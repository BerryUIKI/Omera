import assert from 'node:assert/strict';
import test from 'node:test';
import { iconPaths } from '../src/utils/icons.ts';
import { withProductionComponent } from './helpers/production-component.mjs';

test('production icons render shared line artwork without replacing control accessible labels', async () => {
  await withProductionComponent('AppIcon', {name:'folder'},()=>{},async ({render,props})=>{
    for(const name of Object.keys(iconPaths)) {
      props.name=name;
      const html=await render();
      assert.match(html,/aria-hidden="true"/);
      assert.match(html,/stroke="currentColor"/);
      assert.ok(html.includes(iconPaths[name]));
    }
  });
});
