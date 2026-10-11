import { readFileSync, writeFileSync, readdirSync, lstatSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const publicKeyFile = join(root, 'src-tauri/update-public-key.txt');
const installerPattern = /\.(exe|msi|dmg|AppImage|deb|rpm)$/;

export function validateInputs(env = process.env, pinned = readFileSync(publicKeyFile, 'utf8').trim(), signing = true) {
  const key = env.OMERA_UPDATE_PUBLIC_KEY?.trim();
  if (!key || key !== pinned) throw new Error('OMERA_UPDATE_PUBLIC_KEY must match the reviewed trust file');
  if (!/^[A-Za-z0-9+/]{56}$/.test(key) || Buffer.from(key, 'base64').length !== 42)
    throw new Error('Update public key must be the raw Minisign key line');
  if (signing && (!env.OMERA_UPDATE_SIGNING_KEY || !env.OMERA_UPDATE_SIGNING_PASSWORD))
    throw new Error('Encrypted update signing key and password are required');
  return key;
}

export function collectInstallers(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Bundle directory must not contain symbolic links');
    if (entry.isDirectory()) {
      // Application bundles contain executables, not separately published installers.
      if (!entry.name.endsWith('.app')) files.push(...collectInstallers(path));
    } else if (entry.isFile() && installerPattern.test(entry.name)) files.push(path);
  }
  return files.sort();
}

function run(program, args, env = process.env) {
  const result = spawnSync(program, args, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  // Signer diagnostics can contain credential material; never relay captured output.
  if (result.error || result.status !== 0) throw new Error(`${basename(program)} failed (output withheld)`);
}

export function verifyAssets(assets, keyFile = publicKeyFile, env = process.env) {
  const verifier = env.OMERA_UPDATE_VERIFIER || join(root, 'target/debug', process.platform === 'win32' ? 'verify-update.exe' : 'verify-update');
  run(verifier, [keyFile, ...assets], env);
}

export function signAssets(assets, env = process.env, keyFile = publicKeyFile) {
  validateInputs(env, readFileSync(keyFile, 'utf8').trim());
  if (!assets.length) throw new Error('No supported installers found');
  const require = createRequire(import.meta.url);
  const cli = require.resolve('@tauri-apps/cli/tauri.js');
  const signerEnv = { ...env, TAURI_SIGNING_PRIVATE_KEY: env.OMERA_UPDATE_SIGNING_KEY,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: env.OMERA_UPDATE_SIGNING_PASSWORD };
  delete signerEnv.TAURI_SIGNING_PRIVATE_KEY_PATH;
  delete signerEnv.TAURI_PRIVATE_KEY;
  delete signerEnv.TAURI_PRIVATE_KEY_PATH;
  delete signerEnv.TAURI_PRIVATE_KEY_PASSWORD;
  for (const asset of assets) {
    if (!installerPattern.test(asset) || !lstatSync(asset).isFile()) throw new Error('Expected a regular installer file');
    run(process.execPath, [cli, 'signer', 'sign', asset], signerEnv);
    const encoded = readFileSync(`${asset}.sig`, 'utf8').trim();
    if (!/^[A-Za-z0-9+/]+=*$/.test(encoded)) throw new Error('Invalid encoded signer result');
    const signature = Buffer.from(encoded, 'base64').toString('utf8');
    if (!signature.startsWith('untrusted comment:') || !signature.includes('\ntrusted comment:'))
      throw new Error('Signer did not produce a Minisign signature');
    writeFileSync(`${asset}.minisig`, signature, { mode: 0o600 });
    verifyAssets([asset], keyFile, env);
    console.log(`Signed and verified ${basename(asset)}`);
  }
}

export function preflight(env = process.env) {
  validateInputs(env);
  const temp = mkdtempSync(join(tmpdir(), 'omera-signing-probe-'));
  try {
    const probe = join(temp, 'trust-probe.exe');
    writeFileSync(probe, 'Omera signing custody probe; never an installer');
    signAssets([probe], env);
  } finally { rmSync(temp, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (command === 'check') validateInputs();
    else if (command === 'preflight') preflight();
    else if (command === 'sign-bundle' && args.length === 1) signAssets(collectInstallers(resolve(args[0])));
    else if (command === 'sign' && args.length) signAssets(args.map(path => resolve(path)));
    else if (command === 'verify' && args.length) { validateInputs(process.env, undefined, false); verifyAssets(args.map(path => resolve(path))); }
    else throw new Error('Usage: update-signing.mjs check|preflight|sign-bundle <directory>|sign|verify <asset>...');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
