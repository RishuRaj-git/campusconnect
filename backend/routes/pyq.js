const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PYQ = require('../models/PYQ');
const { authMiddleware } = require('../middleware/auth');
const { escapeRegExp, toStr } = require('../utils/sanitize');
const { actionRate } = require('../middleware/actionLimits');
const { containsAbuse } = require('../utils/profanity');
const crypto = require('crypto');

const router = express.Router();

// Short-lived view tokens: the in-app PDF iframe can't send an Authorization
// header, so it gets a 60-second single-purpose token instead of the JWT.
const viewTokens = new Map(); // token -> { pyqId, exp }
function mintViewToken(pyqId) {
  const t = crypto.randomBytes(16).toString('hex');
  viewTokens.set(t, { pyqId, exp: Date.now() + 60000 });
  if (viewTokens.size > 2000) {
    for (const [k, v] of viewTokens) if (v.exp < Date.now()) viewTokens.delete(k);
  }
  return t;
}

const MIME = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
function mimeFor(name = '') {
  const m = name.match(/\.[a-zA-Z0-9]{2,5}$/);
  return MIME[(m || [''])[0].toLowerCase()] || 'application/octet-stream';
}

router.post('/:id/view-token', authMiddleware, async (req, res) => {
  const pyq = await PYQ.findById(req.params.id).select('_id fileUrl');
  if (!pyq?.fileUrl) return res.status(404).json({ error: 'File not found.' });
  res.json({ token: mintViewToken(pyq._id.toString()) });
});

// Streams the file with a correct inline Content-Type so the browser renders
// PDFs natively (no client PDF engine, no CORS/CSP battles — same origin).
router.get('/:id/view', async (req, res) => {
  const v = viewTokens.get(String(req.query.t || ''));
  if (!v || v.exp < Date.now() || v.pyqId !== req.params.id) {
    return res.status(401).json({ error: 'View link expired. Reopen it.' });
  }
  const pyq = await PYQ.findById(req.params.id);
  if (!pyq?.fileUrl) return res.status(404).json({ error: 'File not found.' });
  if (pyq.fileUrl.startsWith('/uploads')) {
    return res.sendFile(path.join(__dirname, '..', pyq.fileUrl.replace('/uploads', 'uploads')));
  }
  try {
    const upstream = await fetch(pyq.fileUrl);
    if (!upstream.ok) throw new Error('upstream ' + upstream.status);
    res.setHeader('Content-Type', mimeFor(pyq.fileName));
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    const { Readable } = require('stream');
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (e) {
    console.error('view stream failed:', e.message);
    res.status(502).json({ error: 'Could not load preview.' });
  }
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => /pdf|jpg|jpeg|png/.test(path.extname(file.originalname).toLowerCase()) ? cb(null, true) : cb(new Error('Only PDF/JPG/PNG')) });
const { enabled: storageEnabled, uploadBuffer, destroyFile } = require('../utils/storage');

router.get('/', async (req, res) => {
  const { branch, subject, year, teacher } = req.query;
  const f = {};
  if (branch) f.branch = branch;
  if (subject) f.subject = subject;
  if (year) f.year = Number(year);
  if (teacher) f.teacher = teacher;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const [total, items] = await Promise.all([
    PYQ.countDocuments(f),
    PYQ.find(f).sort({ year: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('uploadedBy', 'username').populate('teacher', 'name').lean()
  ]);
  res.set('X-Total-Count', String(total));
  res.json(items);
});
router.get('/meta', async (req, res) => {
  const [branches, subjects, years] = await Promise.all([PYQ.distinct('branch'), PYQ.distinct('subject'), PYQ.distinct('year')]);
  res.json({ branches: branches.sort(), subjects: subjects.sort(), years: years.sort((a, b) => b - a) });
});
router.post('/upload', authMiddleware, actionRate('upload'), upload.single('file'), async (req, res) => {
  const { branch, subject, year, semester, examType, title, notes, teacherName } = req.body;
  if (!branch || !subject || !year || !title) return res.status(400).json({ error: 'Branch, subject, year, title required.' });
  if (!req.file && !notes) return res.status(400).json({ error: 'Upload a file or add notes.' });
  if (containsAbuse(title) || containsAbuse(notes || '')) {
    return res.status(400).json({ error: 'Please keep it respectful — title/notes blocked.' });
  }
  let teacher;
  if (teacherName && String(teacherName).trim()) {
    const { Teacher } = require('../models/Teacher');
    const match = await Teacher.findOne({ name: new RegExp(`^${escapeRegExp(toStr(teacherName, 100))}$`, 'i') }).select('_id');
    if (match) teacher = match._id; // links only to existing teachers — add new ones from the Teachers page
  }
  let fileUrl, fileName, publicId, resourceType, rawPublicId, rawUrl, pageCount = 1;
  if (req.file) {
    if (!storageEnabled()) return res.status(500).json({ error: 'File storage is not configured.' });
    try {
      const isPdf = path.extname(req.file.originalname).toLowerCase() === '.pdf';
      if (isPdf) {
        // Dual-store: image copy renders pages (f_jpg,pg_N works), raw copy
        // downloads bytes (this account 401s `.pdf`-suffixed delivery).
        const [img, raw] = await Promise.all([
          uploadBuffer(req.file.buffer, { filename: req.file.originalname, resourceType: 'auto' }),
          uploadBuffer(req.file.buffer, { filename: req.file.originalname, resourceType: 'raw' })
        ]);
        fileUrl = img.url; publicId = img.publicId; resourceType = 'image';
        rawPublicId = raw.publicId; rawUrl = raw.url;
        pageCount = img.pages || 1;
      } else {
        const up = await uploadBuffer(req.file.buffer, { filename: req.file.originalname, resourceType: 'auto' });
        fileUrl = up.url; publicId = up.publicId; resourceType = up.resourceType; fileName = req.file.originalname;
      }
      fileName = req.file.originalname;
    } catch (e) {
      console.error('Cloudinary upload failed:', e.message);
      return res.status(500).json({ error: 'Upload to storage failed. Try again.' });
    }
  }
  const pyq = await new PYQ({ branch, subject, year: Number(year), semester: semester || undefined, examType: examType || 'Other', title, notes, teacher,
    fileUrl, fileName, publicId, resourceType, rawPublicId, rawUrl, pageCount, uploadedBy: req.user.id }).save();
  res.status(201).json(pyq);
});
// GET /api/pyq/:id/download — LOGIN REQUIRED. Counts the download, then
// hands the client a URL to open (plain <a> links can't carry a JWT, so the
// frontend fetches this with its token and opens the returned URL).
// PDFs download via their raw copy (this account 401s `.pdf`-suffixed URLs).
router.get('/:id/download', authMiddleware, async (req, res) => {
  const pyq = await PYQ.findByIdAndUpdate(req.params.id, { $inc: { downloads: 1 } }, { new: true });
  if (!pyq?.fileUrl) return res.status(404).json({ error: 'File not found.' });
  res.json({ url: pyq.rawUrl || pyq.fileUrl, fileName: pyq.fileName });
});
// GET /api/pyq/:id/pages — LOGIN REQUIRED. Scribd-style page images for the
// in-app reader: [{ n, url }]. Rendered by Cloudinary (f_jpg,pg_N), cached
// after first view, plain <img> tags (no PDF engine, no iframe, no CSP pain).
router.get('/:id/pages', authMiddleware, async (req, res) => {
  const pyq = await PYQ.findById(req.params.id).select('publicId resourceType pageCount fileName');
  if (!pyq?.publicId) return res.status(404).json({ error: 'No previewable file.' });
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const n = Math.min(Math.max(pyq.pageCount || 1, 1), 200);
  const pages = [];
  for (let i = 1; i <= n; i++) {
    pages.push({ n: i, url: `https://res.cloudinary.com/${cloud}/image/upload/f_jpg,pg_${i},w_1200/${pyq.publicId}.jpg` });
  }
  res.json({ pages, total: n });
});
router.delete('/:id', authMiddleware, async (req, res) => {
  const pyq = await PYQ.findById(req.params.id);
  if (!pyq) return res.status(404).json({ error: 'Not found.' });
  const User = require('../models/User');
  const me = await User.findById(req.user.id).select('isAdmin');
  if (pyq.uploadedBy.toString() !== req.user.id && !me?.isAdmin) return res.status(403).json({ error: 'Not authorized.' });
  if (pyq.publicId) {
    await destroyFile(pyq.publicId, pyq.resourceType); // Cloudinary file
    if (pyq.rawPublicId) await destroyFile(pyq.rawPublicId, 'raw'); // download copy
  } else if (pyq.fileUrl && pyq.fileUrl.startsWith('/uploads')) {
    fs.unlink(path.join(__dirname, '..', pyq.fileUrl.replace('/uploads', 'uploads')), () => {}); // legacy local file
  }
  await pyq.deleteOne();
  res.json({ message: 'Deleted.' });
});
module.exports = router;
