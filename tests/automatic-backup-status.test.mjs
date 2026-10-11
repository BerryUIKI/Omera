import assert from 'node:assert/strict';
import test from 'node:test';
import { effectScope, ref } from 'vue';
import { normalizeBackupInterval, useAutomaticBackupStatus } from '../src/utils/automatic-backup.ts';

const fixture = { enabled:true, interval_days:7, running:false, last_attempt_at:100,
  last_success_at:110, next_due_at:604910, last_error:null, last_snapshot:'fixture.zip' };

test('backup intervals handle invalid legacy values and bound saved days', () => {
  assert.equal(normalizeBackupInterval(NaN), 7);
  assert.equal(normalizeBackupInterval(Infinity), 7);
  assert.equal(normalizeBackupInterval(0), 1);
  assert.equal(normalizeBackupInterval(900), 365);
  assert.equal(normalizeBackupInterval(2.6), 3);
});

test('status polling follows tab lifetime, deduplicates and ignores old replies', async t => {
  t.mock.timers.enable({ apis:['setInterval'] });
  const active = ref(false), requests = [];
  const scope = effectScope();
  const state = scope.run(() => useAutomaticBackupStatus(active,
    () => new Promise((resolve,reject) => requests.push({resolve,reject}))));
  t.after(() => scope.stop());
  t.mock.timers.tick(60_000);
  assert.equal(requests.length, 0);
  active.value = true;
  assert.equal(requests.length, 1);
  t.mock.timers.tick(60_000);
  await state.refresh();
  assert.equal(requests.length, 1);
  active.value = false;
  active.value = true;
  assert.equal(requests.length, 2);
  requests[0].resolve({...fixture,last_snapshot:'stale.zip'});
  await Promise.resolve();
  assert.equal(state.status.value, null);
  assert.equal(state.loading.value, true);
  requests[1].resolve(fixture);
  await Promise.resolve();
  assert.deepEqual({...state.status.value}, fixture);
  assert.equal(state.loading.value, false);
  t.mock.timers.tick(30_000);
  assert.equal(requests.length, 3);
  requests[2].reject('worker unavailable');
  await Promise.resolve();
  assert.equal(state.status.value, null);
  assert.equal(state.error.value, 'worker unavailable');
  t.mock.timers.tick(30_000);
  assert.equal(requests.length, 4);
  scope.stop();
  requests[3].resolve(fixture);
  await Promise.resolve();
  assert.equal(state.status.value, null);
  t.mock.timers.tick(60_000);
  assert.equal(requests.length, 4);
});
