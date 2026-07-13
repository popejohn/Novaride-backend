const express = require('express');
const router = express.Router();

const { registerUser, loginUserController, authenticateUser, uploadProfilePic, upload, updateProfile, changePassword, updateSecuritySettings, forgotPassword, resendOtp, verifyResetOtp, verifyOnlyOtp } = require('../Controllers/auth.controller');
const { validateUserSchema, validateLoginSchema } = require('../Validators/auth.validators');
const { authLimiter, createAccountLimiter } = require('../Middlewares/rateLimiter');
const { authenticate } = require('../Middlewares/authenticator');





router.post('/signup', createAccountLimiter, validateUserSchema, registerUser);
router.post(
    '/login',
    (req, res, next) => {
        console.log('➡️ Before authLimiter');
        next();
    },
    authLimiter,
    (req, res, next) => {
        console.log('➡️ After authLimiter');
        next();
    },
    validateLoginSchema,
    loginUserController
);
router.get('/verify-token', authenticate, authenticateUser);
router.post('/upload-profile-pic', authenticate, upload.single('profilePic'), uploadProfilePic);
router.put('/update-profile', authenticate, updateProfile);
router.put('/change-password', authenticate, changePassword);
router.put('/security-settings', authenticate, updateSecuritySettings);
router.post('/forgot-password', forgotPassword);
router.post('/resend-otp', resendOtp);
router.post('/verify-reset-otp', verifyResetOtp);
router.post('/verify-otp', verifyOnlyOtp);







module.exports = router;