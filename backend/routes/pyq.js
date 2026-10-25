const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
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
    const upstream = await fetch(pyq.fileUrl, { signal: AbortSignal.timeout(20000) });
    if (!upstream.ok) throw new Error('upstream ' + upstream.status);
    res.setHeader('Content-Type', mimeFor(pyq.fileName));
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    const { Readable } = require('stream');
    const stream = Readable.fromWeb(upstream.body);
    // Without an error listener a mid-stream upstream failure becomes an
    // uncaught 'error' event (which would kill the whole process).
    stream.on('error', (err) => { console.error('view stream error:', err.message); res.destroy(err); });
    stream.pipe(res);
  } catch (e) {
    console.error('view stream failed:', e.message);
    res.status(502).json({ error: 'Could not load preview.' });
  }
});

const MAX_FILE_MB = Math.min(50, Math.max(1, Number(process.env.MAX_FILE_MB) || 15));
const PYQ_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => PYQ_EXT.has(path.extname(file.originalname).toLowerCase()) ? cb(null, true) : cb(new Error('Only PDF/JPG/PNG')) });
const { enabled: storageEnabled, uploadBuffer, destroyFile } = require('../utils/storage');

router.get('/', async (req, res) => {
  // Sanitise every filter: Express's query parser turns `?branch[$ne]=x`
  // into an object, which would otherwise reach Mongo as a query operator.
  const branch = toStr(req.query.branch, 80).trim();
  const subject = toStr(req.query.subject, 120).trim();
  const teacher = toStr(req.query.teacher, 60).trim();
  const yearNum = Number(req.query.year);
  const f = {};
  if (branch) f.branch = branch;
  if (subject) f.subject = subject;
  if (Number.isInteger(yearNum)) f.year = yearNum;
  if (mongoose.isValidObjectId(teacher)) f.teacher = teacher;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const [total, items] = await Promise.all([
    PYQ.countDocuments(f),
    // Never expose storage URLs/public ids in the public listing — that would
    // let anyone bypass the login-gated /download and /view endpoints.
    PYQ.find(f).sort({ year: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .select('-fileUrl -publicId -rawPublicId -rawUrl -resourceType')
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
  const branch = toStr(req.body.branch, 80).trim();
  const subject = toStr(req.body.subject, 120).trim();
  const title = toStr(req.body.title, 200).trim();
  const notes = toStr(req.body.notes, 3000).trim();
  const teacherName = toStr(req.body.teacherName, 100).trim();
  const year = Number(req.body.year);
  const semesterNum = req.body.semester === '' || req.body.semester === undefined ? null : Number(req.body.semester);
  const examTypes = ['Mid-Term', 'End-Term', 'Internal', 'Practical', 'Other'];
  const examType = examTypes.includes(req.body.examType) ? req.body.examType : 'Other';
  if (!branch || !subject || !title) return res.status(400).json({ error: 'Branch, subject, title required.' });
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return res.status(400).json({ error: 'Year must be a valid 4-digit year.' });
  if (semesterNum !== null && (!Number.isInteger(semesterNum) || semesterNum < 1 || semesterNum > 8)) {
    return res.status(400).json({ error: 'Semester must be 1–8.' });
  }
  if (!req.file && !notes) return res.status(400).json({ error: 'Upload a file or add notes.' });
  if (containsAbuse(title) || containsAbuse(notes)) {
    return res.status(400).json({ error: 'Please keep it respectful — title/notes blocked.' });
  }
  let teacher;
  if (teacherName) {
    const { Teacher } = require('../models/Teacher');
    const match = await Teacher.findOne({ name: new RegExp(`^${escapeRegExp(teacherName)}$`, 'i') }).select('_id');
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
  const pyq = await new PYQ({ branch, subject, year, semester: semesterNum ?? undefined, examType, title, notes, teacher,
    fileUrl, fileName, publicId, resourceType, rawPublicId, rawUrl, pageCount, uploadedBy: req.user.id }).save();
  res.status(201).json(pyq);
});
// GET /api/pyq/:id/download — LOGIN REQUIRED. Counts the download, then
// hands the client a URL to open (plain <a> links can't carry a JWT, so the
// frontend fetches this with its token and opens the returned URL).
// PDFs download via their raw copy (this account 401s `.pdf`-suffixed URLs).
router.get('/:id/download', authMiddleware, async (req, res) => {
  const pyq = await PYQ.findById(req.params.id);
  if (!pyq?.fileUrl) return res.status(404).json({ error: 'File not found.' });
  pyq.downloads += 1; // count only successful downloads, not 404s
  await pyq.save();
  res.json({ url: pyq.rawUrl || pyq.fileUrl, fileName: pyq.fileName });
});
// NOTE: the old /:id/pages endpoint was removed — it handed any logged-in user
// a direct Cloudinary URL for the asset (bypassing the login-gated view/download
// flow and the download counter). Previews now always stream via /:id/view.
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
