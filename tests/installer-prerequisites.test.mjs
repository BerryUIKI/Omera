import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { escapeNsis, installerLocales, renderNsis } from '../scripts/prepare-installer-prerequisites.mjs';

test('installer strings preserve literal NSIS metacharacters', () => {
  assert.equal(escapeNsis('A $value "quoted"\nnext'), 'A $$value $\\"quoted$\\"$\\r$\\nnext');
});

const nsis = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA, 'tauri/NSIS/makensis.exe') : '';
test('compiled NSIS prerequisite gate stops unmet requirements before later sections',
  { skip: !nsis || !fs.existsSync(nsis) }, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omera-prerequisite-test-'));
    try {
      fs.mkdirSync(path.join(root, 'generated'));
      fs.copyFileSync('src-tauri/windows/prerequisites.nsh', path.join(root, 'prerequisites.nsh'));
      for (const [name, version, expected] of [['compatible', '0.0.0.0', 0], ['unmet', '99.0.0.0', 1603]]) {
        fs.writeFileSync(path.join(root, 'generated/prerequisites.nsh'), renderNsis(version));
        const marker = path.join(root, `${name}.txt`);
        const exe = path.join(root, `${name}.exe`);
        const script = path.join(root, `${name}.nsi`);
        fs.writeFileSync(script, `Unicode true
!include "MUI2.nsh"
!include "${path.join(root, 'prerequisites.nsh')}"
Name "Omera prerequisite test"
OutFile "${exe}"
RequestExecutionLevel user
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "TradChinese"
!insertmacro MUI_LANGUAGE "Japanese"
!insertmacro MUI_LANGUAGE "German"
!insertmacro MUI_LANGUAGE "French"
!insertmacro MUI_LANGUAGE "Spanish"
Section "Marker only"
FileOpen $0 "${marker}" w
FileWrite $0 "passed"
FileClose $0
SectionEnd
`);
        execFileSync(nsis, ['/V2', '/INPUTCHARSET', 'UTF8', script], { stdio: 'pipe' });
        const result = spawnSync(exe, ['/S'], { windowsHide: true });
        assert.equal(result.error, undefined);
        assert.equal(result.status, expected);
        assert.equal(fs.existsSync(marker), expected === 0);
      }
    } finally {
      assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
      assert.ok(path.basename(root).startsWith('omera-prerequisite-test-'));
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

test('prerequisite messages cover all installer languages and the exact build minimum', () => {
  const rendered = renderNsis('14.51.36260.0');
  assert.equal(installerLocales.length, 7);
  for (const [id, locale] of installerLocales) {
    assert.ok(locale.installer.runtimeHelp.length > 30);
    assert.match(locale.installer.runtimeSilent, /https:\/\/learn.microsoft.com\/cpp\/windows\/latest-supported-vc-redist/);
    for (const key of Object.keys(locale.installer)) {
      assert.ok(rendered.includes(`LangString Omera_${key} ${id} `));
    }
  }
  assert.equal(rendered.includes('{version}'), false);
  assert.ok(rendered.includes('14.51.36260.0'));
  assert.throws(() => renderNsis('v14.51'), /Invalid CRT version/);
  assert.throws(() => renderNsis('14.51.0.0"\nFile evil.exe'), /Invalid CRT version/);
});
