const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PYQ = require('../models/PYQ');
const { authMiddleware } = require('../middleware/auth');
const { escapeRegExp, toStr } = require('../utils/sanitize');
const { actionRate } = require('../middleware/actionLimits');
const { containsAbuse } = require('../utils/profanity');

const router = express.Router();
// Memory storage — files stream straight to Cloudinary, never touch disk
// (local disk is ephemeral on Render/Railway free tiers).
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
  let fileUrl, fileName, publicId, resourceType;
  if (req.file) {
    if (!storageEnabled()) return res.status(500).json({ error: 'File storage is not configured.' });
    try {
      const isPdf = path.extname(req.file.originalname).toLowerCase() === '.pdf';
      const up = await uploadBuffer(req.file.buffer, { filename: req.file.originalname, resourceType: isPdf ? 'raw' : 'auto' });
      fileUrl = up.url; publicId = up.publicId; resourceType = up.resourceType; fileName = req.file.originalname;
    } catch (e) {
      console.error('Cloudinary upload failed:', e.message);
      return res.status(500).json({ error: 'Upload to storage failed. Try again.' });
    }
  }
  const pyq = await new PYQ({ branch, subject, year: Number(year), semester: semester || undefined, examType: examType || 'Other', title, notes, teacher,
    fileUrl, fileName, publicId, resourceType, uploadedBy: req.user.id }).save();
  res.status(201).json(pyq);
});
// GET /api/pyq/:id/download — LOGIN REQUIRED. Counts the download, then
// hands the client a URL to open (plain <a> links can't carry a JWT, so the
// frontend fetches this with its token and opens the returned URL).
router.get('/:id/download', authMiddleware, async (req, res) => {
  const pyq = await PYQ.findByIdAndUpdate(req.params.id, { $inc: { downloads: 1 } }, { new: true });
  if (!pyq?.fileUrl) return res.status(404).json({ error: 'File not found.' });
  res.json({ url: pyq.fileUrl, fileName: pyq.fileName });
});
router.delete('/:id', authMiddleware, async (req, res) => {
  const pyq = await PYQ.findById(req.params.id);
  if (!pyq) return res.status(404).json({ error: 'Not found.' });
  const User = require('../models/User');
  const me = await User.findById(req.user.id).select('isAdmin');
  if (pyq.uploadedBy.toString() !== req.user.id && !me?.isAdmin) return res.status(403).json({ error: 'Not authorized.' });
  if (pyq.publicId) {
    await destroyFile(pyq.publicId, pyq.resourceType); // Cloudinary file
  } else if (pyq.fileUrl && pyq.fileUrl.startsWith('/uploads')) {
    fs.unlink(path.join(__dirname, '..', pyq.fileUrl.replace('/uploads', 'uploads')), () => {}); // legacy local file
  }
  await pyq.deleteOne();
  res.json({ message: 'Deleted.' });
});
module.exports = router;
