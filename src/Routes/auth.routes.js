const express = require('express');
const router = express.Router();

const { registerUser, loginUserController, authenticateUser, uploadProfilePic, upload, updateProfile, changePassword, updateSecuritySettings } = require('../Controllers/auth.controller');
const { validateUserSchema, validateLoginSchema } = require('../Validators/auth.validators');
const authLimiter = require('../Middlewares/rateLimiter').authLimiter;
const { authenticate } = require('../Middlewares/authenticator');




router.post('/signup', validateUserSchema, registerUser);
router.post('/login', authLimiter, validateLoginSchema, loginUserController);
router.get('/verify-token', authenticate, authenticateUser);
router.post('/upload-profile-pic', authenticate, upload.single('profilePic'), uploadProfilePic);
router.put('/update-profile', authenticate, updateProfile);
router.put('/change-password', authenticate, changePassword);
router.put('/security-settings', authenticate, updateSecuritySettings);






module.exports = router;