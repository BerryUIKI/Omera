# Installation & First Launch

This guide details system requirements, supported platforms, installation procedures, and the first-run onboarding setup for **Omera**.

---

## 1. System Requirements

Omera uses an ultra-efficient native architecture powered by **Tauri v2**, **Rust**, and **SQLite WAL**. It runs smoothly on modest hardware while fully utilizing multi-core workstations and NVMe storage for large libraries (50,000 to 500,000+ files).

### Minimum Hardware Requirements
- **CPU**: Dual-core x86_64 or ARM64 processor (Intel Core i3 / AMD Ryzen 3 / Apple M1 or newer).
- **RAM**: 4 GB RAM (8 GB+ recommended for running local CLIP/WD14 ONNX models).
- **Storage**: ~150 MB for application installation; additional space for thumbnails (configurable 2 GB default LRU cache) and media files.
- **Display Resolution**: 1280 × 800 minimum viewport (responsive down to 960 × 640).

### Supported Operating Systems
| Operating System | Supported Versions | Architecture | Package Types |
| :--- | :--- | :--- | :--- |
| **Windows** | Windows 10 (1809+) & Windows 11 | `x86_64` (64-bit) | Standard Installer (`.exe`), Portable (`.zip`) |
| **macOS** | macOS 12 (Monterey) or later | `aarch64` (Apple Silicon M1/M2/M3/M4) & `x86_64` (Intel) | Disk Image (`.dmg`), Universal Binary |
| **Linux** | Ubuntu 20.04+, Debian 11+, Fedora 36+, Arch Linux | `x86_64` | AppImage (`.AppImage`), Debian package (`.deb`) |

---

## 2. Installation Procedures

Download official production packages from the [GitHub Releases Page](https://github.com/BerryUIKI/Omera/releases) or the [Official Website](https://berryuiki.github.io/Omera/).

### Windows
Setup requires Microsoft Visual C++ v14 Redistributable (x64), with a version
of **14.29.30157.0 or newer** for new builds. This Visual C++ 2019 baseline comes
from the application dependencies rather than the build machine's installed
runtime. Previously downloaded 0.4.4 installers retain their embedded requirement
until a new installer is released. An installed x64
runtime can still be too old. Setup distinguishes a missing registration, an
outdated DLL (showing its detected version), and a missing or unreadable DLL.
It checks x64 registration in both registry views and verifies native System32
files, so an x86 runtime cannot satisfy this requirement.

If prompted, use the installer's download link or the
[official x64 runtime download](https://aka.ms/vc14/vc_redist.x64.exe),
install or repair the runtime (administrator approval may
be required), then return to the EXE installer and click Next. For MSI, rerun
setup after installing the runtime. Silent/passive setup stops when it is missing;
Omera does not bundle runtime DLLs or install the redistributable automatically.
Visual Studio Build Tools and the Windows SDK are source-build dependencies;
running the packaged application requires the redistributable runtime. See
[Microsoft's runtime deployment guidance](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist).

1. **Standard Installer (`Omera_Windows_x64.exe`)**:
   - Double-click the installer executable.
   - The language selector defaults to the Windows UI language. Choose English,
     Simplified Chinese, Traditional Chinese, Japanese, German, French, or Spanish.
     Unsupported system languages fall back to English. The selected language
     applies to the runtime prerequisite page and the rest of setup.
   - Follow the setup wizard to choose the installation location and create desktop/start menu shortcuts.
   - The installer automatically manages desktop shortcuts and register protocol handlers.
2. **Portable ZIP (`Omera_Windows_x64.zip`)**:
   - Extract the `.zip` archive to your preferred drive (e.g., an external NVMe SSD or portable drive).
   - Run `omera.exe` directly without administrative privileges.

### macOS
1. Download the disk image corresponding to your CPU:
   - Apple Silicon (M1/M2/M3/M4): `Omera_macOS_aarch64.dmg`
   - Intel Core: `Omera_macOS_x64.dmg`
2. Open the `.dmg` file and drag **Omera** into your `/Applications` folder.
3. Packages are signed and notarized by Apple Gatekeeper. On first launch, launch from Applications or Spotlight.

### Linux
1. **AppImage (`Omera_Linux_x64.AppImage`)**:
   - Make the binary executable:
     ```bash
     chmod +x Omera_Linux_x64.AppImage
     ./Omera_Linux_x64.AppImage
     ```
2. **Debian / Ubuntu (`Omera_Linux_x64.deb`)**:
   - Install via `dpkg` or `apt`:
     ```bash
     sudo dpkg -i Omera_Linux_x64.deb
     sudo apt-get install -f # Resolve any missing webkit2gtk dependencies
     ```

---

## 3. First Omera Setup and Legacy Import

On the first Omera launch, choose the application language and database directory.
This setup also appears if you completed onboarding in Berry. The default database
is in Omera application data; a custom directory changes the database location,
while configuration, models, caches and original media keep their locations.

1. Review any discovered Berry source. Open the import plan to inspect the source,
   destination, required space, available capacity and warnings. Close the legacy
   application before importing. If capacity cannot be confirmed, resolve that
   problem before proceeding.
2. Import a verified snapshot without overwriting the active library. Restart
   Omera to activate the snapshot. The source database and media are retained.
3. After verified activation, optional cleanup shows exact eligible application
   artifacts. Select and confirm those artifacts separately. Changed artifacts
   require renewed review; user media, external vaults and shared folders are
   excluded from automatic application-data cleanup. You can keep all old data.
4. Continue optional local AI output detection and pipeline setup, or skip it.
   Finish setup to save the database-directory choice. Existing Omera libraries
   load from SQLite before optional filesystem reconciliation.

A failed import must be reviewed again before retrying. An existing nonempty
library is preserved; choose a separate destination if the plan requires one.

The database-directory choice can also be changed in Settings. Omera publishes
it only after validating the copied database; restart to use the selected library.
The application-data directories below remain the locations for settings and
other application files, even when the database is stored elsewhere.

---

## 4. Application Storage & Data Directory

Omera stores all library indexes, caches, and configuration locally in your user profile:

- **Windows**: `%APPDATA%\com.berryuiki.omera\` (e.g., `C:\Users\<User>\AppData\Roaming\com.berryuiki.omera\`)
- **macOS**: `~/Library/Application Support/com.berryuiki.omera/`
- **Linux**: `~/.config/com.berryuiki.omera/`

### Directory Contents:
- `omera.db`: The primary SQLite database containing all metadata, ratings, tags, albums, and stack relationships.
- `omera.db-wal` & `omera.db-shm`: SQLite WAL journal files.
- `config.json`: Application settings (theme, view mode, thumbnail resolution, interop URLs).
- `thumbnails/`: High-efficiency WebP thumbnail cache organized by `{file_id}_{mtime}_{edge}.webp`.
- `models/`: Local ONNX AI weights for CLIP, SigLIP, and WD14 Danbooru auto-taggers.

> [!TIP]
> You can instantly open these locations at any time from **Settings > Storage & About** using the dedicated "Open Folder" buttons.
