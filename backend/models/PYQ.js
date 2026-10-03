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
  publicId: { type: String }, // Cloudinary public_id (new uploads); absent for legacy local files
  resourceType: { type: String }, // Cloudinary type: image | raw | video (needed for delete)
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' }, // optional link
  downloads: { type: Number, default: 0 }
}, { timestamps: true });

pyqSchema.index({ branch: 1, subject: 1, year: -1 });

module.exports = mongoose.model('PYQ', pyqSchema);
