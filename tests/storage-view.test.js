import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStorageView } from '../src/storage-view.js';

test('builds a selected box grid with occupied slot details', () => {
  const view = buildStorageView({
    location: {
      id: 'box-a',
      name: 'Box A',
      kind: 'box',
      rows: 2,
      columns: 3
    },
    inventory: [
      { id: 'item-1', name: 'PCR primer mix', slot_code: 'A2', quantity: '1', unit: 'tube', status: 'available' },
      { id: 'item-2', name: 'Old enzyme', slot_code: 'B3', quantity: '0', unit: 'tube', status: 'depleted' }
    ]
  });

  assert.equal(view.location.name, 'Box A');
  assert.equal(view.slots.length, 6);
  assert.equal(view.slots.find((slot) => slot.code === 'A2').item.name, 'PCR primer mix');
  assert.equal(view.slots.find((slot) => slot.code === 'A1').item, null);
  assert.equal(view.slots.find((slot) => slot.code === 'B3').state, 'depleted');
});

test('places child locations into freezer grid slots', () => {
  const view = buildStorageView({
    location: {
      id: 'freezer-1',
      name: '-80 Freezer 1',
      kind: 'freezer',
      rows: 3,
      columns: 4
    },
    children: [
      { id: 'rack-1', name: 'Rack 1', kind: 'rack', position_code: 'A1' },
      { id: 'box-overflow', name: 'Overflow Box', kind: 'box', position_code: 'C4' }
    ],
    inventory: []
  });

  assert.equal(view.slots.length, 12);
  assert.equal(view.slots.find((slot) => slot.code === 'A1').child.name, 'Rack 1');
  assert.equal(view.slots.find((slot) => slot.code === 'C4').child.kind, 'box');
  assert.equal(view.slots.find((slot) => slot.code === 'B2').child, null);
});
