const express = require('express');
const router = express.Router();
const { authenticate } = require('../Middlewares/authenticator');
const { upload, uploadDocument } = require('../Controllers/upload.controller');
const { generalLimiter } = require('../Middlewares/rateLimiter');

// Upload document endpoint: POST /api/upload/document
router.post('/document', authenticate, generalLimiter, upload.single('file'), uploadDocument);

module.exports = router;
