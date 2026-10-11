//! Release tooling uses the application's streaming verifier without launching it.
use minisign_verify::PublicKey;
use std::{env, fs, path::PathBuf};

fn run() -> Result<(), String> {
    let mut args = env::args_os().skip(1);
    let key_path = args
        .next()
        .ok_or("Usage: verify-update <public-key-file> <asset>...")?;
    let key_text = fs::read_to_string(key_path).map_err(|e| e.to_string())?;
    let key = PublicKey::from_base64(key_text.trim()).map_err(|e| e.to_string())?;
    let assets: Vec<PathBuf> = args.map(PathBuf::from).collect();
    if assets.is_empty() {
        return Err("At least one installer is required".into());
    }
    for asset in assets {
        let mut signature_path = asset.as_os_str().to_os_string();
        signature_path.push(".minisig");
        let signature = fs::read_to_string(signature_path)
            .map_err(|e| format!("Missing signature for {}: {e}", asset.display()))?;
        omera_lib::update_verification::verify_with_key(&asset, &signature, &key)?;
        println!("Verified {}", asset.display());
    }
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
