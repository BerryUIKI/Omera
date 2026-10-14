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
- `pnpm run test:stack`: 289 tests passed. New coverage executes production
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
