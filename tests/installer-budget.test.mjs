import assert from 'node:assert/strict';
import test from 'node:test';
import {requireInstallerBudgets,installerBudgetsMiB} from '../scripts/installer-budget.mjs';
const info = size => ({size,isFile:()=>true});
test('every public v0.5.2 installer fits its format budget; limits reject even one excess byte',()=>{
  for(const [extension,bytes] of Object.entries({exe:17773215,msi:34906112,dmg:18960347,AppImage:105609720,deb:33601024,rpm:33601519})){
    assert.equal(requireInstallerBudgets([`Omera.${extension}`],()=>info(bytes))[0].bytes,bytes);
    const limit=installerBudgetsMiB[extension]*1024*1024;
    assert.doesNotThrow(()=>requireInstallerBudgets([`Omera.${extension}`],()=>info(limit)));
    assert.throws(()=>requireInstallerBudgets([`Omera.${extension}`],()=>info(limit+1)),/exceeds/);
  }
});
test('installer budget rejects empty, invalid and nonregular artifacts',()=>{
  assert.throws(()=>requireInstallerBudgets([]),/No installers/);
  assert.throws(()=>requireInstallerBudgets(['unknown.zip']),/Unsupported/);
  for(const size of [0,-1,NaN,Infinity,1.5])assert.throws(()=>requireInstallerBudgets(['Omera.exe'],()=>info(size)),/nonempty/);
  assert.throws(()=>requireInstallerBudgets(['Omera.exe'],()=>({size:1,isFile:()=>false})),/regular/);
});
