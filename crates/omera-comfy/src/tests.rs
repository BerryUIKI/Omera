use crate::protocol::*;
use serde_json::json;

#[test]
fn endpoint_routes_preserve_proxy_prefix_and_transport_security() {
    let base = endpoint(" https://localhost:8188/comfy/ ").unwrap();
    assert_eq!(
        route(&base, "queue").as_str(),
        "https://localhost:8188/comfy/queue"
    );
    assert_eq!(
        socket_url(&base, "fixture").as_str(),
        "wss://localhost:8188/comfy/ws?clientId=fixture"
    );
    for url in [
        "file:///etc/passwd",
        "ftp://host",
        "http://u:p@host",
        "http://host?a=b",
        "http://host/#x",
    ] {
        assert!(endpoint(url).is_err(), "{url}");
    }
}
#[test]
fn queue_sorting_discards_private_extra_data_and_bounds_workflow_size() {
    let data = json!({"queue_running":[[1,"a",{"1":{"class_type":"KSampler"}},{"secret":"never forwarded"}]],
        "queue_pending":[[4,"d",{}],[2,"b",{}],[3,"c",{}],[0,null,{}]]});
    let (running, pending, rt, pt) = queue(&data).unwrap();
    assert_eq!((rt, pt), (1, 4));
    assert_eq!(
        pending
            .iter()
            .map(|p| p.prompt_id.as_str())
            .collect::<Vec<_>>(),
        vec!["b", "c", "d"]
    );
    assert!(!serde_json::to_string(&running).unwrap().contains("secret"));
    let many = json!({"queue_running":[],"queue_pending":vec![json!([1,"id",{}]);200]});
    assert_eq!(queue(&many).unwrap().1.len(), QUEUE_LIMIT);
    assert!(queue(&json!({"queue_pending":[]})).is_err());
}
#[test]
fn execution_accepts_documented_progress_and_fences_arbitrary_messages() {
    let progress =
        execution(r#"{"type":"progress","data":{"node":"3","prompt_id":"a","value":2,"max":8}}"#)
            .unwrap();
    assert_eq!(progress.value, Some(2.0));
    assert_eq!(progress.max, Some(8.0));
    assert_eq!(progress.node.as_deref(), Some("3"));
    let done = execution(r#"{"type":"executing","data":{"node":null,"prompt_id":"a"}}"#).unwrap();
    assert!(done.node.is_none());
    assert!(execution(r#"{"type":"custom","data":{"token":"private"}}"#).is_none());
    assert!(execution("broken").is_none());
    assert!(execution(&"x".repeat(FRAME_LIMIT + 1)).is_none());
    let status =
        execution(r#"{"type":"status","data":{"status":{"exec_info":{"queue_remaining":3}}}}"#)
            .unwrap();
    assert_eq!(status.queue_remaining, Some(3));
}
#[test]
fn history_status_errors_and_device_unknowns_are_explicit() {
    let history = history(&json!({"old":{"prompt":[1],"status":{"status_str":"success"}},
        "new":{"prompt":[2],"status":{"status_str":"error","messages":[["execution_error",{"exception_message":"fixture error"}]]}}})).unwrap();
    assert_eq!(history[0].status, "failed");
    assert_eq!(history[0].error.as_deref(), Some("fixture error"));
    assert_eq!(history[1].status, "completed");
    let stats = devices(&json!({"devices":[{"name":"CPU","type":"cpu"}]})).unwrap();
    assert!(stats[0].vram_total.is_none());
}
