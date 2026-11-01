import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { generateReleaseNotes, releaseLocales } from '../scripts/generate-release-notes.mjs';
import { selectReleaseNotes } from '../src/utils/release-notes.ts';
import { renderReleaseMarkdown } from '../src/utils/release-markdown.ts';

const catalog = JSON.parse(readFileSync('src/i18n/locales/release-notes.json', 'utf8'));

test('published release generation round-trips each of the seven languages into the app', () => {
  const body = generateReleaseNotes('v0.5.1');
  for (const locale of releaseLocales) {
    const selected = selectReleaseNotes({ tag_name: 'v0.5.1', body }, locale);
    assert.equal(selected, catalog.releases['0.5.1'][locale]);
    const html = renderReleaseMarkdown(selected, 'v0.5.1');
    assert.match(html, /<h3>/);
    assert.doesNotMatch(html, /\*\*/);
    assert.doesNotMatch(selected, /<details>|omera-release-notes:/);
  }
  assert.match(body, /<summary>简体中文<\/summary>/);
});

test('legacy v0.5.1 notes have version-exact translations without applying them to other releases', () => {
  for (const locale of releaseLocales) {
    assert.equal(selectReleaseNotes({ tag_name: 'v0.5.1', body: 'Older English body' }, locale), catalog.releases['0.5.1'][locale]);
    assert.equal(selectReleaseNotes({ tag_name: 'v9.0.0', body: 'Future English body' }, locale), 'Future English body');
  }
});

test('release-provided translations take precedence and missing translations fall back to English', () => {
  const body = '<!-- omera-release-notes:en -->\r\n### New English\r\n<!-- /omera-release-notes -->\n<!-- omera-release-notes:zh-CN -->\n### 新的中文\n<!-- /omera-release-notes -->';
  assert.equal(selectReleaseNotes({ tag_name: 'v0.5.1', body }, 'zh-CN'), '### 新的中文');
  assert.equal(selectReleaseNotes({ tag_name: 'v9.0.0', body }, 'fr'), '### New English');
  assert.equal(selectReleaseNotes({ tag_name: 'v9.0.0', body: '' }, 'fr'), '');
});

test('publication cannot silently omit a locale, version, or publish malformed language boundaries', () => {
  for (const locale of releaseLocales) {
    for (const bad of [undefined, '', '<!-- /omera-release-notes -->']) {
      const partial = structuredClone(catalog);
      partial.releases['0.5.1'][locale] = bad;
      assert.throws(() => generateReleaseNotes('0.5.1', partial), new RegExp(locale));
    }
  }
  assert.throws(() => generateReleaseNotes('0.5.2'), /Missing or invalid en/);
  assert.throws(() => generateReleaseNotes('not-a-version'), /valid version/);
});
