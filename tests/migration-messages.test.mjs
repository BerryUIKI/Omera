import assert from 'node:assert/strict';
import test from 'node:test';
import { migrationMessage, databaseDirectory } from '../src/utils/legacy-migration.ts';
import { setLocale, t } from '../src/i18n/index.ts';
import { en } from '../src/i18n/locales/en.ts';
import { zhCN } from '../src/i18n/locales/zh-CN.ts';
import { zhTW } from '../src/i18n/locales/zh-TW.ts';
import { ja } from '../src/i18n/locales/ja.ts';
import { de } from '../src/i18n/locales/de.ts';
import { fr } from '../src/i18n/locales/fr.ts';
import { es } from '../src/i18n/locales/es.ts';

test('migration errors and exclusions follow the selected language', async () => {
  await setLocale('en');
  assert.equal(migrationMessage('Database migration failed: [DESTINATION_EXISTS] error.migration.destination_exists: details'), t.value.setup.destinationExists);
  assert.equal(migrationMessage('cacheExcluded'), en.setup.cacheExcluded);
  assert.equal(migrationMessage('unrecognized diagnostic'), en.setup.genericError);
  assert.doesNotMatch(Object.values(en.setup).join(' '), /[\u3400-\u9fff]/);
  await setLocale('zh-CN');
  assert.equal(migrationMessage('[SOURCE_CHANGED] details'), zhCN.setup.sourceChanged);
  assert.equal(migrationMessage('cacheExcluded'), zhCN.setup.cacheExcluded);
  for (const locale of [zhCN, zhTW, ja, de, fr, es]) {
    assert.deepEqual(Object.keys(locale.setup).sort(), Object.keys(en.setup).sort());
  }
});

test('database directory handles drive roots and native Windows path prefixes', () => {
  assert.equal(databaseDirectory('C:\\omera.db'), 'C:/');
  assert.equal(databaseDirectory('\\\\?\\F:\\Library\\omera.db'), 'F:/Library');
  assert.equal(databaseDirectory('\\\\?\\UNC\\server\\share\\omera.db'), '//server/share');
  assert.equal(databaseDirectory('/home/user/omera.db'), '/home/user');
  assert.equal(databaseDirectory('/omera.db'), '/');
});
