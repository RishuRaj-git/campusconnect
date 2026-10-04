const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const Discussion = require('../models/Discussion');
const PYQ = require('../models/PYQ');
const { authMiddleware } = require('../middleware/auth');
const { actionRate } = require('../middleware/actionLimits');
const { containsAbuse } = require('../utils/profanity');

const router = express.Router();
// Memory storage — avatars stream straight to Cloudinary, never touch disk.
const upload = multer({ storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => /jpg|jpeg|png|webp/.test(path.extname(file.originalname).toLowerCase()) ? cb(null, true) : cb(new Error('Only JPG/PNG/WEBP')) });
const { enabled: storageEnabled, uploadBuffer, destroyFile } = require('../utils/storage');

router.get('/:username', async (req, res) => {
  const user = await User.findOne({ username: req.params.username }).select('-password -avatarPublicId');
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const [discussionCount, pyqCount] = await Promise.all([
    Discussion.countDocuments({ author: user.username }), PYQ.countDocuments({ uploadedBy: user._id })]);
  res.json({ username: user.username, branch: user.branch, semester: user.semester, year: user.year, enrollmentNo: user.enrollmentNo, bio: user.bio, avatarUrl: user.avatarUrl, stats: { discussionCount, pyqCount } });
});
router.put('/', authMiddleware, actionRate('light'), async (req, res) => {
  const { branch, semester, year, enrollmentNo, bio } = req.body;
  if (typeof bio === 'string' && bio && containsAbuse(bio)) {
    return res.status(400).json({ error: 'Please keep it respectful — bio blocked.' });
  }
  const update = {};
  if (branch !== undefined) update.branch = String(branch).slice(0, 50);
  if (semester !== undefined) update.semester = semester;
  if (year !== undefined) update.year = year;
  if (enrollmentNo !== undefined) update.enrollmentNo = String(enrollmentNo).slice(0, 50);
  if (bio !== undefined) update.bio = String(bio).slice(0, 200);
  res.json(await User.findByIdAndUpdate(req.user.id, update, { new: true }).select('-password -avatarPublicId'));
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
  if (user.avatarPublicId) {
    await destroyFile(user.avatarPublicId, 'image'); // old Cloudinary avatar
  } else if (user.avatarUrl && user.avatarUrl.startsWith('/uploads')) {
    fs.unlink(path.join(__dirname, '..', user.avatarUrl.replace('/uploads', 'uploads')), () => {}); // legacy local
  }
  user.avatarUrl = up.url;
  user.avatarPublicId = up.publicId;
  await user.save();
  res.json({ avatarUrl: user.avatarUrl });
});
module.exports = router;
