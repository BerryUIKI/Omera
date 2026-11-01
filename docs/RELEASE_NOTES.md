# Localized release notes

Release notes are authored in `src/i18n/locales/release-notes.json`. Each release
version requires Markdown in all seven application languages: `en`, `zh-CN`,
`zh-TW`, `ja`, `de`, `fr`, and `es`. Keep the meaning consistent with the English
engineering changelog, including compatibility limits. Translation is authored
before release; the app does not send notes to a translation service.

## Authoring and publication

1. Add the version and its seven translations alongside the version bump and
   `CHANGELOG.md` entry. Do not reuse an older version's text for a new release.
2. Run `node scripts/generate-release-notes.mjs --check`. CI and release preflight
   both reject missing versions, empty translations, and malformed boundaries.
3. Preview the exact GitHub body with
   `node scripts/generate-release-notes.mjs v0.5.1 --output <preview-file>`.

The release workflow generates its final GitHub body from this catalog. English
is visible first, and each other language is in a labeled disclosure. Each
Markdown block has stable `omera-release-notes:<locale>` comment boundaries so
the app can select a single language without scraping translated headings.
Release assets, update signatures, and trust configuration are unchanged.

## Application display

The update dialog follows the resolved application language, including system
language selection. A language change recomputes the display without another
network request. Selection prefers a release-provided translation, then a
bundled translation for that exact tag, then release-provided English, then
the original release body. Empty notes use the localized no-changelog message.
The bundled v0.5.1 text also translates the older English-only published body.
It is never substituted for a different release version.

`release-markdown.ts` renders headings, lists, emphasis, code, tables, and links
with markdown-it. Raw HTML is disabled, non-HTTP(S) links are rejected, and image
tokens render only escaped alt text. Relative links resolve against the tagged
repository. Links open through the existing external-browser command; rendering
does not load remote images or weaken the WebView CSP.

`tests/release-notes.test.mjs` round-trips generated publication bodies through
the production language selector. Renderer and component tests cover Markdown,
unsafe content, language switching, fallback, and progress-only installation.
Native installed-update acceptance remains separate from these tests.

Validation on Windows, 2026-11-01: production build, 327 frontend regressions,
`cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`,
`cargo test --workspace`, and the 167-command IPC inventory check passed. The
production dialog was visually checked in an isolated in-app-browser preview at
861 × 595 in Chinese and English: headings, bold text, bullets, scrolling, and
the progress-mode notice rendered correctly. No real installer was launched.
