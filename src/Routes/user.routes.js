const route = require('express').Router();
const { getWalletData, getInstallmentData, saveInstallmentProfile, saveInstallmentApplication } = require('../Controllers/user.controller');
const { authenticate } = require('../Middlewares/authenticator');

route.get('/wallet-data', authenticate, getWalletData);
route.get('/installment-data', authenticate, getInstallmentData);
route.post('/installment-profile', authenticate, saveInstallmentProfile);
route.post('/installment-application', authenticate, saveInstallmentApplication);

module.exports = route;
