//! Journaled migration activation before opening application connections.
use crate::{
    legacy_migration, library_location, migration_fingerprint::database_fingerprint, recovery,
};
use omera_domain::MigrationReceipt;
use std::{
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

pub fn stage_library(
    root: &Path,
    staged: &Path,
    mut receipt: MigrationReceipt,
) -> Result<MigrationReceipt, String> {
    let target = Path::new(&receipt.destination_db);
    let pending = target.with_extension("pending-restore.db");
    if pending.exists() || (target.exists() && !legacy_migration::is_database_empty(target)) {
        return Err(
            "[DESTINATION_EXISTS] Existing library or pending restore was preserved".into(),
        );
    }
    receipt.activation_requires_empty = target.exists();
    receipt.integrity_hash = database_fingerprint(staged)?;
    receipt.cleanup_status = "preparing".into();
    receipt.activated_at = None;
    legacy_migration::save_receipt(root, &receipt)?;
    if target.exists() {
        recovery::stage_restore(staged, target)?;
    } else {
        recovery::migrate_copy(staged, target)?;
        library_location::select_database(root, target)?;
    }
    receipt.cleanup_status = "activation_pending".into();
    legacy_migration::save_receipt(root, &receipt)?;
    Ok(receipt)
}

pub fn prepare_startup(root: &Path) -> Result<(), String> {
    let Some(mut receipt) = legacy_migration::load_receipt(root)? else {
        return Ok(());
    };
    if !matches!(
        receipt.cleanup_status.as_str(),
        "preparing" | "activation_pending"
    ) {
        return Ok(());
    }
    let target = Path::new(&receipt.destination_db);
    let pending = target.with_extension("pending-restore.db");
    if pending.exists() {
        if database_fingerprint(&pending)? != receipt.integrity_hash {
            return Err(
                "[INTEGRITY_FAILED] Pending migration differs from the verified snapshot".into(),
            );
        }
        if receipt.activation_requires_empty && !target.exists() {
            return Err(
                "[INTEGRITY_FAILED] Active library is missing; migration snapshot was retained"
                    .into(),
            );
        }
        if receipt.activation_requires_empty && !legacy_migration::is_database_empty(target) {
            // Preserve the current library and the imported snapshot if data was
            // added between preview and restart. Never replace the live library.
            let retained =
                target.with_extension(format!("migration-blocked-{}.db", receipt.receipt_id));
            if retained.exists() {
                return Err("[DESTINATION_EXISTS] Retained migration already exists".into());
            }
            std::fs::rename(&pending, retained).map_err(|e| e.to_string())?;
            receipt.cleanup_status = "activation_blocked".into();
            legacy_migration::save_receipt(root, &receipt)?;
            return Ok(());
        }
    } else if !target.is_file() {
        receipt.cleanup_status = "failed".into();
        legacy_migration::save_receipt(root, &receipt)?;
        return Ok(());
    } else if database_fingerprint(target)? != receipt.integrity_hash {
        receipt.cleanup_status = "activation_blocked".into();
        legacy_migration::save_receipt(root, &receipt)?;
        return Ok(());
    }
    // An interrupted publication may have saved the journal before selection.
    // A missing live target is handled by apply_pending_restore at startup.
    if target.exists() {
        library_location::select_database(root, target)?;
    }
    receipt.cleanup_status = "activation_pending".into();
    legacy_migration::save_receipt(root, &receipt)
}

#[cfg(test)]
mod tests {
    use super::*;
    use omera_domain::MigratedArtifact;

    fn receipt(root: &Path, staged: &Path) -> MigrationReceipt {
        MigrationReceipt {
            receipt_id: "activation-test".into(),
            source_id: "legacy".into(),
            source_identifier: "legacy".into(),
            source_root: staged.parent().unwrap().to_string_lossy().into(),
            source_schema_version: 1,
            destination_root: root.to_string_lossy().into(),
            destination_db: root.join("omera.db").to_string_lossy().into(),
            created_at: 0,
            artifacts: vec![MigratedArtifact {
                category: "database".into(),
                source_path: staged.to_string_lossy().into(),
                destination_path: root.join("omera.db").to_string_lossy().into(),
                status: "staged".into(),
                size_bytes: 1024,
            }],
            integrity_hash: String::new(),
            cleanup_status: "preparing".into(),
            source_revision: "verified-source".into(),
            activated_at: None,
            activation_requires_empty: false,
        }
    }

    #[test]
    fn imports_with_live_empty_connection_and_activates_only_after_restart() {
        let root = tempfile::tempdir().unwrap();
        let source = tempfile::tempdir().unwrap();
        let staged = source.path().join("berry.db");
        let db = crate::Database::connect(&staged).unwrap();
        db.connection()
            .execute("INSERT INTO tags(name) VALUES ('imported')", [])
            .unwrap();
        let active = root.path().join("omera.db");
        let live = crate::Database::connect(&active).unwrap();
        let staged_receipt =
            stage_library(root.path(), &staged, receipt(root.path(), &staged)).unwrap();
        assert!(live.list_tags().unwrap().is_empty());
        assert_eq!(staged_receipt.cleanup_status, "activation_pending");
        assert!(staged_receipt.activated_at.is_none());
        drop(live);
        prepare_startup(root.path()).unwrap();
        recovery::apply_pending_restore(&active).unwrap();
        let reopened = crate::Database::connect(&active).unwrap();
        assert_eq!(reopened.list_tags().unwrap()[0].name, "imported");
        // A second prepare simulates interruption between application and receipt finalization.
        prepare_startup(root.path()).unwrap();
        finalize_startup(root.path(), &active).unwrap();
        let completed = legacy_migration::load_receipt(root.path())
            .unwrap()
            .unwrap();
        assert_eq!(completed.cleanup_status, "pending");
        assert!(completed.activated_at.is_some());
        assert_eq!(completed.artifacts[0].status, "success");
        assert_eq!(db.list_tags().unwrap()[0].name, "imported");
    }

    #[test]
    fn data_added_after_staging_blocks_activation_and_preserves_both_libraries() {
        let root = tempfile::tempdir().unwrap();
        let source = tempfile::tempdir().unwrap();
        let staged = source.path().join("berry.db");
        let db = crate::Database::connect(&staged).unwrap();
        db.connection()
            .execute("INSERT INTO tags(name) VALUES ('imported')", [])
            .unwrap();
        let active = root.path().join("omera.db");
        let live = crate::Database::connect(&active).unwrap();
        stage_library(root.path(), &staged, receipt(root.path(), &staged)).unwrap();
        live.connection()
            .execute("INSERT INTO tags(name) VALUES ('new user data')", [])
            .unwrap();
        drop(live);
        prepare_startup(root.path()).unwrap();
        recovery::apply_pending_restore(&active).unwrap();
        assert_eq!(
            crate::Database::connect(&active)
                .unwrap()
                .list_tags()
                .unwrap()[0]
                .name,
            "new user data"
        );
        assert!(active
            .with_extension("migration-blocked-activation-test.db")
            .exists());
        assert_eq!(
            legacy_migration::load_receipt(root.path())
                .unwrap()
                .unwrap()
                .cleanup_status,
            "activation_blocked"
        );
    }
}

/// Call only after the selected database has reopened and its library can be read.
pub fn finalize_startup(root: &Path, active: &Path) -> Result<(), String> {
    let Some(mut receipt) = legacy_migration::load_receipt(root)? else {
        return Ok(());
    };
    if receipt.cleanup_status != "activation_pending" {
        return Ok(());
    }
    let expected = Path::new(&receipt.destination_db);
    if expected.canonicalize().map_err(|e| e.to_string())?
        != active.canonicalize().map_err(|e| e.to_string())?
        || active.with_extension("pending-restore.db").exists()
        || database_fingerprint(active)? != receipt.integrity_hash
    {
        return Err("[INTEGRITY_FAILED] Reopened migration destination does not match the verified snapshot".into());
    }
    for artifact in &mut receipt.artifacts {
        if artifact.category == "database" {
            artifact.status = "success".into();
        }
    }
    receipt.activated_at = Some(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_secs(),
    );
    receipt.cleanup_status = "pending".into();
    legacy_migration::save_receipt(root, &receipt)
}
