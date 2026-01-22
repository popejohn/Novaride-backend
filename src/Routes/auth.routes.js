const express = require('express');
const router = express.Router();

const { registerUser, loginUserController, authenticateUser, uploadProfilePic, upload } = require('../Controllers/auth.controller');
const { validateUserSchema, validateLoginSchema } = require('../Validators/auth.validators');
const authLimiter = require('../Middlewares/rateLimiter').authLimiter;
const {authenticate} = require('../Middlewares/authenticator');




router.post('/signup', validateUserSchema, registerUser);
router.post('/login', authLimiter, validateLoginSchema, loginUserController);
router.get('/verify-token', authenticate, authenticateUser);
router.post('/upload-profile-pic', authenticate, upload.single('profilePic'), uploadProfilePic);






module.exports = router;