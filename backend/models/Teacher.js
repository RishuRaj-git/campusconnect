const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  department: { type: String, default: '', trim: true },
  subjects: [{ type: String, trim: true }],
  bio: { type: String, default: '', maxlength: 500 },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Cached aggregates — refreshed on every rating change so the
  // directory list never needs N+1 aggregation queries.
  ratingCount: { type: Number, default: 0 },
  avgOverall: { type: Number, default: 0 }
}, { timestamps: true });

teacherSchema.index({ name: 'text', department: 'text', subjects: 'text' });

const DIM = { type: Number, required: true, min: 1, max: 5 };

const ratingSchema = new mongoose.Schema({
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  // Who rated is NEVER exposed to clients — used only for one-rating-per-user
  // enforcement and admin anti-brigading checks.
  rater: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teaching: DIM,      // clarity of teaching
  grading: DIM,       // grading leniency
  attendance: DIM,    // attendance strictness
  pyqRep: DIM,        // repeats from PYQs / discussed material
  comment: { type: String, default: '', maxlength: 500 },
  hidden: { type: Boolean, default: false } // admin moderation flag
}, { timestamps: true });

ratingSchema.index({ teacher: 1, rater: 1 }, { unique: true });
ratingSchema.index({ teacher: 1, hidden: 1, createdAt: -1 });

module.exports = {
  Teacher: mongoose.model('Teacher', teacherSchema),
  Rating: mongoose.model('Rating', ratingSchema)
};
