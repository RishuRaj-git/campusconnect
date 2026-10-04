const express = require('express');
const mongoose = require('mongoose');
const { Teacher, Rating } = require('../models/Teacher');
const PYQ = require('../models/PYQ');
const { authMiddleware } = require('../middleware/auth');
const adminOnly = require('../middleware/admin');
const { containsAbuse } = require('../utils/profanity');
const { escapeRegExp, toStr } = require('../utils/sanitize');
const { actionRate } = require('../middleware/actionLimits');

const router = express.Router();

// Averages stay hidden until MIN_RATINGS visible reviews exist, so one
// angry (or planted) review can't define a professor.
const MIN_RATINGS = 5;

async function refreshStats(teacherId) {
  const agg = await Rating.aggregate([
    { $match: { teacher: new mongoose.Types.ObjectId(teacherId), hidden: false } },
    { $group: {
      _id: null, n: { $sum: 1 },
      teaching: { $avg: '$teaching' }, grading: { $avg: '$grading' },
      attendance: { $avg: '$attendance' }, pyqRep: { $avg: '$pyqRep' }
    } }
  ]);
  const a = agg[0];
  const overall = a ? (a.teaching + a.grading + a.attendance + a.pyqRep) / 4 : 0;
  await Teacher.findByIdAndUpdate(teacherId, {
    ratingCount: a ? a.n : 0,
    avgOverall: a ? Math.round(overall * 10) / 10 : 0
  });
  return a;
}

function pageParams(req, def = 20, max = 50) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(max, Math.max(1, parseInt(req.query.limit, 10) || def));
  return { page, limit, skip: (page - 1) * limit };
}

// GET /api/teachers — directory with search + dept filter
router.get('/', async (req, res) => {
  const { q, dept } = req.query;
  const filter = {};
  if (q) filter.$text = { $search: q };
  if (dept) filter.department = new RegExp(`^${escapeRegExp(toStr(dept, 50))}$`, 'i');
  const { limit, skip } = pageParams(req);
  const [total, items] = await Promise.all([
    Teacher.countDocuments(filter),
    Teacher.find(filter, q ? { score: { $meta: 'textScore' } } : {})
      .sort(q ? { score: { $meta: 'textScore' } } : { avgOverall: -1, ratingCount: -1 })
      .skip(skip).limit(limit).lean()
  ]);
  res.set('X-Total-Count', String(total));
  res.json(items);
});

// GET /api/teachers/departments — for filter dropdowns
router.get('/departments', async (req, res) => {
  res.json((await Teacher.distinct('department')).filter(Boolean).sort());
});

// Admin moderation queue — MUST be defined before /:id
router.get('/reviews/flagged', authMiddleware, adminOnly, async (req, res) => {
  const { limit } = pageParams(req);
  res.json(await Rating.find({ hidden: true }).sort({ createdAt: -1 }).limit(limit)
    .populate('teacher', 'name').populate('rater', 'username').lean());
});

// POST /api/teachers — any logged-in user can add a teacher
router.post('/', authMiddleware, actionRate('light'), async (req, res) => {
  const { name, department, subjects, bio } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Teacher name is required.' });
  if (typeof bio === 'string' && bio && containsAbuse(bio)) {
    return res.status(400).json({ error: 'Please keep it respectful — bio blocked.' });
  }
  const existing = await Teacher.findOne({ name: new RegExp(`^${escapeRegExp(toStr(name, 100))}$`, 'i') });
  if (existing) return res.json(existing); // idempotent — no duplicates
  const t = await new Teacher({
    name: String(name).trim().slice(0, 100),
    department: String(department || '').slice(0, 50),
    subjects: Array.isArray(subjects) ? subjects.map((s) => String(s).slice(0, 60)).slice(0, 15) : [],
    bio: String(bio || '').slice(0, 500),
    addedBy: req.user.id
  }).save();
  res.status(201).json(t);
});

// GET /api/teachers/:id — profile + aggregates + visible reviews + their notes
router.get('/:id', async (req, res) => {
  const t = await Teacher.findById(req.params.id).lean();
  if (!t) return res.status(404).json({ error: 'Teacher not found.' });
  const agg = await Rating.aggregate([
    { $match: { teacher: t._id, hidden: false } },
    { $group: {
      _id: null, n: { $sum: 1 },
      teaching: { $avg: '$teaching' }, grading: { $avg: '$grading' },
      attendance: { $avg: '$attendance' }, pyqRep: { $avg: '$pyqRep' },
      dist: { $push: { $round: [{ $divide: [{ $add: ['$teaching', '$grading', '$attendance', '$pyqRep'] }, 4] }, 0] } }
    } }
  ]);
  const a = agg[0];
  const revealed = a && a.n >= MIN_RATINGS;
  const [reviews, notes] = await Promise.all([
    Rating.find({ teacher: t._id, hidden: false }).sort({ createdAt: -1 }).limit(20).lean()
      .then((rs) => rs.map(({ rater, ...r }) => r)), // never leak who rated
    PYQ.find({ teacher: t._id }).sort({ year: -1 }).limit(20)
      .populate('uploadedBy', 'username').lean()
  ]);
  res.json({
    teacher: t,
    stats: revealed
      ? { count: a.n, teaching: +a.teaching.toFixed(1), grading: +a.grading.toFixed(1),
          attendance: +a.attendance.toFixed(1), pyqRep: +a.pyqRep.toFixed(1),
          dist: [1, 2, 3, 4, 5].map((s) => a.dist.filter((d) => d === s).length) }
      : { count: a ? a.n : 0, hidden: true, needed: MIN_RATINGS },
    reviews,
    notes
  });
});

// POST /api/teachers/:id/rate — one rating per user (upsert), comment moderated
router.post('/:id/rate', authMiddleware, async (req, res) => {
  const t = await Teacher.findById(req.params.id);
  if (!t) return res.status(404).json({ error: 'Teacher not found.' });
  const dims = ['teaching', 'grading', 'attendance', 'pyqRep'];
  const scores = {};
  for (const d of dims) {
    const v = Number(req.body[d]);
    if (!Number.isInteger(v) || v < 1 || v > 5) return res.status(400).json({ error: `Score "${d}" must be 1–5.` });
    scores[d] = v;
  }
  const comment = String(req.body.comment || '').slice(0, 500);
  if (comment && containsAbuse(comment)) {
    return res.status(400).json({ error: 'Please keep it respectful — review blocked. Rate the teaching, not the person.' });
  }
  await Rating.findOneAndUpdate(
    { teacher: t._id, rater: req.user.id },
    { ...scores, comment },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const a = await refreshStats(t._id);
  res.json({ message: 'Thanks! Your rating was recorded.', count: a ? a.n : 1 });
});

// POST /api/teachers/ratings/:ratingId/visibility — admin hide/unhide
router.post('/ratings/:ratingId/visibility', authMiddleware, adminOnly, async (req, res) => {
  const r = await Rating.findByIdAndUpdate(req.params.ratingId, { hidden: !!req.body.hidden }, { new: true });
  if (!r) return res.status(404).json({ error: 'Review not found.' });
  await refreshStats(r.teacher);
  res.json(r);
});

// DELETE /api/teachers/:id — admin only (removes teacher + their ratings)
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  const t = await Teacher.findById(req.params.id);
  if (!t) return res.status(404).json({ error: 'Teacher not found.' });
  await Rating.deleteMany({ teacher: t._id });
  await t.deleteOne();
  res.json({ message: 'Teacher removed.' });
});

module.exports = router;
