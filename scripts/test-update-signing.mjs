// Real disposable keys exercise production signing + application verification.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { signAssets, verifyAssets } from './update-signing.mjs';

const cli = createRequire(import.meta.url).resolve('@tauri-apps/cli/tauri.js');
const dir = mkdtempSync(join(tmpdir(), 'omera-signing-integration-'));
try {
  const password = randomBytes(32).toString('base64');
  const key = join(dir, 'disposable.key');
  const generated = spawnSync(process.execPath, [cli, 'signer', 'generate', '--ci', '--password', password, '--write-keys', key], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(generated.status, 0, 'Disposable key generation failed (output withheld)');
  const publicLine = Buffer.from(readFileSync(`${key}.pub`, 'utf8').trim(), 'base64').toString('utf8').trim().split(/\r?\n/).at(-1);
  const pub = join(dir, 'public.txt'); writeFileSync(pub, publicLine);
  const env = { ...process.env, OMERA_UPDATE_PUBLIC_KEY: publicLine, OMERA_UPDATE_SIGNING_KEY: readFileSync(key, 'utf8').trim(), OMERA_UPDATE_SIGNING_PASSWORD: password };
  const asset = join(dir, 'synthetic-buffer-test.exe');
  const bytes = Buffer.from(Array.from({ length: 3 * 65536 + 17 }, (_, i) => i % 251));
  writeFileSync(asset, bytes);
  signAssets([asset], env, pub);
  verifyAssets([asset], pub, env);
  const signature = readFileSync(`${asset}.minisig`, 'utf8');
  bytes[65537] ^= 1; writeFileSync(asset, bytes);
  assert.throws(() => verifyAssets([asset], pub, env), /failed/);
  bytes[65537] ^= 1; writeFileSync(asset, bytes);
  writeFileSync(`${asset}.minisig`, 'malformed signature');
  assert.throws(() => verifyAssets([asset], pub, env), /failed/);
  unlinkSync(`${asset}.minisig`);
  assert.throws(() => verifyAssets([asset], pub, env), /failed/);
  writeFileSync(`${asset}.minisig`, signature);
  assert.throws(() => verifyAssets([asset], undefined, env), /failed/, 'Release key must reject disposable key signatures');
  assert.throws(() => signAssets([asset], { ...env, OMERA_UPDATE_SIGNING_PASSWORD: 'wrong' }, pub), /failed/);
  verifyAssets([asset], pub, env);
  console.log('Valid, tampered, malformed, missing, wrong-key and wrong-password signing cases passed.');
} finally { rmSync(dir, { recursive: true, force: true }); }
