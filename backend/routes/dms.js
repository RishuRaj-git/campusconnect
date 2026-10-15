const express = require('express');
const multer = require('multer');
const path = require('path');
const User = require('../models/User');
const { Conversation, DirectMessage } = require('../models/Chat');
const { authMiddleware } = require('../middleware/auth');
const { actionRate } = require('../middleware/actionLimits');
const { containsAbuse } = require('../utils/profanity');
const { enabled: storageEnabled, uploadBuffer } = require('../utils/storage');

const router = express.Router();

// Registry of freshly uploaded DM attachments: publicId -> { by, at, fileUrl... }.
// The socket send below only accepts THESE ids, so a client can never inject
// an arbitrary (phishing/malware) link into someone's inbox. 15-min TTL.
const pendingUploads = new Map();
function registerUpload(info, username) {
  pendingUploads.set(info.publicId, { ...info, by: username, at: Date.now() });
  if (pendingUploads.size > 1000) pendingUploads.clear();
}
function claimUpload(publicId, username) {
  const u = pendingUploads.get(publicId);
  if (!u || u.by !== username || Date.now() - u.at > 15 * 60 * 1000) return null;
  pendingUploads.delete(publicId);
  return u;
}
// Exported for server.js socket handler (same process).
router.claimUpload = claimUpload;
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

// Documents for DMs: memory-upload straight to Cloudinary (nothing on our
// disk). Returns an attachment token (publicId) — the client then sends it
// inside the socket 'dm message', which claims + verifies it below.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /pdf|jpg|jpeg|png|webp|doc|docx|txt/.test(path.extname(file.originalname).toLowerCase());
    return ok ? cb(null, true) : cb(new Error('Only PDF, images, DOC/DOCX or TXT files.'));
  } });

router.post('/upload', authMiddleware, actionRate('upload'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file.' });
  if (!storageEnabled()) return res.status(500).json({ error: 'File storage is not configured.' });
  const ext = path.extname(req.file.originalname).toLowerCase();
  const needsRaw = ['.pdf', '.doc', '.docx', '.txt'].includes(ext); // this account 401s .pdf-suffixed delivery
  try {
    const up = await uploadBuffer(req.file.buffer, { folder: 'campusconnect/dm', filename: req.file.originalname, resourceType: needsRaw ? 'raw' : 'auto' });
    const info = { fileUrl: up.url, fileName: req.file.originalname, publicId: up.publicId, resourceType: up.resourceType };
    registerUpload(info, req.user.username);
    res.json(info);
  } catch (e) {
    console.error('DM upload failed:', e.message);
    res.status(500).json({ error: 'Upload failed. Try again.' });
  }
});
module.exports = router;
