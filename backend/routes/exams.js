const express = require('express');
const Exam = require('../models/Exam');
const { authMiddleware } = require('../middleware/auth');
const adminOnly = require('../middleware/admin');
const { containsAbuse } = require('../utils/profanity');

const router = express.Router();

// GET /api/exams — upcoming first (default). ?all=1 includes past exams.
router.get('/', async (req, res) => {
  const filter = req.query.all ? {} : { examDate: { $gte: new Date() } };
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  res.json(await Exam.find(filter).sort({ examDate: 1 }).limit(limit).lean());
});

// POST /api/exams — admin only (official scheduled dates)
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  const { title, subject, branch, examDate, examType, venue } = req.body;
  if (!title || !examDate) return res.status(400).json({ error: 'Title and date are required.' });
  if (containsAbuse(title) || containsAbuse(subject || '')) {
    return res.status(400).json({ error: 'Please keep it respectful.' });
  }
  const date = new Date(examDate);
  if (isNaN(date)) return res.status(400).json({ error: 'Invalid date.' });
  const exam = await new Exam({
    title: String(title).slice(0, 120),
    subject: String(subject || '').slice(0, 80),
    branch: String(branch || '').slice(0, 40),
    examDate: date,
    examType: ['Mid-Term', 'End-Term', 'Internal', 'Practical', 'Other'].includes(examType) ? examType : 'End-Term',
    venue: String(venue || '').slice(0, 120),
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
