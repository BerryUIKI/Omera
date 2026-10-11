# Cloud Snapshot Backup & Media Mirroring

Omera includes a cloud backup and delta sync engine (`src-tauri/src/cloud_backup.rs` and `src-tauri/src/cloud_sync.rs`) that enables automated database backups and incremental remote media mirroring without third-party tools.

---

## 1. Supported Storage Providers

Configure remote endpoints in **Settings > Cloud Backup**:

| Provider | Supported Protocols / Endpoints | Notes |
| :--- | :--- | :--- |
| **AWS S3 / Compatible** | AWS S3, Cloudflare R2, MinIO, Backblaze B2, Wasabi | Pure-Rust AWS Signature Version 4 (SigV4) authentication with HMAC-SHA256 signing. |
| **WebDAV** | Nextcloud, ownCloud, Synology DiskStation, QNAP NAS | Standard HTTP Basic Authentication over HTTPS. |
| **Local / Network Path** | Local drive, external USB SSD, SMB / NFS network shares | Direct high-speed filesystem I/O without network protocol overhead. |

---

## 2. Database snapshot backups

Snapshots contain `omera.db` and `manifest.json`, including library records, tags and ratings. Media files, settings and credentials are excluded. Configure a destination in **Settings > Cloud & Backup**, then use **Create Snapshot Now** for a manual backup. Archives use unique names; local publication is atomic. Existing backups are never automatically deleted.

### Automatic backups

Automatic backups default to **off**, with a **seven-day** interval. Enable them, choose **1–365 days**, then **Save Preferences**. Cancel and failed saves retain the saved schedule. The first attempt starts on the next 30-second check while Omera is running; the next interval starts after a successful backup. Closing Omera stops scheduling. Disabling stops future attempts; a running backup may finish.

**Saved schedule** reports the running state, last success/attempt, next due date, archive and error independently of pending edits. Failed or interrupted attempts wait **one hour** before retrying, including after restart. A changed destination starts a new schedule; credential rotation alone preserves its timing. Corrupt schedule state is preserved and pauses scheduling until repaired and Omera restarted.

### Restore

Restore validates the snapshot and stages it for the next application startup. Close and restart Omera to activate it; refreshing the window alone is insufficient. Startup preserves the current database as a separate `omera.pre-restore-<UUID>.db` recovery point before transactional activation. Snapshots do not restore missing media or credentials.

---

## 3. Incremental Media Mirroring & Delta Sync (`cloud_sync.rs`)

While snapshots protect your database, **Delta Sync** provides one-way incremental upload mirroring of physical image and video files from your local library to remote cloud or network storage.

### Sync Capabilities (Shipped):
- **Change Detection Strategies**:
  - *Fast Fingerprint*: Lightweight comparison without reading entire files.
    - **LocalPath**: Compares file size AND modification time (mtime). Detects same-length content changes when local mtime is newer than remote.
    - **S3/WebDAV**: Compares file size only. Cannot safely determine content equality without comparable metadata, so same-size files are always re-uploaded to avoid missing changes.
    - **Guarantees**: Detects size changes immediately. For LocalPath, detects content changes via mtime.
    - **Limitations**: LocalPath may miss same-length changes with backdated or equal mtime. S3/WebDAV re-upload all same-size files (no skip optimization). Not cryptographically secure.
  - *Strict Checksum*: Computes local SHA-256 hashes to verify against remote hashes (custom `x-amz-meta-sha256` header on S3, full download for WebDAV) to guarantee byte-for-byte fidelity. Cryptographically verifies content equality but reads entire files.
- **Token-Bucket Bandwidth Limiter**: Set an upload speed ceiling (KB/s) so background cloud syncing does not saturate your studio's internet bandwidth.
- **Worker Concurrency**: Configure upload thread counts (1 to 16 threads, default 4).
- **Dry-Run Mode**: Simulates sync execution and reports files to upload or skip without modifying remote storage.
- **Live Progress Reporting**: Emits real-time progress events showing transferred bytes, throughput speed, percentage complete, and ETA, with cooperative atomic cancellation.

### Current Limitations & Planned Capabilities:
- **Upload-Only Mirroring**: Current runtime synchronizes local indexed files to the remote target. Remote-to-local pull/download reconciliation is not implemented in the current runtime.
- **No Remote Deletion Sync**: Local file deletions do not delete remote objects; remote storage retains uploaded media.
- **Planned Bidirectional Sync**: Full two-way reconciliation with remote change detection, download pulls, and conflict resolution policies is planned for future releases.

### Folder mapping and existing cloud files

Each registered library root now has a persistent UUID. Uploads use
`<media prefix>/v2-root-<UUID>/<relative file path>`, so two roots called
`outputs` cannot overwrite each other's `image.png`. The UUID remains stable
when that registered root is renamed and across database backup/restore;
removing and registering a new root creates a new identity.

Before starting, Settings shows the source paths and old/new cloud prefixes for
confirmation. Canceling makes no uploads. The mapping is saved in application
data under `cloud-sync-manifests/layout-<ID>.json`; keep this file for manual
reconciliation. Paths shown are relative to the provider destination, including
any S3 base prefix. Changed roots or prefixes require a fresh preview.

Files in the old basename layout remain untouched. A warning identifies roots
that shared an old cloud folder: manually verify which files belong to which
root before reorganizing them. Sync does not automatically adopt, move, or delete
old files. New UUID folders may initially upload another copy and use additional
remote space. Unsafe paths, duplicate keys, or an unavailable/damaged manifest
stop the operation before transfer.
