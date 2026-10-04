const express = require('express');
const User = require('../models/User');
const { Conversation, DirectMessage } = require('../models/Chat');
const { authMiddleware } = require('../middleware/auth');
const { actionRate } = require('../middleware/actionLimits');

const router = express.Router();
router.get('/conversations', authMiddleware, async (req, res) => {
  const convos = await Conversation.find({ participants: req.user.id }).populate('participants', 'username avatarUrl').sort({ lastMessageAt: -1 });
  res.json(convos.map(c => {
    const other = c.participants.find(p => p._id.toString() !== req.user.id);
    return { _id: c._id, otherUser: other ? { username: other.username, avatarUrl: other.avatarUrl } : null, lastMessage: c.lastMessage, lastMessageAt: c.lastMessageAt };
  }));
});
router.post('/conversations', authMiddleware, actionRate('light'), async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required.' });
  if (username === req.user.username) return res.status(400).json({ error: "Can't message yourself." });
  const other = await User.findOne({ username });
  if (!other) return res.status(404).json({ error: 'User not found.' });
  let convo = await Conversation.findOne({ participants: { $all: [req.user.id, other._id], $size: 2 } }).populate('participants', 'username avatarUrl');
  if (!convo) convo = await (await Conversation.create({ participants: [req.user.id, other._id] })).populate('participants', 'username avatarUrl');
  const o = convo.participants.find(p => p._id.toString() !== req.user.id);
  res.json({ _id: convo._id, otherUser: { username: o.username, avatarUrl: o.avatarUrl }, lastMessage: convo.lastMessage, lastMessageAt: convo.lastMessageAt });
});
router.get('/conversations/:id/messages', authMiddleware, async (req, res) => {
  const convo = await Conversation.findById(req.params.id);
  if (!convo) return res.status(404).json({ error: 'Not found.' });
  if (!convo.participants.some(p => p.toString() === req.user.id)) return res.status(403).json({ error: 'Not part of this conversation.' });
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const f = { conversationId: req.params.id };
  if (req.query.before) f.createdAt = { $lt: new Date(req.query.before) };
  res.json(await DirectMessage.find(f).sort({ createdAt: -1 }).limit(limit).lean().then(msgs => msgs.reverse()));
});
module.exports = router;
