//! Bounded indexing and copy-only harvesting of explicitly mapped local outputs.
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
            // subsequent work. Completion harvesting never disposes source files.
            let folder = db
                .find_folder_by_id(folder_id)
                .map_err(|e| e.to_string())?
                .ok_or("Output folder is no longer registered")?;
            if folder.folder_type == "pipeline" {
                let report = crate::pipeline::harvest_completed_paths(
                    &db,
                    folder_id,
                    std::slice::from_ref(relative),
                    stop,
                )
                .map_err(|e| e.to_string())?;
                if report.failed_count > 0 {
                    return Err("Pipeline output could not be harvested".into());
                }
                if report.items.iter().any(|item| {
                    matches!(
                        item,
                        crate::pipeline::PipelineHarvestItemOutcome::SkippedCollision { .. }
                    )
                }) {
                    return Err("Pipeline filename collision; source preserved".into());
                }
                if report.harvested_count == 0 {
                    return Ok(None);
                }
                return Ok(Some(ScanStats {
                    folder_id,
                    found: report.harvested_count as u64,
                    added: report.harvested_count as u64,
                    updated: 0,
                    unchanged: 0,
                    removed: 0,
                    failed: 0,
                    duration_ms: 0,
                    walk_errors: 0,
                }));
            }
            if folder.folder_type != "link" {
                return Err("Select a linked folder or an enabled copy-only pipeline".into());
            }
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
    fn copy_pipeline_harvests_only_named_nested_outputs_and_preserves_sidecars() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source");
        let dest = temp.path().join("dest");
        std::fs::create_dir_all(source.join("nested")).unwrap();
        std::fs::create_dir(&dest).unwrap();
        for name in ["nested/image.png", "unrequested.png"] {
            std::fs::write(source.join(name), b"\x89PNG\r\n\x1a\n").unwrap();
        }
        std::fs::write(source.join("nested/image.txt"), b"prompt").unwrap();
        let db_path = temp.path().join("library.db");
        let db = Database::connect(&db_path).unwrap();
        let folder = db
            .add_folder_with_mode(
                dest.to_str().unwrap(),
                "pipeline",
                Some(source.to_str().unwrap()),
                Some("copy"),
                Some(0),
                true,
            )
            .unwrap();
        let paths = [PathBuf::from("nested/image.png")];
        let stop = AtomicBool::new(false);
        let mut added = 0;
        index_completed_images(&db_path, folder.id, &paths, &stop, |s| added += s.added).unwrap();
        assert_eq!(added, 1);
        assert!(dest.join("image.png").exists());
        assert_eq!(std::fs::read(dest.join("image.txt")).unwrap(), b"prompt");
        assert!(!dest.join("unrequested.png").exists());
        assert!(source.join("nested/image.png").exists());
        assert!(db.get_cleanup_queue(10).unwrap().is_empty());
        index_completed_images(&db_path, folder.id, &paths, &stop, |_| {
            panic!("duplicate refresh")
        })
        .unwrap();
        std::fs::write(source.join("nested/image.png"), b"different").unwrap();
        assert!(index_completed_images(&db_path, folder.id, &paths, &stop, |_| panic!()).is_err());
        assert_eq!(
            std::fs::read(dest.join("image.png")).unwrap(),
            b"\x89PNG\r\n\x1a\n"
        );
    }

    #[test]
    fn completion_pipeline_rejects_move_overlap_escape_and_cancellation() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source");
        let dest = temp.path().join("dest");
        std::fs::create_dir(&source).unwrap();
        std::fs::create_dir(&dest).unwrap();
        std::fs::write(source.join("image.png"), b"\x89PNG\r\n\x1a\n").unwrap();
        let db_path = temp.path().join("library.db");
        let db = Database::connect(&db_path).unwrap();
        let folder = db
            .add_folder_with_mode(
                dest.to_str().unwrap(),
                "pipeline",
                Some(source.to_str().unwrap()),
                Some("move"),
                Some(0),
                true,
            )
            .unwrap();
        let stop = AtomicBool::new(false);
        let paths = [PathBuf::from("image.png")];
        assert!(crate::pipeline::harvest_completed_paths(&db, folder.id, &paths, &stop).is_err());
        db.remove_folder(folder.id).unwrap();
        let folder = db
            .add_folder_with_mode(
                dest.to_str().unwrap(),
                "pipeline",
                Some(source.to_str().unwrap()),
                Some("copy"),
                None,
                true,
            )
            .unwrap();
        assert!(crate::pipeline::harvest_completed_paths(
            &db,
            folder.id,
            &[PathBuf::from("../outside.png")],
            &stop
        )
        .is_err());
        stop.store(true, Ordering::Relaxed);
        assert!(
            crate::pipeline::harvest_completed_paths(&db, folder.id, &paths, &stop)
                .unwrap()
                .cancelled
        );
        stop.store(false, Ordering::Relaxed);
        db.add_folder(temp.path().to_str().unwrap()).unwrap();
        assert!(crate::pipeline::harvest_completed_paths(&db, folder.id, &paths, &stop).is_err());
        assert_eq!(std::fs::read_dir(&dest).unwrap().count(), 0);
        assert!(source.join("image.png").exists());
        db.remove_folder(folder.id).unwrap();
        db.remove_folder(
            db.find_folder_by_path(temp.path().to_str().unwrap())
                .unwrap()
                .unwrap()
                .id,
        )
        .unwrap();
        let folder = db
            .add_folder_with_mode(
                dest.to_str().unwrap(),
                "pipeline",
                Some(source.to_str().unwrap()),
                Some("copy"),
                None,
                true,
            )
            .unwrap();
        std::fs::write(dest.join("image.txt"), b"curated orphan").unwrap();
        assert!(crate::pipeline::harvest_completed_paths(&db, folder.id, &paths, &stop).is_err());
        assert!(!dest.join("image.png").exists());
        assert_eq!(
            std::fs::read(dest.join("image.txt")).unwrap(),
            b"curated orphan"
        );
    }
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
