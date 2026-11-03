//! Bounded, read-only ComfyUI monitoring independent of Tauri and library storage.
pub mod monitor;
pub mod protocol;

#[cfg(test)]
mod tests;
