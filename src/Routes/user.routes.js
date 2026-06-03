const route = require('express').Router();
const { getWalletData, getInstallmentData, saveInstallmentProfile, saveInstallmentApplication } = require('../Controllers/user.controller');
const { authenticate } = require('../Middlewares/authenticator');
const { generalLimiter, sensitiveLimiter } = require('../Middlewares/rateLimiter');

route.get('/wallet-data', authenticate, generalLimiter, getWalletData);
route.get('/installment-data', authenticate, generalLimiter, getInstallmentData);
route.post('/installment-profile', authenticate, generalLimiter, saveInstallmentProfile);
route.post('/installment-application', authenticate, generalLimiter, saveInstallmentApplication);

module.exports = route;
