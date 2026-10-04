// Per-user action throttles (spam control). The global /api limiter stops
// floods; these stop one user from script-looping a single action.
// Single-instance memory (same caveat as utils/rateLimit — use Redis if scaled).
const { createBucket } = require('../utils/rateLimit');

const buckets = {
  // posts, comments: generous for humans, fatal for loops
  write: createBucket({ max: 8, windowMs: 5 * 60 * 1000 }),
  // like/unlike toggles are cheap single taps
  like: createBucket({ max: 30, windowMs: 60 * 1000 }),
  // file uploads are expensive (bandwidth + Cloudinary)
  upload: createBucket({ max: 10, windowMs: 60 * 60 * 1000 }),
  // starting conversations + profile edits
  light: createBucket({ max: 15, windowMs: 60 * 60 * 1000 })
};

// In-memory duplicate-text guard: same user posting the identical text twice
// within `windowMs` is copy-paste spam, not conversation.
const lastText = new Map(); // key -> { text, at }
function duplicateText(key, text, windowMs = 60000) {
  const now = Date.now();
  const prev = lastText.get(key);
  if (prev && prev.text === text && now - prev.at < windowMs) return true;
  lastText.set(key, { text, at: now });
  if (lastText.size > 5000) lastText.clear();
  return false;
}

function actionRate(kind) {
  return (req, res, next) => {
    const key = (req.user && req.user.id) || req.ip;
    if (!buckets[kind].take(`${kind}:${key}`)) {
      return res.status(429).json({ error: 'Too many actions — slow down a little.' });
    }
    next();
  };
}

module.exports = { actionRate, duplicateText };
