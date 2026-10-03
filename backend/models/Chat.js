const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  username: { type: String, required: true },
  message: { type: String, required: true, maxlength: 1000 },
  createdAt: { type: Date, default: Date.now, expires: 172800 } // 48h TTL
});

const conversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  lastMessage: { type: String, default: '' },
  lastMessageAt: { type: Date, default: Date.now }
});
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

const directMessageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender: { type: String, required: true },
  text: { type: String, required: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now }
});
directMessageSchema.index({ conversationId: 1, createdAt: -1 });

const notificationSchema = new mongoose.Schema({
  recipient: { type: String, required: true },
  type: { type: String, enum: ['comment', 'like', 'dm'], required: true },
  fromUser: { type: String, required: true },
  refId: { type: String, default: '' },
  text: { type: String, required: true },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 } // 30 days
});
notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = {
  ChatMessage: mongoose.model('ChatMessage', chatMessageSchema),
  Conversation: mongoose.model('Conversation', conversationSchema),
  DirectMessage: mongoose.model('DirectMessage', directMessageSchema),
  Notification: mongoose.model('Notification', notificationSchema)
};
