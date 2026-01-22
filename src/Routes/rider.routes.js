const route = require('express').Router();
const { getRiderDetails, createRiderProfile, updateRiderLocation } = require('../Controllers/rider.controller');
const { authenticate } = require('../Middlewares/authenticator');

route.get('/get-details', authenticate, getRiderDetails);
route.post('/create-profile', authenticate, createRiderProfile);
route.put('/update-location', authenticate, updateRiderLocation);

module.exports = route;