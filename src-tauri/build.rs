fn main() {
    println!("cargo:rerun-if-env-changed=OMERA_UPDATE_PUBLIC_KEY");
    println!("cargo:rerun-if-env-changed=BERRY_UPDATE_PUBLIC_KEY");
    println!("cargo:rerun-if-env-changed=VCToolsRedistDir");
    println!("cargo:rerun-if-changed=windows/runtime-version.ps1");
    println!("cargo:rerun-if-changed=../scripts/prepare-installer-prerequisites.mjs");
    println!("cargo:rerun-if-changed=../src/i18n/locales");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        assert_eq!(
            std::env::var("CARGO_CFG_TARGET_ARCH").as_deref(),
            Ok("x86_64")
        );
        let status = std::process::Command::new("node")
            .args([
                "--import",
                "tsx",
                "../scripts/prepare-installer-prerequisites.mjs",
            ])
            .status()
            .expect(
                "Windows installer metadata requires Node.js and installed frontend dependencies",
            );
        assert!(
            status.success(),
            "Windows installer metadata preparation failed"
        );
    }
    tauri_build::build()
}
