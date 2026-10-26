//! Civitai model lookups and preview caching.
//!
//! Only public Civitai HTTPS endpoints are contacted. Lookups are cached in
//! SQLite by hash; previews are cached on disk so the WebView never has to
//! load third-party images directly.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use omera_domain::CivitaiModelInfo;
use serde_json::Value;

const API_BASE: &str = "https://civitai.com/api/v1";
const USER_AGENT: &str = "Omera-Civitai";
const MAX_JSON_BYTES: u64 = 4 * 1024 * 1024;
const MAX_PREVIEW_BYTES: u64 = 20 * 1024 * 1024;
const MIN_REQUEST_INTERVAL: Duration = Duration::from_millis(250);

/// Look up the first matching candidate hash (AutoV2 or SHA256) on Civitai.
///
/// `Ok(None)` means no candidate matched a published model version. Network
/// and payload failures are returned so the UI can distinguish them from a
/// genuine miss.
pub fn lookup(candidates: &[String]) -> Result<Option<CivitaiModelInfo>, String> {
    let mut hashes = Vec::new();
    for candidate in candidates {
        let hash = candidate.trim().to_ascii_lowercase();
        if hash.is_empty()
            || !hash
                .chars()
                .all(|character| character.is_ascii_alphanumeric())
        {
            continue;
        }
        if !hashes.contains(&hash) {
            hashes.push(hash);
        }
    }
    if hashes.is_empty() {
        return Ok(None);
    }

    let agent = crate::net::agent(Duration::from_secs(25), USER_AGENT)?;
    for hash in hashes {
        let url = format!("{API_BASE}/model-versions/by-hash/{hash}");
        let Some(version) = get_json(&agent, &url, "model version")? else {
            continue;
        };
        let Some(mut info) = parse_version(&hash, &version) else {
            return Err("Civitai returned an unexpected model-version payload".into());
        };
        // Latest-version discovery is best-effort: keep the matched version
        // when the model endpoint is temporarily unavailable.
        let model_url = format!("{API_BASE}/models/{}", info.model_id);
        if let Ok(Some(model)) = get_json(&agent, &model_url, "model") {
            apply_latest_version(&mut info, &model);
        }
        return Ok(Some(info));
    }
    Ok(None)
}

/// Download and cache a lookup's preview image.
///
/// The URL is restricted to Civitai HTTPS hosts. An existing cached file is
/// reused, so repeated calls do not hit the network.
pub fn download_preview(url: &str, hash: &str, cache_dir: &Path) -> Result<PathBuf, String> {
    if !is_civitai_https(url) {
        return Err("Preview URL is not a Civitai HTTPS URL".into());
    }
    std::fs::create_dir_all(cache_dir)
        .map_err(|e| format!("Failed to create Civitai cache directory: {e}"))?;
    let safe_hash: String = hash.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    if safe_hash.is_empty() {
        return Err("Model hash is required to cache a preview".into());
    }
    for extension in ["jpg", "png", "webp"] {
        let existing = cache_dir.join(format!("{safe_hash}.{extension}"));
        if existing.is_file() {
            return Ok(existing);
        }
    }

    let agent = crate::net::agent(Duration::from_secs(40), USER_AGENT)?;
    let response = match agent.get(url).call() {
        Ok(response) => response,
        Err(ureq::Error::Status(status, _)) => {
            return Err(format!("Civitai preview request failed with HTTP {status}"))
        }
        Err(error) => return Err(format!("Civitai preview request failed: {error}")),
    };
    let content_type = response
        .header("content-type")
        .unwrap_or_default()
        .to_ascii_lowercase();
    let extension = if content_type.contains("png") {
        "png"
    } else if content_type.contains("webp") {
        "webp"
    } else {
        "jpg"
    };
    let destination = cache_dir.join(format!("{safe_hash}.{extension}"));

    let mut reader = response.into_reader().take(MAX_PREVIEW_BYTES + 1);
    let mut bytes = Vec::new();
    reader
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Failed to read Civitai preview: {e}"))?;
    if bytes.is_empty() {
        return Err("Civitai returned an empty preview image".into());
    }
    if bytes.len() as u64 > MAX_PREVIEW_BYTES {
        return Err("Civitai preview exceeds the size limit".into());
    }

    let temporary = tempfile::NamedTempFile::new_in(cache_dir)
        .map_err(|e| format!("Failed to stage Civitai preview: {e}"))?;
    std::fs::write(temporary.path(), &bytes)
        .map_err(|e| format!("Failed to write Civitai preview: {e}"))?;
    temporary
        .persist(&destination)
        .map_err(|error| format!("Failed to store Civitai preview: {}", error.error))?;
    Ok(destination)
}

fn get_json(agent: &ureq::Agent, url: &str, label: &str) -> Result<Option<Value>, String> {
    throttle();
    match agent.get(url).call() {
        Ok(response) => {
            let mut reader = response.into_reader().take(MAX_JSON_BYTES + 1);
            let mut body = String::new();
            reader
                .read_to_string(&mut body)
                .map_err(|e| format!("Failed to read Civitai {label} response: {e}"))?;
            if body.len() as u64 > MAX_JSON_BYTES {
                return Err(format!("Civitai {label} response exceeds the size limit"));
            }
            serde_json::from_str(&body)
                .map(Some)
                .map_err(|e| format!("Invalid Civitai {label} response: {e}"))
        }
        Err(ureq::Error::Status(404, _)) => Ok(None),
        Err(ureq::Error::Status(429, _)) => {
            Err("Civitai rate limit reached; try again later".into())
        }
        Err(ureq::Error::Status(status, _)) => {
            Err(format!("Civitai {label} request failed with HTTP {status}"))
        }
        Err(error) => Err(format!("Civitai {label} request failed: {error}")),
    }
}

fn throttle() {
    static LAST_REQUEST: OnceLock<Mutex<Instant>> = OnceLock::new();
    let mutex = LAST_REQUEST.get_or_init(|| Mutex::new(Instant::now()));
    let Ok(mut last) = mutex.lock() else {
        return;
    };
    let elapsed = last.elapsed();
    if elapsed < MIN_REQUEST_INTERVAL {
        std::thread::sleep(MIN_REQUEST_INTERVAL - elapsed);
    }
    *last = Instant::now();
}

fn parse_version(hash: &str, value: &Value) -> Option<CivitaiModelInfo> {
    let version_id = value.get("id").and_then(Value::as_i64)?;
    let model = value.get("model");
    let model_id = value
        .get("modelId")
        .and_then(Value::as_i64)
        .or_else(|| model.and_then(|m| m.get("id")).and_then(Value::as_i64))?;
    let model_name = model
        .and_then(|m| m.get("name"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    let model_type = model
        .and_then(|m| m.get("type"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    let version_name = value
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    let base_model = value
        .get("baseModel")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let trained_words = parse_trained_words(value.get("trainedWords"));
    let description = value
        .get("description")
        .and_then(Value::as_str)
        .map(crate::commands::strip_html_tags)
        .filter(|value| !value.is_empty());
    let preview_url = pick_preview_url(value.get("images"));
    let download_url = value
        .get("downloadUrl")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| is_civitai_https(value))
        .map(str::to_string);

    Some(CivitaiModelInfo {
        hash: hash.to_string(),
        model_id,
        model_name,
        model_type,
        version_id,
        version_name,
        base_model,
        trained_words,
        description,
        preview_url,
        download_url,
        latest_version_id: None,
        latest_version_name: None,
        latest_version_created_at: None,
        update_available: false,
    })
}

fn apply_latest_version(info: &mut CivitaiModelInfo, model: &Value) {
    let Some(versions) = model.get("modelVersions").and_then(Value::as_array) else {
        return;
    };
    let latest = versions.iter().max_by_key(|version| {
        version
            .get("createdAt")
            .and_then(Value::as_str)
            .unwrap_or_default()
    });
    let Some(latest) = latest else {
        return;
    };
    if let Some(version_id) = latest.get("id").and_then(Value::as_i64) {
        info.latest_version_id = Some(version_id);
        info.update_available = version_id != info.version_id;
    }
    info.latest_version_name = latest
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    info.latest_version_created_at = latest
        .get("createdAt")
        .and_then(Value::as_str)
        .map(str::to_string);
}

fn parse_trained_words(value: Option<&Value>) -> Vec<String> {
    let mut words = Vec::new();
    if let Some(items) = value.and_then(Value::as_array) {
        for item in items {
            let Some(word) = item.as_str() else {
                continue;
            };
            let word = word.trim();
            if !word.is_empty()
                && !words
                    .iter()
                    .any(|existing: &String| existing.eq_ignore_ascii_case(word))
            {
                words.push(word.to_string());
            }
        }
    }
    words
}

fn pick_preview_url(images: Option<&Value>) -> Option<String> {
    let images = images?.as_array()?;
    let mut fallback = None;
    for image in images {
        let Some(url) = image
            .get("url")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| is_civitai_https(value))
        else {
            continue;
        };
        if image.get("nsfw").and_then(Value::as_bool).unwrap_or(false) {
            if fallback.is_none() {
                fallback = Some(url.to_string());
            }
        } else {
            return Some(url.to_string());
        }
    }
    fallback
}

/// Whether `value` is an HTTPS URL on civitai.com or one of its subdomains.
fn is_civitai_https(value: &str) -> bool {
    let Some(rest) = value.strip_prefix("https://") else {
        return false;
    };
    let host = rest
        .split(['/', '?', '#'])
        .next()
        .unwrap_or_default()
        .split(':')
        .next()
        .unwrap_or_default();
    host == "civitai.com" || host.ends_with(".civitai.com")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_model_version_and_deduplicates_trained_words() {
        let value = json!({
            "id": 100,
            "modelId": 42,
            "name": "v1.0",
            "baseModel": "Flux.1 D",
            "trainedWords": ["trigger one", "trigger two", "Trigger One", " "],
            "description": "<p>Hello <b>world</b></p>",
            "images": [
                { "url": "https://image.civitai.com/nsfw.jpeg", "nsfw": true },
                { "url": "https://image.civitai.com/safe.jpeg", "nsfw": false }
            ],
            "downloadUrl": "https://civitai.com/api/download/models/100",
            "model": { "name": "My Model", "type": "LORA" }
        });
        let info = parse_version("abc123", &value).expect("parsed");
        assert_eq!(info.model_id, 42);
        assert_eq!(info.model_name, "My Model");
        assert_eq!(info.model_type, "LORA");
        assert_eq!(info.version_id, 100);
        assert_eq!(info.version_name, "v1.0");
        assert_eq!(info.base_model.as_deref(), Some("Flux.1 D"));
        assert_eq!(info.trained_words, vec!["trigger one", "trigger two"]);
        assert_eq!(info.description.as_deref(), Some("Hello world"));
        assert_eq!(
            info.preview_url.as_deref(),
            Some("https://image.civitai.com/safe.jpeg")
        );
        assert!(!info.update_available);
        assert!(info.latest_version_id.is_none());
    }

    #[test]
    fn flags_a_newer_published_version() {
        let mut info = parse_version(
            "abc123",
            &json!({
                "id": 100,
                "modelId": 42,
                "name": "v1.0",
                "model": { "name": "My Model", "type": "Checkpoint" }
            }),
        )
        .expect("parsed");
        apply_latest_version(
            &mut info,
            &json!({
                "modelVersions": [
                    { "id": 100, "name": "v1.0", "createdAt": "2025-01-01T00:00:00Z" },
                    { "id": 101, "name": "v1.1", "createdAt": "2025-02-01T00:00:00Z" }
                ]
            }),
        );
        assert_eq!(info.latest_version_id, Some(101));
        assert_eq!(info.latest_version_name.as_deref(), Some("v1.1"));
        assert!(info.update_available);

        let mut current = info.clone();
        apply_latest_version(
            &mut current,
            &json!({ "modelVersions": [{ "id": 100, "name": "v1.0", "createdAt": "2025-01-01T00:00:00Z" }] }),
        );
        assert!(!current.update_available);
    }

    #[test]
    fn ignores_candidates_that_could_escape_the_api_path() {
        assert_eq!(lookup(&["../admin".to_string()]).unwrap(), None);
        assert_eq!(lookup(&["abc/def".to_string()]).unwrap(), None);
    }

    #[test]
    fn accepts_only_civitai_https_hosts() {
        assert!(is_civitai_https(
            "https://civitai.com/api/download/models/1"
        ));
        assert!(is_civitai_https("https://image.civitai.com/foo/bar.jpeg"));
        assert!(!is_civitai_https("http://civitai.com/foo"));
        assert!(!is_civitai_https("https://evil.example/civitai.com"));
        assert!(!is_civitai_https("https://civitai.com.evil.example/foo"));
        assert!(!is_civitai_https("https://user@civitai.com/foo"));
    }

    #[test]
    fn chooses_the_first_safe_preview_and_falls_back_to_nsfw() {
        assert_eq!(
            pick_preview_url(Some(&json!([
                { "url": "https://image.civitai.com/nsfw.jpeg", "nsfw": true },
                { "url": "https://image.civitai.com/safe.jpeg", "nsfw": false }
            ]))),
            Some("https://image.civitai.com/safe.jpeg".to_string())
        );
        assert_eq!(
            pick_preview_url(Some(&json!([
                { "url": "https://image.civitai.com/only.jpeg", "nsfw": true }
            ]))),
            Some("https://image.civitai.com/only.jpeg".to_string())
        );
    }

    #[test]
    #[ignore = "requires live Civitai access"]
    fn live_lookup_and_preview_download() {
        let hash = "879db523c30d3b9017143d56705015e15a2cb5628762c11d086fed9538abd7fd";
        let info = lookup(&[hash.to_string()])
            .expect("live Civitai lookup")
            .expect("known DreamShaper version");
        assert_eq!(info.model_id, 4384);
        assert!(!info.model_name.is_empty());
        assert!(info.latest_version_id.is_some());
        let preview_url = info.preview_url.as_deref().expect("preview URL");
        assert!(is_civitai_https(preview_url));
        let directory = tempfile::tempdir().unwrap();
        let path =
            download_preview(preview_url, hash, directory.path()).expect("preview download");
        assert!(path.is_file());
        assert!(std::fs::metadata(&path).unwrap().len() > 0);
    }
}
