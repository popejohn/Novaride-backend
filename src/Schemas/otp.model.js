const mongoose = require('mongoose');
const { OTP_EXPIRY_SECONDS } = require('../Configs/otp.config');

// create a schema for token storage for a user
const otpSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  otp: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: OTP_EXPIRY_SECONDS // OTP will expire based on config (currently 10 minutes)
  }
});


const otpModel = mongoose.model('Token', otpSchema);


module.exports = {otpModel};
