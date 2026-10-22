//! Structured metadata extracted from a media file's embedded info.

use serde::{Deserialize, Serialize};

use crate::MetadataFormat;

/// Metadata extracted from an image/video, normalized from whatever the
/// generator embedded (PNGInfo text chunks, EXIF, `.txt` sidecars).
///
/// Serialized to a JSON `metadata` column on the `files` row. `parameters`
/// keeps the raw generator string (e.g. the A1111 "parameters" chunk) so the
/// original text survives even as structured fields are added.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct ExtractedMetadata {
    /// The generator platform, or Unspecified (JSON null) for technical facts only.
    pub format: MetadataFormat,
    /// Raw A1111/SD.Next-style parameter string, if present.
    pub parameters: Option<String>,
    /// Any other raw text (e.g. a ComfyUI `prompt`/`workflow` chunk or the
    /// full contents of a `.txt` sidecar).
    pub raw: Option<String>,
    /// The generation prompt.
    pub prompt: Option<String>,
    /// The negative prompt, if any.
    pub negative_prompt: Option<String>,
    /// Current image width in pixels; transformed records use decoded output geometry.
    pub width: Option<u32>,
    /// Current image height in pixels; raw parameters may retain generation geometry.
    pub height: Option<u32>,
    /// Seed (kept as a string: seeds can be 64-bit values or hashes).
    pub seed: Option<String>,
    /// Number of sampling steps.
    pub steps: Option<u32>,
    /// CFG scale.
    pub cfg_scale: Option<f64>,
    /// Guidance scale used by Flux-style models (A1111 `Guidance`, ComfyUI
    /// Flux guidance).
    #[serde(default)]
    pub guidance_scale: Option<f64>,
    /// Distilled CFG scale emitted by Flux WebUI/Forge implementations.
    #[serde(default)]
    pub distilled_cfg_scale: Option<f64>,
    /// Sampling shift used by SD3/Flux schedulers.
    #[serde(default)]
    pub shift: Option<f64>,
    /// Scheduler or schedule type (A1111 `Schedule type`, ComfyUI `scheduler`).
    #[serde(default)]
    pub schedule_type: Option<String>,
    /// CLIP-L text-encoder prompt from a dual-encoder Flux workflow.
    #[serde(default)]
    pub clip_l_prompt: Option<String>,
    /// T5-XXL text-encoder prompt from a dual-encoder Flux workflow.
    #[serde(default)]
    pub t5xxl_prompt: Option<String>,
    /// Sampler name.
    pub sampler: Option<String>,
    /// Checkpoint model name.
    pub model_name: Option<String>,
    /// Checkpoint model hash.
    pub model_hash: Option<String>,
    /// Video duration in seconds (for video media).
    #[serde(default)]
    pub duration_seconds: Option<f64>,
    /// Video frame rate in frames per second (for video media).
    #[serde(default)]
    pub fps: Option<f64>,
    /// Video codec identifier (e.g. h264, hevc, vp9, av1).
    #[serde(default)]
    pub video_codec: Option<String>,
}
