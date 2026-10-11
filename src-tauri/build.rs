fn main() {
    println!("cargo:rerun-if-env-changed=OMERA_UPDATE_PUBLIC_KEY");
    println!("cargo:rerun-if-env-changed=BERRY_UPDATE_PUBLIC_KEY");
    println!("cargo:rerun-if-env-changed=VCToolsRedistDir");
    println!("cargo:rerun-if-changed=windows/prepare-runtime.ps1");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        assert_eq!(
            std::env::var("CARGO_CFG_TARGET_ARCH").as_deref(),
            Ok("x86_64"),
            "Windows runtime packaging currently supports x64 only"
        );
        let status = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-File", "windows/prepare-runtime.ps1"])
            .status()
            .expect("Windows packaging requires PowerShell and Visual Studio CRT redistributables");
        assert!(status.success(), "Windows CRT preparation failed");
    }
    tauri_build::build()
}
