# Isolated Windows update qualification

Prepared 2026-10-12 for #256. This checkout is a test fixture derived from `dev`
at `bda2cbc4a91ff7fb36bfe356a3c3045244b9ce80`. Its 0.4.4 version bump identifies
the test successor to the signed 0.4.3 baseline; it is not an approved release.
Do not merge this fixture version into integration or create a release/tag from it.

The owner authorized testing on this Windows 11 x64 device and will perform the
macOS/Linux installed-update tests. The normal Windows profile has an existing
Omera installation, settings and a SQLite library with WAL files. Keep them intact.
Windows Sandbox is absent; use a separate disposable local account. Account setup
requires the owner's administrator action and is not part of installer execution.
Never reuse Codex's service sandbox accounts or request the owner's password.

`scripts/prepare-windows-update-account.ps1` defaults to a read-only setup plan.
Its explicit `-Create` mode is for the owner to review and run in an elevated
Windows PowerShell window. It refuses an existing account, creates a three-day
`OmeraUpdateQA` account in the built-in Users group, and prompts locally for the
test password without saving it. No installer is launched by account preparation.
The helper's creation mode has not been executed or qualified on this device.

1. Verify the baseline and test-successor NSIS packages against the pinned public
   key, record their SHA-256 hashes and the exact source/build versions.
2. In the disposable account, install 0.4.3, launch it, and create a synthetic
   library and saved settings. Record shortcuts and uninstall registration.
3. Close the app, install the signed 0.4.4 NSIS successor in the same account, and
   reopen it. Confirm displayed version, library records, preferences and source
   retention. Never point this test at the normal profile or personal media.
4. Record MSI command-plan tests separately; a machine-wide MSI installation is
   outside this isolated current-user NSIS test and needs a disposable OS.
5. Qualify the in-app discovery/download/install path once an approved official
   signed successor is published. These local installer steps do not exercise
   GitHub's stable `releases/latest` discovery and cannot close #256 by themselves.

Private update-signing credentials stay outside this checkout and are not copied
into the Windows test account. Preserve evidence outside the managed checkout
before archiving it. Remove only task-owned fixtures after qualification; cleanup
of the normal installed application or library is never part of this test.

## Owner's macOS and Linux handoff

Build the same 0.4.4 fixture through the non-publishing artifact workflow for
Linux x64, and through the production macOS qualification-only workflow for
Apple Silicon. Retain the corresponding signed 0.4.3 baseline packages. The owner
performs native installed-upgrade checks on those operating systems and records
the version, hashes, restart, preferences, synthetic library and source retention.
Do not substitute an unnotarized macOS artifact for the production-qualified DMG.
These local installer pairs still leave official stable update discovery untested.

## Evidence recorded so far

- Local Windows 11 x64 NSIS build completed with embedded pinned update trust.
  The application resource reports FileVersion/ProductVersion `0.4.4`.
  The build started at fixture revision `0f61a82`; subsequent changes during the
  build affected only this guide and the unexecuted account-preparation helper.
  The 17,528,830-byte installer passed the production streaming verifier after
  signing. SHA-256:
  `b61db56fc69cd74765529ce87c7ca1e1b7038c0abfcc25c55f5dc6a461ee2000`.
- All six copied 0.4.3 baseline packages verified again, including the production
  notarized macOS DMG. Public packages and four repository-icon media fixtures
  are retained in the owner's Downloads qualification folder; no private signing
  credentials or ordinary library data were copied.
- [Artifact run 38162255683](https://github.com/BerryUIKI/Omera/actions/runs/38162255683)
  and [macOS qualification run 38162261453](https://github.com/BerryUIKI/Omera/actions/runs/38162261453)
  were dispatched from fixture revision `b62b244`, then canceled at the owner's
  request. The macOS artifact-only job completed before cancellation; it does not
  establish Developer ID/notarization or native installed-upgrade acceptance.
- The owner requested that update testing be skipped for now and Windows Sandbox
  installed later. Native Windows installation has not run; no account or Sandbox
  was created, and the normal profile remains intact. Account helpers are retained
  for review only, with no setup or installer launch requested while testing is
  deferred. No macOS/Linux installed-upgrade result is claimed.
