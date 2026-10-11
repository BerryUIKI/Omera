import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeNsis, installerLocales, renderNsis } from '../scripts/prepare-installer-prerequisites.mjs';

test('installer strings preserve literal NSIS metacharacters', () => {
  assert.equal(escapeNsis('A $value "quoted"\nnext'), 'A $$value $\\"quoted$\\"$\\r$\\nnext');
});

test('prerequisite messages cover all installer languages and the exact build minimum', () => {
  const rendered = renderNsis('14.51.36260.0');
  assert.equal(installerLocales.length, 7);
  for (const [id, locale] of installerLocales) {
    assert.ok(locale.installer.runtimeHelp.length > 30);
    assert.match(locale.installer.runtimeSilent, /https:\/\/learn.microsoft.com\/cpp\/windows\/latest-supported-vc-redist/);
    for (const key of Object.keys(locale.installer)) {
      assert.ok(rendered.includes(`LangString Omera_${key} ${id} `));
    }
  }
  assert.equal(rendered.includes('{version}'), false);
  assert.ok(rendered.includes('14.51.36260.0'));
  assert.throws(() => renderNsis('v14.51'), /Invalid CRT version/);
  assert.throws(() => renderNsis('14.51.0.0"\nFile evil.exe'), /Invalid CRT version/);
});
