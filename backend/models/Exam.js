const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  subject: { type: String, default: '', trim: true, maxlength: 80 },
  branch: { type: String, default: '', trim: true, maxlength: 40 },
  examDate: { type: Date, required: true },
  examType: { type: String, enum: ['Mid-Term', 'End-Term', 'Internal', 'Practical', 'Other'], default: 'End-Term' },
  venue: { type: String, default: '', maxlength: 120 },
  author: { type: String, required: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

examSchema.index({ examDate: 1 });

module.exports = mongoose.model('Exam', examSchema);
