//! No-follow artifact validation for discovered legacy application data.
use sha2::{Digest, Sha256};
use std::{fs::Metadata, path::Path, time::UNIX_EPOCH};

pub fn plain_metadata(path: &Path) -> Result<Metadata, String> {
    let metadata = std::fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    let redirected = {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0
    };
    #[cfg(not(windows))]
    let redirected = metadata.file_type().is_symlink();
    if redirected || (!metadata.is_file() && !metadata.is_dir()) {
        return Err("[CLEANUP_PROTECTED] Redirected or special artifacts are preserved".into());
    }
    Ok(metadata)
}

pub fn artifact_fingerprint(path: &Path) -> Result<String, String> {
    fn visit(path: &Path, hash: &mut Sha256) -> Result<(), String> {
        let metadata = plain_metadata(path)?;
        hash.update(
            path.file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .as_bytes(),
        );
        hash.update(metadata.len().to_le_bytes());
        hash.update(
            metadata
                .modified()
                .map_err(|e| e.to_string())?
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
                .to_le_bytes(),
        );
        if metadata.is_file() {
            let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, hash).map_err(|e| e.to_string())?;
        } else {
            let mut entries = std::fs::read_dir(path)
                .map_err(|e| e.to_string())?
                .map(|entry| entry.map(|entry| entry.path()))
                .collect::<std::io::Result<Vec<_>>>()
                .map_err(|e| e.to_string())?;
            entries.sort();
            for entry in entries {
                visit(&entry, hash)?;
            }
        }
        Ok(())
    }
    let mut hash = Sha256::new();
    visit(path, &mut hash)?;
    Ok(format!("{:x}", hash.finalize()))
}

#[cfg(windows)]
pub fn database_in_use(path: &Path) -> bool {
    use std::os::windows::fs::OpenOptionsExt;
    std::fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(path)
        .is_err()
}

#[cfg(not(windows))]
pub fn database_in_use(_path: &Path) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn artifact_changes_invalidate_reviewed_cleanup_paths() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("cache.webp");
        std::fs::write(&path, b"before").unwrap();
        let before = artifact_fingerprint(&path).unwrap();
        std::fs::write(&path, b"after!").unwrap();
        assert_ne!(artifact_fingerprint(&path).unwrap(), before);
    }

    #[cfg(windows)]
    #[test]
    fn a_live_legacy_sqlite_connection_blocks_cleanup() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("berry.db");
        let live = crate::Database::connect(&path).unwrap();
        assert!(database_in_use(&path));
        drop(live);
        assert!(!database_in_use(&path));
    }
}
