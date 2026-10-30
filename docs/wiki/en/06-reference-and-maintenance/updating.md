# Updating Omera

Omera can check for releases and download a verified installer. Installing an update requires your action; the steps depend on your operating system.

## Check for updates

Use **Help > Check for Updates**. The startup check can be enabled or disabled in **Settings > General**. Read the release notes before installing.

## Download and install

1. Choose **Update Now** on Windows to download and install the update with one click. You can select silent installation before starting. On macOS/Linux, choose **Download Update**.
2. Omera verifies the downloaded package and checks its signature again before launching the installer. Verification failures stop installation; a launch failure lets you retry with the downloaded package.
3. Windows updates the existing application and reopens Omera on success, without a separate uninstall step. On macOS, choose **Install & Restart Now** to open the verified DMG, complete installation and reopen Omera. On Linux, the install action launches an AppImage; DEB/RPM packages require your package manager. Automatic restart is not guaranteed on macOS/Linux.

If trust is unavailable, the signature is missing or verification fails, use **Download in Browser** or **GitHub Releases** to open the [official release page](https://github.com/BerryUIKI/Omera/releases). Choose a package for your OS and architecture and follow its installation instructions. Do not disable verification or use an untrusted mirror. Older builds without update trust need a manual first upgrade to a trusted build.

## Preserve your library

The application binaries and user data are stored separately. Keep a current database backup before upgrading, and retain your original media and settings. Startup schema migrations are append-only; legacy discovery and supported import remain available before version 1.0. Do not delete application data or legacy sources as part of an upgrade.
