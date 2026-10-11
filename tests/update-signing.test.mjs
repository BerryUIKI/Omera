import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateInputs, collectInstallers, publicKeyFile } from '../scripts/update-signing.mjs';
import { requireCoverage } from '../scripts/release-update-assets.mjs';

test('release signing requires pinned raw trust and encrypted-key credentials', () => {
  const key = readFileSync(publicKeyFile, 'utf8').trim();
  const env = { OMERA_UPDATE_PUBLIC_KEY: key, OMERA_UPDATE_SIGNING_KEY: 'test-only', OMERA_UPDATE_SIGNING_PASSWORD: 'test-only' };
  assert.equal(validateInputs(env), key);
  assert.throws(() => validateInputs({}), /reviewed trust/);
  assert.throws(() => validateInputs({ ...env, OMERA_UPDATE_PUBLIC_KEY: Buffer.from(key).toString('base64') }), /reviewed trust/);
  assert.throws(() => validateInputs({ ...env, OMERA_UPDATE_PUBLIC_KEY: `${key}\n` }), /reviewed trust/);
  assert.throws(() => validateInputs({ ...env, OMERA_UPDATE_PUBLIC_KEY: ` ${key}` }), /reviewed trust/);
  assert.throws(() => validateInputs({ ...env, OMERA_UPDATE_SIGNING_PASSWORD: '' }), /password/);
  assert.throws(() => validateInputs({ ...env, OMERA_UPDATE_SIGNING_KEY: '' }), /signing key/);
  assert.equal(validateInputs({ OMERA_UPDATE_PUBLIC_KEY: key }, key, false), key);
});

test('publication requires every supported platform and unique asset names', () => {
  const names = ['Omera_0.4.3_x64-setup.exe', 'Omera_macOS_aarch64.dmg', 'Omera_0.4.3_amd64.AppImage'];
  assert.doesNotThrow(() => requireCoverage(names));
  for (let i = 0; i < names.length; i++) assert.throws(() => requireCoverage(names.filter((_, index) => index !== i)), /required/);
  assert.throws(() => requireCoverage([...names, names[0]]), /Duplicate/);
  assert.throws(() => requireCoverage(names, 'unrecognized'), /required/);
  assert.throws(() => requireCoverage(['foreign_x64-setup.exe'], 'x86_64-pc-windows-msvc'), /required/);
});

test('installer inventory excludes app internals and signature files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omera-signing-inventory-'));
  try {
    mkdirSync(join(dir, 'nsis')); mkdirSync(join(dir, 'Omera.app'));
    mkdirSync(join(dir, 'appimage')); mkdirSync(join(dir, 'appimage/Omera.AppDir'));
    symlinkSync(join(dir, 'Omera.app'), join(dir, 'appimage/Omera.AppDir/runtime'), process.platform === 'win32' ? 'junction' : 'dir');
    for (const name of ['Omera.dmg', 'Omera.AppImage', 'Omera.deb', 'Omera.rpm', 'Omera.msi', 'Omera.dmg.minisig']) writeFileSync(join(dir, name), name);
    writeFileSync(join(dir, 'nsis/Omera-setup.exe'), 'installer');
    writeFileSync(join(dir, 'Omera.app/internal.exe'), 'excluded');
    assert.deepEqual(collectInstallers(dir), ['Omera.AppImage', 'Omera.deb', 'Omera.dmg', 'Omera.msi', 'Omera.rpm', 'nsis/Omera-setup.exe'].map(p => join(dir, p)).sort());
    symlinkSync(join(dir, 'Omera.app'), join(dir, 'linked-installer.exe'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => collectInstallers(dir), /symbolic links/);
    assert.equal(readFileSync(join(dir, 'Omera.app/internal.exe'), 'utf8'), 'excluded');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
