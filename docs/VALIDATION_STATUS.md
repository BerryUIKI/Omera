# Handoff baseline and validation status

Recorded: 2026-09-23. No release readiness is implied.

## Baselines

- Integrated documentation: [PR #136](https://github.com/BerryUIKI/Omera/pull/136), merged into `dev` by the repository owner/workflow. The assistant did not merge it.
- Current `dev` baseline for this documentation follow-up: `4f57246b9aeaa6ce556e960171ab590e58584f3e`. Later documentation translations are preserved.
- Unmerged implementation snapshot: `5fabdd8`, branch `codex/repository-review-fixes`, [draft PR #138](https://github.com/BerryUIKI/Omera/pull/138). Runtime changes were committed at `b1b5afb`; `5fabdd8` only removes an extra blank line. This is a checkpoint of partial remediation, not an approved feature baseline or completed rename.
- IPC_REFERENCE.md describes the 138 command signatures in `5fabdd8`. Proposed migration IPC is not part of that registry.

To inspect/check the snapshot without replacing a working checkout:

```sh
git fetch origin codex/repository-review-fixes
git show 5fabdd8:src-tauri/src/commands.rs
node scripts/generate-ipc-reference.mjs --source-ref 5fabdd8 --check
```

## Completed automated checks on the implementation snapshot

Environment: Windows, repository workspace, available local Rust/Node/pnpm toolchains. These checks were run against the checkpoint content before commit; the final source change was whitespace-only.

| Check | Result |
| --- | --- |
| `pnpm run build` | Passed |
| `pnpm run test:stack` | Passed: 23 tests |
| `pnpm run test:memory` | Passed: 2 production-cache tests |
| `pnpm run bench:scroll` | Passed: 3 production-helper tests/measurements |
| `cargo fmt --check` | Passed |
| `cargo clippy --workspace -- -D warnings` | Passed, including the final recheck |
| `cargo test --workspace` | Passed after fixing Windows connection-release teardown and an obsolete hardcoded schema-version assertion |
| IPC signature generator | All 138 registered snapshot commands parsed; no missing registered declaration |

The storage recovery suite covers source-preserving WAL-inclusive copy, upgrading only the copy, refusing existing destinations, rejection of future schemas, invalid backups, and staged restore with retained recovery data. These tests do not constitute a complete migration coordinator or crash-fault matrix.

The Node benchmark measures helper execution, not WebView painting, image decode, full application memory or native scrolling FPS. No general product speedup is inferred from it.

## Not validated / not complete

- Native Grid, Waterfall and Table matrix at narrow/wide sizes, rapid dragging, stacks, keyboard and reduced motion.
- macOS/Linux build and runtime validation for the working changes, including credential-store dependencies.
- Actual Berry-to-Omera installer migration, App Store/provisioning implications, signed release artifacts, skipped-version upgrades and the next Omera update.
- Legacy source discovery, multi-artifact receipts, source selection, old WebView-origin export/import, final Omera activation and separately approved cleanup.
- Full file-operation fault/partial-result cases, config secret reuse/conflicts, watcher initialization/revocation races and remaining #98–#117 acceptance cases described in the task cards.

Do not close issues or merge draft PR #138 based solely on this table. Treat its changes as inputs to reviewed, issue-sized implementation work. The interface/assignment documents can be distributed independently, but engineers must use the baseline and readiness gate stated for their task.

## First Omera setup and legacy import follow-up (2026-10-14)

Local validation on Windows in `codex/version-update-check`, based on the current
`dev` integration checkout. This evidence does not replace the historical
snapshot records above or imply installer/release readiness.

- `pnpm run build`: passed (existing bundle-size advisory remains).
- `pnpm run test:stack`: 274 tests passed, including production setup/migration
  controls with controlled IPC, stale replies, failed saves, failed import
  invalidation, separately approved cleanup IDs and seven-locale diagnostics.
- `cargo fmt --check`, `cargo clippy --workspace -- -D warnings`, and
  `cargo test --workspace`: passed. The application suite has 82 tests and the
  storage suite 98; the other workspace unit, integration and doc tests passed.
- IPC inventory generation/check: 161 registered commands. Compatibility checks
  separately cover optional destination arguments, nullable measured capacity,
  new receipt defaults, and inherited configuration defaults.
- Temporary SQLite fixtures cover live empty-target staging, verified restart
  activation, changes after preview, custom destinations retaining the active
  library, source-preserving WAL snapshots, cache exclusion, legacy open-handle
  detection on Windows, stale cleanup artifacts, protected media, and partial
  disposal failure retaining the source database for renewed review.
- Browser fixtures mounted production components and the full application.
  Inherited Berry onboarding completion still opens first Omera setup; initial
  SQLite library requests precede discovery and optional startup cleanup does
  not run. English/Chinese text, GB capacity, unknown-space rejection, failed
  import invalidation, explicit cleanup approval, keyboard focus wrapping and
  500 px window layout were checked. Fixture cleanup used mocked IPC only.

No real user legacy directory, media, shared vault, or credentials were imported
or removed during these checks. Native installed old-to-new upgrade and
cross-platform installer/crash-fault matrices still require release validation.

## Workbench usability follow-up (2026-10-14)

Combined local evidence on Windows in `codex/version-update-check`, before
splitting the changes into the user-approved small PR stack:

- `pnpm run build`: passed; the existing bundle-size advisory remains.
- `pnpm run test:stack`: 290 tests passed. New coverage executes production
  Inspector/viewer/organization actions, verifies registered curation commands,
  late-reply fences, selected-tab preservation, bounded next-page navigation,
  conditional modal focus, pixel geometry, translated settings discovery,
  draft theme radios, and anchor capture before Vue clears element references.
- `cargo fmt --check`, `cargo clippy --workspace -- -D warnings`, and
  `cargo test --workspace`: passed, including 82 application and 98 storage
  tests. This phase introduces no Rust changes, IPC commands, or config fields.
- The production application was mounted in an isolated English browser fixture
  with mocked IPC and 520 synthetic entries. Grid, Waterfall, and Table were
  checked at wide and narrow sizes, including preview return, a rapid scrollbar
  drag, keyboard selection, stack expansion/collapse, ordinary-photo Overview,
  generated-image tabs, nested organization dialogs, Fit/100%, full-screen
  Escape, settings result focus, empty results, and save-only theme application.
  Mounted gallery cards/rows remained bounded to the visible window plus
  overscan. At display density 1, a 1600-pixel image measured 1600 display pixels
  at 100%. Reduced-motion safeguards are covered by style/regression checks;
  a native reduced-motion session was not exercised.

Browser evidence uses synthetic media and mocked persistence. Native installed
WebView behavior, real media/video codecs, and installed application smoke
checks remain separate release validation. No real library, legacy data,
credentials, or settings were changed by these fixtures. Each isolated PR also
receives its relevant TypeScript and production regression checks.

The follow-up is published as six draft PRs with individual commits preserved:

| PR | Scope | Current base |
| --- | --- | --- |
| [#393](https://github.com/BerryUIKI/Omera/pull/393) | Confirmed curation field patches and registered IPC | `dev` |
| [#394](https://github.com/BerryUIKI/Omera/pull/394) | Inspector tabs and shared UI-label foundations | #393 branch |
| [#395](https://github.com/BerryUIKI/Omera/pull/395) | Current-offset anchor capture before unmount | #394 branch |
| [#396](https://github.com/BerryUIKI/Omera/pull/396) | Central preview, shared Inspector, physical-pixel zoom | #395 branch |
| [#397](https://github.com/BerryUIKI/Omera/pull/397) | Settings search and draft theme cards | #394 branch |
| [#398](https://github.com/BerryUIKI/Omera/pull/398) | Organization dialog dismissal/refresh contracts | #396 branch |

The user explicitly approved stacked bases for this change. Merge #393, #394,
#395, #396, then #398; #397 can follow #394 independently. Retarget each child
to `dev` after its prerequisite merges and merge the updated `dev` into the
child to trigger required CI without rewriting commits. The current CI branch
filter schedules PR checks against `dev`; #393 passed Linux/macOS/Windows CI,
while the feature-based draft PRs still require those checks after retargeting.
Preserve individual commits instead of squash-merging.

## Workbench review follow-up (2026-10-15)

A production regression pass reproduced three gaps before applying fixes:

- Inspector: reclassifying an already revealed image as sensitive did not mask
  it again. The classification watcher now remasks without resetting the tab.
- Viewer: a pending next-page reply could navigate after an A/B/A selection
  round trip or a same-path media replacement. A selection revision cancels it.
- App shortcuts: embedded preview blocked Preferences, help, sidebar, and folder
  shortcuts together with hidden-gallery actions. App commands now remain
  available; gallery mutations, editable focus, and modal isolation stay guarded.

Each fix has a separate commit and a regression that failed before the change.
`pnpm run build` and all 294 frontend tests passed on the combined checkout;
isolated Inspector/viewer branches also passed TypeScript and relevant tests.
The English production-app browser fixture verified Ctrl+comma opening
Preferences from preview, B toggling navigation, and renewed sensitive masking
with Raw Data still selected. Persistence and media were synthetic mocked IPC.
No native installed application or real library was changed. Rust, IPC, and
configuration schemas are unchanged; the October 14 Rust validation remains the
backend baseline rather than a claim of a new native desktop smoke test.

Follow-ups are added to #394 and #396; dependencies are refreshed using merge
commits, with no rebases or squash merges. #393 remains the first integration
candidate with its existing green Linux/macOS/Windows CI. Feature-based PRs still
need their required CI after dependency merges and retargeting to `dev`.

## Joint workbench integration (2026-10-15)

The user approved a shared integration branch, `codex/workbench-joint`, based on
`dev` at `3b445f9` after #393 merged. It combines #394–#398 through merge commits
from `codex/organization-dialog-events` and `codex/settings-search-themes`, which
include their Inspector, gallery anchor, and preview prerequisites. The focused
PRs remain available for review, and all their individual commits are retained.
Use merge commits when integrating this branch to preserve that history.

#393 was squash-merged upstream. Its original commit and the new `dev` commit
have identical trees; the resulting three conflicts were resolved against the
validated feature tree. Before this documentation update, the complete joint
tree matched the earlier combined checkpoint `4cee241` exactly.

Fresh local checks on the joint branch passed: `pnpm run build`, all 294 tests
from `pnpm run test:stack` (including the memory and scroll suites),
`cargo fmt --all -- --check`, and the IPC inventory check (161 commands).
The existing bundle-size advisory remains. The joint PR targets `dev`, allowing
the existing Linux/macOS/Windows CI matrix to validate the combined changes.
Native installed WebView, real-media/video, and native reduced-motion smoke
checks remain release acceptance work; the earlier synthetic browser evidence
continues to apply to the identical frontend source.

## Post-integration audit (2026-10-15)

- #399 merged into `dev` at `466b8bb`, preserving the small commits from
  #394–#398. The merged tree matches the validated joint head `3160331`.
  [Post-merge CI](https://github.com/BerryUIKI/Omera/actions/runs/38704249822)
  passed on Windows, macOS, and Linux. All included PRs are merged or closed
  with integration references; the audit found no remaining open feature PRs.
- A viewer follow-up reproduced stale video time/duration on navigation and
  source revision changes. `317f4ca` clears the timeline and keys the video
  element by source revision. Build and all 295 frontend tests passed. An
  isolated browser fixture verified the new duration fallback and replacement
  of the video element after a same-path revision. It used synthetic entries
  without playable media; codec playback was not tested.
- Remaining work: native installed WebView and real-media/video smoke checks;
  the native narrow/wide gallery, keyboard, and reduced-motion matrix; and
  installed next-version/signed publication qualification tracked by #256.
  Earlier synthetic browser checks and passing CI do not close these gates.
  Installer/Sandbox tests previously deferred by the owner were not restarted.
- The existing Vite bundle-size advisory remains a performance follow-up.
  This audit introduces no Rust, IPC, schema, or configuration changes and
  makes no release-readiness claim.

## Language bundle follow-up (2026-10-15)

- #400's [post-merge CI](https://github.com/BerryUIKI/Omera/actions/runs/38707586218)
  passed on Windows, macOS, and Linux.
- The language catalog follow-up loads only the requested non-English catalog,
  preserves the English fallback and legacy preference lookup, fences late
  language changes, and prepares settings drafts before persistence. No Rust,
  IPC, schema, configuration field, or dependency changed.
- `pnpm run build` passed without the previous Vite chunk-size advisory. The
  main JavaScript asset fell from 695.21 kB to 373.77 kB (gzip 230.46 to
  118.39 kB). Deferred catalogs remain packaged; this is not an installer-size
  or startup-time measurement. See [PERFORMANCE.md](PERFORMANCE.md).
- All 301 frontend tests passed, including production settings save failure,
  seven-locale search, legacy saved-language startup, shared catalog requests,
  stale selection/failure handling, preparation isolation, and retry behavior.
- The production build ran in an isolated browser with an empty synthetic
  library and mocked native IPC. English startup requested no extra catalog;
  French startup requested only French. Actual menu selections rendered all
  seven languages. A deliberate French chunk HTTP failure retained English
  and displayed the localized error; a new document then loaded French.
  Preferences did not request a catalog while editing the language draft and
  applied French after a successful mocked save. No real user data changed.
- Native WebView, real-media, gallery/reduced-motion and installed-update
  acceptance remain open as recorded above; this frontend change does not
  qualify them.
