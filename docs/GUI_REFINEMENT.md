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
  pass (21 tests). Chinese/dark and English/light sidebar fixtures verified at
  1280×720, including folder expansion. Merged as PR #422.

- Package 2: bounded panel sizing passed 32 focused tests and a production build.
  Synthetic 1,200-item gallery checked at 960×640 and 1280×850 in all three view
  modes, including fixed card widths, bounded mounts, stacks, keyboard navigation,
  reset, persistence and embedded inspector. Reduced-motion CSS was forced in
  the fixture (the OS preference was not changed). Merged as PR #423.
- Package 3: shared decorative line icons retain control names and inherit the
  existing palette. Prompt and release-note reading text uses 14px / 1.6 line
  height. 39 focused regressions and production build pass; production App
  fixture visually checked at 1280×850.

- Package 4: the gallery width (not total window width) chooses direct display
  controls or a compact disclosure. One control tree preserves values and handlers.
  Search, filters and masking remain direct. Production build and three existing
  shortcut/header regressions pass. Browser checks at 960×640, 1280×850 and
  1720×900 verified layout, slider changes, Escape focus restoration and no page
  overflow. No card-width or decode behavior changed.
- Package 5: PR #425 merged after three-platform CI. The update dialog groups
  fallback actions, uses Later for secondary dismissal and reports verification
  separately from download/installer launch. Existing signed-update trust remains
  enforced. Verification-before-install is covered by production-handler tests.
- Package 6: exports, model downloads and update downloads share operation-owned
  task state. Scans and thumbnail diagnostics remain in the same Activity panel.
  A closed/reopened export dialog cannot duplicate a running export, and partial
  export failures retain their output path/error. Focused task/updater regressions
  and the production build pass; full frontend suite passes 335 tests. Chinese
  fixture visually verified running progress and failure details at 1280×850.
  Tasks are session-local; no unsupported cancel/retry controls are advertised.
