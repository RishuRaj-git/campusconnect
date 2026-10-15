const mongoose = require('mongoose');

const pyqSchema = new mongoose.Schema({
  branch: { type: String, required: true, trim: true },
  subject: { type: String, required: true, trim: true },
  year: { type: Number, required: true },
  semester: { type: Number, min: 1, max: 8 },
  examType: { type: String, enum: ['Mid-Term', 'End-Term', 'Internal', 'Practical', 'Other'], default: 'Other' },
  title: { type: String, required: true, trim: true },
  notes: { type: String, trim: true },
  fileUrl: { type: String },
  fileName: { type: String },
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
