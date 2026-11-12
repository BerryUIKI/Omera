# Motion score design (Milestone 15, final package)

Status: **Design only — nothing is implemented.** This document settles the
algorithm, the persistence shape and the computation trigger for the last open
Milestone 15 item in [ROADMAP.md](ROADMAP.md). It is a proposal for review; no
schema, IPC or UI change accompanies it.

## Why this is not a wiring task

The duration, frame-rate, resolution and codec facets were pure wiring because
`width`, `height` and `video_codec` were already in stored metadata. Motion has
no such source. It is a derived metric that requires looking at pixels, and this
codebase has never looked at video pixels outside the WebView.

That single fact decides most of the design.

## Constraint: there is no Rust-side video decoder

`crates/omera-metadata/src/video.rs` parses MP4 (ISOBMFF) and WebM (EBML)
container headers. It reads stream geometry, duration, frame rate and codec from
the headers. It does not decode a single frame.

`crates/omera-scan` depends on `image = { version = "0.25", default-features =
false, features = ["png", "jpeg", "webp", "avif", "rayon"] }`. That is the
complete set of decodable formats. There is no MP4 or WebM decoder anywhere in
the workspace, and no `ffmpeg`/`ffprobe` subprocess anywhere in the codebase.

Introducing a decoder is a heavy decision rather than an implementation detail:

| Candidate | Cost |
|---|---|
| `ffmpeg-next` / bundled ffmpeg | Large native dependency, licensing review, per-platform build and signing work, and it would push installer size against the enforced budgets (25 MiB NSIS/DMG, 40 MiB MSI/DEB/RPM, 120 MiB AppImage) |
| A pure-Rust MP4/VP8/VP9/AV1 decoder | No mature, maintained option covering the codec matrix the video milestone already advertises |
| Shelling out to a user-installed ffmpeg | Adds an unverified external runtime dependency to a signed, self-contained application |

None of these are justified by a single filter facet.

## The channel that already exists

Video thumbnails are already produced by the WebView, not by Rust:

1. `VirtualGrid.vue` renders a `<video>` element for video cards and, on
   `loadeddata`, calls `captureAndSaveVideoThumbnail` (`src/utils/thumbnail.ts`).
2. That function draws the current frame onto a canvas, downscales to the
   thumbnail edge, encodes WebP via `canvas.toDataURL`, and invokes
   `save_video_thumbnail`.
3. `save_video_thumbnail` (`src-tauri/src/commands.rs`) decodes the base64,
   writes the file into the thumbnail cache, and records a
   `ThumbnailCacheEntry` in SQLite.

This works because file paths are served over Tauri's `asset:` protocol
(`convertFileSrc` in `src/utils/image.ts`) and the configured folder roots are
granted via `asset_protocol_scope().allow_directory(...)`. The video element is
therefore **same-origin with the page**, so `drawImage` into a canvas does not
taint it and `toDataURL` succeeds. Without that, reading pixels would be
impossible regardless of decoder availability.

Motion scoring should extend this channel, not invent a parallel one. The
decode cost is paid by a decoder that already ships with the platform, and the
pixels never have to enter Rust.

## Algorithm

### Recommendation: downsampled grayscale mean absolute difference

For a given video, sample `N` frames at fixed fractional positions across the
clip, decode each to a small fixed-size grayscale buffer, and average the
per-pixel absolute difference between consecutive samples.

```
sample positions: t_k = duration * (k + 0.5) / N        for k in 0..N
for each k: draw video frame at t_k into a W x H canvas (W = H = 64)
            apply ctx.filter = "grayscale(1)" via a second pass
            read the pixel buffer with getImageData
motion_raw = mean over k in 1..N of  mean over pixels |frame[k] - frame[k-1]| / 255
motion_score = round(motion_raw * 100)                 → 0..100, REAL
```

The parameters are not arbitrary:

- **Grayscale** removes chroma noise from compression artifacts and avoids
  weighting colour shifts that a viewer does not read as motion.
- **64×64 downsampling** is the important step. It makes the score independent
  of source resolution — a 480p and a 4K clip of the same scene should score
  alike — and it low-passes away both sensor noise and per-pixel grain. It also
  bounds the work: 4 KiB per frame regardless of source size.
- **Fixed fractional sampling with a half-step offset** avoids always landing on
  a black lead-in frame or a final duplicate frame, and makes the score
  comparable across clips of different lengths.
- **Consecutive-sample difference** rather than "first frame vs last frame"
  keeps the metric about ongoing motion rather than total displacement, so a
  slow pan does not score the same as a punch.

`N = 8` is the starting value. It is a tunable, and per-frame cost is small
enough that `N = 12` is affordable if the first pass proves too coarse.

### Known weaknesses and their mitigations

| Weakness | Mitigation |
|---|---|
| Global brightness ramps (fade in/out) read as motion because every pixel changes | Subtract the per-frame mean before differencing, so only spatially varying change counts |
| Compression artifacts in near-static footage inflate the score | The 64×64 downsample already suppresses this; a small dead zone (scores below ~2 clamp to 0) keeps "static" meaning static |
| A clip with one brief cut scores like uniformly busy footage | The average is over samples, so a single instantaneous cut contributes at most `1/N` of the total |
| Sampling can miss motion entirely between samples | Accepted. The facet is a coarse triage band, not a measurement; users filter "basically still" vs "busy", not exact motion energy |

### Rejected alternatives

- **Optical flow** (Farneback, TV-L1, RAFT) gives a richer per-pixel vector
  field, but it needs an implementation the project does not have, costs an
  order of magnitude more per frame, and — critically — its output is not
  obviously better for a coarse 0..100 triage band. It can be revisited if users
  ask for direction-aware filtering.
- **Persisting the raw frame buffers** to score later in Rust. Decoding is the
  expensive part; caching raw frames costs disk for a value that can be computed
  once in a few milliseconds.
- **Decoding in Rust with a new dependency**, for the reasons in the constraint
  section above.

## Persistence

A new column on `files`, following the shape that `rating` and `aesthetic_score`
already use:

```sql
-- v19: derived motion score for video assets.
ALTER TABLE files ADD COLUMN motion_score REAL;
CREATE INDEX idx_files_motion_score ON files(motion_score);
```

Notes:

- **A real column, not a key inside the `metadata` JSON.** `metadata` holds
  values extracted from the file's own container; the motion score is a derived
  measurement. Mixing them would put a value the scanner writes next to values
  the media writes, and it would force every facet query onto
  `json_extract` instead of an index.
- **Nullable, with no default.** Existing rows stay `NULL` until a score is
  computed. `NULL` means "not measured", which is what it is.
- **Append-only.** v19 is appended to `MIGRATIONS`; the existing eighteen entries
  are untouched. `LATEST_VERSION` follows `MIGRATIONS.len()` automatically.
- **Migration is metadata-only.** Adding a nullable column with no rewrite is
  cheap on large libraries; the index build is the only real cost and is
  proportional to row count, not file size.

`motion_score` must also be carried through the paths that already carry
`aesthetic_score`: the upsert statements (`db.rs`), the row readers, the
`ImageFile` DTO in `omera-domain`, `src/types.ts`, and the migration-export
readers in `crates/omera-storage/src/migration_export.rs`. The upsert must
preserve an existing score on rescan the same way `aesthetic_score` does — a
rescan that re-reads metadata must not wipe a measurement:

```sql
motion_score = coalesce(excluded.motion_score, files.motion_score)
```

## When it is computed

Three triggers, in order of importance.

### 1. Opportunistic, on the existing `loadeddata` path

`onVideoLoadedData` in `VirtualGrid.vue` already fires when a video card first
becomes playable, and already triggers thumbnail capture. Scoring there adds
almost nothing: the element is decoded, and the additional cost is `N - 1`
seeks plus `N` canvas reads.

The score is written through a new command (see IPC below) only when the stored
value is `NULL`, so the work happens once per file, not once per hover or per
scroll position.

This makes the facet fill in as the user browses, which is consistent with how
thumbnails, and how the SQLite-backed library in general, already behave.

### 2. Explicit batch action

A "Compute motion scores" action beside the existing batch operations, with
progress, cancellation and a count of skipped files. It walks videos missing a
score, driven by the same bounded async-command pattern as
`batch_generate_thumbnails`.

This is the only way to score a library without scrolling through it, and it
must be user-initiated: it decodes video and will spin the GPU for a large
library.

### 3. Not at scan time

Ingestion must not decode video. Scan currently walks metadata only, and a
decode-per-file during import would make importing a video library orders of
magnitude slower — a direct violation of the startup and ingestion performance
invariants in [PERFORMANCE.md](PERFORMANCE.md).

## Facet wiring

Mirrors the resolution and codec facets that just shipped:

| Layer | Change |
|---|---|
| `crates/omera-domain/src/search.rs` | `min_motion: Option<f64>`, `max_motion: Option<f64>` |
| `crates/omera-storage/src/db.rs` | Two conditions against the `files.motion_score` column (not `json_extract`) |
| `src/types.ts` | `min_motion?: number \| null; max_motion?: number \| null;` |
| `src/utils/search.ts` | `motion:` token with the shared range grammar; `criteriaToQuery` and `countActiveFilters` |
| `src/components/FilterDrawer.vue` | A Motion group under the existing `v-if="mediaType !== 'image'"` guard, with Still / Subtle / Lively / Dynamic presets |
| `src/i18n/locales/*.ts` | Keys in all seven locales |

Query syntax follows the established pattern: `motion:>=60`, `motion:10..30`,
`motion:0`.

The SQL predicate is a plain column comparison, which is why the score lives in
`files` rather than in JSON:

```sql
files.motion_score >= ?     -- min_motion
files.motion_score <= ?     -- max_motion
```

Rows with a `NULL` score never match a motion filter, which is the correct
behavior: an unmeasured clip is not "still".

Sorting by motion score (`FileSortField::MotionScore`) is deliberately out of
scope for the first package. It touches the sort enum, the cursor keyset logic
and the sort bar, and filtering is the feature the milestone describes.

## IPC surface

Two commands, following the thin-adapter rule:

```rust
// Persist one score computed in the WebView.
#[tauri::command]
async fn save_video_motion_score(
    file_id: i64,
    modified_at: i64,       // guards against a stale write after the file changed
    motion_score: f64,      // clamped to 0..=100 in Rust, not trusted from JS
    app_handle: AppHandle,
) -> Result<(), String>;

// Return the ids of videos that still need a score, bounded like other pages.
#[tauri::command]
async fn list_unscored_videos(limit: u32) -> Result<Vec<FileMotionTarget>, String>;
```

`save_video_motion_score` clamps and rejects non-finite values. The WebView is
trusted in the same limited sense it already is for `save_video_thumbnail`: it
proposes a number, and the backend enforces the range and the staleness check.

After adding both, run `node scripts/generate-ipc-reference.mjs`.

## Unmeasurable files

The WebView decodes with whatever the operating system provides. On Windows,
WebView2 relies on OS codecs rather than bundling Edge's proprietary ones —
HEVC and AV1 playback can be unavailable on a machine without the corresponding
extensions. The project's own validation notes record that "codec playback was
not tested" (`docs/VALIDATION_STATUS.md`), so this is an unverified surface, not
a known-good one.

The design handles this by not depending on it:

- If the element never reaches a playable state, or `getImageData` fails, or
  fewer than two frames decode, no score is written. The row stays `NULL`.
- `NULL` never matches a motion filter, so a file that cannot be measured is
  simply absent from motion-filtered results, rather than being mislabelled.
- The batch action reports how many files it could not measure, broken down by
  reason, instead of silently skipping them.

No fallback decoder is introduced. If real-world coverage of HEVC or AV1 turns
out to be poor, that is a decoder question with its own cost/benefit review, not
something to paper over inside this feature.

## Rollout

Four PRs, each landing on its own and each independently mergeable.

| Package | Content | Gate |
|---|---|---|
| **M1 — Schema and plumbing** | v19 migration, `motion_score` on the DTO and row readers, upsert preservation, migration-export readers | Rust tests: migration idempotence, upsert preserves an existing score, export round-trip |
| **M2 — Scoring engine** | The `N`-sample grayscale MAD routine in `src/utils/`, pure and unit-tested against synthetic canvases | Node tests: static frames score ~0, a hard cut scores high, brightness ramp stays low, resolution independence |
| **M3 — Compute and persist** | `onVideoLoadedData` hookup, `save_video_motion_score`, `list_unscored_videos`, batch action with progress and cancellation | IPC reference regenerated; a manual pass over a mixed library |
| **M4 — Facet and UI** | `SearchCriteria`, SQL conditions, `motion:` token, drawer group, seven locales | Query round-trip tests; locale parity test |

M1 must land before M3 writes anything; M2 and M4 can be developed in parallel
with M1.

## Validation that would close the milestone

Mapping the algorithm is not the same as proving it. Before the facet is
described as delivered, the following should be recorded, in the same shape
`docs/COMFY_STUDIO.md` uses for its own qualification:

- The same clip at several resolutions and bitrates scores within a few points.
- A known-static clip (a still with a slow fade) scores below a known-busy clip.
- The codec matrix — H.264, HEVC, VP8, VP9, AV1 — either scores or fails in the
  documented `NULL` way on each platform, with the codec that failed named.
- A batch run over a few hundred videos completes with bounded memory and can be
  cancelled mid-run without leaving a partial score.

Until that evidence exists, Milestone 15 should continue to read as open.
