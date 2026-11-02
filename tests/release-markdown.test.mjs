import assert from 'node:assert/strict';
import test from 'node:test';
import { renderReleaseMarkdown } from '../src/utils/release-markdown.ts';

test('release Markdown renders headings, lists, emphasis, code, tables and readable repository links', () => {
  const html = renderReleaseMarkdown('### Fixed\n\n- **Update Now** preserves `omera.db`.\n\n1. Restart\n\n[Changelog](CHANGELOG.md)\n\n```text\n<sample>\n```\n\n| A | B |\n| - | - |\n| one | two |', 'v0.5.1');
  for (const expected of ['<h3>Fixed</h3>', '<ul>', '<strong>Update Now</strong>', '<code>omera.db</code>', '<ol>', '<table>', '&lt;sample&gt;', 'href="https://github.com/BerryUIKI/Omera/blob/v0.5.1/CHANGELOG.md"', 'rel="noopener noreferrer"']) {
    assert.ok(html.includes(expected), expected);
  }
});

test('remote notes cannot inject HTML, execute non-web links, or load images', () => {
  const source = '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1))\n\n[local](file:///C:/secret)\n\n[data](data:text/html,bad)\n\n[mail](mailto:test@example.com)\n\n![pixel](https://tracker.example/pixel.png)\n\n[safe](https://example.com/notes)';
  const html = renderReleaseMarkdown(source, 'v0.5.1');
  assert.doesNotMatch(html, /<script|<img|href="(?:javascript|file|data|mailto):/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /pixel/);
  assert.match(html, /href="https:\/\/example.com\/notes"/);
});
