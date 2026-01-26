const route = require('express').Router();
const { getRiderDetails, createRiderProfile, updateRiderLocation, createRide, getNearbyDrivers } = require('../Controllers/rider.controller');
const { authenticate } = require('../Middlewares/authenticator');

route.get('/get-details', authenticate, getRiderDetails);
route.post('/create-profile', authenticate, createRiderProfile);
route.put('/update-location', authenticate, updateRiderLocation);

route.get('/nearby-drivers', getNearbyDrivers); // No auth needed for fetching drivers

module.exports = route;
