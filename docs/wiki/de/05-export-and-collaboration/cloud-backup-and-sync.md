# Cloud-Snapshot-Backup & Medienspiegelung

Omera verfügt über integrierte Module für Cloud-Backups und Delta-Synchronisation (`src-tauri/src/cloud_backup.rs` und `src-tauri/src/cloud_sync.rs`), die automatisierte Datenbanksicherungen und inkrementelle Medienspiegelungen ohne externe Hilfswerkzeuge ermöglichen.

---

## 1. Unterstützte Speicheranbieter

Konfigurieren Sie Remote-Endpunkte unter **Einstellungen > Cloud & Backup**:

| Anbieter | Unterstützte Protokolle / Endpunkte | Besonderheiten |
| :--- | :--- | :--- |
| **AWS S3 / Kompatibel** | AWS S3, Cloudflare R2, MinIO, Backblaze B2, Wasabi | Reine Rust-basierte AWS Signature Version 4 (SigV4)-Authentifizierung mit HMAC-SHA256-Signierung. |
| **WebDAV** | Nextcloud, ownCloud, Synology DiskStation, QNAP NAS | Standardmäßige HTTP-Basic-Authentifizierung über verschlüsseltes HTTPS. |
| **Lokales / Netzwerkverzeichnis** | Lokale Laufwerke, externe USB-SSDs, SMB- / NFS-Netzwerkfreigaben | Direkte, extrem schnelle Dateisystem-E/A ohne Protokoll-Overhead. |

---

## 2. Datenbank-Snapshots

Snapshots enthalten `omera.db` und `manifest.json` mit Bibliotheksdaten, Tags und Bewertungen. Medien, Einstellungen und Zugangsdaten sind ausgeschlossen. Wählen Sie unter **Einstellungen > Cloud & Backup** ein Ziel und **Snapshot jetzt erstellen** für eine manuelle Sicherung. Archive haben eindeutige Namen; lokale Veröffentlichung erfolgt atomar. Vorhandene Sicherungen werden nicht automatisch gelöscht.

### Automatische Sicherungen

Standardmäßig **deaktiviert**, Intervall **sieben Tage**. Aktivieren, **1–365 Tage** wählen und **Einstellungen speichern**. Abbrechen und fehlgeschlagenes Speichern behalten den gespeicherten Zeitplan. Solange Omera läuft, prüft es alle 30 Sekunden; der erste Versuch beginnt bei der nächsten Prüfung. Das nächste Intervall beginnt nach erfolgreicher Sicherung. Beenden stoppt die Planung. Deaktivieren stoppt künftige Versuche; ein laufender darf fertig werden.

**Gespeicherter Zeitplan** zeigt unabhängig von Entwürfen Laufstatus, letzten Erfolg/Versuch, nächsten Termin, Archiv und Fehler. Fehler oder Unterbrechungen führen auch nach Neustart zu **einer Stunde** Wartezeit. Ein anderes Ziel startet einen neuen Zeitplan; neue Zugangsdaten allein ändern ihn nicht. Beschädigter Status bleibt erhalten und pausiert die Planung bis zur Reparatur und zum Neustart.

### Wiederherstellung

Wiederherstellung validiert den Snapshot und bereitet ihn für den nächsten App-Start vor. Omera schließen und neu starten; Fenster-Neuladen genügt nicht. Vor der transaktionalen Aktivierung bleibt die aktuelle Datenbank als `omera.pre-restore-<UUID>.db` erhalten. Fehlende Medien oder Zugangsdaten werden nicht wiederhergestellt.

---

## 3. Inkrementelle Medienspiegelung & Delta-Sync (`cloud_sync.rs`)

Während Snapshots Ihre Datenbankstruktur und Metadaten sichern, bietet der **Delta-Sync** eine einseitige inkrementelle Upload-Spiegelung physischer Bild- und Videodateien aus Ihrer lokalen Bibliothek auf Remote- oder Netzwerkspeicher.

### Synchronisationsfähigkeiten (Implementiert):
- **Strategien zur Änderungserkennung**:
  - *Schneller Fingerabdruck*: Vergleicht die lokale Dateigröße mit der Remote-Dateigröße über HTTP-HEAD-Metadaten (besonders schnell bei langsameren Verbindungen).
  - *Strikte Prüfsumme*: Berechnet lokale SHA-256-Prüfsummen zum Abgleich mit Remote-Headern (benutzerdefinierter `x-amz-meta-sha256`-Header auf S3) für garantierte Byte-für-Byte-Konsistenz.
- **Bandbreitenbegrenzung (Token-Bucket)**: Legen Sie ein Upload-Limit (KB/s) fest, damit Hintergrundübertragungen die Internetleitung Ihres Studios nicht blockieren.
- **Übertragungs-Threads (Worker Concurrency)**: Konfigurierbare Thread-Anzahl (1 bis 16 parallele Uploads, Standard 4).
- **Testlauf-Modus (Dry-Run)**: Simuliert den Abgleich und meldet hochzuladende und zu überspringende Dateien, ohne Daten auf dem Remote-Speicher zu verändern.
- **Echtzeit-Fortschrittsanzeige**: Sendet kontinuierliche Status-Updates mit übertragenen Bytes, Durchsatzrate, Prozentsatz und geschätzter Restzeit (ETA) sowie atomarer kooperativer Abbruchunterstützung.

### Aktuelle Einschränkungen & Geplante Funktionen:
- **Nur unidirektionaler Upload**: Der aktuelle Synchronisationspfad lädt lokale indizierte Dateien zum Remote-Ziel hoch. Ein Herunterladen/Abgleich von Remote nach Lokal ist nicht implementiert.
- **Keine Synchronisation von Löschungen**: Lokal gelöschte Dateien werden auf dem Remote-Speicher nicht gelöscht; Remote-Dateien bleiben erhalten.
- **Kein ETag-basierter Delta-Abgleich**: Die Änderungserkennung nutzt Dateigröße und SHA-256; HTTP-ETags werden nicht zur Cache-Invalidierung ausgewertet.
- **Geplante bidirektionale Synchronisation**: Eine vollständige bidirektionale Synchronisation mit Erkennung von Remote-Änderungen, Pull-Downloads und Konfliktlösungsrichtlinien ist für zukünftige Versionen geplant.
