# Signed update delivery

Updated: 2026-10-11. Lead-owned follow-up for #256; integration targets `dev`.
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
match it. The recovery directory is `%USERPROFILE%/.codex/signing/omera-update-20261011`,
restricted to its owner. Its password is protected with Windows DPAPI for that
account. Recovery requires that account and its profile; arrange an independently
protected maintainer recovery copy before release qualification. This establishes
initial trust and does not rotate a previously trusted installed application.

`cargo build -p omera --bin verify-update` builds the CLI that shares the app's
verifier. `node scripts/update-signing.mjs check` validates inputs; `preflight`
signs and verifies a disposable custody probe. `sign-bundle <directory>` signs
supported installer files, excluding `.app` internals; `sign <asset>...` handles
renamed final assets. `verify <asset>...` needs public trust only. Set
`OMERA_UPDATE_VERIFIER` when the CLI lives outside `target/debug`.

`node scripts/test-update-signing.mjs` exercises a disposable encrypted key and
an artifact larger than three streaming buffers. CI runs it on all three OSes;
the release key is never supplied to normal PR tests.

## Signing and publication

Validate trust inputs before building. Sign final installer bytes only, after
macOS signing, notarization, stapling and any renaming. Convert the Tauri CLI's
encoded `.sig` output to plain `.minisig`; these formats are not interchangeable.
Independently verify every result with the same streaming verifier as the app.
Upload each installer and its exact adjacent signature together to the draft.
Before promotion, download and verify the draft's supported installer assets;
require Windows x64, macOS aarch64 and Linux x64 coverage. An incomplete or altered
draft must remain unpublished. Preserve existing Developer ID/Gatekeeper gates.

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
