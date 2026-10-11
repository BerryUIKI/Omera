# Signed update delivery

Updated: 2026-10-12. Lead-owned follow-up for #256; integration targets `dev`.
This contract precedes release integration. It does not authorize publishing a release.

## Trust and custody

The custom updater accepts official HTTPS GitHub release assets only. Each
installer requires an adjacent `<asset-name>.minisig` containing plain Minisign
text. The app verifies the downloaded bytes and verifies them again before launch.
Missing trust, missing signatures, invalid signatures and changed bytes fail closed.
The update dialog retains its browser download and official release-page actions.

Release builds must embed `OMERA_UPDATE_PUBLIC_KEY`, the raw base64 public-key
line accepted by `minisign-verify`. `BERRY_UPDATE_PUBLIC_KEY` remains a legacy
build fallback. Preserve an established key when available; rotation requires a
separate reviewed trust transition. Older installations without embedded trust
need a manual first upgrade; fetching a public key at runtime is prohibited.

Use repository variable `OMERA_UPDATE_PUBLIC_KEY` and encrypted repository secrets
`OMERA_UPDATE_SIGNING_KEY` and `OMERA_UPDATE_SIGNING_PASSWORD`. The private key uses
the Tauri CLI's encoded encrypted-key format. Never commit private keys, passwords,
or generated secret logs. A local recovery copy, if provisioned, lives outside the
checkout with owner-only access and a password protected by the owner's OS account.
Normal CI tests use a disposable test key, never the release private key.

On 2026-10-11, no established update trust was present in the repository variables,
secret names, checkout or build environment. A new encrypted key was provisioned
after a signing probe passed the production streaming verifier. The reviewed
public key is `src-tauri/update-public-key.txt`; repository signing inputs must
match it verbatim, without surrounding whitespace: Rust embeds that build input
without trimming it. The recovery directory is `%USERPROFILE%/.codex/signing/omera-update-20261011`,
restricted to its owner. Its password is protected with Windows DPAPI for that
account. Recovery requires that account and its profile; arrange an independently
protected maintainer recovery copy before release qualification. This establishes
initial trust and does not rotate a previously trusted installed application.

`cargo build -p omera --bin verify-update` builds the CLI that shares the app's
verifier. `node scripts/update-signing.mjs check` validates inputs; `preflight`
signs and verifies a disposable custody probe. `sign-bundle <directory>` signs
supported installer files, excluding `.app` internals; `sign <asset>...` handles
renamed final assets. Inventory is bounded to root files and the six known bundle
format directories; application/staging internals are excluded. Symlinked published
installers or format directories are rejected. `verify <asset>...` needs public trust only. Set
`OMERA_UPDATE_VERIFIER` when the CLI lives outside `target/debug`.

`node scripts/test-update-signing.mjs` exercises a disposable encrypted key and
an artifact larger than three streaming buffers. CI runs it on all three OSes;
the release key is never supplied to normal PR tests.

The separate `Signed installer artifact checks` workflow builds actual packages
with embedded public trust, signs them and verifies their bytes. It runs manually
or for an internal PR changing that workflow; fork PRs cannot use signing secrets.
It stores installers as short-lived Actions artifacts and cannot publish releases.
These are engineering test packages. Its macOS DMG lacks the release workflow's
Developer ID/notarization steps and must not be distributed as a production release.

For the production macOS signing gate, dispatch `Release Build & Publish` from the
reviewed candidate with `qualification_only: true` and leave `tag_name` empty.
This is the default for manual dispatch. It checks manifest agreement and runs
the same Developer ID, notarization, stapling, mounted-app and Gatekeeper steps as
publication. The build action receives neither a release tag nor a GitHub token;
release uploads, Windows/Linux release jobs and publication are disabled. It signs
the final DMG with the pinned update key and preserves the DMG/signature as a
seven-day Actions artifact. It does not create a tag or release.
The shared `release-update-assets.mjs qualify <target> [canonical-dmg]` command
uses the same final-file inventory, naming, signing and streaming verification as
release upload, with no GitHub API calls or release credentials.

The build-only behavior is supported by
[tauri-action's upload guard](https://github.com/tauri-apps/tauri-action/blob/v0/src/index.ts):
without a release ID or tag, it skips release creation/uploads. Keep that guard
and the workflow's publication conditions intact. Passing this gate still does
not establish installed-to-next-version acceptance or approve distribution.

## Signing and publication

Before any publication build or release mutation, require the requested tag to match all three
version manifests. The tag must already exist, resolve to the checked-out commit,
and be included in `main`; a development checkout cannot create a release tag as a
side effect. Existing published releases are immutable: retries may resume only
an absent release or a draft. Authentication, network and unexpected API failures
must block the run rather than be treated as an absent release.

Serialize runs for the same tag without canceling an active publication. Recheck
draft status immediately before signed uploads and promotion. These checks prepare
the release path; they do not authorize creating tags, integrating into `main`, or
publishing a release. Installed-platform qualification remains required below.

`node scripts/release-preflight.mjs check` performs the read-only tag/version,
`main` ancestry and release-state checks using authenticated GitHub API reads.
`draft` requires an existing draft for upload/promotion. To publish an approved,
qualified release, explicitly set `qualification_only: false`, select its existing
tag and run from that exact commit. The form has no default release tag. Tag-push
runs use the publication path and must pass the complete preflight.

Validate trust inputs before building. Sign final installer bytes only, after
macOS signing, notarization, stapling and any renaming. Convert the Tauri CLI's
encoded `.sig` output to plain `.minisig`; these formats are not interchangeable.
Independently verify every result with the same streaming verifier as the app.
Upload each installer and its exact adjacent signature together to the draft.
Before promotion, download and verify the draft's supported installer assets;
require Windows x64, macOS aarch64 and Linux x64 coverage. An incomplete or altered
draft must remain unpublished. Preserve existing Developer ID/Gatekeeper gates.

The release workflow validates the pinned variable and proves key custody before
bundling. Windows/Linux installers and both final macOS DMG names receive exact
adjacent signatures. The publication job downloads the draft, requires the three
primary platform installers and verifies every supported installer, including
secondary MSI/DEB/RPM assets. Missing or wrong signatures block promotion. Do not
modify a published asset after signing. Run qualification before invoking release
publication; the qualification workflow is the non-publishing test path.

## Qualification and completion

Keep separate evidence for signing fixtures, actual platform artifacts and installed
application updates. Test valid, missing, malformed, wrong-key and modified-file
cases. Signing tests must exercise real Minisign output through the production
verifier, including files spanning several read buffers.

Before closing #256, qualify a trusted installed version updating to a subsequent
signed version on Windows x64, macOS aarch64 and Linux x64, including restart and
library/config preservation. macOS opens the verified DMG for installation; Linux
package downloads require the package manager. Legacy identity/import paths remain
supported. Synthetic signatures and passing development CI do not establish this
qualification. Record unavailable credentials, publication or platform access as
explicit gates; never weaken verification to bypass them.

### Installed-version qualification procedure

Use disposable OS accounts and a synthetic library, keeping ordinary user data
outside the test. Record both package versions, build commits, OS/architecture,
artifact hashes, signature verification, and observed application behavior.

1. Manually install the first build containing the reviewed trust key. Confirm
   library records, saved preferences and legacy discovery/import with fixtures.
2. From that installed application, discover a subsequent signed official release,
   download it, and complete the platform installation flow. Confirm the displayed
   new version after reopening and the same library/configuration/credential access.
3. Use controlled fixtures for missing signatures, altered installers and wrong-key
   signatures, including disposable staged-file tampering before installation.
   Confirm installation is blocked and the manual release-page action remains usable.
   Do not publish malformed or tampered packages as public release assets.
4. Verify Windows shortcuts/uninstall registration, macOS Developer ID/notarization
   and Gatekeeper, and Linux AppImage/package behavior. Record staged restore and
   legacy-source retention separately. Never clean up original data during testing.

This procedure needs two versioned signed releases and Windows/macOS/Linux test
environments. The current artifact-check workflow builds one repository version
and does not exercise the installed application's release discovery or next-update
path. No production or prerelease publication was performed by this remediation.
Current application discovery uses GitHub's stable `releases/latest` endpoint;
a draft or prerelease alone does not exercise that discovery path. Keep the
installed-update and publication decisions explicit when planning the next stage.

### Production macOS signing evidence — 2026-10-12

[Qualification run 38159904889](https://github.com/BerryUIKI/Omera/actions/runs/38159904889)
at `b01e9c233c59b748e3168977a424824d417630e0` passed Developer ID certificate
validation, signing, app/DMG notarization, stapling, mounted-app verification,
Gatekeeper and final update signing/streaming verification. Release uploads and
publication were skipped; before/after API snapshots confirmed existing release
assets and tags were unchanged. The downloaded canonical DMG also passed the
production streaming verifier locally.

The retained Omera 0.4.3 `Omera_macOS_aarch64.dmg` is 18,640,094 bytes, with SHA-256
`a7169b70e37ccddb3ed72085a2308102bcb2ba9b5b90f140e592aa338cea8f00`.
It is a short-lived qualification artifact, not a published successor or evidence
of an installed application's next-version upgrade. #256 remains open.
