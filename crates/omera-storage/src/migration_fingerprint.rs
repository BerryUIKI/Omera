//! Stable catalog fingerprints across WAL snapshots and SQLite backup activation.
use rusqlite::types::ValueRef;
use sha2::{Digest, Sha256};
use std::path::Path;

fn quoted(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

fn field(hash: &mut Sha256, bytes: &[u8]) {
    hash.update((bytes.len() as u64).to_le_bytes());
    hash.update(bytes);
}

pub fn database_fingerprint(path: &Path) -> Result<String, String> {
    let conn =
        crate::legacy_migration::validate_source_database(path).map_err(|e| e.to_string())?;
    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;
    let mut hash = Sha256::new();
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    hash.update(version.to_le_bytes());
    let mut table_query = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('thumbnail_cache_entries', 'filesystem_change_journal', 'embedding_failures') ORDER BY name").map_err(|e| e.to_string())?;
    let tables = table_query
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    for table in tables {
        let table = table.map_err(|e| e.to_string())?;
        field(&mut hash, table.as_bytes());
        let mut schema = conn
            .prepare(&format!("PRAGMA table_info({})", quoted(&table)))
            .map_err(|e| e.to_string())?;
        let columns = schema
            .query_map([], |row| {
                Ok((row.get::<_, String>(1)?, row.get::<_, i64>(5)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| e.to_string())?;
        let mut keys: Vec<_> = columns
            .iter()
            .filter(|(_, position)| *position > 0)
            .collect();
        keys.sort_by_key(|(_, position)| *position);
        let ordering = if keys.is_empty() {
            columns
                .iter()
                .map(|(name, _)| quoted(name))
                .collect::<Vec<_>>()
        } else {
            keys.iter().map(|(name, _)| quoted(name)).collect()
        }
        .join(",");
        for (name, _) in &columns {
            field(&mut hash, name.as_bytes());
        }
        let mut query = conn
            .prepare(&format!(
                "SELECT * FROM {} ORDER BY {ordering}",
                quoted(&table)
            ))
            .map_err(|e| e.to_string())?;
        let mut rows = query.query([]).map_err(|e| e.to_string())?;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            hash.update([0xff]);
            for index in 0..columns.len() {
                match row.get_ref(index).map_err(|e| e.to_string())? {
                    ValueRef::Null => hash.update([0]),
                    ValueRef::Integer(value) => {
                        hash.update([1]);
                        hash.update(value.to_le_bytes());
                    }
                    ValueRef::Real(value) => {
                        hash.update([2]);
                        hash.update(value.to_bits().to_le_bytes());
                    }
                    ValueRef::Text(value) => {
                        hash.update([3]);
                        field(&mut hash, value);
                    }
                    ValueRef::Blob(value) => {
                        hash.update([4]);
                        field(&mut hash, value);
                    }
                }
            }
        }
        hash.update([0xfe]);
    }
    Ok(format!("{:x}", hash.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fingerprints_include_wal_data_but_ignore_disposable_thumbnail_manifests() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("berry.db");
        let live = crate::Database::connect(&source).unwrap();
        let initial = database_fingerprint(&source).unwrap();
        live.connection()
            .execute(
                "INSERT INTO thumbnail_cache_entries VALUES (1, 0, 384, 'webp', 'old.webp', 16, 0)",
                [],
            )
            .unwrap();
        assert_eq!(database_fingerprint(&source).unwrap(), initial);
        live.connection()
            .execute("INSERT INTO tags(name) VALUES ('preserved')", [])
            .unwrap();
        let with_data = database_fingerprint(&source).unwrap();
        assert_ne!(with_data, initial);
        let copy = dir.path().join("omera.db");
        crate::recovery::migrate_copy(&source, &copy).unwrap();
        assert_eq!(database_fingerprint(&copy).unwrap(), with_data);
        assert_eq!(live.list_tags().unwrap()[0].name, "preserved");
    }
}
