const route = require('express').Router();
const { createRide } = require('../Controllers/ride.controller');
const { authenticate } = require('../Middlewares/authenticator');

route.post('/create-ride', authenticate, createRide);

module.exports = route;
