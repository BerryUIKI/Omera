import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateInputs, collectInstallers, publicKeyFile } from '../scripts/update-signing.mjs';

test('release signing requires pinned raw trust and encrypted-key credentials', () => {
  const key = readFileSync(publicKeyFile, 'utf8').trim();
  const env = { OMERA_UPDATE_PUBLIC_KEY: key, OMERA_UPDATE_SIGNING_KEY: 'test-only', OMERA_UPDATE_SIGNING_PASSWORD: 'test-only' };
  assert.equal(validateInputs(env), key);
  assert.throws(() => validateInputs({}), /reviewed trust/);
  assert.throws(() => validateInputs({ ...env, OMERA_UPDATE_PUBLIC_KEY: Buffer.from(key).toString('base64') }), /reviewed trust/);
  assert.throws(() => validateInputs({ ...env, OMERA_UPDATE_SIGNING_PASSWORD: '' }), /password/);
  assert.throws(() => validateInputs({ ...env, OMERA_UPDATE_SIGNING_KEY: '' }), /signing key/);
  assert.equal(validateInputs({ OMERA_UPDATE_PUBLIC_KEY: key }, key, false), key);
});

test('installer inventory excludes app internals and signature files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omera-signing-inventory-'));
  try {
    mkdirSync(join(dir, 'nsis')); mkdirSync(join(dir, 'Omera.app'));
    for (const name of ['Omera.dmg', 'Omera.AppImage', 'Omera.deb', 'Omera.rpm', 'Omera.msi', 'Omera.dmg.minisig']) writeFileSync(join(dir, name), name);
    writeFileSync(join(dir, 'nsis/Omera-setup.exe'), 'installer');
    writeFileSync(join(dir, 'Omera.app/internal.exe'), 'excluded');
    assert.deepEqual(collectInstallers(dir), ['Omera.AppImage', 'Omera.deb', 'Omera.dmg', 'Omera.msi', 'Omera.rpm', 'nsis/Omera-setup.exe'].map(p => join(dir, p)).sort());
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
