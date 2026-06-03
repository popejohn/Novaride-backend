const express = require('express');
const router = express.Router();
const paystackController = require('../Controllers/paystack.controller');
const { authenticate } = require('../Middlewares/authenticator');
const { paymentLimiter } = require('../Middlewares/rateLimiter');

router.post('/verify-wallet-funding', authenticate, paymentLimiter, paystackController.verifyWalletFunding);
router.post('/verify-installment-payment', authenticate, paymentLimiter, paystackController.verifyInstallmentPayment);
router.post('/verify-ride-payment', authenticate, paymentLimiter, paystackController.verifyRidePayment);

module.exports = router;
