import { shallowReactive } from "vue";
import { Channel, invoke } from "@tauri-apps/api/core";

export interface ComfyQueueItem { prompt_id: string; number: number; graph_json: string | null }
export interface ComfyHistoryItem { prompt_id: string; status: string; error: string | null }
export interface ComfyDevice { name: string; device_type: string; vram_total: number | null; vram_free: number | null }
export interface ComfySnapshot {
  running: ComfyQueueItem[]; pending: ComfyQueueItem[]; running_total: number; pending_total: number;
  recent: ComfyHistoryItem[]; devices: ComfyDevice[]; history_error: string | null; stats_error: string | null;
}
export interface ComfyExecution {
  kind: string; prompt_id: string | null; node: string | null; value: number | null;
  max: number | null; queue_remaining: number | null; error: string | null;
}
export type ComfyEvent =
  | { type: "connection"; status: string; error: string | null }
  | { type: "snapshot"; snapshot: ComfySnapshot }
  | { type: "execution"; message: ComfyExecution };
export interface ComfySession { session_id: string; client_id: string; endpoint: string }
type Connection = "disconnected" | "connecting" | "connected" | "reconnecting" | "degraded" | "error";
export interface ComfyMonitorState {
  status: Connection; endpoint: string; session: ComfySession | null; snapshot: ComfySnapshot | null;
  activePromptId: string | null; node: string | null; value: number; max: number;
  queueRemaining: number | null; error: string | null; lastUpdated: number | null; fresh: boolean;
}
interface Transport {
  start(endpoint: string, receive: (event: ComfyEvent) => void): Promise<ComfySession>;
  stop(sessionId: string): Promise<void>;
}
const nativeTransport: Transport = {
  start(endpoint, receive) {
    const channel = new Channel<ComfyEvent>(); channel.onmessage = receive;
    return invoke("start_comfyui_monitor", { endpoint, onEvent: channel });
  },
  stop(sessionId) { return invoke("stop_comfyui_monitor", { sessionId }); },
};
export function createComfyMonitor(transport: Transport = nativeTransport) {
  const state = shallowReactive<ComfyMonitorState>({ status: "disconnected", endpoint: "", session: null,
    snapshot: null, activePromptId: null, node: null, value: 0, max: 0, queueRemaining: null,
    error: null, lastUpdated: null, fresh: false });
  let revision = 0;
  let transition = Promise.resolve();
  const resetExecution = () => { state.activePromptId = null; state.node = null; state.value = 0; state.max = 0; };
  function receive(event: ComfyEvent) {
    if (event.type === "connection") {
      const statuses: Connection[] = ["connecting", "connected", "reconnecting", "degraded", "error"];
      state.status = statuses.includes(event.status as Connection) ? event.status as Connection : "error";
      state.error = event.error;
      if (state.status !== "connected") { state.fresh = false; resetExecution(); }
      return;
    }
    if (event.type === "snapshot") {
      state.snapshot = event.snapshot.history_error && state.snapshot
        ? { ...event.snapshot, recent: state.snapshot.recent } : event.snapshot;
      state.lastUpdated = Date.now(); state.fresh = true;
      state.queueRemaining = event.snapshot.running_total + event.snapshot.pending_total;
      if (state.activePromptId && !event.snapshot.running.some(item => item.prompt_id === state.activePromptId)) resetExecution();
      return;
    }
    if (event.type !== "execution") return;
    const message = event.message;
    if (message.kind === "status") { state.queueRemaining = message.queue_remaining; return; }
    if (["execution_success", "execution_error", "execution_interrupted"].includes(message.kind)) {
      if (message.kind === "execution_error") state.error = message.error;
      if (message.prompt_id && message.prompt_id === state.activePromptId) resetExecution();
      return;
    }
    if (["execution_start", "executing", "progress"].includes(message.kind)) {
      if (message.prompt_id && message.prompt_id !== state.activePromptId) {
        resetExecution(); state.activePromptId = message.prompt_id;
      }
      // Older servers can send an unscoped reconnect node. Do not attach it to
      // an arbitrary queue item or display somebody else's node on a graph.
      if (!state.activePromptId) return;
      if (message.kind === "executing") {
        state.node = message.node; state.value = 0; state.max = 0;
        if (!message.node) resetExecution();
      } else if (message.kind === "progress") {
        if (message.node) state.node = message.node;
        const max = message.max ?? 0, value = message.value ?? 0;
        state.max = Number.isFinite(max) && max > 0 ? max : 0;
        state.value = Number.isFinite(value) ? Math.max(0, Math.min(value, state.max)) : 0;
      } else { state.error = null; }
    }
  }
  function connect(endpoint: string) {
    const request = ++revision;
    state.status = "connecting"; state.error = null; state.fresh = false;
    state.endpoint = endpoint; state.snapshot = null; state.lastUpdated = null;
    state.queueRemaining = null; resetExecution();
    transition = transition.catch(() => {}).then(async () => {
      if (request !== revision) return;
      const previous = state.session; state.session = null;
      try {
        if (previous) await transport.stop(previous.session_id);
        if (request !== revision) return;
        const session = await transport.start(endpoint, event => { if (request === revision) receive(event); });
        if (request !== revision) { await transport.stop(session.session_id); return; }
        state.session = session; state.endpoint = session.endpoint;
      } catch (error) {
        if (request === revision) { state.status = "error"; state.error = String(error); }
      }
    });
    return transition;
  }
  function disconnect() {
    const request = ++revision;
    state.status = "disconnected"; state.fresh = false; state.snapshot = null;
    state.queueRemaining = null; state.error = null; state.lastUpdated = null; resetExecution();
    transition = transition.catch(() => {}).then(async () => {
      const previous = state.session; state.session = null;
      if (previous) {
        try { await transport.stop(previous.session_id); }
        catch (error) { if (request === revision) { state.error = String(error); state.status = "error"; } }
      }
    });
    return transition;
  }
  return { state, connect, disconnect };
}
// Importing this module is idle. Explicit Connect owns the session independently
// of the queue dialog, and native AppState owns shutdown cancellation.
export const comfyMonitor = createComfyMonitor();
