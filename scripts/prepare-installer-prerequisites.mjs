import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { en } from '../src/i18n/locales/en.ts';
import { zhCN } from '../src/i18n/locales/zh-CN.ts';
import { zhTW } from '../src/i18n/locales/zh-TW.ts';
import { ja } from '../src/i18n/locales/ja.ts';
import { de } from '../src/i18n/locales/de.ts';
import { fr } from '../src/i18n/locales/fr.ts';
import { es } from '../src/i18n/locales/es.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
export const installerLocales = [[1033, en], [2052, zhCN], [1028, zhTW],
  [1041, ja], [1031, de], [1036, fr], [1034, es]];

export function escapeNsis(text) {
  return text.replaceAll('$', () => '$$').replaceAll('"', '$\\"')
    .replace(/\r?\n/g, '$\\r$\\n');
}

export function renderNsis(minimum) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(minimum)) throw new Error('Invalid CRT version metadata');
  const lines = [`; Generated from src/i18n/locales and the build's Microsoft CRT metadata.`,
    `!define OMERA_MINIMUM_CRT_VERSION "${minimum}"`];
  for (const [id, locale] of installerLocales) {
    for (const [key, value] of Object.entries(locale.installer)) {
      lines.push(`LangString Omera_${key} ${id} "${escapeNsis(value)
        .replaceAll('{version}', minimum)}"`);
    }
  }
  return '\uFEFF' + lines.join('\n') + '\n';
}

export function prepare() {
  if (process.platform !== 'win32') return;
  const minimum = execFileSync('powershell.exe', ['-NoProfile', '-File',
    path.join(root, 'src-tauri/windows/runtime-version.ps1')], { encoding: 'utf8' }).trim();
  const destination = path.join(root, 'src-tauri/windows/generated');
  fs.mkdirSync(destination, { recursive: true });
  const file = path.join(destination, 'prerequisites.nsh');
  const content = renderNsis(minimum);
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) {
    fs.writeFileSync(file, content);
  }
  console.log(`Prepared prerequisite metadata for Microsoft Visual C++ x64 ${minimum}; no DLLs bundled.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) prepare();
