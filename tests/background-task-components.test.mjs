import assert from 'node:assert/strict';
import test from 'node:test';
import { nextTick } from 'vue';
import { withProductionComponent } from './helpers/production-component.mjs';
import { backgroundTasks, isTaskActive, dismissTask } from '../src/utils/background-tasks.ts';

function boundaries(code) {
  return code.replace(/import \{ subscribeTaskEvents \} from [^;]+;/,
    'const subscribeTaskEvents = (names, handler) => invoke("subscribe", {names, handler});')
    .replace(/import \{ save, open as openDialog \} from [^;]+;/, 'const save = async () => null, openDialog = save;');
}

test('export progress survives modal teardown, blocks duplicate exports and retains partial failures', async () => {
  let finish, operation, update, disposed = 0;
  const pending = new Promise(resolve => { finish = resolve; });
  const calls = [];
  const native = async (command, args) => {
    calls.push(command);
    if (command === 'subscribe') { update = args.handler; return () => disposed++; }
    if (command === 'export_files_batch') return pending;
    if (command === 'estimate_export_file') return null;
    assert.fail(command);
  };
  const props = {show:false, files:[{id:1,path:'/fixture.png'}]};
  await withProductionComponent('ExportModal', props, native, async ({controls:c}) => {
    c.destinationPath.value = '/output.zip';
    operation = c.handleStartExport();
    await nextTick();
    assert.equal(c.exporting.value, true);
    await c.handleStartExport();
  }, boundaries);
  assert.equal(disposed, 0);
  update({current:1,total:2,current_filename:'fixture.png'});
  assert.equal(backgroundTasks[0].progress.current, 1);
  await withProductionComponent('ExportModal', props, native, async ({controls:c}) => {
    assert.equal(c.exporting.value, true);
    c.destinationPath.value = '/second.zip';
    await c.handleStartExport();
  }, boundaries);
  assert.equal(calls.filter(command => command === 'export_files_batch').length, 1);
  finish({success:false,total_exported:1,total_failed:1,output_path:'/output.zip',errors:['one failed']});
  await operation;
  assert.equal(isTaskActive('export'), false);
  assert.equal(disposed, 1);
  assert.equal(backgroundTasks[0].status, 'failed');
  assert.match(backgroundTasks[0].error, /one failed/);
  dismissTask(backgroundTasks[0].id);
});
