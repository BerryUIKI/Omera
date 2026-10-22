# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Omera** is an open-source **local asset manager and prompt studio for
AI-generated images**. It scans image/video folders, extracts prompt/model/
parameter metadata (PNGInfo, EXIF, `.txt` sidecars, ComfyUI workflows), and
indexes it into SQLite for search, organization (albums, tags, stacks,
favorites, ratings, NSFW), and model lookup. Additional features include local
WD14 auto-tagging, CLIP/SigLIP semantic search, cloud snapshot backup and media
mirroring, exports, batch transforms, and a signed auto-updater.

This is a clean-slate Tauri 2 rewrite (`omera` v0.4.x). The legacy C#/.NET
codebase is archived read-only on `old/main`. Milestones have moved well beyond
the original six; see [docs/ROADMAP.md](docs/ROADMAP.md) and
[CHANGELOG.md](CHANGELOG.md). Pre-1.0 compatibility with legacy "Berry" data
discovery/import is a standing obligation — see [AGENTS.md](AGENTS.md) and
[docs/OMERA_MIGRATION.md](docs/OMERA_MIGRATION.md).

## Build, Test & Lint

Frontend tooling is **pnpm**; Rust is a single workspace at the repository root.

```bash
pnpm install                      # install frontend dependencies
pnpm dev:desktop                  # run the desktop app (Vite + Rust, hot reload)
pnpm dev                          # frontend-only Vite server (port 1420)
pnpm build                        # vue-tsc --noEmit + vite build → dist/
pnpm tauri build                  # release bundle → src-tauri/target/release/bundle/

cargo test --workspace            # all Rust unit + integration tests
cargo clippy --workspace --all-targets -- -D warnings   # must be clean
cargo fmt --all -- --check        # must be clean
```

Frontend tests (Node's test runner via `tsx`, files in `tests/*.test.mjs`):

```bash
pnpm run test:stack               # discover and run all frontend regression tests
pnpm exec tsx --test tests/search-query.test.mjs        # a single frontend test
pnpm run test:memory              # memory audit
pnpm run bench:scroll             # scroll benchmark
```

- Run a single Rust test: `cargo test -p omera-storage db::tests::migrations_are_idempotent`.
- **`dist/` must exist before any cargo command that compiles `src-tauri`**
  (`tauri::generate_context!` embeds `frontendDist: "../dist"` at compile time).
  Tauri's `beforeBuildCommand`/`beforeDevCommand` run `pnpm build`/`pnpm dev`
  automatically; CI runs `pnpm build` before cargo.
- `pnpm dev` binds port 1420. Stop a separately running frontend server before
  starting `pnpm dev:desktop`/`pnpm tauri dev`.
- CI also enforces the generated IPC inventory:
  `node scripts/generate-ipc-reference.mjs --check`.
- CI runs the same steps in [.github/workflows/ci.yml](.github/workflows/ci.yml);
  match it before handing off a cross-layer change.

## Architecture

```
Frontend (src/, Vue 3 + TS) ── invoke() ──► src-tauri/ (thin #[tauri::command] adapters)
                                              │
                                              ▼
    crates/omera-domain   crates/omera-metadata   crates/omera-storage
    crates/omera-scan     crates/omera-tagger     crates/omera-clip
```

| Crate | Responsibility |
|---|---|
| `omera` (`src-tauri/`) | Tauri shell: window/lifecycle, `AppState`, IPC commands, watcher, cloud sync/backup orchestration, signed updates, legacy migration coordinator. **Thin adapters only — no business logic.** |
| `omera-domain` | Pure DTOs and domain logic: files/folders/albums/tags/stacks, search parsing, prompt similarity, collaboration and transform types. Zero I/O. |
| `omera-metadata` | Magic-byte container detection; parsers for WebUI/A1111, ComfyUI, NovelAI, Fooocus, InvokeAI, EasyDiffusion, LoRA, EXIF, video, `.txt` sidecars. |
| `omera-scan` | `Scanner` (walk → extract → batch upsert → orphan cleanup), thumbnails, AIGC pipeline, file operations, batch transform/export, HTML showcase. |
| `omera-storage` | SQLite persistence: `Database`, append-only `MIGRATIONS`, search/query builders, backup/restore recovery, storage-root and `StorageEngine` abstractions. |
| `omera-tagger` | Local WD14/Danbooru ONNX inference and auto-tagging (`ort`). |
| `omera-clip` | Local CLIP/SigLIP image/text embeddings and semantic similarity (`ort`, `tokenizers`). |

**Data flow:** Vue calls `invoke("command", args)`; the command validates input,
locks only the state it needs (`AppState` holds `Mutex<Database>` plus optional
tagger/CLIP/watcher instances, cancellation flags, and cloud-sync state), calls
into a core crate, and returns a Serde value or `Result<_, String>`. Do not hold
a shared lock across network, decode, or long inference work.

**Schema versioning:** `crates/omera-storage/src/migrations.rs` holds the ordered
`MIGRATIONS: &[&str]`; `Database::migrate()` applies pending entries in
transactions and bumps `PRAGMA user_version`. **Never edit, reorder, or delete an
applied migration — append a new one.** No ad-hoc DDL. SQLite runs in WAL mode;
restores use staged snapshots (`VACUUM INTO`) rather than replacing live files.

**IPC contract:** [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md) documents wire
conventions; [docs/IPC_REFERENCE.md](docs/IPC_REFERENCE.md) is generated from
`generate_handler!` (currently 167 commands). Top-level invoke args are
camelCase; nested DTO fields are snake_case. After adding/removing commands, run
`node scripts/generate-ipc-reference.mjs` and validate TypeScript DTO parity in
`src/types.ts`. Registered commands do not all imply a working backend (remote
database commands are experimental).

**Frontend:** `src/App.vue` orchestrates application state and navigation;
reusable logic lives in `src/utils/*.ts` (many are unit-tested directly by the
Node tests); UI components are in `src/components/`; DTO mirrors in
`src/types.ts`; i18n in `src/i18n/locales/` (7 locales + `auto`). Expensive
filesystem and image work stays out of the WebView thread.

## Working Conventions

- **Performance invariants:** gallery work during scroll must scale with visible
  items, not library size; keep card width stable and change column count
  instead; debounce/deduplicate speculative thumbnail work; startup renders the
  SQLite-backed library before any reconciliation walk; new large-library
  queries are paginated or bounded; honor `prefers-reduced-motion`. See
  [docs/PERFORMANCE.md](docs/PERFORMANCE.md).
- **Config changes:** new persisted fields need compatible defaults on both
  sides (`src/utils/config.ts` and Rust `AppConfig` in
  `src-tauri/src/commands.rs`), preserving legacy settings readability.
- **Localization:** user-facing strings belong in every file under
  `src/i18n/locales/`, not in templates as untranslated fallbacks.
- **Commits:** commit frequently in small, coherent increments (one logical
  change each); stage specific files/hunks and inspect the staged diff; preserve
  small commits when merging a multi-step PR; never rewrite history or run
  destructive Git commands without explicit approval.
- **Data safety:** preserve legacy features/fixtures and source data; cleanup of
  legacy application data requires validated destination data and an explicit,
  separate user confirmation. Never include user media or external vaults in
  automatic cleanup.
- Update architecture/performance docs when a change alters lifecycle, caching,
  virtualization, or persistence behavior.

## Branch Policy (critical)

Read [BRANCH_POLICY.md](BRANCH_POLICY.md) before branching.

- **`main`** is the default, protected branch — official releases only, direct
  pushes forbidden, PR-only, and accepts release PRs **from `dev` only**.
- **`dev`** is the integration branch — **all** feature/fix/chore/docs PRs
  target `dev`.
- Branch off `dev`, named `feature/<name>`, `fix/<name>`, `chore/<name>`, or
  `docs/<name>`. Use conventional commits (`feat:`, `fix:`, `chore:`, `docs:`).

**Practical implication for Claude:** never branch from or commit to `main`;
start from `dev` and point PRs at `dev`. The local checkout may be sitting on
`main` (the default), so check `git status`/`git branch` before editing.

```bash
git checkout dev && git pull origin dev && git checkout -b feature/your-feature
```

Release mechanics (version bump, preflight, signing, tagging) are documented in
[docs/RELEASING.md](docs/RELEASING.md); `scripts/bump-version.mjs` and
`scripts/release-preflight.mjs` enforce version consistency.

## Key Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — full component/frontend design
- [docs/PERFORMANCE.md](docs/PERFORMANCE.md) — performance model and backlog
- [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md), [docs/IPC_REFERENCE.md](docs/IPC_REFERENCE.md) — IPC surfaces
- [docs/INGESTION_AND_STACKING.md](docs/INGESTION_AND_STACKING.md) — folder modes, pipeline, stacking
- [docs/STORAGE_EVOLUTION.md](docs/STORAGE_EVOLUTION.md) — schema/storage direction
- [docs/SIGNED_UPDATES.md](docs/SIGNED_UPDATES.md) — update trust model
- [docs/ROADMAP.md](docs/ROADMAP.md) — milestone status and future work
- [AGENTS.md](AGENTS.md) — agent-specific rules, ownership boundaries, task cards
