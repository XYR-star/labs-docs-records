import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStoragePath,
  generateSlotGrid,
  normalizeInventoryQuantity,
  validateSlotCode
} from '../src/domain.js';

test('builds a readable storage path from root to leaf', () => {
  const locations = [
    { id: 'room-a', parent_id: null, name: 'Room A' },
    { id: 'freezer-1', parent_id: 'room-a', name: '-80 Freezer 1' },
    { id: 'rack-2', parent_id: 'freezer-1', name: 'Rack 2' },
    { id: 'box-a1', parent_id: 'rack-2', name: 'Box A1' },
    { id: 'well-b7', parent_id: 'box-a1', name: 'B7' }
  ];

  assert.equal(
    buildStoragePath(locations, 'well-b7'),
    'Room A / -80 Freezer 1 / Rack 2 / Box A1 / B7'
  );
});

test('prevents inventory quantity from going below zero', () => {
  assert.equal(normalizeInventoryQuantity('5', '-2'), 3);
  assert.equal(normalizeInventoryQuantity('5', '-9'), 0);
});

test('generates Excel-like slot coordinates for freezer boxes', () => {
  const slots = generateSlotGrid(2, 3);

  assert.deepEqual(slots.map((slot) => slot.code), ['A1', 'A2', 'A3', 'B1', 'B2', 'B3']);
  assert.deepEqual(slots[4], { row: 2, column: 2, rowLabel: 'B', columnLabel: '2', code: 'B2' });
});

test('validates slot codes against a box layout', () => {
  assert.equal(validateSlotCode('B7', 8, 12), 'B7');
  assert.equal(validateSlotCode('b7', 8, 12), 'B7');
  assert.equal(validateSlotCode('I1', 8, 12), null);
  assert.equal(validateSlotCode('A13', 8, 12), null);
});
