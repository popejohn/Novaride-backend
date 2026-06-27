const mongoose = require('mongoose');
const supportMessageSchema = new mongoose.Schema({
  senderId: { type: String, required: true },
  senderModel: { type: String, required: true, enum: ['User', 'Admin'] },
  senderName: { type: String, required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const supportChatSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    userPhone: { type: String, required: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    adminName: { type: String, default: null },
    status: { type: String, enum: ['open', 'active', 'closed'], default: 'open' },
    messages: [supportMessageSchema]
  },
  { timestamps: true }
);
const SupportChat = mongoose.model('SupportChat', supportChatSchema);
module.exports = SupportChat;