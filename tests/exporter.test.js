import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { exportBackupManifest } from '../src/exporter.js';

test('writes backup manifest JSON into the exports directory', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'labs-export-'));

  try {
    const result = await exportBackupManifest({
      exportsDir: temp,
      experiments: [{ id: 'exp-1', title: 'mRNA transfection' }],
      records: [{ id: 'entry-1', title: 'PCR setup' }],
      inventory: [{ id: 'item-1', name: 'Taq polymerase' }],
      locations: [{ id: 'loc-1', name: 'Freezer' }],
      attachments: [{ id: 'att-1', original_name: 'gel.png' }]
    });

    assert.equal(result.kind, 'manifest');
    assert.ok(result.filename.endsWith('.json'));
    assert.ok(result.filepath.startsWith(temp));

    const parsed = JSON.parse(await readFile(result.filepath, 'utf8'));
    assert.equal(parsed.schema, 'labs-eln-backup-v1');
    assert.equal(parsed.experiments[0].title, 'mRNA transfection');
    assert.equal(parsed.records[0].title, 'PCR setup');
    assert.equal(parsed.inventory[0].name, 'Taq polymerase');
    assert.equal(parsed.attachments[0].original_name, 'gel.png');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
