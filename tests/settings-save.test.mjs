import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { normalizeBackupInterval } from "../src/utils/automatic-backup.ts";

function setup(save) {
  const sfc = fs.readFileSync("src/components/SettingsModal.vue", "utf8");
  const script = sfc.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const ast = ts.createSourceFile("settings.ts", script, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "saveSettings");
  const events = [];
  const context = { console: { error() {} }, saveAppConfig: save,
    loadAppConfig: async () => { throw new Error("must retain loaded revision"); },
    getStorageItem: () => null, getCurrentCloudConfig: () => ({}),
    loadCacheStats: async () => {}, emit: (...args) => events.push(args),
    prepareLocale: async () => {},
    setLocale: () => events.push(["locale"]), applyTheme: () => events.push(["theme"]),
    setThumbnailMaxEdge: () => events.push(["edge"]), setThumbnailCacheBudgetMb: () => events.push(["budget"]),
  };
  // Supply refs read by the actual production function; no copied save implementation.
  for (const match of fn.getText(ast).matchAll(/(\w+)\.value/g)) context[match[1]] = { value: false };
  context.loadedConfig.value = { config_revision: 7 };
  context.saveError.value = "";
  vm.createContext(context);
  vm.runInContext(ts.transpile(fn.getText(ast)), context);
  return { context, events };
}

test("failed settings save retains edits/revision and applies no preferences or success events", async () => {
  const { context, events } = setup(async () => { throw new Error("revision conflict"); });
  context.selectedTheme.value = "light";
  await context.saveSettings();
  assert.match(context.saveError.value, /revision conflict/);
  assert.equal(context.loadedConfig.value.config_revision, 7);
  assert.equal(context.selectedTheme.value, "light");
  assert.equal(context.savingSettings.value, false);
  assert.deepEqual(events, []);
});

test("settings save prevents duplicate submissions and applies preferences after persistence", async () => {
  let release;
  let calls = 0;
  const { context, events } = setup(async config => {
    calls++;
    await new Promise(resolve => { release = resolve; });
    config.config_revision = 8;
  });
  const first = context.saveSettings();
  await context.saveSettings();
  assert.equal(calls, 1);
  assert.deepEqual(events, []);
  release();
  await first;
  assert.equal(context.loadedConfig.value.config_revision, 8);
  assert.deepEqual(events.map(event => event[0]), ["locale", "edge", "budget", "theme", "save", "close"]);
  assert.equal(context.savingSettings.value, false);
});

test("a failed language preparation prevents saving or applying preferences", async () => {
  const { context, events } = setup(async () => assert.fail("must not save an unavailable language"));
  context.prepareLocale = async () => { throw Error("catalog unavailable"); };
  await context.saveSettings();
  assert.match(context.saveError.value, /catalog unavailable/);
  assert.equal(context.loadedConfig.value.config_revision, 7);
  assert.deepEqual(events, []);
  assert.equal(context.savingSettings.value, false);
});

test("automatic backup drafts require a successful revision-checked settings save", async () => {
  let fail = true;
  const saved = [];
  const { context, events } = setup(async config => {
    saved.push(config);
    if (fail) throw "save rejected";
    config.config_revision++;
  });
  const script = fs.readFileSync("src/components/SettingsModal.vue", "utf8")
    .match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const ast = ts.createSourceFile("settings.ts", script, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "getCurrentCloudConfig");
  for (const match of fn.getText(ast).matchAll(/(\w+)\.value/g)) context[match[1]] = { value: "" };
  context.cloudProvider.value = "webdav";
  context.cloudAutoBackup.value = true;
  context.cloudAutoIntervalDays.value = 900;
  context.normalizeBackupInterval = normalizeBackupInterval;
  context.loadedConfig.value.cloud_backup = { auto_backup_enabled:false, auto_backup_interval_days:7 };
  vm.runInContext(ts.transpile(fn.getText(ast)), context);
  assert.equal(saved.length, 0, "editing alone cannot persist or start a backup");
  await context.saveSettings();
  assert.equal(saved[0].cloud_backup.auto_backup_enabled, true);
  assert.equal(saved[0].cloud_backup.auto_backup_interval_days, 365);
  assert.equal(saved[0].cloud_backup.provider, "webdav");
  assert.equal(context.loadedConfig.value.cloud_backup.auto_backup_enabled, false);
  assert.equal(context.cloudAutoBackup.value, true);
  assert.deepEqual(events, []);
  fail = false;
  await context.saveSettings();
  assert.equal(context.loadedConfig.value.cloud_backup.auto_backup_enabled, true);
  assert.equal(context.loadedConfig.value.config_revision, 8);
  assert.equal(events.at(-1)[0], "close");
});
