use omera_comfy::{monitor::MonitorService, protocol::MonitorEvent};
use serde_json::json;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    mpsc, Arc, Mutex,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tungstenite::Message;

struct Fixture {
    endpoint: String,
    stop: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
    clients: Arc<Mutex<Vec<String>>>,
    sockets: Arc<AtomicUsize>,
}
impl Fixture {
    fn new(disconnect_first: bool, history_fails: bool) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let stop = Arc::new(AtomicBool::new(false));
        let cancel = stop.clone();
        let clients = Arc::new(Mutex::new(Vec::new()));
        let ids = clients.clone();
        let sockets = Arc::new(AtomicUsize::new(0));
        let count = sockets.clone();
        let handle = thread::spawn(move || {
            let mut workers = Vec::new();
            while !cancel.load(Ordering::Relaxed) {
                let Ok((mut stream, _)) = listener.accept() else {
                    thread::sleep(Duration::from_millis(10));
                    continue;
                };
                let cancel = cancel.clone();
                let ids = ids.clone();
                let count = count.clone();
                workers.push(thread::spawn(move || {
                    stream.set_read_timeout(Some(Duration::from_secs(1))).unwrap();
                    stream.set_write_timeout(Some(Duration::from_secs(1))).unwrap();
                    let mut bytes=[0u8;2048];let Ok(n)=stream.peek(&mut bytes) else{return;};
                    let request=String::from_utf8_lossy(&bytes[..n]);
                    if request.starts_with("GET /ws?") {
                        let path=request.split_whitespace().nth(1).unwrap_or_default().to_owned();
                        ids.lock().unwrap().push(path);
                        let number=count.fetch_add(1,Ordering::Relaxed);
                        let Ok(mut socket)=tungstenite::accept(stream) else{return;};
                        for text in [
                            r#"{"type":"status","data":{"status":{"exec_info":{"queue_remaining":2}}}}"#,
                            r#"{"type":"execution_start","data":{"prompt_id":"fixture-job"}}"#,
                            r#"{"type":"progress","data":{"prompt_id":"fixture-job","node":"3","value":2,"max":8}}"#,
                            r#"{"type":"custom","data":{"secret":"must not be forwarded"}}"#,
                            "malformed",
                        ] {let _=socket.send(Message::Text(text.into()));}
                        let _=socket.send(Message::Text("x".repeat(omera_comfy::protocol::FRAME_LIMIT+1).into()));
                        let _=socket.send(Message::Text(r#"{"type":"execution_cached","data":{"prompt_id":"fixture-job"}}"#.into()));
                        let _=socket.send(Message::Binary(vec![0,1,2].into()));
                        if disconnect_first && number==0 {let _=socket.close(None);return;}
                        socket.get_mut().set_read_timeout(Some(Duration::from_millis(100))).unwrap();
                        while !cancel.load(Ordering::Relaxed) {
                            match socket.read() {
                                Err(tungstenite::Error::Io(error)) if matches!(error.kind(),std::io::ErrorKind::TimedOut|std::io::ErrorKind::WouldBlock)=>{},
                                Ok(Message::Close(_))|Err(_)=>break,
                                _=>{},
                            }
                        }
                    } else {
                        let mut request=Vec::new();
                        while !request.ends_with(b"\r\n\r\n") && request.len()<8192 {
                            let mut byte=[0];if stream.read_exact(&mut byte).is_err(){return;} request.push(byte[0]);
                        }
                        let request=String::from_utf8_lossy(&request);
                        let (status,body)=if request.starts_with("GET /queue ") {
                            (200,json!({"queue_running":[[1,"fixture-job",{"3":{"class_type":"KSampler","inputs":{"seed":42}}}]],"queue_pending":[[2,"waiting",{}]]}).to_string())
                        } else if request.starts_with("GET /history?") {
                            if history_fails {(503,"unavailable".into())} else {(200,json!({"previous":{"prompt":[0],"status":{"status_str":"success"}}}).to_string())}
                        } else {(200,json!({"devices":[{"name":"Fixture GPU","type":"cuda","vram_total":8000,"vram_free":4000}]}).to_string())};
                        let _=write!(stream,"HTTP/1.1 {status} OK\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{body}",body.len());
                    }
                }));
            }
            for worker in workers {
                let _ = worker.join();
            }
        });
        Self {
            endpoint,
            stop,
            handle: Some(handle),
            clients,
            sockets,
        }
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        let _ = self.handle.take().unwrap().join();
    }
}
fn receive_until(
    rx: &mpsc::Receiver<MonitorEvent>,
    mut predicate: impl FnMut(&MonitorEvent) -> bool,
) {
    let deadline = Instant::now() + Duration::from_secs(12);
    loop {
        let event = rx
            .recv_timeout(deadline.saturating_duration_since(Instant::now()))
            .unwrap();
        if predicate(&event) {
            return;
        }
    }
}

#[test]
fn real_http_websocket_reconnect_preserves_client_and_cleans_up() {
    let fixture = Fixture::new(true, false);
    let service = MonitorService::default();
    let (tx, rx) = mpsc::channel();
    let session = service
        .start(
            &fixture.endpoint,
            Arc::new(move |event| tx.send(event).is_ok()),
        )
        .unwrap();
    receive_until(
        &rx,
        |event| matches!(event,MonitorEvent::Snapshot{snapshot} if snapshot.pending_total==1 && snapshot.devices[0].vram_free==Some(4000)),
    );
    receive_until(
        &rx,
        |event| matches!(event,MonitorEvent::Execution{message} if message.kind=="progress" && message.node.as_deref()==Some("3")),
    );
    receive_until(
        &rx,
        |event| matches!(event,MonitorEvent::Execution{message} if message.kind=="execution_cached"),
    );
    receive_until(
        &rx,
        |event| matches!(event,MonitorEvent::Connection{status,..} if status=="reconnecting"),
    );
    receive_until(
        &rx,
        |event| matches!(event,MonitorEvent::Connection{status,..} if status=="connected"),
    );
    assert!(fixture.sockets.load(Ordering::Relaxed) >= 2);
    let clients = fixture.clients.lock().unwrap();
    assert_eq!(clients[0], clients[1]);
    drop(clients);
    service.stop("stale-session").unwrap();
    assert!(service.client_for_endpoint(&fixture.endpoint).is_some());
    let start = Instant::now();
    service.stop(&session.session_id).unwrap();
    assert!(start.elapsed() < Duration::from_secs(2));
    assert!(service.client_for_endpoint(&fixture.endpoint).is_none());
}
#[test]
fn partial_api_failure_retains_queue_and_replacing_endpoint_retires_old_session() {
    let first = Fixture::new(false, true);
    let second = Fixture::new(false, false);
    let service = MonitorService::default();
    let (tx, rx) = mpsc::channel();
    let old = service
        .start(
            &first.endpoint,
            Arc::new(move |event| tx.send(event).is_ok()),
        )
        .unwrap();
    receive_until(
        &rx,
        |event| matches!(event,MonitorEvent::Snapshot{snapshot} if snapshot.history_error.is_some() && snapshot.running_total==1),
    );
    let (tx, rx) = mpsc::channel();
    let new = service
        .start(
            &second.endpoint,
            Arc::new(move |event| tx.send(event).is_ok()),
        )
        .unwrap();
    assert!(service.client_for_endpoint(&first.endpoint).is_none());
    service.stop(&old.session_id).unwrap();
    receive_until(
        &rx,
        |event| matches!(event,MonitorEvent::Snapshot{snapshot} if snapshot.history_error.is_none()),
    );
    service.stop(&new.session_id).unwrap();
    assert!(service.client_for_endpoint(&second.endpoint).is_none());
}
#[test]
fn disconnected_backoff_is_cancelable_and_dead_channels_stop_workers() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    drop(listener);
    let service = MonitorService::default();
    let (tx, rx) = mpsc::channel();
    let session = service
        .start(
            &format!("http://{address}"),
            Arc::new(move |event| tx.send(event).is_ok()),
        )
        .unwrap();
    receive_until(&rx, |event| {
        matches!(event, MonitorEvent::Connection { error: Some(_), .. })
    });
    let start = Instant::now();
    service.stop(&session.session_id).unwrap();
    assert!(start.elapsed() < Duration::from_secs(1));
    let fixture = Fixture::new(false, false);
    let session = service
        .start(&fixture.endpoint, Arc::new(|_| false))
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(2);
    while service.client_for_endpoint(&fixture.endpoint).is_some() && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(10));
    }
    assert!(service.client_for_endpoint(&fixture.endpoint).is_none());
    service.stop(&session.session_id).unwrap();
}
