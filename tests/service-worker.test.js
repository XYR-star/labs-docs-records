import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('service worker uses a fresh cache and activates updates immediately', async () => {
  const source = await readFile(new URL('../public/service-worker.js', import.meta.url), 'utf8');

  assert.match(source, /labs-eln-v\d+/);
  assert.match(source, /self\.skipWaiting\(\)/);
  assert.match(source, /self\.clients\.claim\(\)/);
  assert.match(source, /caches\.keys\(\)/);
});

test('service worker fetches the network before falling back to cached app shell assets', async () => {
  const source = await readFile(new URL('../public/service-worker.js', import.meta.url), 'utf8');
  const fetchIndex = source.indexOf('fetch(event.request)');
  const fallbackIndex = source.indexOf('caches.match(fallbackKey)');

  assert.ok(fetchIndex > -1);
  assert.ok(fallbackIndex > fetchIndex);
});
