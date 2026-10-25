const mongoose = require('mongoose');

const pyqSchema = new mongoose.Schema({
  branch: { type: String, required: true, trim: true, maxlength: 80 },
  subject: { type: String, required: true, trim: true, maxlength: 120 },
  year: { type: Number, required: true, min: 1900, max: 2100 },
  semester: { type: Number, min: 1, max: 8 },
  examType: { type: String, enum: ['Mid-Term', 'End-Term', 'Internal', 'Practical', 'Other'], default: 'Other' },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  notes: { type: String, trim: true, maxlength: 3000 },
  fileUrl: { type: String },
  fileName: { type: String, maxlength: 255 },
  publicId: { type: String }, // primary asset (images: the file; PDFs: image copy for page previews)
  resourceType: { type: String },
  rawPublicId: { type: String }, // PDFs only: extensionless raw copy that actually downloads
  rawUrl: { type: String },
  pageCount: { type: Number, default: 1 },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' }, // optional link
  downloads: { type: Number, default: 0 }
}, { timestamps: true });

pyqSchema.index({ branch: 1, subject: 1, year: -1 });

module.exports = mongoose.model('PYQ', pyqSchema);
