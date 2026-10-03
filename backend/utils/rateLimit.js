// Tiny in-memory sliding-window rate limiter (no deps).
// For single-instance Node. If you scale horizontally later,
// swap this for Redis (e.g. rate-limit-redis).
function createBucket({ max, windowMs }) {
  const hits = new Map(); // key -> array of timestamps
  function prune(now) {
    // Cheap periodic cleanup to avoid unbounded growth
    if (hits.size > 10000) {
      for (const [k, arr] of hits) {
        const fresh = arr.filter((t) => now - t < windowMs);
        if (fresh.length) hits.set(k, fresh);
        else hits.delete(k);
      }
    }
  }
  return {
    // Returns true if allowed (and records the hit), false if over limit
    take(key) {
      const now = Date.now();
      const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
      if (arr.length >= max) {
        hits.set(key, arr);
        return false;
      }
      arr.push(now);
      hits.set(key, arr);
      if (Math.random() < 0.01) prune(now);
      return true;
    },
    _size() { return hits.size; }
  };
}

module.exports = { createBucket };
