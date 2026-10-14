//! Durable selection of an already validated library; original libraries stay intact.
use rusqlite::{Connection, OpenFlags, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const LOCATION_FILE: &str = "library-location.json";

#[derive(Serialize, Deserialize)]
struct Location {
    version: u8,
    database_path: PathBuf,
}

pub fn database_path(data_dir: &Path) -> Result<PathBuf, String> {
    let selection = data_dir.join(LOCATION_FILE);
    if !selection.exists() {
        return Ok(data_dir.join("omera.db"));
    }
    let location: Location =
        serde_json::from_slice(&std::fs::read(selection).map_err(|e| e.to_string())?)
            .map_err(|e| format!("Invalid library location record: {e}"))?;
    if location.version != 1
        || !location.database_path.is_absolute()
        || location
            .database_path
            .file_name()
            .is_none_or(|name| name != "omera.db")
    {
        return Err("Invalid library location; the original library has been preserved".into());
    }
    if !location.database_path.is_file() {
        return Err(format!(
            "Selected library is missing: {}",
            location.database_path.display()
        ));
    }
    Ok(location.database_path)
}

pub fn destination_in(directory: &Path) -> Result<PathBuf, String> {
    if !directory.is_absolute() || !directory.is_dir() {
        return Err("Choose an existing absolute database directory".into());
    }
    Ok(directory
        .canonicalize()
        .map_err(|e| e.to_string())?
        .join("omera.db"))
}

/// Publish only a verified destination. Invalid records never silently open an empty replacement.
pub fn select_database(data_dir: &Path, database: &Path) -> Result<(), String> {
    if database.file_name().is_none_or(|name| name != "omera.db") {
        return Err("The selected library must be named omera.db".into());
    }
    crate::legacy_migration::validate_source_database(database).map_err(|e| e.to_string())?;
    let location = Location {
        version: 1,
        database_path: database.canonicalize().map_err(|e| e.to_string())?,
    };
    let mut temporary = tempfile::NamedTempFile::new_in(data_dir).map_err(|e| e.to_string())?;
    serde_json::to_writer(temporary.as_file_mut(), &location).map_err(|e| e.to_string())?;
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    temporary
        .persist(data_dir.join(LOCATION_FILE))
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Explicit location choice creates a WAL-inclusive copy, then switches on restart.
/// The original database and media are never removed. A SQLite writer gate protects
/// the snapshot from concurrent mutations without holding the application mutex.
pub fn copy_and_select(
    data_dir: &Path,
    directory: &Path,
    active: &Path,
) -> Result<PathBuf, String> {
    let target = destination_in(directory)?;
    if active.canonicalize().map_err(|e| e.to_string())? == target {
        return Ok(active.to_path_buf());
    }
    if target.exists() || active.with_extension("pending-restore.db").exists() {
        return Err(
            "A destination library or pending restore already exists; nothing was overwritten"
                .into(),
        );
    }
    let mut connection = Connection::open_with_flags(active, OpenFlags::SQLITE_OPEN_READ_WRITE)
        .map_err(|e| e.to_string())?;
    let _writer_gate = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| format!("Library is busy: {e}"))?;
    crate::recovery::migrate_copy(active, &target)?;
    select_database(data_dir, &target)?;
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn location_choice_copies_wal_without_mutating_the_original() {
        let data = tempfile::tempdir().unwrap();
        let selected = tempfile::tempdir().unwrap();
        let active = data.path().join("omera.db");
        let live = crate::Database::connect(&active).unwrap();
        live.connection()
            .execute("INSERT INTO tags(name) VALUES ('preserved')", [])
            .unwrap();
        let target = copy_and_select(data.path(), selected.path(), &active).unwrap();
        assert_eq!(database_path(data.path()).unwrap(), target);
        assert_eq!(live.list_tags().unwrap()[0].name, "preserved");
        assert_eq!(
            crate::Database::connect(&target)
                .unwrap()
                .list_tags()
                .unwrap()[0]
                .name,
            "preserved"
        );
        assert!(active.exists());
        assert!(copy_and_select(data.path(), selected.path(), &active).is_err());
    }

    #[test]
    fn invalid_or_missing_selection_never_falls_back_to_a_new_empty_database() {
        let data = tempfile::tempdir().unwrap();
        assert_eq!(
            database_path(data.path()).unwrap(),
            data.path().join("omera.db")
        );
        std::fs::write(data.path().join(LOCATION_FILE), b"invalid").unwrap();
        assert!(database_path(data.path()).is_err());
        let missing = data.path().join("absent/omera.db");
        std::fs::write(
            data.path().join(LOCATION_FILE),
            serde_json::to_vec(&Location {
                version: 1,
                database_path: missing,
            })
            .unwrap(),
        )
        .unwrap();
        assert!(database_path(data.path()).is_err());
    }
}
