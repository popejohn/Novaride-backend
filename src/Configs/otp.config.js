// OTP Configuration
// This file defines OTP settings used throughout the application

// OTP expiry time in seconds
// MongoDB TTL indexes count in seconds
const OTP_EXPIRY_SECONDS = 60; // 60 seconds

// OTP expiry time in minutes (for display on frontend)
const OTP_EXPIRY_MINUTES = Math.ceil(OTP_EXPIRY_SECONDS / 60); // 10 minutes

// OTP length (number of digits)
const OTP_LENGTH = 6;

// Rate limiting: Maximum OTP attempts before user is locked out
const MAX_OTP_ATTEMPTS = 5;

// Rate limiting: Lockout duration in seconds
const OTP_LOCKOUT_SECONDS = 300; // 5 minutes

module.exports = {
  OTP_EXPIRY_SECONDS,
  OTP_EXPIRY_MINUTES,
  OTP_LENGTH,
  MAX_OTP_ATTEMPTS,
  OTP_LOCKOUT_SECONDS
};
