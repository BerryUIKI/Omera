import assert from 'node:assert/strict';
import test from 'node:test';
import {diffPrompts, visibleDiff} from '../src/utils/prompt-diff.ts';
const original = parts => parts.map(p => p.text).join('');
test('diff preserves exact text, order, Unicode and explicit weight changes', () => {
  for (const [a,b] of [['cat, (light:1.2)','cat, (light:1.5)'],['cat','(cat:1.2)'],
    ['猫 😀\n dog','dog 猫 😀\t'],['','<script>alert(1)</script>'],['\\(cat\\)','(cat)'],
    ['((blue cat):1.2)','((blue cat):0.8)'],['(cat:1.20)','(cat:1.2)'],['a b','b a']]) {
    const d=diffPrompts(a,b); assert.equal(original(d.left),a);assert.equal(original(d.right),b);
  }
  const d=diffPrompts('cat, (light:1.2)','cat, (light:1.5)');
  assert.deepEqual(d.left.find(p=>p.kind==='weight'),{text:'(light:1.2)',kind:'weight',from:1.2,to:1.5});
  assert.equal(diffPrompts('same','same').changed,false);
  assert.equal(diffPrompts('(cat:1.20)','(cat:1.2)').left[0].kind,'removed');
});
test('long and adversarial inputs use bounded fallback and never split surrogate pairs',()=>{
  for(const [a,b] of [['😀'.repeat(30000)+'a','😀'.repeat(30000)+'b'],['('.repeat(30000),')'.repeat(30000)],
    ['word '.repeat(1000),'other '.repeat(1000)],['('.repeat(15000)+')'.repeat(15000),'x']]){
    const d=diffPrompts(a,b);assert.equal(original(d.left),a);assert.equal(original(d.right),b);
    assert.ok(visibleDiff(d.left).reduce((n,p)=>n+p.text.length,0)<=20000);
  }
  assert.equal(diffPrompts('a '.repeat(2000),'b '.repeat(2000)).coarse,true);
  assert.equal(visibleDiff([{text:'😀x',kind:'equal'}],1)[0].text,'');
});
