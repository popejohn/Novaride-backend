const express = require('express');
const router = express.Router();
const locationController = require('../Controllers/location.controller');
const { authenticate } = require('../Middlewares/authenticator');

// All location routes require JWT authentication
router.get('/autocomplete', authenticate, locationController.autocomplete);
router.get('/reverse', authenticate, locationController.reverse);
router.get('/search', authenticate, locationController.search);
router.get('/directions/driving/:coordinates', authenticate, locationController.directions);

module.exports = router;
