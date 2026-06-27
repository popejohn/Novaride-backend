const express = require('express');
const router = express.Router();
const { authenticate } = require('../Middlewares/authenticator');
const authenticateAdmin = require('../Middlewares/admin.auth.middleware');
const {
  startSupportChat,
  getMyChat,
  sendUserMessage,
  getSupportChats,
  claimSupportChat,
  sendAdminMessage,
  closeSupportChat
} = require('../Controllers/support.controller');
// User support routes
router.post('/start', authenticate, startSupportChat);
router.get('/my-chat', authenticate, getMyChat);
router.post('/message', authenticate, sendUserMessage);
// Admin support routes
router.get('/admin/chats', authenticateAdmin, getSupportChats);
router.post('/admin/claim/:chatId', authenticateAdmin, claimSupportChat);
router.post('/admin/message/:chatId', authenticateAdmin, sendAdminMessage);
router.post('/admin/close/:chatId', authenticateAdmin, closeSupportChat);
module.exports = router;