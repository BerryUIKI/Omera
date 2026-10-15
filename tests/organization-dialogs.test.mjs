import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { withProductionComponent } from './helpers/production-component.mjs';
test('production tag and album actions emit the events consumed by the application', async () => {
  const app = fs.readFileSync('src/App.vue', 'utf8');
  for (const [name, state, action, change] of [ ['TagModal','tagModalOpen','onApplyTag','tagsChanged'], ['AlbumModal','albumModalOpen','onAddFiles','addedToAlbum'] ]) {
    const block = app.match(new RegExp('<'+name+'[\\s\\S]*?/>'))[0];
    assert.ok(block.includes('v-model:open="'+state+'"'));
    const calls = [];
    await withProductionComponent(name, {open:true,fileIds:[3]}, async (command,args) => {calls.push([command,args]);return [];}, async ({controls,events}) => {
      await controls[action]({id:4,name:'Reference'});
      assert.ok(events.some(event => event[0]===change));
      assert.deepEqual(events.at(-1), ['update:open',false]);
      assert.ok(calls.some(([command,args]) => ['tag_files','add_files_to_album'].includes(command)&&args.fileIds[0]===3));
    });
  }
  assert.match(app, /@tags-changed="refreshOrganization"/); assert.match(app, /@albums-changed="loadAlbumsAndTags"/);
});
