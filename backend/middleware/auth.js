const jwt = require('jsonwebtoken');
const User = require('../models/User');

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}. Copy .env.example to .env.`);
  return v;
}

// Decode + validate the bearer token. Returns null for missing/invalid tokens
// (never throws), so callers can decide whether auth is required or optional.
function verifiedPayload(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!payload || typeof payload.id !== 'string' || typeof payload.username !== 'string') return null;
    return payload;
  } catch {
    return null;
  }
}

function authMiddleware(req, res, next) {
  if (!(req.headers.authorization || '').startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Login required.' });
  }
  const payload = verifiedPayload(req);
  if (!payload) return res.status(401).json({ error: 'Session expired. Please log in again.' });
  // Enforce bans on every authenticated request (a ban must take effect
  // immediately, not at next login).
  User.findById(payload.id).select('isBanned').lean()
    .then((u) => {
      if (!u) return res.status(401).json({ error: 'Account no longer exists.' });
      if (u.isBanned) return res.status(403).json({ error: 'Your account has been suspended.' });
      req.user = payload;
      next();
    })
    .catch(() => res.status(500).json({ error: 'Auth check failed.' }));
}

// For routes that are public but personalise their response (e.g. a profile
// only exposing its enrollment number to its owner). Invalid/expired tokens
// are treated as anonymous instead of blocking the public content.
function optionalAuth(req, res, next) {
  const payload = verifiedPayload(req);
  if (!payload) return next();
  User.findById(payload.id).select('isBanned').lean()
    .then((u) => {
      if (u && !u.isBanned) req.user = payload;
      next();
    })
    .catch(() => next());
}

module.exports = { authMiddleware, optionalAuth, requiredEnv };
