const express = require('express');
const multer = require('multer');
const path = require('path');
const User = require('../models/User');
const { Conversation, DirectMessage } = require('../models/Chat');
const { authMiddleware } = require('../middleware/auth');
const { actionRate } = require('../middleware/actionLimits');
const { containsAbuse } = require('../utils/profanity');
const { toStr } = require('../utils/sanitize');
const { enabled: storageEnabled, uploadBuffer } = require('../utils/storage');
const crypto = require('crypto');

// Same short-lived view-token pattern as PYQs (see routes/pyq.js).
const dmViewTokens = new Map(); // token -> { msgId, userId, exp }
const DM_MIME = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };

const router = express.Router();

// Registry of freshly uploaded DM attachments: publicId -> { by, at, fileUrl... }.
// The socket send below only accepts THESE ids, so a client can never inject
// an arbitrary (phishing/malware) link into someone's inbox. 15-min TTL.
const pendingUploads = new Map();
function registerUpload(info, username) {
  pendingUploads.set(info.publicId, { ...info, by: username, at: Date.now() });
  if (pendingUploads.size > 1000) {
    // Evict only expired entries — clearing the whole map would invalidate
    // other users' freshly uploaded attachments.
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const [id, v] of pendingUploads) if (v.at < cutoff) pendingUploads.delete(id);
    if (pendingUploads.size > 2000) pendingUploads.clear();
  }
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
  // Coerce to a plain string: blocks NoSQL operator injection via JSON
  // bodies like {"username": {"$ne": null}}.
  const username = toStr(req.body.username, 20).trim();
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
  const before = req.query.before ? new Date(String(req.query.before)) : null;
  if (before && !isNaN(before)) f.createdAt = { $lt: before };
  res.json(await DirectMessage.find(f)
    .select('-publicId -rawPublicId -rawUrl -resourceType')
    .sort({ createdAt: -1 }).limit(limit).lean().then(msgs => msgs.reverse()));
});

// Documents for DMs: memory-upload straight to Cloudinary (nothing on our
// disk). Returns an attachment token (publicId) — the client then sends it
// inside the socket 'dm message', which claims + verifies it below.
const MAX_FILE_MB = Math.min(50, Math.max(1, Number(process.env.MAX_FILE_MB) || 15));
const UPLOAD_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.doc', '.docx', '.txt']);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // Exact extension match — a substring test would accept names like
    // "malware.notpdf" just because they contain "pdf".
    const ok = UPLOAD_EXT.has(path.extname(file.originalname).toLowerCase());
    return ok ? cb(null, true) : cb(new Error('Only PDF, images, DOC/DOCX or TXT files.'));
  } });

router.post('/upload', authMiddleware, actionRate('upload'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file.' });
  if (!storageEnabled()) return res.status(500).json({ error: 'File storage is not configured.' });
  const ext = path.extname(req.file.originalname).toLowerCase();
  try {
    const first = await uploadBuffer(req.file.buffer, { folder: 'campusconnect/dm', filename: req.file.originalname, resourceType: 'auto' });
    const info = { fileUrl: first.url, fileName: req.file.originalname, publicId: first.publicId, resourceType: first.resourceType };
    if (ext === '.pdf') {
      // Dual-store like PYQs: image copy renders pages, raw copy downloads
      // (this account 401s `.pdf`-suffixed delivery URLs).
      const raw = await uploadBuffer(req.file.buffer, { folder: 'campusconnect/dm', filename: req.file.originalname, resourceType: 'raw' });
      info.rawPublicId = raw.publicId;
      info.rawUrl = raw.url;
    }
    registerUpload(info, req.user.username);
    res.json(info);
  } catch (e) {
    console.error('DM upload failed:', e.message);
    res.status(500).json({ error: 'Upload failed. Try again.' });
  }
});

router.post('/messages/:msgId/view-token', authMiddleware, async (req, res) => {
  const m = await DirectMessage.findById(req.params.msgId);
  if (!m?.fileUrl) return res.status(404).json({ error: 'No attachment.' });
  const convo = await Conversation.findById(m.conversationId).select('participants');
  if (!convo || !convo.participants.some((p) => p.toString() === req.user.id)) {
    return res.status(403).json({ error: 'Not part of this conversation.' });
  }
  const t = crypto.randomBytes(16).toString('hex');
  dmViewTokens.set(t, { msgId: m._id.toString(), userId: req.user.id, exp: Date.now() + 60000 });
  if (dmViewTokens.size > 2000) {
    for (const [k, v] of dmViewTokens) if (v.exp < Date.now()) dmViewTokens.delete(k);
  }
  res.json({ token: t });
});

router.get('/attachments/:msgId/view', async (req, res) => {
  const v = dmViewTokens.get(String(req.query.t || ''));
  if (!v || v.exp < Date.now() || v.msgId !== req.params.msgId) {
    return res.status(401).json({ error: 'View link expired. Reopen it.' });
  }
  const m = await DirectMessage.findById(req.params.msgId);
  if (!m?.fileUrl) return res.status(404).json({ error: 'No attachment.' });
  const convo = await Conversation.findById(m.conversationId).select('participants');
  if (!convo || !convo.participants.some((p) => p.toString() === v.userId)) {
    return res.status(403).json({ error: 'Not part of this conversation.' });
  }
  try {
    const upstream = await fetch(m.rawUrl || m.fileUrl, { signal: AbortSignal.timeout(20000) });
    if (!upstream.ok) throw new Error('upstream ' + upstream.status);
    const ext = (m.fileName || '').match(/\.[a-zA-Z0-9]{2,5}$/);
    res.setHeader('Content-Type', DM_MIME[(ext || [''])[0].toLowerCase()] || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    const { Readable } = require('stream');
    const stream = Readable.fromWeb(upstream.body);
    stream.on('error', (err) => { console.error('dm view stream error:', err.message); res.destroy(err); });
    stream.pipe(res);
  } catch (e) {
    console.error('dm view stream failed:', e.message);
    res.status(502).json({ error: 'Could not load preview.' });
  }
});
module.exports = router;
