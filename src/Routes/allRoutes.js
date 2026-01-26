const express = require('express');
const router = express.Router();
const authRoutes = require('./auth.routes');
const riderRoutes = require('./rider.routes');
const rideRoutes = require('./ride.routes');


// Auth routes
router.use('/auth', authRoutes);
// Rider routes
router.use('/rider', riderRoutes);
// Ride routes
router.use('/ride', rideRoutes);
















module.exports = router;