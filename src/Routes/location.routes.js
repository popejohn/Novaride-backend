const express = require('express');
const router = express.Router();
const locationController = require('../Controllers/location.controller');
const { authenticate } = require('../Middlewares/authenticator');

// Public location routes (no JWT required)
router.get('/autocomplete', locationController.autocomplete);
router.get('/reverse', locationController.reverse);
router.get('/search', locationController.search);

// Protected location routes
router.get('/directions/driving/:coordinates', authenticate, locationController.directions);

module.exports = router;
