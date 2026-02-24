const route = require('express').Router();
const { createRide, getRideById, assignDriver, updateRideStatus, getAvailableRides, acceptRide, rejectRide, getRideHistory, submitRating, submitComplaint } = require('../Controllers/ride.controller');
const { authenticate } = require('../Middlewares/authenticator');

route.post('/create-ride', authenticate, createRide);
route.get('/history', authenticate, getRideHistory);
route.get('/available-rides', authenticate, getAvailableRides);
route.post('/accept-ride', authenticate, acceptRide);
route.post('/reject-ride', authenticate, rejectRide);
route.get('/:id', authenticate, getRideById);
route.post('/:id/assign-driver', authenticate, assignDriver);
route.patch('/:id/status', authenticate, updateRideStatus);
route.post('/:id/rate', authenticate, submitRating);
route.post('/:id/complaint', authenticate, submitComplaint);

module.exports = route;
