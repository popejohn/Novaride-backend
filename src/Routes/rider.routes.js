const route = require('express').Router();
const { getRiderDetails, createRiderProfile, updateRiderLocation, updateRiderStatus, getNearbyDrivers } = require('../Controllers/rider.controller');
const { authenticate } = require('../Middlewares/authenticator');
const { generalLimiter, nearbyDriversLimiter } = require('../Middlewares/rateLimiter');

route.get('/get-details', authenticate, generalLimiter, getRiderDetails);
route.post('/create-profile', authenticate, generalLimiter, createRiderProfile);
route.put('/update-location', authenticate, generalLimiter, updateRiderLocation); // Heartbeat - only updates location
route.put('/update-status', authenticate, generalLimiter, updateRiderStatus); // Status change - called only when online/offline changes

route.get('/nearby-drivers', authenticate, nearbyDriversLimiter, getNearbyDrivers); // Using nearbyDriversLimiter to allow frequent polling

module.exports = route;
