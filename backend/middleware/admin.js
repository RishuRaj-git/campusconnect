const User = require('../models/User');

async function adminOnly(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select('isAdmin isBanned');
    if (!user || !user.isAdmin) return res.status(403).json({ error: 'Admin only.' });
    if (user.isBanned) return res.status(403).json({ error: 'Account suspended.' });
    next();
  } catch {
    res.status(500).json({ error: 'Admin check failed.' });
  }
}

module.exports = adminOnly;
