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

## Completion-driven local indexing (2026-11-04)

The studio offers an optional registered linked output folder at connection time.
It must match the loopback server's output root. Persisted `executed` image events
index only the named files (including subfolders) and publish the existing library
change event; gallery updates use the established bounded refresh scheduler.
There is no full directory walk or speculative original-image decode in the WebView.
The native monitor worker serializes indexing and may defer socket processing while
extracting one item. Cancellation is checked between files. Duplicate events use
the normal path upsert and unchanged files do not cause another gallery refresh.

This is the first Milestone 17 ingestion package, not completion of the full
zero-latency pipeline. Pipeline copy/cleanup, remote server downloads, video/custom
node output descriptors, history replay after reconnect and large-batch overflow
remain follow-ups. Existing filesystem watching remains enabled for recovery.
Source media and legacy data are preserved; no schema or configuration field changes.

## Prior graph, queue and comparison acceptance

All seven UI languages, focused production-handler/parser tests, full frontend
build/regressions and Rust fmt/clippy/workspace tests. Local HTTP/WebSocket fixtures
exercise status, progress, completion/error, disconnect/reconnect, endpoint changes,
malformed/large frames, cancellation and partial API failures. Owner chose local
protocol fixtures only; no running personal ComfyUI instance will be contacted.
Browser QA covers narrow/wide layouts, keyboard access and reduced-motion styles.
Fixture results do not establish compatibility with every custom ComfyUI node.

Graph and queue acceptance (2026-11-03): native local TCP HTTP/WebSocket fixtures
passed reconnect/client identity, stale-session cancellation, endpoint replacement,
partial API failures and malformed/large frames. Shared Serde/TypeScript fixtures
validate DTO compatibility separately from the 169-command IPC inventory. Rust
workspace fmt, clippy with warnings denied and tests passed. Browser fixtures used
production Inspector, graph and queue components at 960x640 and 1440x900, Chinese
dark and English light themes: search, keyboard selection, pan/zoom, active-node
highlight, real step counts, pending selection, explicit disconnect, focus return
and reduced-motion styles. No personal ComfyUI instance was contacted.

Prompt Diff acceptance (2026-11-03): lossless Unicode/whitespace reconstruction,
explicit weight edits, reorder/empty/escaped input, adversarial nesting and long
text limits passed. Production component tests cover seven locales, HTML escaping,
zero versus missing parameters, selected-pair hydration and late reply disposal.
Local browser fixtures verified 1440x900 and 960x640, Chinese/dark and English/light,
positive/negative text, partial-detail notices, long-text section fallback and
20,000-character display caps, with no hidden image stages or horizontal overflow.
The image mode keeps synchronized zoom/pan and existing stack-cover actions.
