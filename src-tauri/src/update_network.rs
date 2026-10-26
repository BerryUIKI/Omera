//! Native update transport, shared by release discovery and signed downloads.

use std::time::Duration;

/// All update endpoints use HTTPS. Environment overrides take precedence over
/// Windows' current-user manual proxy (including the common local proxy apps).
pub fn agent(timeout: Duration) -> Result<ureq::Agent, String> {
    crate::net::agent(timeout, "Omera-Updater")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_transport_rejects_plain_http() {
        // Does not contact the network, regardless of local proxy settings.
        assert!(agent(Duration::from_secs(1))
            .unwrap()
            .get("http://github.com/BerryUIKI/Omera/releases/latest")
            .call()
            .is_err());
    }
}
