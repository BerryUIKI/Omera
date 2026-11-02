import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSemVer, readCurrentVersions } from './bump-version.mjs';

const catalogFile = new URL('../src/i18n/locales/release-notes.json', import.meta.url);
export const releaseLocales = ['en', 'zh-CN', 'zh-TW', 'ja', 'de', 'fr', 'es'];

export function generateReleaseNotes(tag, catalog = JSON.parse(readFileSync(catalogFile, 'utf8'))) {
  const version = String(tag).replace(/^v/, '');
  if (!parseSemVer(version)) throw new Error('Release notes require a valid version');
  const notes = catalog.releases?.[version];
  for (const locale of releaseLocales) {
    if (typeof notes?.[locale] !== 'string' || !notes[locale].trim() ||
      /<!--\s*\/?omera-release-notes/.test(notes[locale]) ||
      typeof catalog.languageNames?.[locale] !== 'string' || !catalog.languageNames[locale].trim()) {
      throw new Error(`Missing or invalid ${locale} release notes for v${version}`);
    }
  }
  const sections = releaseLocales.map(locale => {
    const block = `<!-- omera-release-notes:${locale} -->\n${notes[locale].trim()}\n<!-- /omera-release-notes -->`;
    return locale === 'en' ? block : `<details>\n<summary>${catalog.languageNames[locale]}</summary>\n\n${block}\n\n</details>`;
  });
  return `${sections.join('\n\n')}\n\n---\n[CHANGELOG.md](https://github.com/BerryUIKI/Omera/blob/v${version}/CHANGELOG.md)\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const check = args[0] === '--check' && args.length === 1;
    if (!check && (args.length !== 3 || args[1] !== '--output')) {
      throw new Error('Usage: generate-release-notes.mjs --check | <version> --output <file>');
    }
    const version = check ? readCurrentVersions().packageJson : args[0];
    const body = generateReleaseNotes(version);
    if (check) console.log(`Validated seven-language release notes for v${version}`);
    else writeFileSync(args[2], body, 'utf8');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
