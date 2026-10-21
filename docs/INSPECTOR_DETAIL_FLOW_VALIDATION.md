# Inspector detail flow validation

Date: 2026-10-16. Branch: `codex/inspector-detail-flow`, based on `dev`.

## Scope

Overview, Generation, and Raw Data tabs are replaced by a single detail flow.
Generation summary, prompt, and parameters precede supplemental disclosures,
organization, and file facts. Existing localized strings are reused.

## Browser checks

The production Vue component was mounted in a temporary local Vite fixture on
Windows, using the Codex in-app browser. The initial viewport was 1280 × 720;
both 280px standalone and 320px embedded Inspector widths were checked.
The fixture used two synthetic records: a generated PNG with a long model name,
long prompt, long sampler name, large seed, negative prompt, LoRA, and raw data;
and a JPG with dimensions but no generation metadata. Tauri calls were mocked.

- Both widths have no horizontal content overflow; quick actions wrap at 280px.
- Dark and light themes retain readable generation text and reuse buttons.
- Enter expands the prompt, negative prompt, LoRA section, and raw data.
- Raw text mounts on expansion; its copy action becomes available.
- Rating changes preserve expanded prompt and raw data state.
- Switching to the JPG removes generation sections and retains organization.
- A new file revision resets scroll to zero and closes disclosures.

The temporary fixture and server were removed after review. This is component
browser evidence, not native Tauri application or live backend acceptance.
Reduced-motion CSS disables Inspector transitions and animations; an OS-level
reduced-motion session and full gallery mode matrix were not exercised here.

## Automated checks

`pnpm run build` passed TypeScript checking and production bundling.
`pnpm run test:stack` passed all 304 tests, including production-component
coverage for information order, long prompts,
revision resets, curation preservation, model-only and LoRA-only records,
ComfyUI reuse, raw metadata fallback, and stale metadata replies.
