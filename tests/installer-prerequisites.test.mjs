import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { escapeNsis, installerLocales, renderNsis, renderWix, runtimeDownloadUrl } from '../scripts/prepare-installer-prerequisites.mjs';

test('installer strings preserve literal NSIS metacharacters', () => {
  assert.equal(escapeNsis('A $value "quoted"\nnext'), 'A $$value $\\"quoted$\\"$\\r$\\nnext');
});

const nsis = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA, 'tauri/NSIS/makensis.exe') : '';

function nativeRuntimeVersion() {
  return execFileSync('powershell.exe', ['-NoProfile', '-Command',
    "(Get-Item -LiteralPath (Join-Path $env:windir 'System32\\msvcp140.dll')).VersionInfo.FileVersionRaw.ToString()"],
  { encoding: 'utf8' }).trim();
}

function newerVersion(version) {
  const parts = version.split('.').map(Number);
  parts[3] += 1;
  return parts.join('.');
}

test('compiled NSIS prerequisite gate stops unmet requirements before later sections',
  { skip: !nsis || !fs.existsSync(nsis) }, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omera-prerequisite-test-'));
    try {
      fs.mkdirSync(path.join(root, 'generated'));
      fs.copyFileSync('src-tauri/windows/prerequisites.nsh', path.join(root, 'prerequisites.nsh'));
      fs.copyFileSync('src-tauri/windows/language-selector.nsh', path.join(root, 'language-selector.nsh'));
      const installed = nativeRuntimeVersion();
      for (const [name, version, expected, language = 1033] of [
        ['compatible', '0.0.0.0', 0],
        ['installed', installed, 0],
        ['outdated', newerVersion(installed), 1603],
        ['unmet', '99.0.0.0', 1603],
        ...installerLocales.slice(1).map(([id]) => [`outdated-${id}`, newerVersion(installed), 1603, id]),
      ]) {
        fs.writeFileSync(path.join(root, 'generated/prerequisites.nsh'), renderNsis(version));
        const marker = path.join(root, `${name}.txt`);
        const diagnostic = path.join(root, `${name}-diagnostic.txt`);
        const exe = path.join(root, `${name}.exe`);
        const script = path.join(root, `${name}.nsi`);
        fs.writeFileSync(script, `Unicode true
!include "MUI2.nsh"
Page custom OmeraRecordDiagnosticsPage
Section "-Record diagnostics"
Call OmeraRecordDiagnostics
SectionEnd
!include "${path.join(root, 'prerequisites.nsh')}"
!include "${path.join(root, 'language-selector.nsh')}"
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
Function .onInit
StrCpy $LANGUAGE ${language}
!insertmacro MUI_LANGDLL_DISPLAY
FunctionEnd
Function OmeraRecordDiagnostics
Call OmeraCheckRuntime
FileOpen $0 "${diagnostic}" w
FileWriteUTF16LE $0 "$OmeraRuntimeDetails"
FileClose $0
FunctionEnd
Function OmeraRecordDiagnosticsPage
Call OmeraRecordDiagnostics
Abort
FunctionEnd
Section "Marker only"
FileOpen $0 "${marker}" w
FileWrite $0 "passed"
FileClose $0
SectionEnd
`);
        execFileSync(nsis, ['/V2', '/INPUTCHARSET', 'UTF8', script], { stdio: 'pipe' });
        const result = spawnSync(exe, ['/S'], { windowsHide: true, timeout: 15000 });
        assert.equal(result.error, undefined);
        assert.equal(result.status, expected);
        assert.equal(fs.existsSync(marker), expected === 0);
        const details = fs.readFileSync(diagnostic, 'utf16le');
        if (expected === 0) {
          assert.equal(details, '');
        } else {
          const locale = installerLocales.find(([id]) => id === language)[1];
          assert.equal(details, locale.installer.runtimeOutdated
            .replace('{file}', 'msvcp140.dll').replace('{detectedVersion}', installed));
        }
        if (expected === 1603) {
          const passive = spawnSync(exe, ['/P'], { windowsHide: true, timeout: 15000 });
          assert.equal(passive.error, undefined);
          assert.equal(passive.status, 1603);
          assert.equal(fs.existsSync(marker), false);
        }
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
    assert.ok(locale.installer.runtimeSilent.includes('{downloadUrl}'));
    for (const key of Object.keys(locale.installer)) {
      assert.ok(rendered.includes(`LangString Omera_${key} ${id} `));
    }
  }
  assert.equal(rendered.includes('{version}'), false);
  assert.equal(rendered.includes('{detectedVersion}'), false);
  assert.equal(rendered.includes('{file}'), false);
  assert.equal(rendered.includes('{downloadUrl}'), false);
  assert.ok(rendered.includes(runtimeDownloadUrl));
  assert.ok(renderWix('14.51.36260.0').includes(runtimeDownloadUrl));
  assert.ok(rendered.includes('$OmeraRuntimeVersion'));
  assert.ok(rendered.includes('$OmeraRuntimeFile'));
  assert.ok(rendered.includes('14.51.36260.0'));
  assert.throws(() => renderNsis('v14.51'), /Invalid CRT version/);
  assert.throws(() => renderNsis('14.51.0.0"\nFile evil.exe'), /Invalid CRT version/);
});

const wix = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA, 'tauri/WixTools314') : '';
test('compiled MSI searches reject old runtimes before transactions while allowing uninstall',
  { skip: !wix || !fs.existsSync(path.join(wix, 'candle.exe')) }, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omera-msi-prerequisite-test-'));
    try {
      fs.writeFileSync(path.join(root, 'main.wxs'), `<?xml version="1.0"?>
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
  <Product Id="*" Name="Omera prerequisite test" Language="1033" Version="0.0.1"
    Manufacturer="Omera test" UpgradeCode="96A038DA-7B65-4DCD-895E-EF9642373BB1">
    <Package InstallerVersion="500" Compressed="yes" InstallScope="perMachine" />
    <MajorUpgrade DowngradeErrorMessage="Test fixture" />
    <Directory Id="TARGETDIR" Name="SourceDir" />
    <Feature Id="RuntimeCheck" Title="Runtime check" Level="1">
      <ComponentGroupRef Id="OmeraRuntimePrerequisites" />
    </Feature>
  </Product>
</Wix>`);
      const installed = nativeRuntimeVersion();
      for (const [name, version, missing] of [
        ['compatible', '0.0.0.0', '0'],
        ['installed', installed, '0'],
        ['outdated', newerVersion(installed), '1'],
        ['unmet', '99.0.0.0', '1'],
      ]) {
        fs.writeFileSync(path.join(root, 'runtime.wxs'), renderWix(version));
        const msi = path.join(root, `${name}.msi`);
        execFileSync(path.join(wix, 'candle.exe'), ['-nologo', '-arch', 'x64',
          '-out', root + path.sep, path.join(root, 'main.wxs'), path.join(root, 'runtime.wxs')], { stdio: 'pipe' });
        execFileSync(path.join(wix, 'light.exe'), ['-nologo', '-sval', '-out', msi,
          path.join(root, 'main.wixobj'), path.join(root, 'runtime.wixobj')], { stdio: 'pipe' });
        execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
          path.resolve('tests/helpers/check-msi-prerequisites.ps1'), '-Package', msi,
          '-ExpectedMissing', missing], { stdio: 'pipe' });
      }
    } finally {
      assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
      assert.ok(path.basename(root).startsWith('omera-msi-prerequisite-test-'));
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
