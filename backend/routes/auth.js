const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { toStr } = require('../utils/sanitize');
const User = require('../models/User');

const router = express.Router();

router.post('/signup',
  body('username').isLength({ min: 3, max: 20 }).matches(/^[a-zA-Z0-9_]+$/),
  body('password').isLength({ min: 6, max: 100 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Username (3-20, letters/numbers/_ ) and password (6+ chars) required.' });
    // Coerce to plain strings: blocks NoSQL operator injection via JSON
    // bodies like {"username": {"$ne": null}}.
    const username = toStr(req.body.username, 20);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });
    if (await User.findOne({ username })) return res.status(400).json({ error: 'Username already taken.' });
    const hash = await bcrypt.hash(password, 10);
    await new User({ username, password: hash }).save();
    res.status(201).json({ message: 'Account created. Please log in.' });
  });

router.post('/login',
  body('username').notEmpty(), body('password').notEmpty(),
  async (req, res) => {
    const username = toStr(req.body.username, 20);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!username || !password) return res.status(400).json({ error: 'Invalid username or password.' });
    const user = await User.findOne({ username }).select('+password username isAdmin isBanned');
    if (!user) return res.status(400).json({ error: 'Invalid username or password.' });
    if (user.isBanned) return res.status(403).json({ error: 'Your account has been suspended.' });
    if (!(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: 'Invalid username or password.' });
    const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username: user.username, isAdmin: user.isAdmin });
  });

module.exports = router;
