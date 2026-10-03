const express = require('express');
const User = require('../models/User');
const Discussion = require('../models/Discussion');
const PYQ = require('../models/PYQ');
const { ChatMessage } = require('../models/Chat');
const { authMiddleware } = require('../middleware/auth');
const adminOnly = require('../middleware/admin');

const router = express.Router();
router.use(authMiddleware, adminOnly);
router.get('/check', (req, res) => res.json({ isAdmin: true }));
router.get('/stats', async (req, res) => {
  const [userCount, discussionCount, pyqCount, chatMessageCount] = await Promise.all([
    User.countDocuments(), Discussion.countDocuments(), PYQ.countDocuments(), ChatMessage.countDocuments()]);
  res.json({ userCount, discussionCount, pyqCount, chatMessageCount });
});
router.get('/users', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const [total, users] = await Promise.all([
    User.countDocuments(),
    User.find().select('username branch semester isAdmin isBanned').skip((page - 1) * limit).limit(limit).lean()
  ]);
  res.set('X-Total-Count', String(total));
  res.json(users);
});
router.post('/users/:username/ban', async (req, res) => {
  res.json(await User.findOneAndUpdate({ username: req.params.username }, { isBanned: true }, { new: true }).select('username isBanned'));
});
router.post('/users/:username/unban', async (req, res) => {
  res.json(await User.findOneAndUpdate({ username: req.params.username }, { isBanned: false }, { new: true }).select('username isBanned'));
});
router.get('/discussions', async (req, res) => res.json(await Discussion.find().sort({ _id: -1 }).limit(50).lean()));
router.delete('/discussions/:id', async (req, res) => { await Discussion.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted.' }); });
router.get('/chatmessages', async (req, res) => res.json(await ChatMessage.find().sort({ createdAt: -1 }).limit(100).lean()));
router.delete('/chatmessages/:id', async (req, res) => { await ChatMessage.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted.' }); });
module.exports = router;
