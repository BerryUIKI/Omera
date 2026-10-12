import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { en } from '../src/i18n/locales/en.ts';
import { zhCN } from '../src/i18n/locales/zh-CN.ts';
import { zhTW } from '../src/i18n/locales/zh-TW.ts';
import { ja } from '../src/i18n/locales/ja.ts';
import { de } from '../src/i18n/locales/de.ts';
import { fr } from '../src/i18n/locales/fr.ts';
import { es } from '../src/i18n/locales/es.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtimeRequirements = JSON.parse(fs.readFileSync(
  path.join(root, 'src-tauri/windows/runtime-requirements.json'), 'utf8'));
export const minimumRuntimeVersion = runtimeRequirements.minimumVersion;
export const runtimeDlls = runtimeRequirements.dlls;
if (!Array.isArray(runtimeDlls) || runtimeDlls.length === 0 ||
    !runtimeDlls.every(dll => /^(?:msvcp|vcruntime)\d+(?:_[a-z0-9_]+)?$/.test(dll))) {
  throw new Error('Invalid CRT DLL requirements');
}
export const runtimeDownloadUrl = 'https://aka.ms/vc14/vc_redist.x64.exe';
export const installerLocales = [[1033, en], [2052, zhCN], [1028, zhTW],
  [1041, ja], [1031, de], [1036, fr], [1034, es]];
export function renderWix(minimum = minimumRuntimeVersion) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(minimum)) throw new Error('Invalid CRT version metadata');
  const escapeXml = text => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const ready = ['(OMERA_CRT_INSTALLED = "#1" OR OMERA_CRT_INSTALLED_32 = "#1")',
    ...runtimeDlls.map((_, i) => `OMERA_CRT_${i}`)].join(' AND ');
  const condition = escapeXml(`NOT (REMOVE = "ALL") AND NOT (${ready})`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
  <Fragment>
    <ComponentGroup Id="OmeraRuntimePrerequisites" />
    <Property Id="OMERA_CRT_INSTALLED" Secure="yes">
      <RegistrySearch Id="OmeraCrtInstalled" Root="HKLM" Key="SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64" Name="Installed" Type="raw" Win64="yes" />
    </Property>
    <Property Id="OMERA_CRT_INSTALLED_32" Secure="yes">
      <RegistrySearch Id="OmeraCrtInstalled32" Root="HKLM" Key="SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64" Name="Installed" Type="raw" Win64="no" />
    </Property>
${runtimeDlls.map((dll, i) => `    <Property Id="OMERA_CRT_${i}" Secure="yes">
      <DirectorySearch Id="OmeraCrtDirectory${i}" Path="[System64Folder]" Depth="0">
        <!-- Microsoft's CRT file resources use English, including localized redistributables.
             MSI compares language at an exactly equal minimum file version. -->
        <FileSearch Id="OmeraCrtFile${i}" Name="${dll}.dll" MinVersion="${minimum}" Languages="1033" />
      </DirectorySearch>
    </Property>`).join('\n')}
    <CustomAction Id="OmeraRuntimeMissing" Error="${escapeXml(en.installer.runtimeSilent.replace('{downloadUrl}', runtimeDownloadUrl) + ' ' + en.installer.runtimeMinimum.replace('{version}', minimum))}" />
    <InstallUISequence>
      <Custom Action="OmeraRuntimeMissing" After="AppSearch">${condition}</Custom>
    </InstallUISequence>
    <InstallExecuteSequence>
      <Custom Action="OmeraRuntimeMissing" After="AppSearch">${condition}</Custom>
    </InstallExecuteSequence>
  </Fragment>
</Wix>
`;
}

export function escapeNsis(text) {
  return text.replaceAll('$', () => '$$').replaceAll('"', '$\\"')
    .replace(/\r?\n/g, '$\\r$\\n');
}

export function renderNsis(minimum = minimumRuntimeVersion) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(minimum)) throw new Error('Invalid CRT version metadata');
  const lines = [`; Generated from src/i18n/locales and windows/runtime-requirements.json.`,
    `!define OMERA_MINIMUM_CRT_VERSION "${minimum}"`,
    `!define OMERA_CRT_DOWNLOAD_URL "${runtimeDownloadUrl}"`];
  for (const [id, locale] of installerLocales) {
    for (const [key, value] of Object.entries(locale.installer)) {
      lines.push(`LangString Omera_${key} ${id} "${escapeNsis(value)
        .replaceAll('{version}', minimum)
        .replaceAll('{downloadUrl}', runtimeDownloadUrl)
        .replaceAll('{detectedVersion}', '$OmeraRuntimeVersion')
        .replaceAll('{file}', '$OmeraRuntimeFile')}"`);
    }
  }
  lines.push('!macro OmeraCheckRequiredRuntimeDlls');
  for (const dll of runtimeDlls) lines.push(`  !insertmacro OmeraCheckRuntimeDll "${dll}.dll"`);
  lines.push('!macroend');
  return '\uFEFF' + lines.join('\n') + '\n';
}

export function prepare() {
  if (process.platform !== 'win32') return;
  const destination = path.join(root, 'src-tauri/windows/generated');
  fs.mkdirSync(destination, { recursive: true });
  for (const [name, content] of [['prerequisites.nsh', renderNsis()],
    ['runtime-prerequisite.wxs', renderWix()]]) {
    const file = path.join(destination, name);
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) {
      fs.writeFileSync(file, content);
    }
  }
  console.log(`Prepared prerequisite metadata for Microsoft Visual C++ x64 ${minimumRuntimeVersion}; no DLLs bundled.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) prepare();
