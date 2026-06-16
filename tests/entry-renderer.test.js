import test from 'node:test';
import assert from 'node:assert/strict';
import { imageMarkdown, renderEntryBody } from '../public/entry-renderer.js';

test('imageMarkdown creates an attachment image token', () => {
  const markdown = imageMarkdown({
    id: '123e4567-e89b-12d3-a456-426614174000',
    original_name: 'gel.png'
  });

  assert.equal(markdown, '![gel.png](/api/attachments/123e4567-e89b-12d3-a456-426614174000/file)');
});

test('renderEntryBody renders attachment image tokens as safe image previews', () => {
  const html = renderEntryBody('结果如下\n![gel <1>.png](/api/attachments/123e4567-e89b-12d3-a456-426614174000/file)');

  assert.match(html, /<img src="\/api\/attachments\/123e4567-e89b-12d3-a456-426614174000\/file"/);
  assert.match(html, /alt="gel &lt;1&gt;.png"/);
  assert.match(html, /结果如下<br>/);
});
