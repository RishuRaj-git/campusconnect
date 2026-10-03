const express = require('express');
const { Notification } = require('../models/Chat');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.get('/', authMiddleware, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  res.json(await Notification.find({ recipient: req.user.username }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean());
});
router.post('/:id/read', authMiddleware, async (req, res) => {
  await Notification.findOneAndUpdate({ _id: req.params.id, recipient: req.user.username }, { read: true });
  res.json({ ok: true });
});
router.post('/read-all', authMiddleware, async (req, res) => {
  await Notification.updateMany({ recipient: req.user.username }, { read: true });
  res.json({ ok: true });
});
module.exports = router;
