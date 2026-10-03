const express = require('express');
const Discussion = require('../models/Discussion');
const { Notification } = require('../models/Chat');
const { authMiddleware } = require('../middleware/auth');
const { containsAbuse } = require('../utils/profanity');
const { escapeRegExp, toStr } = require('../utils/sanitize');

const router = express.Router();
async function notify(io, data) {
  if (data.recipient === data.fromUser) return;
  try {
    const n = await Notification.create(data);
    io.to(`user:${data.recipient}`).emit('notification', n);
  } catch (e) { console.error('notify error', e); }
}
module.exports = (io) => {
  router.get('/', async (req, res) => {
    const q = req.query.search || '';
    const rx = new RegExp(escapeRegExp(q).slice(0, 100), 'i');
    const filter = q ? { $or: [{ title: rx }, { content: rx }] } : {};
    const sort = req.query.sort === 'liked' ? { likes: -1 } : { createdAt: -1 };
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const [total, items] = await Promise.all([
      Discussion.countDocuments(filter),
      Discussion.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean()
    ]);
    res.set('X-Total-Count', String(total));
    res.json(items);
  });
  router.post('/', authMiddleware, async (req, res) => {
    const title = toStr(req.body.title, 150);
    const content = toStr(req.body.content, 5000);
    if (!title || !content) return res.status(400).json({ error: 'Title and content required.' });
    if (containsAbuse(title) || containsAbuse(content)) return res.status(400).json({ error: 'Please keep it respectful — post blocked.' });
    const d = await new Discussion({ title, content, author: req.user.username, authorId: req.user.id }).save();
    res.status(201).json(d);
  });
  router.post('/:id/like', authMiddleware, async (req, res) => {
    const d = await Discussion.findById(req.params.id);
    if (!d) return res.status(404).json({ error: 'Not found.' });
    const i = d.likes.indexOf(req.user.username);
    let liked = false;
    if (i === -1) { d.likes.push(req.user.username); liked = true; } else d.likes.splice(i, 1);
    await d.save();
    if (liked) notify(io, { recipient: d.author, type: 'like', fromUser: req.user.username, refId: d._id.toString(), text: `${req.user.username} liked your post "${d.title}"` });
    res.json(d);
  });
  router.post('/:id/comments', authMiddleware, async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Comment required.' });
    if (containsAbuse(text)) return res.status(400).json({ error: 'Please keep it respectful — comment blocked.' });
    const d = await Discussion.findById(req.params.id);
    if (!d) return res.status(404).json({ error: 'Not found.' });
    d.comments.push({ author: req.user.username, authorId: req.user.id, text: text.slice(0, 1000) });
    await d.save();
    notify(io, { recipient: d.author, type: 'comment', fromUser: req.user.username, refId: d._id.toString(), text: `${req.user.username} commented on "${d.title}"` });
    res.json(d);
  });
  router.delete('/:id', authMiddleware, async (req, res) => {
    const d = await Discussion.findById(req.params.id);
    if (!d) return res.status(404).json({ error: 'Not found.' });
    const User = require('../models/User');
    const me = await User.findById(req.user.id).select('isAdmin');
    if (d.author !== req.user.username && !me?.isAdmin) return res.status(403).json({ error: 'Not authorized.' });
    await d.deleteOne();
    res.json({ message: 'Deleted.' });
  });
  return router;
};
