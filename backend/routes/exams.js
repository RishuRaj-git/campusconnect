const express = require('express');
const Exam = require('../models/Exam');
const { authMiddleware } = require('../middleware/auth');
const adminOnly = require('../middleware/admin');
const { containsAbuse } = require('../utils/profanity');
const { toStr } = require('../utils/sanitize');

const router = express.Router();

// GET /api/exams — upcoming first (default). ?all=1 includes past exams.
router.get('/', async (req, res) => {
  const includePast = req.query.all === '1' || req.query.all === 'true';
  const filter = includePast ? {} : { examDate: { $gte: new Date() } };
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const [total, items] = await Promise.all([
    Exam.countDocuments(filter),
    Exam.find(filter).sort({ examDate: 1 }).skip((page - 1) * limit).limit(limit).lean()
  ]);
  res.set('X-Total-Count', String(total));
  res.json(items);
});

// POST /api/exams — admin only (official scheduled dates)
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  const title = toStr(req.body.title, 120).trim();
  const subject = toStr(req.body.subject, 80).trim();
  const branch = toStr(req.body.branch, 40).trim();
  const venue = toStr(req.body.venue, 120).trim();
  if (!title || !req.body.examDate) return res.status(400).json({ error: 'Title and date are required.' });
  if (containsAbuse(title) || containsAbuse(subject) || containsAbuse(venue)) {
    return res.status(400).json({ error: 'Please keep it respectful.' });
  }
  const date = new Date(String(req.body.examDate));
  if (isNaN(date)) return res.status(400).json({ error: 'Invalid date.' });
  const exam = await new Exam({
    title,
    subject,
    branch,
    examDate: date,
    examType: ['Mid-Term', 'End-Term', 'Internal', 'Practical', 'Other'].includes(req.body.examType) ? req.body.examType : 'End-Term',
    venue,
    author: req.user.username,
    authorId: req.user.id
  }).save();
  res.status(201).json(exam);
});

// DELETE /api/exams/:id — admin only
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) return res.status(404).json({ error: 'Not found.' });
  await exam.deleteOne();
  res.json({ message: 'Deleted.' });
});

module.exports = router;
