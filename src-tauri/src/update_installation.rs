use std::ffi::OsStr;
use std::path::Path;
use std::process::Command;

/// Construct the launch only after the caller has verified the staged package.
pub fn windows_installer_command(
    installer: &Path,
    silent: bool,
    system_root: Option<&OsStr>,
) -> Result<Command, String> {
    let extension = installer
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or_default();
    if extension.eq_ignore_ascii_case("exe") {
        let mut command = Command::new(installer);
        // Tauri's NSIS update mode skips the old-version uninstaller and
        // preserves existing shortcuts. Passive mode shows progress only.
        command
            .arg(if silent { "/S" } else { "/P" })
            .args(["/UPDATE", "/R"]);
        Ok(command)
    } else if extension.eq_ignore_ascii_case("msi") {
        let root = system_root
            .map(Path::new)
            .filter(|path| path.is_absolute())
            .ok_or("Cannot locate the system Windows Installer")?;
        let mut command = Command::new(root.join("System32").join("msiexec.exe"));
        command
            .arg("/i")
            .arg(installer)
            .arg("/norestart")
            .arg(if silent { "/quiet" } else { "/passive" })
            .arg("AUTOLAUNCHAPP=True");
        Ok(command)
    } else {
        Err("Unsupported Windows update package; use an EXE or MSI installer".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;

    fn args(command: &Command) -> Vec<OsString> {
        command.get_args().map(OsStr::to_owned).collect()
    }

    #[test]
    fn nsis_updates_without_uninstalling_and_restarts_in_both_modes() {
        let path = Path::new("更新 & Omera setup.EXE");
        for (silent, mode) in [(false, "/P"), (true, "/S")] {
            let command = windows_installer_command(path, silent, None).unwrap();
            assert_eq!(command.get_program(), path.as_os_str());
            assert_eq!(args(&command), [mode, "/UPDATE", "/R"].map(OsString::from));
        }
    }

    #[test]
    fn msi_uses_system_installer_and_a_single_unicode_path_argument() {
        let root = std::env::temp_dir().join("Windows root fixture");
        let path = std::env::temp_dir().join("更新 & Omera setup.MSI");
        for silent in [false, true] {
            let command = windows_installer_command(&path, silent, Some(root.as_os_str())).unwrap();
            assert_eq!(command.get_program(), root.join("System32/msiexec.exe"));
            let expected = vec![
                OsString::from("/i"),
                path.clone().into_os_string(),
                OsString::from("/norestart"),
                OsString::from(if silent { "/quiet" } else { "/passive" }),
                OsString::from("AUTOLAUNCHAPP=True"),
            ];
            assert_eq!(args(&command), expected);
        }
    }

    #[test]
    fn unsupported_packages_and_missing_system_installer_fail_before_launch() {
        for filename in ["Omera.zip", "Omera.exe.zip", "Omera"] {
            assert!(windows_installer_command(Path::new(filename), false, None).is_err());
        }
        let path = Path::new("Omera.msi");
        assert!(windows_installer_command(path, false, None).is_err());
        assert!(windows_installer_command(path, false, Some(OsStr::new("relative"))).is_err());
    }
}
