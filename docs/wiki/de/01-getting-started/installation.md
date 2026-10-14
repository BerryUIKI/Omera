# Installation & Erster Start

Dieser Leitfaden beschreibt die Systemanforderungen, unterstützten Plattformen, Installationsschritte und die Ersteinrichtung über den Onboarding-Assistenten für **Omera**.

---

## 1. Systemanforderungen

Omera nutzt eine hocheffiziente native Architektur auf Basis von **Tauri v2**, **Rust** und **SQLite WAL**. Die Anwendung läuft reibungslos auf Standard-Hardware und schöpft auf leistungsstarken Multi-Core-Workstations mit NVMe-Speicher das volle Potenzial für umfangreiche Bibliotheken (50.000 bis über 500.000 Dateien) aus.

### Minimale Hardwareanforderungen
- **CPU**: Dual-Core x86_64- oder ARM64-Prozessor (Intel Core i3 / AMD Ryzen 3 / Apple M1 oder neuer).
- **RAM**: 4 GB RAM (8 GB+ empfohlen für die Ausführung lokaler CLIP/WD14-ONNX-Modelle).
- **Speicherplatz**: ca. 150 MB für die Anwendungsinstallation; zusätzlicher Speicherplatz für Vorschaubilder (konfigurierbarer 2-GB-Standard-LRU-Cache) und Mediendateien.
- **Bildschirmauflösung**: Mindestens 1280 × 800 Bildpunkte (responsiv herab bis 960 × 640).

### Unterstützte Betriebssysteme
| Betriebssystem | Unterstützte Versionen | Architektur | Pakettypen |
| :--- | :--- | :--- | :--- |
| **Windows** | Windows 10 (1809+) & Windows 11 | `x86_64` (64-Bit) | Standard-Installer (`.exe`), Portabel (`.zip`) |
| **macOS** | macOS 12 (Monterey) oder neuer | `aarch64` (Apple Silicon M1/M2/M3/M4) & `x86_64` (Intel) | Disk-Image (`.dmg`), Universal-Binary |
| **Linux** | Ubuntu 20.04+, Debian 11+, Fedora 36+, Arch Linux | `x86_64` | AppImage (`.AppImage`), Debian-Paket (`.deb`) |

---

## 2. Installationsverfahren

Laden Sie offizielle Produktionspakete von der [GitHub-Releases-Seite](https://github.com/BerryUIKI/Omera/releases) oder der [offiziellen Website](https://berryuiki.github.io/Omera/) herunter.

### Windows
Setup benötigt eine kompatible Microsoft Visual C++ x64-Systemlaufzeit. Öffnen Sie
bei Bedarf die [offizielle Microsoft-Downloadseite](https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist)
und installieren oder reparieren Sie das aktuelle **x64** Redistributable
(Administratorfreigabe kann erforderlich sein). Kehren Sie danach zum EXE-Installer
zurück und klicken Sie auf Weiter; starten Sie MSI-Setup erneut. Unbeaufsichtigtes
oder passives Setup stoppt bei fehlender Laufzeit. Omera bündelt keine Laufzeit-DLLs
und installiert das Redistributable nicht automatisch.

1. **Standard-Installationsprogramm (`Omera_Windows_x64.exe`)**:
   - Führen Sie die Installationsdatei per Doppelklick aus.
   - Folgen Sie dem Installationsassistenten, um den Installationsort festzulegen und Verknüpfungen auf dem Desktop sowie im Startmenü zu erstellen.
   - Der Installer verwaltet Verknüpfungen und registriert Protokoll-Handler automatisch.
2. **Portable ZIP-Version (`Omera_Windows_x64.zip`)**:
   - Entpacken Sie das `.zip`-Archiv auf ein beliebiges Laufwerk (z. B. eine externe NVMe-SSD oder ein Wechsellaufwerk).
   - Starten Sie `omera.exe` direkt ohne Administratorrechte.

### macOS
1. Laden Sie das zu Ihrem Prozessor passende Disk-Image herunter:
   - Apple Silicon (M1/M2/M3/M4): `Omera_macOS_aarch64.dmg`
   - Intel Core: `Omera_macOS_x64.dmg`
2. Öffnen Sie die `.dmg`-Datei und ziehen Sie **Omera** in Ihren `/Applications`-Ordner (Programme).
3. Die Pakete sind durch Apple Gatekeeper signiert und notarisiert. Starten Sie das Programm beim ersten Mal aus dem Programme-Ordner oder über Spotlight.

### Linux
1. **AppImage (`Omera_Linux_x64.AppImage`)**:
   - Machen Sie die Binärdatei ausführbar:
     ```bash
     chmod +x Omera_Linux_x64.AppImage
     ./Omera_Linux_x64.AppImage
     ```
2. **Debian / Ubuntu (`Omera_Linux_x64.deb`)**:
   - Installieren Sie das Paket über `dpkg` oder `apt`:
     ```bash
     sudo dpkg -i Omera_Linux_x64.deb
     sudo apt-get install -f # Eventuell fehlende webkit2gtk-Abhängigkeiten auflösen
     ```

---

## 3. Erste Omera-Einrichtung und Import aus Berry

Wählen Sie beim ersten Start die Anwendungssprache und das Datenbankverzeichnis.
Diese Einrichtung erscheint auch nach einer abgeschlossenen Berry-Einrichtung.
Standardmäßig liegt die Datenbank in den Omera-Anwendungsdaten. Ein anderes
Verzeichnis ändert nur den Datenbankort; Einstellungen, Modelle, Cache und
Originalmedien behalten ihre Speicherorte.

1. Prüfen Sie gefundene Berry-Quellen. Der Importplan zeigt Quelle, Ziel,
   Speicherbedarf, verfügbaren Platz und Warnungen. Beenden Sie die alte Anwendung.
   Ist die Kapazität unbekannt, beheben Sie das Problem vor dem Import.
2. Importieren Sie einen geprüften Snapshot, ohne die aktive Bibliothek zu
   überschreiben. Starten Sie Omera zur Aktivierung neu. Quelldatenbank und Medien
   bleiben erhalten.
3. Nach geprüfter Aktivierung zeigt die optionale Bereinigung die genauen
   Anwendungsdateien. Wählen und bestätigen Sie diese separat. Geänderte Dateien
   erfordern eine neue Prüfung. Medien, externe Bibliotheken und gemeinsame Ordner
   sind ausgeschlossen. Sie können alle alten Daten behalten.
4. Fahren Sie mit der optionalen Erkennung lokaler KI-Ausgaben und der Pipeline-
   Einrichtung fort oder überspringen Sie sie. Beim Abschluss wird das Verzeichnis
   gespeichert. Vor optionalen Dateisystemprüfungen wird die SQLite-Bibliothek geladen.

Prüfen Sie den Plan nach einem fehlgeschlagenen Import erneut. Bestehende, nicht
leere Bibliotheken bleiben erhalten; wählen Sie bei Bedarf ein separates Ziel.

Das Datenbankverzeichnis kann auch in den Einstellungen geändert werden. Omera
speichert die Auswahl erst nach Prüfung der Kopie; starten Sie danach neu. Die
folgenden Anwendungsdatenverzeichnisse bleiben für Einstellungen und andere
Anwendungsdateien zuständig, auch wenn die Datenbank woanders liegt.

---

## 4. Anwendungsspeicher & Datenverzeichnis

Omera speichert alle Bibliotheksindizes, Caches und Konfigurationen lokal in Ihrem Benutzerprofil:

- **Windows**: `%APPDATA%\com.berryuiki.omera\` (z. B. `C:\Users\<Benutzer>\AppData\Roaming\com.berryuiki.omera\`)
- **macOS**: `~/Library/Application Support/com.berryuiki.omera/`
- **Linux**: `~/.config/com.berryuiki.omera/`

### Verzeichnisinhalt:
- `omera.db`: Die primäre SQLite-Datenbank mit allen Metadaten, Bewertungen, Tags, Alben und Stapelbeziehungen.
- `omera.db-wal` & `omera.db-shm`: SQLite-WAL-Journaldateien.
- `config.json`: Anwendungseinstellungen (Design, Ansichtsmodus, Vorschauauflösung, Interop-URLs).
- `thumbnails/`: Hocheffizienter WebP-Vorschaubild-Cache, strukturiert nach `{file_id}_{mtime}_{edge}.webp`.
- `models/`: Lokale ONNX-KI-Gewichte für CLIP, SigLIP und WD14 Danbooru-Auto-Tagger.

> [!TIP]
> Sie können diese Speicherorte jederzeit über **Einstellungen > Speicher & Info** mit den entsprechenden Schaltflächen „Ordner öffnen“ direkt im Dateimanager des Systems anzeigen.
