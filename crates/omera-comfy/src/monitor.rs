use crate::protocol::{self, MonitorEvent, SessionInfo, Snapshot, FRAME_LIMIT, RESPONSE_LIMIT};
use std::io::Read;
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tungstenite::{
    client_tls_with_config, protocol::WebSocketConfig, stream::MaybeTlsStream, Message,
};
use url::Url;

type Emit = Arc<dyn Fn(MonitorEvent) -> bool + Send + Sync>;
pub type CompletedImages = Arc<dyn Fn(Vec<std::path::PathBuf>, &AtomicBool) + Send + Sync>;
struct Worker {
    info: SessionInfo,
    stop: Arc<AtomicBool>,
    handle: JoinHandle<()>,
}
#[derive(Default)]
pub struct MonitorService {
    active: Mutex<Option<Worker>>,
    transition: Mutex<()>,
}

impl MonitorService {
    /// Nonblocking exit signal; no network join is performed on the app thread.
    pub fn shutdown(&self) {
        if let Ok(active) = self.active.lock() {
            if let Some(worker) = active.as_ref() {
                worker.stop.store(true, Ordering::Relaxed);
            }
        }
    }
    pub fn start(&self, raw: &str, emit: Emit) -> Result<SessionInfo, String> {
        self.start_with_images(raw, emit, None)
    }
    pub fn start_with_images(
        &self,
        raw: &str,
        emit: Emit,
        images: Option<CompletedImages>,
    ) -> Result<SessionInfo, String> {
        let base = protocol::endpoint(raw)?;
        // Reject concurrent transitions rather than accumulating blocked workers.
        let _transition = self
            .transition
            .try_lock()
            .map_err(|_| "ComfyUI monitor transition is busy")?;
        let previous = self
            .active
            .lock()
            .map_err(|_| "Monitor lock failed")?
            .take();
        if let Some(worker) = previous {
            stop_worker(worker);
        }
        let info = SessionInfo {
            session_id: uuid::Uuid::new_v4().to_string(),
            client_id: uuid::Uuid::new_v4().to_string(),
            endpoint: base.to_string(),
        };
        let stop = Arc::new(AtomicBool::new(false));
        let cancel = stop.clone();
        let client_id = info.client_id.clone();
        let handle = thread::Builder::new()
            .name("omera-comfy-monitor".into())
            .spawn(move || run(base, client_id, cancel, emit, images))
            .map_err(|_| "Cannot start ComfyUI monitor")?;
        *self.active.lock().map_err(|_| "Monitor lock failed")? = Some(Worker {
            info: info.clone(),
            stop,
            handle,
        });
        Ok(info)
    }
    pub fn stop(&self, session_id: &str) -> Result<(), String> {
        let mut active = self.active.lock().map_err(|_| "Monitor lock failed")?;
        if active
            .as_ref()
            .is_some_and(|worker| worker.info.session_id == session_id)
        {
            let worker = active.take().expect("checked active worker");
            drop(active);
            stop_worker(worker);
        }
        Ok(())
    }
    pub fn client_for_endpoint(&self, raw: &str) -> Option<String> {
        let endpoint = protocol::endpoint(raw).ok()?.to_string();
        self.active
            .lock()
            .ok()?
            .as_ref()
            .filter(|worker| {
                worker.info.endpoint == endpoint && !worker.stop.load(Ordering::Relaxed)
            })
            .map(|worker| worker.info.client_id.clone())
    }
}
impl Drop for MonitorService {
    fn drop(&mut self) {
        if let Ok(Some(worker)) = self.active.get_mut() {
            worker.stop.store(true, Ordering::Relaxed);
        }
    }
}
fn stop_worker(worker: Worker) {
    worker.stop.store(true, Ordering::Relaxed);
    let _ = worker.handle.join();
}
fn connection(emit: &Emit, status: &str, error: Option<String>) -> bool {
    emit(MonitorEvent::Connection {
        status: status.into(),
        error,
    })
}
fn pause(stop: &AtomicBool, duration: Duration) {
    let deadline = Instant::now() + duration;
    while !stop.load(Ordering::Relaxed) && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(50));
    }
}
fn read_json(agent: &ureq::Agent, url: &Url) -> Result<serde_json::Value, String> {
    let response = agent
        .get(url.as_str())
        .call()
        .map_err(|_| "ComfyUI HTTP request failed")?;
    if response.status() != 200 {
        return Err("ComfyUI HTTP request did not return 200".into());
    }
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take((RESPONSE_LIMIT + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| "Cannot read ComfyUI response")?;
    if bytes.len() > RESPONSE_LIMIT {
        return Err("ComfyUI response exceeds 8 MiB".into());
    }
    serde_json::from_slice(&bytes).map_err(|_| "Invalid ComfyUI JSON response".into())
}

fn snapshot(agent: &ureq::Agent, base: &Url, stop: &AtomicBool) -> Result<Snapshot, String> {
    let value = read_json(agent, &protocol::route(base, "queue"))?;
    let (running, pending, running_total, pending_total) = protocol::queue(&value)?;
    if stop.load(Ordering::Relaxed) {
        return Err("Monitor stopped".into());
    }
    let mut history_url = protocol::route(base, "history");
    history_url.query_pairs_mut().append_pair("max_items", "20");
    let history = read_json(agent, &history_url).and_then(|v| protocol::history(&v));
    if stop.load(Ordering::Relaxed) {
        return Err("Monitor stopped".into());
    }
    let devices = read_json(agent, &protocol::route(base, "system_stats"))
        .and_then(|v| protocol::devices(&v));
    Ok(Snapshot {
        running,
        pending,
        running_total,
        pending_total,
        history_error: history.as_ref().err().cloned(),
        stats_error: devices.as_ref().err().cloned(),
        recent: history.unwrap_or_default(),
        devices: devices.unwrap_or_default(),
    })
}
fn connect(
    base: &Url,
    client_id: &str,
) -> Result<tungstenite::WebSocket<MaybeTlsStream<TcpStream>>, String> {
    let address = (
        base.host_str().ok_or("Missing ComfyUI host")?,
        base.port_or_known_default().ok_or("Missing ComfyUI port")?,
    );
    let mut stream = None;
    for address in address
        .to_socket_addrs()
        .map_err(|_| "Cannot resolve ComfyUI host")?
        .take(4)
    {
        if let Ok(socket) = TcpStream::connect_timeout(&address, Duration::from_secs(2)) {
            stream = Some(socket);
            break;
        }
    }
    let stream = stream.ok_or("Cannot connect to ComfyUI WebSocket")?;
    stream
        .set_read_timeout(Some(Duration::from_secs(3)))
        .map_err(|_| "Cannot configure socket")?;
    stream
        .set_write_timeout(Some(Duration::from_secs(3)))
        .map_err(|_| "Cannot configure socket")?;
    let mut config = WebSocketConfig::default();
    // Binary preview frames are discarded, not decoded or forwarded. Keep a
    // separate smaller bound for parsed JSON messages.
    config.max_message_size = Some(RESPONSE_LIMIT);
    config.max_frame_size = Some(RESPONSE_LIMIT);
    let (mut socket, _) = client_tls_with_config(
        protocol::socket_url(base, client_id).as_str(),
        stream,
        Some(config),
        None,
    )
    .map_err(|_| "ComfyUI WebSocket handshake failed")?;
    let stream = match socket.get_mut() {
        MaybeTlsStream::Plain(stream) => stream,
        MaybeTlsStream::Rustls(stream) => &mut stream.sock,
        _ => return Err("Unsupported ComfyUI TLS transport".into()),
    };
    stream
        .set_read_timeout(Some(Duration::from_millis(200)))
        .map_err(|_| "Cannot configure socket")?;
    Ok(socket)
}
fn run(
    base: Url,
    client_id: String,
    stop: Arc<AtomicBool>,
    emit: Emit,
    images: Option<CompletedImages>,
) {
    let agent = ureq::AgentBuilder::new()
        .redirects(0)
        .timeout(Duration::from_secs(3))
        .build();
    let mut failures = 0u32;
    while !stop.load(Ordering::Relaxed) {
        if !connection(
            &emit,
            if failures == 0 {
                "connecting"
            } else {
                "reconnecting"
            },
            None,
        ) {
            break;
        }
        match connect(&base, &client_id) {
            Ok(mut socket) => {
                if !connection(&emit, "connected", None) {
                    break;
                }
                let mut last_snapshot = Instant::now() - Duration::from_secs(10);
                let mut last_progress = Instant::now() - Duration::from_secs(1);
                let mut degraded = false;
                let mut queue_changed = false;
                while !stop.load(Ordering::Relaxed) {
                    if last_snapshot.elapsed() >= Duration::from_secs(3)
                        || (queue_changed && last_snapshot.elapsed() >= Duration::from_millis(750))
                    {
                        match snapshot(&agent, &base, &stop) {
                            Ok(snapshot) => {
                                failures = 0;
                                if degraded && !connection(&emit, "connected", None) {
                                    break;
                                }
                                degraded = false;
                                if !emit(MonitorEvent::Snapshot { snapshot }) {
                                    stop.store(true, Ordering::Relaxed);
                                    break;
                                }
                            }
                            Err(error) => {
                                degraded = true;
                                if !connection(&emit, "degraded", Some(error)) {
                                    break;
                                }
                            }
                        }
                        last_snapshot = Instant::now();
                        queue_changed = false;
                    }
                    match socket.read() {
                        Ok(Message::Text(text)) if text.len() <= FRAME_LIMIT => {
                            if let Some(callback) = &images {
                                let paths = protocol::completed_images(text.as_str());
                                if !paths.is_empty() && !stop.load(Ordering::Relaxed) {
                                    callback(paths, &stop);
                                }
                            }
                            if let Some(message) = protocol::execution(text.as_str()) {
                                queue_changed |=
                                    message.kind != "progress" && message.kind != "executing";
                                if message.kind == "progress"
                                    && last_progress.elapsed() < Duration::from_millis(100)
                                {
                                    continue;
                                }
                                if message.kind == "progress" {
                                    last_progress = Instant::now();
                                }
                                if !emit(MonitorEvent::Execution { message }) {
                                    stop.store(true, Ordering::Relaxed);
                                    break;
                                }
                            }
                        }
                        Ok(Message::Close(_)) => break,
                        Err(tungstenite::Error::Io(error))
                            if matches!(
                                error.kind(),
                                std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                            ) => {}
                        Err(_error) => {
                            // Keep diagnostics free of frame contents and HTTP
                            // response bodies. Release builds emit no debug log.
                            #[cfg(debug_assertions)]
                            {
                                let reason = match &_error {
                                    tungstenite::Error::Io(error) => {
                                        format!("I/O {:?}", error.kind())
                                    }
                                    tungstenite::Error::Protocol(error) => {
                                        format!("protocol {error}")
                                    }
                                    tungstenite::Error::Capacity(error) => {
                                        format!("capacity {error}")
                                    }
                                    _ => format!("category {:?}", std::mem::discriminant(&_error)),
                                };
                                eprintln!("ComfyUI socket read stopped: {reason}");
                            }
                            break;
                        }
                        _ => {}
                    }
                }
                let _ = socket.close(None);
            }
            Err(error) => {
                if !connection(&emit, "reconnecting", Some(error)) {
                    break;
                }
            }
        }
        if stop.load(Ordering::Relaxed) {
            break;
        }
        failures = failures.saturating_add(1);
        if !connection(
            &emit,
            "reconnecting",
            Some("ComfyUI connection lost; retrying".into()),
        ) {
            break;
        }
        pause(&stop, Duration::from_secs(1u64 << failures.min(4)));
    }
    stop.store(true, Ordering::Relaxed);
}

#[cfg(test)]
mod bounds_tests {
    use super::*;
    #[test]
    fn http_body_and_redirect_boundaries_are_enforced() {
        let mut server = mockito::Server::new();
        let oversized = server
            .mock("GET", "/large")
            .with_body(vec![b'x'; RESPONSE_LIMIT + 1])
            .create();
        let redirect = server
            .mock("GET", "/redirect")
            .with_status(302)
            .with_header("Location", "http://must-not-contact.invalid/queue")
            .with_body("{\"queue_running\":[],\"queue_pending\":[]}")
            .create();
        let agent = ureq::AgentBuilder::new()
            .redirects(0)
            .timeout(Duration::from_secs(3))
            .build();
        assert!(read_json(
            &agent,
            &Url::parse(&format!("{}/large", server.url())).unwrap()
        )
        .unwrap_err()
        .contains("8 MiB"));
        assert!(read_json(
            &agent,
            &Url::parse(&format!("{}/redirect", server.url())).unwrap()
        )
        .is_err());
        oversized.assert();
        redirect.assert();
    }
}
