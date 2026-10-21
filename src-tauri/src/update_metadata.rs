//! Fixed official release endpoints; never an arbitrary URL fetch IPC.

use std::{io::Read, time::Duration};

const API_URL: &str = "https://api.github.com/repos/BerryUIKI/Omera/releases/latest";
const FALLBACK_URL: &str = "https://github.com/BerryUIKI/Omera/releases/latest";
const MAX_METADATA_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Debug, serde::Serialize)]
pub struct UpdateMetadataResponse {
    pub status: u16,
    pub url: String,
    pub body: String,
}

pub fn fetch(fallback: bool) -> Result<UpdateMetadataResponse, String> {
    let agent = crate::update_network::agent(Duration::from_secs(25))?;
    request(
        &agent,
        if fallback { FALLBACK_URL } else { API_URL },
        fallback,
    )
}

fn request(
    agent: &ureq::Agent,
    url: &str,
    fallback: bool,
) -> Result<UpdateMetadataResponse, String> {
    let response = match agent
        .get(url)
        .set(
            "Accept",
            if fallback {
                "text/html"
            } else {
                "application/vnd.github+json"
            },
        )
        .call()
    {
        Ok(response) | Err(ureq::Error::Status(_, response)) => response,
        Err(error) => return Err(format!("GitHub update request failed: {error}")),
    };
    let status = response.status();
    let url = response.get_url().to_string();
    let mut body = String::new();
    // The HTML fallback only needs the final redirect URL. Do not buffer a page.
    if !fallback {
        response
            .into_reader()
            .take(MAX_METADATA_BYTES + 1)
            .read_to_string(&mut body)
            .map_err(|error| format!("Failed reading update metadata: {error}"))?;
        if body.len() as u64 > MAX_METADATA_BYTES {
            return Err("GitHub update metadata exceeds size limit".into());
        }
    }
    Ok(UpdateMetadataResponse { status, url, body })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "requires real GitHub access and the current user's proxy settings"]
    fn live_official_update_endpoints() {
        let response = fetch(false).unwrap();
        assert_eq!(response.status, 200);
        let release: serde_json::Value = serde_json::from_str(&response.body).unwrap();
        assert!(release["tag_name"].as_str().is_some());
        println!(
            "Native GitHub API: HTTP {}, tag {}",
            response.status, release["tag_name"]
        );
        let fallback = fetch(true).unwrap();
        assert_eq!(fallback.status, 200);
        assert!(fallback
            .url
            .starts_with("https://github.com/BerryUIKI/Omera/releases/tag/"));
        println!(
            "Native GitHub fallback: HTTP {}, {}",
            fallback.status, fallback.url
        );
    }

    #[test]
    fn serializes_the_typescript_wire_contract() {
        let response = UpdateMetadataResponse {
            status: 200,
            url: API_URL.into(),
            body: "{\"tag_name\":\"v0.4.7\"}".into(),
        };
        assert_eq!(
            serde_json::to_value(response).unwrap(),
            serde_json::json!({
                "status": 200, "url": API_URL, "body": "{\"tag_name\":\"v0.4.7\"}"
            })
        );
    }

    #[test]
    fn preserves_api_status_and_bounds_response_size() {
        let mut server = mockito::Server::new();
        let limited = server
            .mock("GET", "/latest")
            .with_status(403)
            .with_body("rate limited")
            .create();
        let agent = ureq::builder().try_proxy_from_env(false).build();
        let response = request(&agent, &format!("{}/latest", server.url()), false).unwrap();
        assert_eq!(response.status, 403);
        assert_eq!(response.body, "rate limited");
        limited.assert();
        let large = server
            .mock("GET", "/large")
            .with_body("x".repeat(MAX_METADATA_BYTES as usize + 1))
            .create();
        assert!(request(&agent, &format!("{}/large", server.url()), false)
            .unwrap_err()
            .contains("size limit"));
        large.assert();
    }

    #[test]
    fn fallback_follows_redirect_and_returns_only_url() {
        let mut server = mockito::Server::new();
        let redirect = server
            .mock("GET", "/latest")
            .with_status(302)
            .with_header("Location", "/releases/tag/v0.4.7")
            .create();
        let page = server
            .mock("GET", "/releases/tag/v0.4.7")
            .with_body("unused HTML")
            .create();
        let agent = ureq::builder().try_proxy_from_env(false).build();
        let response = request(&agent, &format!("{}/latest", server.url()), true).unwrap();
        assert_eq!(response.status, 200);
        assert_eq!(
            response.url,
            format!("{}/releases/tag/v0.4.7", server.url())
        );
        assert!(response.body.is_empty());
        redirect.assert();
        page.assert();
    }
}
