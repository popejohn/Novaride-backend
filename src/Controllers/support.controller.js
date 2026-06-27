const SupportChat = require('../Models/supportChat.model');
const userModel = require('../Schemas/user.schema');
const Admin = require('../Models/admin.model');
// User Controllers
const startSupportChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    // Check for an existing open/active chat
    let chat = await SupportChat.findOne({
      userId,
      status: { $in: ['open', 'active'] }
    });
    if (!chat) {
      chat = new SupportChat({
        userId,
        userName: `${user.firstname} ${user.lastname}`,
        userPhone: user.phone,
        status: 'open',
        messages: []
      });
      await chat.save();
      const io = req.app.get('io');
      if (io) {
        io.emit('supportChatsUpdated');
      }
    }
    return res.status(200).json({ success: true, chat });
  } catch (error) {
    console.error('Error starting support chat:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
const getMyChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const chat = await SupportChat.findOne({
      userId,
      status: { $in: ['open', 'active'] }
    });
    return res.status(200).json({ success: true, chat });
  } catch (error) {
    console.error('Error fetching support chat:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
const sendUserMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Message text is required' });
    }
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const chat = await SupportChat.findOne({
      userId,
      status: { $in: ['open', 'active'] }
    });
    if (!chat) {
      return res.status(404).json({ message: 'No active support chat session found' });
    }
    const newMessage = {
      senderId: userId,
      senderModel: 'User',
      senderName: `${user.firstname} ${user.lastname}`,
      text: text.trim(),
      createdAt: new Date()
    };
    chat.messages.push(newMessage);
    await chat.save();
    const io = req.app.get('io');
    if (io) {
      io.to(`chat:${chat._id}`).emit('supportMessage', chat.messages[chat.messages.length - 1]);
      io.emit('supportChatsUpdated');
    }
    return res.status(201).json({ success: true, message: chat.messages[chat.messages.length - 1] });
  } catch (error) {
    console.error('Error sending user message:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
// Admin Controllers
const getSupportChats = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) {
      filter.status = status;
    } else {
      filter.status = { $in: ['open', 'active'] };
    }
    const chats = await SupportChat.find(filter).sort({ updatedAt: -1 });
    return res.status(200).json(chats);
  } catch (error) {
    console.error('Error fetching admin support chats:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
const claimSupportChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const adminId = req.admin.id;
    const adminUser = await Admin.findById(adminId);
    if (!adminUser) {
      return res.status(404).json({ message: 'Admin not found' });
    }
    const chat = await SupportChat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Support chat session not found' });
    }
    if (chat.adminId && chat.adminId.toString() !== adminId) {
      return res.status(409).json({
        message: `This chat is already claimed by admin ${chat.adminName || 'another administrator'}`
      });
    }
    const adminName = `${adminUser.firstname} ${adminUser.lastname}`;
    chat.adminId = adminUser._id;
    chat.adminName = adminName;
    chat.status = 'active';
    await chat.save();
    const io = req.app.get('io');
    if (io) {
      io.to(`chat:${chat._id}`).emit('chatClaimed', { adminId: adminUser._id, adminName });
      io.emit('supportChatsUpdated');
    }
    return res.status(200).json({ success: true, chat });
  } catch (error) {
    console.error('Error claiming support chat:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
const sendAdminMessage = async (req, res) => {
  try {
    const { chatId } = req.params;
    const adminId = req.admin.id;
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Message text is required' });
    }
    const chat = await SupportChat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Support chat session not found' });
    }
    if (!chat.adminId || chat.adminId.toString() !== adminId) {
      return res.status(403).json({
        message: 'Only the claimed administrator can respond to this support chat session.'
      });
    }
    const newMessage = {
      senderId: adminId,
      senderModel: 'Admin',
      senderName: chat.adminName,
      text: text.trim(),
      createdAt: new Date()
    };
    chat.messages.push(newMessage);
    await chat.save();
    const io = req.app.get('io');
    if (io) {
      io.to(`chat:${chat._id}`).emit('supportMessage', chat.messages[chat.messages.length - 1]);
      io.emit('supportChatsUpdated');
    }
    return res.status(201).json({ success: true, message: chat.messages[chat.messages.length - 1] });
  } catch (error) {
    console.error('Error sending admin message:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
const closeSupportChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const adminId = req.admin.id;
    const chat = await SupportChat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Support chat session not found' });
    }
    if (!chat.adminId || chat.adminId.toString() !== adminId) {
      return res.status(403).json({
        message: 'Only the claimed administrator can close this support chat session.'
      });
    }
    chat.status = 'closed';
    await chat.save();
    const io = req.app.get('io');
    if (io) {
      io.to(`chat:${chat._id}`).emit('chatClosed');
      io.emit('supportChatsUpdated');
    }
    return res.status(200).json({ success: true, message: 'Support chat closed successfully.' });
  } catch (error) {
    console.error('Error closing support chat:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
module.exports = {
  startSupportChat,
  getMyChat,
  sendUserMessage,
  getSupportChats,
  claimSupportChat,
  sendAdminMessage,
  closeSupportChat
};
