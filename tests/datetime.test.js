import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBeijingDateTimeInput, parseBeijingDateTimeInput } from '../src/datetime.js';

test('parseBeijingDateTimeInput treats datetime-local values as Asia/Shanghai time', () => {
  assert.equal(parseBeijingDateTimeInput('2026-06-16T17:30'), '2026-06-16T09:30:00.000Z');
});

test('formatBeijingDateTimeInput formats UTC timestamps for datetime-local controls in Beijing time', () => {
  assert.equal(formatBeijingDateTimeInput('2026-06-16T09:30:00.000Z'), '2026-06-16T17:30');
});

test('parseBeijingDateTimeInput leaves empty values unset', () => {
  assert.equal(parseBeijingDateTimeInput(''), null);
  assert.equal(parseBeijingDateTimeInput(null), null);
});
