const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true, trim: true, minlength: 3, maxlength: 20, match: /^[a-zA-Z0-9_]+$/ },
  password: { type: String, required: true, select: false },
  branch: { type: String, default: '', trim: true },
  semester: { type: Number, default: null, min: 1, max: 8 },
  year: { type: String, default: '' },
  enrollmentNo: { type: String, default: '', trim: true },
  bio: { type: String, default: '', maxlength: 200 },
  avatarUrl: { type: String, default: '' },
  avatarPublicId: { type: String }, // Cloudinary public_id for avatar delete/replace
  isAdmin: { type: Boolean, default: false },
  isBanned: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
