import test from 'node:test';
import assert from 'node:assert/strict';

import { createLoginRateLimiter } from '../src/rate-limit.js';

test('blocks a client after too many failed login attempts', () => {
  const limiter = createLoginRateLimiter({
    maxFailures: 3,
    windowMs: 60_000,
    lockMs: 300_000,
    now: () => 1_000
  });

  assert.equal(limiter.isBlocked('203.0.113.10').blocked, false);
  limiter.recordFailure('203.0.113.10');
  limiter.recordFailure('203.0.113.10');
  assert.equal(limiter.isBlocked('203.0.113.10').blocked, false);
  limiter.recordFailure('203.0.113.10');

  const blocked = limiter.isBlocked('203.0.113.10');
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.retryAfterSeconds, 300);
});

test('successful login clears previous failures', () => {
  const limiter = createLoginRateLimiter({
    maxFailures: 3,
    windowMs: 60_000,
    lockMs: 300_000,
    now: () => 1_000
  });

  limiter.recordFailure('203.0.113.11');
  limiter.recordFailure('203.0.113.11');
  limiter.recordSuccess('203.0.113.11');
  limiter.recordFailure('203.0.113.11');

  assert.equal(limiter.isBlocked('203.0.113.11').blocked, false);
});

test('expired windows start a fresh failure count', () => {
  let time = 1_000;
  const limiter = createLoginRateLimiter({
    maxFailures: 3,
    windowMs: 60_000,
    lockMs: 300_000,
    now: () => time
  });

  limiter.recordFailure('203.0.113.12');
  limiter.recordFailure('203.0.113.12');
  time = 70_000;
  limiter.recordFailure('203.0.113.12');

  assert.equal(limiter.isBlocked('203.0.113.12').blocked, false);
});
