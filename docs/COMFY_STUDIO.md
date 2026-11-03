# ComfyUI studio implementation contract

Owner scope: 2026-11-03. Three bounded packages target `dev`: workflow graph,
live queue, and prompt comparison. Preserve individual commits and existing
generation submission behavior. Do not bump/release until integration is qualified.

## Workflow graph

Read API prompt graphs and UI workflow node/link documents from existing image
metadata. Preserve UI positions when available; lay out API graphs deterministically.
Selection, search, pan/zoom and connected-edge highlighting expose prompt,
sampler, ControlNet and LoRA nodes without changing the source workflow. Bound
input bytes, nodes, edges, labels and details; cycles and malformed links must
not hang or crash the viewer. Load the viewer only on explicit request.

## Live queue

Use the saved ComfyUI endpoint and native HTTP/WebSocket transport; do not widen
WebView CSP. Connect only on explicit user action. One bounded monitor owns its
worker and cancellation, reconnects with backoff, and releases resources when
disconnected or the application exits. REST queue/history snapshots reconcile
WebSocket execution messages, including reconnects. Show actual status, node
progress, queue order, recent outcomes and available VRAM, with unknown values
represented explicitly. Never clear, interrupt or submit a real queue as part of
automatic connection or tests. Keep HTTP reads, frames and retained history
bounded. No raw preview frames or arbitrary custom messages are forwarded.

Protocol sources: [routes](https://docs.comfy.org/development/comfyui-server/comms_routes),
[messages](https://docs.comfy.org/development/comfyui-server/comms_messages), and
[server source](https://github.com/Comfy-Org/ComfyUI/blob/master/server.py).
Native commands and event/DTO contracts must be recorded separately, checked
against the generated IPC inventory, and tested for serialization compatibility.

## Prompt comparison

Compare positive/negative prompts and generation parameters for the two selected
comparison images. Preserve original strings, token order, whitespace and Unicode;
highlight insertions/deletions and distinguish weight-only edits. Bound diff work
on long texts and avoid HTML injection. Fetch full details on demand when gallery
projections omit prompt data; fence late results on selection change.

## Acceptance

All seven UI languages, focused production-handler/parser tests, full frontend
build/regressions and Rust fmt/clippy/workspace tests. Local HTTP/WebSocket fixtures
exercise status, progress, completion/error, disconnect/reconnect, endpoint changes,
malformed/large frames, cancellation and partial API failures. Owner chose local
protocol fixtures only; no running personal ComfyUI instance will be contacted.
Browser QA covers narrow/wide layouts, keyboard access and reduced-motion styles.
Fixture results do not establish compatibility with every custom ComfyUI node.
