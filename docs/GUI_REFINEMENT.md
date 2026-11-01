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
- Package 1: existing sidebar navigation, search and folder-tree regressions
  pass (21 tests). Visual acceptance and PR integration are pending.
