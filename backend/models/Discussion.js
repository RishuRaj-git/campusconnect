const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  author: { type: String, required: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  text: { type: String, required: true, maxlength: 1000 },
  likes: [{ type: String }] // Quora-style answer upvotes (old comments default to [])
}, { timestamps: true });

const discussionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 150 },
  content: { type: String, default: '', maxlength: 5000 },
  author: { type: String, required: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  likes: [{ type: String }],
  comments: [commentSchema]
}, { timestamps: true });

discussionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Discussion', discussionSchema);
