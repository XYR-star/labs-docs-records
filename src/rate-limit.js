export function createLoginRateLimiter({
  maxFailures = 5,
  windowMs = 10 * 60 * 1000,
  lockMs = 15 * 60 * 1000,
  now = () => Date.now()
} = {}) {
  const attempts = new Map();

  function getFreshRecord(key) {
    const currentTime = now();
    const record = attempts.get(key);
    if (!record || currentTime - record.windowStartedAt > windowMs) {
      return {
        failures: 0,
        windowStartedAt: currentTime,
        lockedUntil: 0
      };
    }
    return record;
  }

  return {
    isBlocked(key) {
      const record = attempts.get(key);
      const currentTime = now();
      if (!record || record.lockedUntil <= currentTime) {
        return { blocked: false, retryAfterSeconds: 0 };
      }
      return {
        blocked: true,
        retryAfterSeconds: Math.ceil((record.lockedUntil - currentTime) / 1000)
      };
    },

    recordFailure(key) {
      const record = getFreshRecord(key);
      record.failures += 1;
      if (record.failures >= maxFailures) {
        record.lockedUntil = now() + lockMs;
      }
      attempts.set(key, record);
      return record;
    },

    recordSuccess(key) {
      attempts.delete(key);
    }
  };
}
