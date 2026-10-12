import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSemVer, readCurrentVersions } from './bump-version.mjs';

export function validateReleaseVersion(tag, versions = readCurrentVersions()) {
  const version = typeof tag === 'string' && tag.startsWith('v') ? tag.slice(1) : '';
  if (!parseSemVer(version)) throw new Error('Expected a valid versioned release tag');
  if (['packageJson', 'cargoToml', 'tauriConf'].some(key => versions[key] !== version))
    throw new Error('Release tag must match every package, workspace and Tauri version');
}

export function githubRequest(path, execute = spawnSync) {
  const env = { ...process.env };
  delete env.OMERA_UPDATE_SIGNING_KEY; delete env.OMERA_UPDATE_SIGNING_PASSWORD;
  const result = execute('gh', ['api', '--include', path], { env, encoding: 'utf8' });
  const output = result.stdout || '';
  const status = Number(output.match(/^HTTP\/[\d.]+ (\d{3})\b/m)?.[1]);
  if (!result.error && status === 404 && result.status !== 0) return null;
  if (result.error || result.status !== 0 || status !== 200)
    throw new Error('Release API request failed; publication is blocked');
  const separator = output.match(/\r?\n\r?\n/);
  try {
    if (!separator) throw new Error('Missing response body');
    const body = JSON.parse(output.slice(separator.index + separator[0].length));
    if (!body || typeof body !== 'object') throw new Error('Invalid response');
    return body;
  } catch { throw new Error('Invalid release API response; publication is blocked'); }
}

function repository(env) {
  if (env.GITHUB_REPOSITORY !== 'BerryUIKI/Omera') throw new Error('Expected the official Omera repository');
  return `repos/${env.GITHUB_REPOSITORY}`;
}

function findReleaseByTag(tag, repo, request) {
  const perPage = 100;
  for (let page = 1; page <= 1000; page += 1) {
    const releases = request(`${repo}/releases?per_page=${perPage}&page=${page}`);
    if (!Array.isArray(releases)) throw new Error('Release listing unavailable; publication is blocked');
    const release = releases.find(item => item?.tag_name === tag);
    if (release) return release;
    if (releases.length < perPage) return null;
  }
  throw new Error('Release listing exceeded the pagination safety limit; publication is blocked');
}

function checkRelease(tag, repo, request, allowMissing) {
  const release = findReleaseByTag(tag, repo, request);
  if (release === null && allowMissing) return;
  if (!release || release.tag_name !== tag || release.draft !== true)
    throw new Error('Release must be a draft; published assets cannot be overwritten');
}

export function requireDraftRelease(env = process.env, request = githubRequest, versions = readCurrentVersions()) {
  validateReleaseVersion(env.RELEASE_TAG, versions);
  checkRelease(env.RELEASE_TAG, repository(env), request, false);
}

export function validateReleasePreflight({ env = process.env, versions = readCurrentVersions(),
  head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), request = githubRequest } = {}) {
  const tag = env.RELEASE_TAG;
  validateReleaseVersion(tag, versions);
  const repo = repository(env);
  checkRelease(tag, repo, request, true);
  let object = request(`${repo}/git/ref/tags/${encodeURIComponent(tag)}`)?.object;
  const seen = new Set();
  while (object?.type === 'tag') {
    if (!/^[a-f0-9]{40}$/i.test(object.sha) || seen.has(object.sha) || seen.size >= 8)
      throw new Error('Invalid annotated release tag');
    seen.add(object.sha);
    object = request(`${repo}/git/tags/${object.sha}`)?.object;
  }
  if (object?.type !== 'commit' || !/^[a-f0-9]{40}$/i.test(object.sha) || object.sha !== head)
    throw new Error('Existing release tag must resolve to the checked-out commit');
  const comparison = request(`${repo}/compare/${object.sha}...main`);
  if (!comparison || !['ahead', 'identical'].includes(comparison.status))
    throw new Error('Release commit must already be integrated into main');
  return object.sha;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...extra] = process.argv.slice(2);
    if (extra.length) throw new Error('Unexpected release preflight arguments');
    if (command === 'check') console.log(`Release preflight passed: ${validateReleasePreflight()}`);
    else if (command === 'draft') { requireDraftRelease(); console.log('Release remains a draft'); }
    else throw new Error('Usage: release-preflight.mjs check|draft');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
