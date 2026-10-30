import assert from 'node:assert/strict';
import test from 'node:test';
import { nextTick } from 'vue';
import { withProductionComponent } from './helpers/production-component.mjs';

const asset = { name: 'Omera_0.6.0_x64-setup.exe', browser_download_url: 'https://github.com/BerryUIKI/Omera/releases/download/v0.6.0/Omera_0.6.0_x64-setup.exe', size: 100 };
const available = { status: 'update_available', latestVersion: '0.6.0', matchedAsset: asset,
  release: { html_url: 'https://github.com/BerryUIKI/Omera/releases/tag/v0.6.0', body: '' } };

// Stub native/network boundaries while executing the production component's
// setup, watchers, action handlers and template in the shared Vue harness.
function updateBoundaries(code) {
  return code.replace(/import\s*\{[^}]+\}\s*from "\.\.\/utils\/updater";/,
    `import { invoke } from "@tauri-apps/api/core";
    const checkForUpdates = () => invoke("check");
    const downloadUpdateAsset = (...args) => invoke("download", args);
    const installUpdate = (...args) => invoke("install", args);
    const openUrl = (...args) => invoke("open", args);`)
    .replace(/import \{ openStorageDir \} from [^;]+;/, 'const openStorageDir = async () => {};');
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('one click downloads then installs Windows updates; busy actions cannot duplicate or reset it', async () => {
  for (const silent of [false, true]) {
    const download = deferred();
    const install = deferred();
    const calls = [];
    await withProductionComponent('UpdateModal', { show: true, currentVersion: '0.5.0' },
      async (command, args) => {
        calls.push([command, args]);
        if (command === 'check') return available;
        if (command === 'download') return download.promise;
        if (command === 'install') return install.promise;
        assert.fail(command);
      }, async ({ controls: c, props, events, render }) => {
        c.silentInstall.value = silent;
        const operation = c.handleAutoDownload();
        assert.deepEqual(calls.map(([command]) => command), ['check', 'download']);
        calls[1][1][2]({ downloaded_bytes: 25, total_bytes: 100, percent: 25 });
        assert.equal(c.downloadProgress.value.percent, 25);
        await c.handleAutoDownload();
        await c.runCheck();
        c.handleClose();
        assert.deepEqual(events, []);
        props.show = false;
        await nextTick();
        props.show = true;
        await nextTick();
        assert.equal(c.downloading.value, true);
        assert.equal(calls.length, 2);

        download.resolve('C:/updates/Omera setup.exe');
        // Wait for the native download boundary to settle.
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(c.installing.value, true);
        assert.deepEqual(calls.at(-1), ['install', ['C:/updates/Omera setup.exe', silent]]);
        await c.handleInstallAndRestart();
        await c.handleAutoDownload();
        c.handleClose();
        assert.equal(calls.length, 3);
        assert.deepEqual(events, []);
        assert.match(await render(), /Starting update installation/);
        install.resolve();
        await operation;
        assert.equal(c.busy.value, false);
      }, updateBoundaries);
  }
});

test('download or signature failure never starts installation and allows a fresh retry', async () => {
  const calls = [];
  let fail = true;
  await withProductionComponent('UpdateModal', { show: true, currentVersion: '0.5.0' },
    async (command) => {
      calls.push(command);
      if (command === 'check') return available;
      if (command === 'download') {
        if (fail) throw 'Invalid update signature';
        return 'C:/updates/verified.exe';
      }
    }, async ({ controls: c }) => {
      await c.handleAutoDownload();
      assert.equal(c.downloadError.value, 'Invalid update signature');
      assert.equal(c.downloadedFilePath.value, null);
      assert.equal(c.busy.value, false);
      assert.deepEqual(calls, ['check', 'download']);
      fail = false;
      await c.handleAutoDownload();
      assert.equal(c.downloadError.value, null);
      assert.deepEqual(calls, ['check', 'download', 'download', 'install']);
    }, updateBoundaries);
});

test('launch failure retains the verified package and retries installation without another download', async () => {
  const calls = [];
  let fail = true;
  await withProductionComponent('UpdateModal', { show: true, currentVersion: '0.5.0' },
    async (command) => {
      calls.push(command);
      if (command === 'check') return available;
      if (command === 'download') return 'C:/updates/verified.exe';
      if (command === 'install' && fail) throw new Error('Failed to launch installer');
    }, async ({ controls: c }) => {
      await c.handleAutoDownload();
      assert.equal(c.downloadError.value, 'Failed to launch installer');
      assert.equal(c.downloadedFilePath.value, 'C:/updates/verified.exe');
      assert.equal(c.busy.value, false);
      fail = false;
      await c.handleInstallAndRestart();
      assert.equal(c.downloadError.value, null);
      assert.deepEqual(calls, ['check', 'download', 'install', 'install']);
    }, updateBoundaries);
});

test('macOS/Linux downloads retain the explicit installer handoff', async () => {
  for (const name of ['Omera.dmg', 'Omera.AppImage', 'Omera.deb', 'Omera.rpm']) {
    const calls = [];
    await withProductionComponent('UpdateModal', { show: true, currentVersion: '0.5.0' },
      async (command) => {
        calls.push(command);
        if (command === 'check') return { ...available, matchedAsset: { ...asset, name } };
        if (command === 'download') return '/updates/' + name;
      }, async ({ controls: c }) => {
        await c.handleAutoDownload();
        assert.deepEqual(calls, ['check', 'download']);
        await c.handleInstallAndRestart();
        assert.deepEqual(calls, ['check', 'download', 'install']);
        assert.equal(c.busy.value, false);
      }, updateBoundaries);
  }
});

test('missing compatible package opens the official release instead of attempting an install', async () => {
  const calls = [];
  await withProductionComponent('UpdateModal', { show: true, currentVersion: '0.5.0' },
    async (command, args) => {
      calls.push([command, args]);
      if (command === 'check') return { ...available, matchedAsset: null };
    }, async ({ controls: c }) => {
      await c.handleAutoDownload();
      assert.deepEqual(calls, [['check', undefined], ['open', [available.release.html_url]]]);
    }, updateBoundaries);
});
