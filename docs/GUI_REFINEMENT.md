# GUI refinement execution

Owner authorization: 2026-11-01. Implement all six proposed GUI improvements in
small PRs targeting `dev`, preserving atomic commits. The sidebar retains its
content, colors, navigation, keyboard and drag/drop behavior. Release timing is
delegated to Codex; do not republish existing release assets.

## Work packages

1. Sidebar rhythm: shared row/type/icon/radius/inset metrics and larger controls.
2. Resizable side panels: bounded widths, keyboard adjustment, reset, and local
   per-device persistence. Gallery cards retain their existing fixed widths.
3. Readability and icon consistency: shared line icons and larger reading text.
4. Responsive toolbar: direct wide-window controls and compact display settings;
   search, filters and privacy masking remain readily available.
5. Update dialog: concise retention guidance, one main action, secondary dismissal,
   grouped fallback actions and explicit download/verification/installation status.
6. Task center: bounded background task state and a common status/drawer entry for
   scans, downloads and exports. Do not invent unsupported cancellation or retry.

Each package includes focused behavior checks and a production build. Gallery
layout changes additionally require Grid/Waterfall/Table at narrow/wide sizes,
scroll/stack/keyboard and reduced-motion checks. Record actual observations and
remaining limits. Run the full frontend/Rust suites before release integration.

## Evidence

- The preceding updater PR #421 passed all three CI platforms and was merged
  using a merge commit before this work started.
- Package 1: PR #422 merged after three-platform CI. Existing navigation,
  search and folder-tree regressions pass (21 tests). Chinese/dark and
  English/light isolated previews verified geometry and folder expansion.
- Package 2: width preferences use the existing per-device `omera_` storage
  helpers (`layout_sidebar_width` / `layout_inspector_width`), with legacy read
  fallback and bounded defaults. They are presentation preferences, not new
  synchronized AppConfig fields. No startup IPC or filesystem work is added.
  The center reserves at least one fixed-width card plus padding. An isolated
  production-App fixture with 1,200 synthetic entries checked 960×640 and
  1280×850 Grid/Waterfall/Table, keyboard resize, pointer drag, reset, persisted
  widths, stack expansion/collapse, End-key rapid scrolling and embedded details.
  Mounted cards remained bounded (36 observed after scrolling), with 200px
  cards unchanged by panel resize and no page overflow. Reduced-motion CSS was
  forced in this fixture; the resize handle had a 0s transition. Actual OS
  reduced-motion switching was not performed. PR integration is pending.
