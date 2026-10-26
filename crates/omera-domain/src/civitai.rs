use serde::{Deserialize, Serialize};

/// Cached Civitai metadata for a local model hash.
///
/// The by-hash endpoint identifies the exact model version, while the model
/// endpoint supplies the latest published version so the UI can flag updates.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CivitaiModelInfo {
    /// Hash used for the lookup (lowercase AutoV2 or SHA256).
    pub hash: String,
    /// Civitai model identifier.
    pub model_id: i64,
    /// Civitai model (not version) display name.
    pub model_name: String,
    /// Civitai model type, e.g. `Checkpoint`, `LORA`.
    pub model_type: String,
    /// Version identifier matched by the hash.
    pub version_id: i64,
    /// Version name, e.g. `v1.0`.
    pub version_name: String,
    /// Base model declared by Civitai, when present.
    pub base_model: Option<String>,
    /// Trigger words / trained words for the matched version.
    pub trained_words: Vec<String>,
    /// Plain-text description (HTML stripped).
    pub description: Option<String>,
    /// First safe preview image URL reported by Civitai.
    pub preview_url: Option<String>,
    /// Direct download URL for the matched version, when available.
    pub download_url: Option<String>,
    /// Latest published version identifier, when the model lookup succeeded.
    pub latest_version_id: Option<i64>,
    /// Latest published version name.
    pub latest_version_name: Option<String>,
    /// Creation timestamp of the latest published version.
    pub latest_version_created_at: Option<String>,
    /// Whether a version newer than the matched one exists.
    pub update_available: bool,
}
