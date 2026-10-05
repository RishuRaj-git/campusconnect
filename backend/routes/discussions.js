const express = require('express');
const Discussion = require('../models/Discussion');
const { Notification } = require('../models/Chat');
const { authMiddleware } = require('../middleware/auth');
const { containsAbuse } = require('../utils/profanity');
const { escapeRegExp, toStr } = require('../utils/sanitize');
const { actionRate, duplicateText } = require('../middleware/actionLimits');

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
    // Quora-style: best (most liked) answers first inside each question
    for (const d of items) {
      (d.comments || []).sort((a, b) => (b.likes || []).length - (a.likes || []).length);
    }
    res.set('X-Total-Count', String(total));
    res.json(items);
  });
  router.post('/', authMiddleware, actionRate('write'), async (req, res) => {
    const title = toStr(req.body.title, 150);
    const content = toStr(req.body.content, 5000);
    if (!title) return res.status(400).json({ error: 'Question title required.' });
    if (containsAbuse(title) || containsAbuse(content)) return res.status(400).json({ error: 'Please keep it respectful — post blocked.' });
    if (duplicateText(`post:${req.user.id}`, `${title}\n${content}`, 5 * 60 * 1000)) {
      return res.status(429).json({ error: 'You already posted that — no need to send it twice.' });
    }
    const d = await new Discussion({ title, content, author: req.user.username, authorId: req.user.id }).save();
    res.status(201).json(d);
  });
  router.post('/:id/like', authMiddleware, actionRate('like'), async (req, res) => {
    const d = await Discussion.findById(req.params.id);
    if (!d) return res.status(404).json({ error: 'Not found.' });
    const i = d.likes.indexOf(req.user.username);
    let liked = false;
    if (i === -1) { d.likes.push(req.user.username); liked = true; } else d.likes.splice(i, 1);
    await d.save();
    if (liked) notify(io, { recipient: d.author, type: 'like', fromUser: req.user.username, refId: d._id.toString(), text: `${req.user.username} liked your post "${d.title}"` });
    res.json(d);
  });
  router.post('/:id/comments', authMiddleware, actionRate('write'), async (req, res) => {
    const text = toStr(req.body.text, 1000);
    if (!text) return res.status(400).json({ error: 'Answer text required.' });
    if (containsAbuse(text)) return res.status(400).json({ error: 'Please keep it respectful — answer blocked.' });
    if (duplicateText(`comment:${req.user.id}`, text)) {
      return res.status(429).json({ error: 'You already sent that answer.' });
    }
    const d = await Discussion.findById(req.params.id);
    if (!d) return res.status(404).json({ error: 'Not found.' });
    d.comments.push({ author: req.user.username, authorId: req.user.id, text, likes: [] });
    await d.save();
    notify(io, { recipient: d.author, type: 'comment', fromUser: req.user.username, refId: d._id.toString(), text: `${req.user.username} commented on "${d.title}"` });
    res.json(d);
  });
  // Quora-style answer upvote: POST /api/discussions/:id/comments/:commentId/like
  router.post('/:id/comments/:commentId/like', authMiddleware, actionRate('like'), async (req, res) => {
    const d = await Discussion.findById(req.params.id);
    if (!d) return res.status(404).json({ error: 'Not found.' });
    const c = d.comments.id(req.params.commentId);
    if (!c) return res.status(404).json({ error: 'Answer not found.' });
    if (!Array.isArray(c.likes)) c.likes = [];
    const i = c.likes.indexOf(req.user.username);
    let liked = false;
    if (i === -1) { c.likes.push(req.user.username); liked = true; } else c.likes.splice(i, 1);
    await d.save();
    if (liked) notify(io, { recipient: c.author, type: 'like', fromUser: req.user.username, refId: d._id.toString(), text: `${req.user.username} liked your answer on "${d.title}"` });
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
