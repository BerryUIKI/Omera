import assert from 'node:assert/strict';
import test from 'node:test';
import { HELP_TOPICS, HELP_UI } from '../src/i18n/help-content.ts';

const LOCALES = ['en', 'zh-CN', 'zh-TW', 'ja', 'de', 'fr', 'es'];

test('all locales expose the same help topics with non-empty content', () => {
  const expectedIds = HELP_TOPICS.en.map((topic) => topic.id);
  for (const locale of LOCALES) {
    const topics = HELP_TOPICS[locale];
    assert.ok(topics, `missing help topics for ${locale}`);
    assert.deepEqual(topics.map((topic) => topic.id), expectedIds, locale);
    for (const topic of topics) {
      assert.ok(topic.title.trim(), `${locale}:${topic.id} title`);
      assert.ok(topic.summary.trim(), `${locale}:${topic.id} summary`);
      assert.ok(topic.content.length > 0, `${locale}:${topic.id} content`);
      assert.ok(topic.content.every((line) => line.trim()), `${locale}:${topic.id} empty content line`);
    }
    assert.ok(HELP_UI[locale].title.trim(), `${locale} UI title`);
    assert.ok(HELP_UI[locale].searchPlaceholder.trim(), `${locale} search placeholder`);
  }
});
