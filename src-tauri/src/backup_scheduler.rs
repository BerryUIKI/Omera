//! Private schedule persistence and a single background snapshot worker.
use omera_domain::{
    AutomaticBackupStatus, BackupSchedule, CloudBackupConfig, CloudStorageProvider,
};
use sha2::{Digest, Sha256};
use std::{io::Write, path::PathBuf};

const STATE_FILE: &str = "automatic-backup-state.json";

fn target_key(config: &CloudBackupConfig) -> String {
    // Inactive provider settings and rotating credentials cannot reset due dates.
    let values = match config.provider {
        CloudStorageProvider::LocalPath => {
            vec!["local_path", config.local_path.as_deref().unwrap_or("")]
        }
        CloudStorageProvider::WebDav => vec![
            "web_dav",
            config.webdav_endpoint.as_deref().unwrap_or(""),
            config.webdav_username.as_deref().unwrap_or(""),
        ],
        CloudStorageProvider::S3 => vec![
            "s3",
            config.s3_endpoint.as_deref().unwrap_or(""),
            config.s3_bucket.as_deref().unwrap_or(""),
            config.s3_prefix.as_deref().unwrap_or("backups/"),
        ],
    };
    hex::encode(Sha256::digest(
        serde_json::to_vec(&values).expect("strings serialize"),
    ))
}

/// Execute a saved automatic attempt without holding application-state locks.
pub fn create_snapshot(
    data_dir: &std::path::Path,
    database_path: &std::path::Path,
    preferences: CloudBackupConfig,
) -> Result<String, String> {
    let config = crate::config_store::resolve_backup_credentials(preferences)?;
    let database = omera_storage::Database::connect(database_path).map_err(|e| e.to_string())?;
    let result = crate::cloud_backup::create_cloud_snapshot(&database, &config, data_dir, None);
    result
        .and_then(|value| {
            value
                .snapshot
                .map(|snapshot| snapshot.filename)
                .ok_or_else(|| {
                    value
                        .error
                        .unwrap_or_else(|| "Snapshot did not complete".into())
                })
        })
        .map_err(|mut error| {
            for secret in [
                &config.webdav_password,
                &config.s3_access_key,
                &config.s3_secret_key,
            ]
            .into_iter()
            .flatten()
            .filter(|value| !value.is_empty())
            {
                error = error.replace(secret, "[redacted]");
            }
            error.chars().take(2_048).collect()
        })
}

pub struct BackupEngine {
    data_dir: PathBuf,
    schedule: BackupSchedule,
    needs_persist: bool,
}

impl BackupEngine {
    pub fn open(data_dir: PathBuf, timestamp: u64) -> Result<Self, String> {
        let path = data_dir.join(STATE_FILE);
        if std::fs::metadata(&path).is_ok_and(|meta| meta.len() > 65_536) {
            return Err(format!("Automatic backup state exceeds its size limit; original preserved. Repair {STATE_FILE} and restart."));
        }
        let mut schedule: BackupSchedule = match std::fs::read(&path) {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .map_err(|e| format!("Automatic backup state is invalid; original preserved. Repair {STATE_FILE} and restart: {e}"))?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => BackupSchedule::default(),
            Err(error) => return Err(format!("Cannot read automatic backup state: {error}")),
        };
        let interrupted = schedule.status.running;
        schedule.recover_interrupted(timestamp);
        let mut engine = Self {
            data_dir,
            schedule,
            needs_persist: interrupted,
        };
        if interrupted {
            engine.persist()?;
        }
        Ok(engine)
    }

    fn persist(&mut self) -> Result<(), String> {
        let mut staged =
            tempfile::NamedTempFile::new_in(&self.data_dir).map_err(|e| e.to_string())?;
        staged
            .write_all(&serde_json::to_vec_pretty(&self.schedule).map_err(|e| e.to_string())?)
            .and_then(|_| staged.as_file().sync_all())
            .map_err(|e| format!("Cannot persist automatic backup status: {e}"))?;
        staged
            .persist(self.data_dir.join(STATE_FILE))
            .map_err(|e| format!("Cannot publish automatic backup status: {e}"))?;
        self.needs_persist = false;
        Ok(())
    }

    pub fn poll(
        &mut self,
        timestamp: u64,
        mut publish: impl FnMut(AutomaticBackupStatus),
        perform: impl FnOnce(CloudBackupConfig) -> Result<String, String>,
        completed_at: impl FnOnce() -> u64,
    ) -> Result<(), String> {
        let config = crate::config_store::backup_preferences(&self.data_dir.join("config.json"))?;
        let previous = self.schedule.clone();
        self.schedule.configure(
            timestamp,
            config.auto_backup_enabled,
            config.auto_backup_interval_days,
            target_key(&config),
        );
        let started = self.schedule.begin_if_due(timestamp);
        if self.schedule != previous || self.needs_persist {
            self.needs_persist = true;
            if let Err(error) = self.persist() {
                self.schedule = previous;
                return Err(error);
            }
        }
        publish(self.schedule.status.clone());
        if started {
            let result = perform(config);
            // Completion time sets the interval even for a slow provider.
            self.schedule.finish(completed_at().max(timestamp), result);
            self.needs_persist = true;
            self.persist()?;
            publish(self.schedule.status.clone());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn save_preferences(root: &Path, enabled: bool, destination: &Path) {
        let mut config = crate::commands::AppConfig::default();
        config.cloud_backup.auto_backup_enabled = enabled;
        config.cloud_backup.local_path = Some(destination.to_string_lossy().into());
        std::fs::write(
            root.join("config.json"),
            serde_json::to_vec(&config).unwrap(),
        )
        .unwrap();
    }

    #[test]
    fn saved_opt_in_creates_a_real_snapshot_and_restart_respects_success() {
        let root = tempfile::tempdir().unwrap();
        let target = root.path().join("backups");
        let db_path = root.path().join("omera.db");
        let db = omera_storage::Database::connect(&db_path).unwrap();
        db.connection()
            .execute("INSERT INTO tags(name) VALUES ('wal_data')", [])
            .unwrap();
        save_preferences(root.path(), false, &target);
        let mut engine = BackupEngine::open(root.path().into(), 100).unwrap();
        engine
            .poll(100, |_| {}, |_| panic!("disabled"), || 101)
            .unwrap();
        assert!(!target.exists());
        save_preferences(root.path(), true, &target);
        let original_config = std::fs::read(root.path().join("config.json")).unwrap();
        let mut statuses = Vec::new();
        engine
            .poll(
                100,
                |value| statuses.push(value),
                |config| {
                    let persisted: BackupSchedule = serde_json::from_slice(
                        &std::fs::read(root.path().join(STATE_FILE)).unwrap(),
                    )
                    .unwrap();
                    assert!(persisted.status.running);
                    let independent = omera_storage::Database::connect(&db_path).unwrap();
                    let snapshot = crate::cloud_backup::create_cloud_snapshot(
                        &independent,
                        &config,
                        root.path(),
                        None,
                    )?
                    .snapshot
                    .unwrap();
                    assert_eq!(snapshot.tag_count, 1);
                    Ok(snapshot.filename)
                },
                || 110,
            )
            .unwrap();
        assert!(statuses[0].running);
        assert!(!statuses[1].running);
        assert_eq!(statuses[1].last_success_at, Some(110));
        assert_eq!(std::fs::read_dir(&target).unwrap().count(), 1);
        assert_eq!(
            std::fs::read(root.path().join("config.json")).unwrap(),
            original_config
        );
        assert_eq!(db.get_database_stats().unwrap().tag_count, 1);
        let mut restarted = BackupEngine::open(root.path().into(), 200).unwrap();
        restarted
            .poll(200, |_| {}, |_| panic!("not due"), || 201)
            .unwrap();
        assert_eq!(restarted.schedule.status.last_success_at, Some(110));
        save_preferences(root.path(), false, &target);
        restarted
            .poll(999_999, |_| {}, |_| panic!("disabled again"), || 1_000_000)
            .unwrap();
        assert_eq!(restarted.schedule.status.next_due_at, None);
    }

    #[test]
    fn failed_provider_and_interrupted_attempt_back_off_after_restart() {
        let root = tempfile::tempdir().unwrap();
        save_preferences(root.path(), true, &root.path().join("backups"));
        let mut engine = BackupEngine::open(root.path().into(), 100).unwrap();
        engine
            .poll(100, |_| {}, |_| Err("offline".into()), || 110)
            .unwrap();
        assert_eq!(engine.schedule.status.next_due_at, Some(3710));
        let mut restarted = BackupEngine::open(root.path().into(), 200).unwrap();
        restarted
            .poll(200, |_| {}, |_| panic!("retry too early"), || 201)
            .unwrap();
        assert_eq!(
            restarted.schedule.status.last_error.as_deref(),
            Some("offline")
        );
        restarted.schedule.begin_if_due(3710);
        restarted.persist().unwrap();
        let mut interrupted = BackupEngine::open(root.path().into(), 3800).unwrap();
        assert!(!interrupted.schedule.status.running);
        assert_eq!(interrupted.schedule.status.next_due_at, Some(7400));
        interrupted
            .poll(
                7399,
                |_| {},
                |_| panic!("interrupted retry too early"),
                || 7400,
            )
            .unwrap();
        interrupted
            .poll(7400, |_| {}, |_| Ok("recovered.zip".into()), || 7410)
            .unwrap();
        assert!(interrupted.schedule.status.last_error.is_none());
    }

    #[test]
    fn corrupt_state_config_and_failed_status_publication_preserve_sources() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join(STATE_FILE), b"{broken").unwrap();
        assert!(BackupEngine::open(root.path().into(), 100).is_err());
        assert_eq!(
            std::fs::read(root.path().join(STATE_FILE)).unwrap(),
            b"{broken"
        );
        let other = tempfile::tempdir().unwrap();
        let mut engine = BackupEngine::open(other.path().into(), 100).unwrap();
        std::fs::write(other.path().join("config.json"), b"{invalid").unwrap();
        assert!(engine
            .poll(100, |_| {}, |_| panic!("invalid config"), || 101)
            .is_err());
        assert_eq!(
            std::fs::read(other.path().join("config.json")).unwrap(),
            b"{invalid"
        );
        save_preferences(other.path(), true, &other.path().join("backups"));
        std::fs::create_dir(other.path().join(STATE_FILE)).unwrap();
        assert!(engine
            .poll(
                100,
                |_| {},
                |_| panic!("status must be durable first"),
                || 101
            )
            .is_err());
        assert!(!engine.schedule.status.running);
        assert!(other.path().join(STATE_FILE).is_dir());
    }

    #[test]
    fn destination_digest_ignores_credentials_and_inactive_providers() {
        let mut config = CloudBackupConfig {
            local_path: Some("backup-target".into()),
            ..Default::default()
        };
        let original = target_key(&config);
        config.s3_secret_key = Some("fixture-secret".into());
        config.webdav_endpoint = Some("https://fixture.invalid".into());
        assert_eq!(target_key(&config), original);
        config.local_path = Some("new-target".into());
        assert_ne!(target_key(&config), original);
        config.provider = CloudStorageProvider::WebDav;
        let webdav = target_key(&config);
        config.webdav_password = Some("rotated".into());
        assert_eq!(target_key(&config), webdav);
        config.webdav_username = Some("different-account".into());
        assert_ne!(target_key(&config), webdav);
    }

    #[test]
    fn completed_status_is_retried_before_starting_another_job() {
        let root = tempfile::tempdir().unwrap();
        save_preferences(root.path(), true, &root.path().join("backups"));
        let mut engine = BackupEngine::open(root.path().into(), 100).unwrap();
        assert!(engine
            .poll(
                100,
                |_| {},
                |_| {
                    // Simulate a status publication failure after a successful provider job.
                    std::fs::remove_file(root.path().join(STATE_FILE)).unwrap();
                    std::fs::create_dir(root.path().join(STATE_FILE)).unwrap();
                    Ok("completed.zip".into())
                },
                || 110
            )
            .is_err());
        assert!(engine.needs_persist);
        std::fs::remove_dir(root.path().join(STATE_FILE)).unwrap();
        engine
            .poll(
                200,
                |_| {},
                |_| panic!("successful job must not repeat"),
                || 201,
            )
            .unwrap();
        assert!(!engine.needs_persist);
        let state: BackupSchedule =
            serde_json::from_slice(&std::fs::read(root.path().join(STATE_FILE)).unwrap()).unwrap();
        assert_eq!(state.status.last_success_at, Some(110));
        assert_eq!(state.status.last_snapshot.as_deref(), Some("completed.zip"));
    }
}
