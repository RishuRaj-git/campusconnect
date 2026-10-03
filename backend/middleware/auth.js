const jwt = require('jsonwebtoken');

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}. Copy .env.example to .env.`);
  return v;
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required.' });
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
  // Enforce bans on every authenticated request (a ban must take effect
  // immediately, not at next login).
  const User = require('../models/User');
  User.findById(payload.id).select('isBanned').lean()
    .then((u) => {
      if (!u) return res.status(401).json({ error: 'Account no longer exists.' });
      if (u.isBanned) return res.status(403).json({ error: 'Your account has been suspended.' });
      req.user = payload;
      next();
    })
    .catch(() => res.status(500).json({ error: 'Auth check failed.' }));
}

module.exports = { authMiddleware, requiredEnv };
