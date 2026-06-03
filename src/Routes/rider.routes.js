const route = require('express').Router();
const { getRiderDetails, createRiderProfile, updateRiderLocation, getNearbyDrivers } = require('../Controllers/rider.controller');
const { authenticate } = require('../Middlewares/authenticator');
const { generalLimiter } = require('../Middlewares/rateLimiter');

route.get('/get-details', authenticate, generalLimiter, getRiderDetails);
route.post('/create-profile', authenticate, generalLimiter, createRiderProfile);
route.put('/update-location', authenticate, generalLimiter, updateRiderLocation);

route.get('/nearby-drivers', generalLimiter, getNearbyDrivers); // No auth needed for fetching drivers

module.exports = route;
