use serde::{Deserialize, Serialize};
use serde_json::Value;
use url::Url;

pub const RESPONSE_LIMIT: usize = 8 * 1024 * 1024;
pub const FRAME_LIMIT: usize = 256 * 1024;
pub const QUEUE_LIMIT: usize = 100;
pub const HISTORY_LIMIT: usize = 20;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct QueueItem {
    pub prompt_id: String,
    pub number: f64,
    pub graph_json: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HistoryItem {
    pub prompt_id: String,
    pub status: String,
    pub error: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Device {
    pub name: String,
    pub device_type: String,
    pub vram_total: Option<u64>,
    pub vram_free: Option<u64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Snapshot {
    pub running: Vec<QueueItem>,
    pub pending: Vec<QueueItem>,
    pub running_total: usize,
    pub pending_total: usize,
    pub recent: Vec<HistoryItem>,
    pub devices: Vec<Device>,
    pub history_error: Option<String>,
    pub stats_error: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ExecutionMessage {
    pub kind: String,
    pub prompt_id: Option<String>,
    pub node: Option<String>,
    pub value: Option<f64>,
    pub max: Option<f64>,
    pub queue_remaining: Option<u64>,
    pub error: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MonitorEvent {
    Connection {
        status: String,
        error: Option<String>,
    },
    Snapshot {
        snapshot: Snapshot,
    },
    Execution {
        message: ExecutionMessage,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SessionInfo {
    pub session_id: String,
    pub client_id: String,
    pub endpoint: String,
}

pub fn endpoint(raw: &str) -> Result<Url, String> {
    if raw.len() > 2048 {
        return Err("ComfyUI endpoint is too long".into());
    }
    let mut url = Url::parse(raw.trim()).map_err(|_| "Invalid ComfyUI endpoint")?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(
            "ComfyUI endpoint requires HTTP(S) without credentials, query or fragment".into(),
        );
    }
    let path = url.path().trim_end_matches('/').to_owned();
    url.set_path(&path);
    Ok(url)
}
pub fn route(base: &Url, suffix: &str) -> Url {
    let mut url = base.clone();
    url.set_path(&format!("{}/{}", base.path().trim_end_matches('/'), suffix));
    url
}
pub fn socket_url(base: &Url, client_id: &str) -> Url {
    let mut url = route(base, "ws");
    url.set_scheme(if base.scheme() == "https" {
        "wss"
    } else {
        "ws"
    })
    .expect("valid scheme");
    url.query_pairs_mut().append_pair("clientId", client_id);
    url
}
fn text(value: Option<&Value>, max: usize) -> Option<String> {
    value?.as_str().map(|s| s.chars().take(max).collect())
}
pub fn queue(value: &Value) -> Result<(Vec<QueueItem>, Vec<QueueItem>, usize, usize), String> {
    let running = value
        .get("queue_running")
        .and_then(Value::as_array)
        .ok_or("Invalid running queue")?;
    let pending = value
        .get("queue_pending")
        .and_then(Value::as_array)
        .ok_or("Invalid pending queue")?;
    let parse = |items: &[Value]| {
        items
            .iter()
            .take(QUEUE_LIMIT)
            .filter_map(|item| {
                let row = item.as_array()?;
                let id = row.get(1)?.as_str()?;
                if id.is_empty() || id.len() > 128 {
                    return None;
                }
                let graph_json = row
                    .get(2)
                    .filter(|v| v.as_object().is_some_and(|nodes| nodes.len() <= 500))
                    .and_then(|v| serde_json::to_string(v).ok())
                    .filter(|s| s.len() <= 2 * 1024 * 1024);
                Some(QueueItem {
                    prompt_id: id.into(),
                    number: row.first()?.as_f64()?,
                    graph_json,
                })
            })
            .collect()
    };
    let mut waiting: Vec<QueueItem> = parse(pending);
    waiting.sort_by(|a, b| {
        a.number
            .total_cmp(&b.number)
            .then_with(|| a.prompt_id.cmp(&b.prompt_id))
    });
    Ok((parse(running), waiting, running.len(), pending.len()))
}
pub fn history(value: &Value) -> Result<Vec<HistoryItem>, String> {
    let entries = value.as_object().ok_or("Invalid ComfyUI history")?;
    let mut rows: Vec<_> = entries.iter().collect();
    // History objects do not promise insertion order; queue number provides a
    // stable newest-first ordering across versions and reconnects.
    rows.sort_by(|a, b| {
        let number = |v: &Value| {
            v.get("prompt")
                .and_then(|p| p.get(0))
                .and_then(Value::as_f64)
                .unwrap_or(0.0)
        };
        number(b.1)
            .total_cmp(&number(a.1))
            .then_with(|| b.0.cmp(a.0))
    });
    Ok(rows
        .into_iter()
        .take(HISTORY_LIMIT)
        .map(|(id, item)| {
            let status = item.get("status");
            let messages = status
                .and_then(|s| s.get("messages"))
                .and_then(Value::as_array);
            let error = messages.and_then(|messages| {
                messages.iter().find_map(|message| {
                    if message.get(0)?.as_str()? != "execution_error" {
                        return None;
                    }
                    text(message.get(1)?.get("exception_message"), 1000)
                })
            });
            let outcome = match status
                .and_then(|s| s.get("status_str"))
                .and_then(Value::as_str)
            {
                Some("success") => "completed",
                Some("error") => "failed",
                _ => "unknown",
            };
            HistoryItem {
                prompt_id: id.chars().take(128).collect(),
                status: outcome.into(),
                error,
            }
        })
        .collect())
}
pub fn devices(value: &Value) -> Result<Vec<Device>, String> {
    Ok(value
        .get("devices")
        .and_then(Value::as_array)
        .ok_or("Invalid ComfyUI device statistics")?
        .iter()
        .take(8)
        .map(|item| Device {
            name: text(item.get("name"), 200).unwrap_or_default(),
            device_type: text(item.get("type"), 32).unwrap_or_default(),
            vram_total: item.get("vram_total").and_then(Value::as_u64),
            vram_free: item.get("vram_free").and_then(Value::as_u64),
        })
        .collect())
}
pub fn execution(raw: &str) -> Option<ExecutionMessage> {
    if raw.len() > FRAME_LIMIT {
        return None;
    }
    let root: Value = serde_json::from_str(raw).ok()?;
    let kind = root.get("type")?.as_str()?;
    if !matches!(
        kind,
        "status"
            | "execution_start"
            | "executing"
            | "progress"
            | "execution_success"
            | "execution_error"
            | "execution_interrupted"
            | "execution_cached"
    ) {
        return None;
    }
    let data = root.get("data")?;
    let node = data
        .get("node")
        .and_then(|v| text(Some(v), 128).or_else(|| v.as_i64().map(|n| n.to_string())));
    let finite = |key| {
        data.get(key)
            .and_then(Value::as_f64)
            .filter(|v| v.is_finite() && *v >= 0.0)
    };
    Some(ExecutionMessage {
        kind: kind.into(),
        prompt_id: text(data.get("prompt_id"), 128),
        node,
        value: finite("value"),
        max: finite("max"),
        queue_remaining: data
            .pointer("/status/exec_info/queue_remaining")
            .or_else(|| data.pointer("/exec_info/queue_remaining"))
            .and_then(Value::as_u64),
        error: text(data.get("exception_message"), 1000),
    })
}
