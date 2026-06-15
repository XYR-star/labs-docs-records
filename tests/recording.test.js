import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRecordingState,
  shouldRecordChange
} from '../src/recording.js';

test('recording is disabled until explicitly started', () => {
  const state = createRecordingState(null);

  assert.equal(state.enabled, false);
  assert.equal(shouldRecordChange(state), false);
});

test('recording is enabled after start time exists', () => {
  const state = createRecordingState('2026-06-15T06:40:00.000Z');

  assert.equal(state.enabled, true);
  assert.equal(state.started_at, '2026-06-15T06:40:00.000Z');
  assert.equal(shouldRecordChange(state), true);
});

test('formats inventory actions for readable history', () => {
  const state = createRecordingState('2026-06-15T06:40:00.000Z');

  assert.deepEqual(shouldRecordChange(state, 'inventory.store'), true);
});
