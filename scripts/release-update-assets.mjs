import { existsSync, copyFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { collectInstallers, signAssets, validateInputs, verifyAssets } from './update-signing.mjs';
import { requireDraftRelease } from './release-preflight.mjs';

const targets = {
  'x86_64-pc-windows-msvc': /x64.*\.exe$/i,
  'aarch64-apple-darwin': /aarch64.*\.dmg$/i,
  'x86_64-unknown-linux-gnu': /(?:amd64|x64|x86_64).*\.AppImage$/,
};

export function requireCoverage(assets, target) {
  const names = assets.map(path => basename(path));
  const required = target ? [targets[target]] : Object.values(targets);
  if (!required.length || required.some(pattern => !pattern || !names.some(name => /^Omera/i.test(name) && pattern.test(name))))
    throw new Error('Missing a required Omera platform installer');
  if (new Set(names).size !== names.length) throw new Error('Duplicate installer asset names');
}

export function uploadBundle(target, canonicalAsset) {
  validateInputs();
  if (!targets[target]) throw new Error('Unsupported release target');
  requireDraftRelease();
  const roots = [resolve('target', target, 'release/bundle'), resolve('src-tauri/target', target, 'release/bundle')].filter(existsSync);
  if (roots.length !== 1) throw new Error('Expected exactly one bundle directory');
  const assets = collectInstallers(roots[0]);
  if (canonicalAsset) {
    if (target !== 'aarch64-apple-darwin' || basename(canonicalAsset) !== 'Omera_macOS_aarch64.dmg')
      throw new Error('Unexpected canonical installer');
    const dmgs = assets.filter(asset => asset.endsWith('.dmg'));
    if (dmgs.length !== 1) throw new Error('Expected exactly one final notarized DMG');
    copyFileSync(dmgs[0], canonicalAsset);
    assets.push(canonicalAsset);
  }
  requireCoverage(assets, target);
  signAssets(assets);
  const env = { ...process.env };
  delete env.OMERA_UPDATE_SIGNING_KEY; delete env.OMERA_UPDATE_SIGNING_PASSWORD;
  const result = spawnSync('gh', ['release', 'upload', env.RELEASE_TAG,
    ...assets.flatMap(asset => [asset, `${asset}.minisig`]), '--clobber', '--repo', env.GITHUB_REPOSITORY], { env, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error('Signed installer upload failed');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, argument, canonical] = process.argv.slice(2);
    if (command === 'upload') uploadBundle(argument, canonical);
    else if (command === 'verify' && argument && !canonical) {
      validateInputs(process.env, undefined, false);
      const assets = collectInstallers(resolve(argument));
      requireCoverage(assets);
      verifyAssets(assets);
    } else throw new Error('Usage: release-update-assets.mjs upload <target> [canonical-dmg]|verify <download-directory>');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
