import assert from 'node:assert/strict';
import test from 'node:test';
import { runBackgroundTask, backgroundTasks, isTaskActive, dismissTask } from '../src/utils/background-tasks.ts';

test('tasks own progress and listeners through completion, fence late events, and reject duplicates', async () => {
  let resolve, update, disposed = 0;
  const pending = new Promise(done => { resolve = done; });
  const operation = runBackgroundTask('export', () => pending, {subscribe: async callback => {
    update = callback;
    return () => disposed++;
  }, result: value => ({outputPath:value})});
  assert.equal(isTaskActive('export'), true);
  await assert.rejects(runBackgroundTask('export', async () => assert.fail('duplicate')), /already running/);
  update({current: 4, total: 10, detail: 'file.png'});
  const task = backgroundTasks[0];
  dismissTask(task.id);
  assert.equal(backgroundTasks[0].id, task.id);
  assert.equal(task.progress.current, 4);
  resolve('/output.zip');
  assert.equal(await operation, '/output.zip');
  assert.equal(task.status, 'completed');
  assert.equal(task.outputPath, '/output.zip');
  assert.equal(disposed, 1);
  update({current: 9,total:10});
  assert.equal(task.progress.current, 4);
});

test('failed subscription does not start native work; rejection and cancellation settle tasks', async () => {
  await assert.rejects(runBackgroundTask('modelDownload', async () => assert.fail('not subscribed'), {
    subscribe: async () => { throw new Error('listen failed'); },
  }), /listen failed/);
  assert.equal(backgroundTasks[0].status, 'failed');
  await assert.rejects(runBackgroundTask('modelDownload', async () => { throw 'download canceled'; }));
  assert.equal(backgroundTasks[0].status, 'canceled');
  assert.equal(isTaskActive('modelDownload'), false);
});

test('partial result errors remain visible and completed history stays bounded', async () => {
  await runBackgroundTask('export', async () => ({errors:['one failed']}), {
    result: value => ({error:value.errors.join('\n')}),
  });
  assert.equal(backgroundTasks[0].status, 'failed');
  assert.match(backgroundTasks[0].error, /one failed/);
  for (let i = 0; i < 25; i++) await runBackgroundTask('export', async () => i);
  assert.equal(backgroundTasks.length, 20);
  for (const task of [...backgroundTasks]) dismissTask(task.id);
  assert.equal(backgroundTasks.length, 0);
});


test('paired legacy event subscriptions clean up after partial registration failure', async () => {
  const { subscribeTaskEvents } = await import('../src/utils/task-events.ts');
  let disposed = 0;
  await assert.rejects(subscribeTaskEvents(['omera', 'legacy'], () => {}, async name => {
    if (name === 'legacy') throw new Error('listener unavailable');
    return () => disposed++;
  }), /listener unavailable/);
  assert.equal(disposed, 1);
});
