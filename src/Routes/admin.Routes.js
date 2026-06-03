const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Import models
const Admin = require('../Models/admin.model');

// Import controllers
const {
  adminSignup,
  adminLogin,
  getAdminProfile
} = require('../Controllers/admin.auth.controller');

const {
  getStats,
  getRiders,
  getPassengers,
  getPartners,
  getRidesList
} = require('../Controllers/admin.dashboard.controller');

const {
  fundUserWallet,
  withdrawRiderWallet,
  getWalletLogs
} = require('../Controllers/admin.wallet.controller');

// Import middleware
const authenticateAdmin = require('../Middlewares/admin.auth.middleware');

// --- Routes (inline from Admin/adminBackend/src/Routes/routes.js)
// Authentication routes (public)
router.post('/auth/signup', adminSignup);
router.post('/auth/login', adminLogin);

// Protected routes (require admin authentication)
router.get('/auth/profile', authenticateAdmin, getAdminProfile);
router.get('/dashboard/stats', authenticateAdmin, getStats);
router.get('/dashboard/riders', authenticateAdmin, getRiders);
router.get('/dashboard/passengers', authenticateAdmin, getPassengers);
router.get('/dashboard/partners', authenticateAdmin, getPartners);
router.get('/dashboard/rides', authenticateAdmin, getRidesList);
router.get('/wallet/logs', authenticateAdmin, getWalletLogs);
router.post('/wallet/fund', authenticateAdmin, fundUserWallet);
router.post('/wallet/withdraw-rider', authenticateAdmin, withdrawRiderWallet);

module.exports = router;


