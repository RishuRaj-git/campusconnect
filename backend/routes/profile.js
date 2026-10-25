const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const Discussion = require('../models/Discussion');
const PYQ = require('../models/PYQ');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const { actionRate } = require('../middleware/actionLimits');
const { containsAbuse } = require('../utils/profanity');

const router = express.Router();
// Memory storage — avatars stream straight to Cloudinary, never touch disk.
const AVATAR_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const upload = multer({ storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => AVATAR_EXT.has(path.extname(file.originalname).toLowerCase()) ? cb(null, true) : cb(new Error('Only JPG/PNG/WEBP')) });
const { enabled: storageEnabled, uploadBuffer, destroyFile } = require('../utils/storage');

router.get('/:username', optionalAuth, async (req, res) => {
  const user = await User.findOne({ username: req.params.username }).select('-password -avatarPublicId');
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const [discussionCount, pyqCount] = await Promise.all([
    Discussion.countDocuments({ author: user.username }), PYQ.countDocuments({ uploadedBy: user._id })]);
  const own = req.user && req.user.username === user.username;
  res.json({
    username: user.username, branch: user.branch, semester: user.semester, year: user.year,
    // Enrollment numbers are personal data — only their owner gets them back.
    ...(own ? { enrollmentNo: user.enrollmentNo } : {}),
    bio: user.bio, avatarUrl: user.avatarUrl,
    stats: { discussionCount, pyqCount }
  });
});
router.put('/', authMiddleware, actionRate('light'), async (req, res) => {
  const { branch, semester, year, enrollmentNo, bio } = req.body;
  const fields = { bio, branch, enrollmentNo };
  for (const value of Object.values(fields)) {
    if (typeof value === 'string' && value && containsAbuse(value)) {
      return res.status(400).json({ error: 'Please keep it respectful — profile blocked.' });
    }
  }
  const update = {};
  if (branch !== undefined) update.branch = String(branch).slice(0, 50);
  if (semester !== undefined) {
    if (semester === '' || semester === null) update.semester = null;
    else {
      const n = Number(semester);
      if (!Number.isInteger(n) || n < 1 || n > 8) return res.status(400).json({ error: 'Semester must be 1–8.' });
      update.semester = n;
    }
  }
  if (year !== undefined) update.year = String(year).slice(0, 20);
  if (enrollmentNo !== undefined) update.enrollmentNo = String(enrollmentNo).slice(0, 50);
  if (bio !== undefined) update.bio = String(bio).slice(0, 200);
  const saved = await User.findByIdAndUpdate(req.user.id, update, { new: true, runValidators: true }).select('-password -avatarPublicId');
  res.json(saved);
});
router.post('/avatar', authMiddleware, actionRate('upload'), upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image.' });
  if (!storageEnabled()) return res.status(500).json({ error: 'File storage is not configured.' });
  let up;
  try {
    up = await uploadBuffer(req.file.buffer, { folder: 'campusconnect/avatars', filename: req.file.originalname });
  } catch (e) {
    console.error('Avatar upload failed:', e.message);
    return res.status(500).json({ error: 'Upload failed. Try again.' });
  }
  const user = await User.findById(req.user.id);
  if (!user) return res.status(401).json({ error: 'Account no longer exists.' });
  const oldPublicId = user.avatarPublicId;
  const oldUrl = user.avatarUrl;
  user.avatarUrl = up.url;
  user.avatarPublicId = up.publicId;
  // Save first: if the DB write fails we must not delete the avatar that is
  // still referenced by the account.
  await user.save();
  try {
    if (oldPublicId) {
      await destroyFile(oldPublicId, 'image'); // old Cloudinary avatar
    } else if (oldUrl && oldUrl.startsWith('/uploads')) {
      fs.unlink(path.join(__dirname, '..', oldUrl.replace('/uploads', 'uploads')), () => {}); // legacy local
    }
  } catch (e) {
    // Cleanup failure must not fail the upload — the new avatar is already saved.
    console.error('Old avatar cleanup failed:', e.message);
  }
  res.json({ avatarUrl: user.avatarUrl });
});
module.exports = router;
