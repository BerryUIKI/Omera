# Updating Omera

Omera can check for releases and download a verified installer. Installing an update requires your action; the steps depend on your operating system.

## Check for updates

Use **Help > Check for Updates**. The startup check can be enabled or disabled in **Settings > General**. Read the release notes before installing.

## Download and install

1. Choose the automatic download action to download the package from the official GitHub release.
2. Omera verifies its signature before offering installation and checks it again before launching the installer. An error does not authorize installation.
3. On Windows, the EXE installer can use the selected silent-install option. On macOS, Omera opens the verified DMG; complete the installation and reopen Omera. On Linux, an AppImage is launched; DEB/RPM packages require your package manager. Automatic restart is not guaranteed on every platform.

If trust is unavailable, the signature is missing or verification fails, use **Download in Browser** or **GitHub Releases** to open the [official release page](https://github.com/BerryUIKI/Omera/releases). Choose a package for your OS and architecture and follow its installation instructions. Do not disable verification or use an untrusted mirror. Older builds without update trust need a manual first upgrade to a trusted build.

## Preserve your library

The application binaries and user data are stored separately. Keep a current database backup before upgrading, and retain your original media and settings. Startup schema migrations are append-only; legacy discovery and supported import remain available before version 1.0. Do not delete application data or legacy sources as part of an upgrade.
