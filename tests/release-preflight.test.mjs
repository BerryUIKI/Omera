import test from 'node:test';
import assert from 'node:assert/strict';
import { githubRequest, validateReleaseVersion, validateReleasePreflight, requireDraftRelease } from '../scripts/release-preflight.mjs';

const env = { GITHUB_REPOSITORY: 'BerryUIKI/Omera', RELEASE_TAG: 'v0.4.3' };
const versions = { packageJson: '0.4.3', cargoToml: '0.4.3', tauriConf: '0.4.3' };
const head = 'a'.repeat(40);
const tagSha = 'b'.repeat(40);
const repo = 'repos/BerryUIKI/Omera';
const releaseListPath = `${repo}/releases?per_page=100&page=1`;
function responses(overrides = {}) {
  const data = {
    [releaseListPath]: [],
    [`${repo}/git/ref/tags/v0.4.3`]: { object: { type: 'tag', sha: tagSha } },
    [`${repo}/git/tags/${tagSha}`]: { object: { type: 'commit', sha: head } },
    [`${repo}/compare/${head}...main`]: { status: 'ahead' },
    ...overrides,
  };
  return path => { assert.ok(Object.hasOwn(data, path), `Unexpected request ${path}`); return data[path]; };
}
function preflight(overrides = {}, options = {}) {
  return validateReleasePreflight({ env, versions, head, request: responses(overrides), ...options });
}

test('release tags must agree with every actual version manifest', () => {
  assert.doesNotThrow(() => validateReleaseVersion('v0.4.3', versions));
  for (const key of Object.keys(versions))
    assert.throws(() => validateReleaseVersion('v0.4.3', { ...versions, [key]: '0.4.2' }), /match every/);
  assert.throws(() => validateReleaseVersion('v0.4.3', {}), /match every/);
  for (const tag of ['v0.1.0', 'v0.4.4']) assert.throws(() => validateReleaseVersion(tag, versions), /match every/);
  for (const tag of ['0.4.3', 'v00.4.3', 'v0.4.3\n', 'v0.4.3-01', undefined])
    assert.throws(() => validateReleaseVersion(tag, versions), /valid versioned/);
});

test('only explicit HTTP 404 means absent; API failures remain blocking', () => {
  const response = (status, body, exitCode = status === 200 ? 0 : 1) => () => ({
    status: exitCode, stdout: `HTTP/2.0 ${status} Test\r\nContent-Type: application/json\r\n\r\n${body}`,
  });
  assert.equal(githubRequest('fixture', response(404, '{}')), null);
  assert.deepEqual(githubRequest('fixture', response(200, '{"draft":true}')), { draft: true });
  assert.deepEqual(githubRequest('fixture', response(200, '[{"draft":true}]')), [{ draft: true }]);
  for (const status of [401, 403, 429, 500]) assert.throws(() => githubRequest('fixture', response(status, '{}')), /failed/);
  assert.throws(() => githubRequest('fixture', () => ({ status: 1, stdout: '', stderr: 'network unavailable' })), /failed/);
  assert.throws(() => githubRequest('fixture', () => ({ error: new Error('spawn failed'), stdout: 'HTTP/2.0 404' })), /failed/);
  for (const body of ['not json', 'null', '7', '"text"'])
    assert.throws(() => githubRequest('fixture', response(200, body)), /Invalid/);
});

test('release preflight accepts an existing main-integrated tag and resumable draft', () => {
  assert.equal(preflight(), head);
  assert.equal(preflight({ [releaseListPath]: [{ tag_name: 'v0.4.3', draft: true }] }), head);
  const firstPage = Array.from({ length: 100 }, (_, index) => ({ tag_name: `other-${index}`, draft: true }));
  assert.equal(preflight({ [releaseListPath]: firstPage,
    [`${repo}/releases?per_page=100&page=2`]: [{ tag_name: 'v0.4.3', draft: true }] }), head);
  assert.equal(preflight({ [`${repo}/git/ref/tags/v0.4.3`]: { object: { type: 'commit', sha: head } },
    [`${repo}/compare/${head}...main`]: { status: 'identical' } }), head);
});

test('preflight blocks published releases, missing or different tags, and development-only commits', () => {
  assert.throws(() => preflight({ [releaseListPath]: [{ tag_name: 'v0.4.3', draft: false }] }), /published assets/);
  assert.throws(() => preflight({ [`${repo}/git/ref/tags/v0.4.3`]: null }), /checked-out/);
  assert.throws(() => preflight({}, { head: 'c'.repeat(40) }), /checked-out/);
  for (const status of ['behind', 'diverged', undefined])
    assert.throws(() => preflight({ [`${repo}/compare/${head}...main`]: { status } }), /integrated into main/);
  assert.throws(() => preflight({}, { env: { ...env, GITHUB_REPOSITORY: 'other/repository' } }), /official/);
  assert.throws(() => preflight({ [`${repo}/git/tags/${tagSha}`]: { object: { type: 'tag', sha: tagSha } } }), /annotated/);
});

test('upload and promotion gates require an existing draft, never an absent or published release', () => {
  const draft = { tag_name: env.RELEASE_TAG, draft: true };
  assert.doesNotThrow(() => requireDraftRelease(env, responses({ [releaseListPath]: [draft] }), versions));
  assert.throws(() => requireDraftRelease(env, responses(), versions), /must be a draft/);
  for (const release of [{ ...draft, draft: false }, { ...draft, tag_name: 'v0.4.2' }, {}])
    assert.throws(() => requireDraftRelease(env, responses({ [releaseListPath]: [release] }), versions), /must be a draft/);
  assert.throws(() => requireDraftRelease(env, responses({ [releaseListPath]: null }), versions), /listing unavailable/);
});
