//! Bounded, read-only indexing of explicitly mapped local ComfyUI outputs.
use crate::{ScanStats, Scanner};
use omera_storage::Database;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

pub fn index_completed_images(
    db_path: &Path,
    folder_id: i64,
    paths: &[PathBuf],
    stop: &AtomicBool,
    mut publish: impl FnMut(ScanStats),
) -> Result<(), String> {
    let db = Database::connect(db_path).map_err(|e| e.to_string())?;
    let scanner = Scanner::with_default_extractor(db_path.to_path_buf());
    let mut last_error = None;
    for relative in paths.iter().take(64) {
        if stop.load(Ordering::Relaxed) {
            break;
        }
        let result = (|| {
            // Recheck registration on every item; removing/changing a folder revokes
            // subsequent work. Pipeline copy/disposition is intentionally excluded.
            let folder = db
                .find_folder_by_id(folder_id)
                .map_err(|e| e.to_string())?
                .filter(|f| f.folder_type == "link")
                .ok_or("Output folder is no longer a registered linked folder")?;
            if relative.as_os_str().is_empty()
                || relative
                    .components()
                    .any(|c| !matches!(c, Component::Normal(_)))
            {
                return Err("Invalid relative output path".into());
            }
            let root = Path::new(&folder.path);
            let canonical_root = root.canonicalize().map_err(|e| e.to_string())?;
            let path = root.join(relative);
            let canonical_path = path.canonicalize().map_err(|e| e.to_string())?;
            if !canonical_path.starts_with(&canonical_root) || !path.is_file() {
                return Err("Output escapes the selected folder or is not a file".into());
            }
            for ext in ["txt", "json"] {
                let sidecar = path.with_extension(ext);
                if sidecar.exists()
                    && !sidecar
                        .canonicalize()
                        .map_err(|e| e.to_string())?
                        .starts_with(&canonical_root)
                {
                    return Err("Output sidecar escapes the selected folder".into());
                }
            }
            if let Some(existing) = db
                .get_file_by_path(&path.to_string_lossy())
                .map_err(|e| e.to_string())?
            {
                if existing.folder_id != folder_id {
                    return Err("Output is already owned by another folder".into());
                }
                let meta = path.metadata().map_err(|e| e.to_string())?;
                let modified_at = meta
                    .modified()
                    .ok()
                    .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|time| time.as_secs() as i64)
                    .unwrap_or(0);
                if existing.size_bytes == meta.len() && existing.modified_at == modified_at {
                    return Ok(None);
                }
            }
            let stats = scanner
                .reconcile_paths(folder_id, root, &[path], |_| {})
                .map_err(|e| e.to_string())?;
            if stats.failed > 0 {
                return Err("Completed output could not be indexed".into());
            }
            Ok(Some(stats))
        })();
        match result {
            Ok(Some(stats)) => {
                if stats.added > 0 || stats.updated > 0 {
                    publish(stats);
                }
            }
            Ok(None) => {}
            Err(error) => last_error = Some(error),
        }
    }
    last_error.map_or(Ok(()), Err)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn indexes_nested_outputs_once_preserves_sources_and_continues_after_missing_file() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("output");
        std::fs::create_dir_all(root.join("nested")).unwrap();
        let path = root.join("nested/image.png");
        let bytes = b"\x89PNG\r\n\x1a\n";
        std::fs::write(&path, bytes).unwrap();
        let db_path = temp.path().join("library.db");
        let db = Database::connect(&db_path).unwrap();
        let folder = db.add_folder(root.to_str().unwrap()).unwrap();
        let paths = [
            PathBuf::from("missing.png"),
            PathBuf::from("nested/image.png"),
        ];
        let stop = AtomicBool::new(false);
        let mut added = 0;
        assert!(
            index_completed_images(&db_path, folder.id, &paths, &stop, |s| added += s.added)
                .is_err()
        );
        assert_eq!(added, 1);
        let indexed = db
            .get_file_by_path(&path.to_string_lossy())
            .unwrap()
            .unwrap();
        db.set_file_rating(indexed.id.unwrap(), Some(5)).unwrap();
        index_completed_images(&db_path, folder.id, &paths[1..], &stop, |_| {
            panic!("duplicate refresh")
        })
        .unwrap();
        let repeated = db
            .get_file_by_path(&path.to_string_lossy())
            .unwrap()
            .unwrap();
        assert_eq!(repeated.id, indexed.id);
        assert_eq!(repeated.rating, Some(5));
        assert_eq!(std::fs::read(path).unwrap(), bytes);
        assert!(index_completed_images(
            &db_path,
            folder.id,
            &[PathBuf::from("../outside.png")],
            &stop,
            |_| panic!()
        )
        .is_err());
        stop.store(true, Ordering::Relaxed);
        index_completed_images(&db_path, folder.id, &paths, &stop, |_| panic!()).unwrap();
        stop.store(false, Ordering::Relaxed);
        db.remove_folder(folder.id).unwrap();
        assert!(
            index_completed_images(&db_path, folder.id, &paths[1..], &stop, |_| panic!()).is_err()
        );
    }

    #[test]
    fn rejects_managed_destinations_without_writing_files() {
        let temp = tempfile::tempdir().unwrap();
        let db_path = temp.path().join("library.db");
        let db = Database::connect(&db_path).unwrap();
        let destination = temp.path().join("absent");
        let folder = db
            .add_folder_with_mode(
                destination.to_str().unwrap(),
                "managed",
                None,
                None,
                None,
                true,
            )
            .unwrap();
        assert!(index_completed_images(
            &db_path,
            folder.id,
            &[PathBuf::from("image.png")],
            &AtomicBool::new(false),
            |_| panic!()
        )
        .is_err());
        assert!(!destination.exists());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinked_outputs_and_sidecars_outside_root() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("root");
        std::fs::create_dir(&root).unwrap();
        let outside = temp.path().join("outside.png");
        std::fs::write(&outside, b"\x89PNG\r\n\x1a\n").unwrap();
        std::os::unix::fs::symlink(&outside, root.join("escape.png")).unwrap();
        std::fs::copy(&outside, root.join("image.png")).unwrap();
        std::os::unix::fs::symlink(&outside, root.join("image.txt")).unwrap();
        let db_path = temp.path().join("library.db");
        let db = Database::connect(&db_path).unwrap();
        let folder = db.add_folder(root.to_str().unwrap()).unwrap();
        for name in ["escape.png", "image.png"] {
            assert!(index_completed_images(
                &db_path,
                folder.id,
                &[PathBuf::from(name)],
                &AtomicBool::new(false),
                |_| panic!()
            )
            .is_err());
        }
    }
}
