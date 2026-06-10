const express = require('express');
const router = express.Router();
const authRoutes = require('./auth.routes');
const riderRoutes = require('./rider.routes');
const rideRoutes = require('./ride.routes');
const userRoutes = require('./user.routes');
const paystackRoutes = require('./paystack.routes');
const healthRoutes = require('./health');
const adminRoutes = require('./admin.Routes');
const locationRoutes = require('./location.routes');

// Health check routes (no auth required)
router.use('/health', healthRoutes);

// Auth routes
router.use('/auth', authRoutes);
// Rider routes
router.use('/rider', riderRoutes);
// Ride routes
router.use('/ride', rideRoutes);
// User routes
router.use('/user', userRoutes);
// Paystack routes
router.use('/paystack', paystackRoutes);
// Admin routes
router.use('/admin', adminRoutes);
// Location routes
router.use('/location', locationRoutes);
















module.exports = router;