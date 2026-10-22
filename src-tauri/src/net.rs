//! Shared HTTPS transport with environment and Windows system-proxy support.
//!
//! Callers must pass their own user agent so update and Civitai traffic stay
//! distinguishable. HTTPS-only is enforced for every outbound request.

use std::time::Duration;

pub fn agent(timeout: Duration, user_agent: &str) -> Result<ureq::Agent, String> {
    let environment_proxy = [
        "HTTPS_PROXY",
        "https_proxy",
        "ALL_PROXY",
        "all_proxy",
        "HTTP_PROXY",
        "http_proxy",
    ]
    .iter()
    .filter_map(|key| std::env::var(key).ok())
    .find(|value| !value.trim().is_empty());
    let proxy = environment_proxy.or_else(system_proxy);
    let mut builder = ureq::builder()
        .https_only(true)
        .redirects(10)
        .timeout_connect(Duration::from_secs(15))
        .timeout(timeout)
        .user_agent(user_agent);
    if let Some(proxy) = proxy {
        builder = builder
            .proxy(ureq::Proxy::new(proxy.trim()).map_err(|_| "Invalid proxy configuration")?);
    }
    Ok(builder.build())
}

#[cfg(windows)]
fn system_proxy() -> Option<String> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};

    // Read on each operation so changes made by a local proxy app take effect
    // without restarting Omera. Do not log proxy settings or credentials.
    let settings = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")
        .ok()?;
    if settings.get_value::<u32, _>("ProxyEnable").ok()? == 0 {
        return None;
    }
    https_proxy(&settings.get_value::<String, _>("ProxyServer").ok()?)
}

#[cfg(not(windows))]
fn system_proxy() -> Option<String> {
    None
}

#[cfg(any(windows, test))]
fn https_proxy(servers: &str) -> Option<String> {
    let servers = servers.trim();
    if servers.is_empty() {
        return None;
    }
    if !servers.contains('=') {
        return Some(servers.to_string());
    }
    // Windows also permits per-protocol entries: http=host:port;https=host:port.
    // Never use an HTTP-only entry for HTTPS traffic.
    servers.split(';').find_map(|entry| {
        let (protocol, server) = entry.trim().split_once('=')?;
        let server = server.trim();
        (protocol.trim().eq_ignore_ascii_case("https") && !server.is_empty())
            .then(|| server.to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_manual_and_protocol_specific_windows_proxies() {
        assert_eq!(
            https_proxy(" 127.0.0.1:7890 "),
            Some("127.0.0.1:7890".into())
        );
        assert_eq!(
            https_proxy("http=127.0.0.1:8080; HTTPS = 127.0.0.1:7890"),
            Some("127.0.0.1:7890".into())
        );
        assert_eq!(https_proxy("http=127.0.0.1:8080"), None);
        assert_eq!(https_proxy("https=;http=localhost:80"), None);
        assert_eq!(https_proxy(" "), None);
    }

    #[test]
    fn rejects_plain_http_transport() {
        // Does not contact the network, regardless of local proxy settings.
        assert!(agent(Duration::from_secs(1), "Omera-Test")
            .unwrap()
            .get("http://civitai.com/")
            .call()
            .is_err());
    }
}
