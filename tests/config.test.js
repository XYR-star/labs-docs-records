import test from 'node:test';
import assert from 'node:assert/strict';

import { getDataPaths } from '../src/config.js';

test('uses /www/labs-data as the default persistent data root', () => {
  const paths = getDataPaths({});

  assert.equal(paths.root, '/www/labs-data');
  assert.equal(paths.uploads, '/www/labs-data/uploads');
  assert.equal(paths.exports, '/www/labs-data/exports');
  assert.equal(paths.backups, '/www/labs-data/backups');
  assert.equal(paths.logs, '/www/labs-data/logs');
});

test('keeps all configured persistent paths under the configured data root', () => {
  const paths = getDataPaths({ LABS_DATA_ROOT: '/tmp/labs-data-test' });

  assert.equal(paths.root, '/tmp/labs-data-test');
  assert.ok(paths.uploads.startsWith(paths.root));
  assert.ok(paths.exports.startsWith(paths.root));
  assert.ok(paths.backups.startsWith(paths.root));
  assert.ok(paths.logs.startsWith(paths.root));
});
