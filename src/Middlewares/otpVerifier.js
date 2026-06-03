const { otpModel } = require('../Schemas/otp.model');
const { errorResponse } = require('../Utils/responseHelper');

/**
 * Middleware to verify OTP before allowing sensitive operations
 * Usage: router.post('/sensitive-endpoint', authenticate, otpVerifier, controller);
 */
const otpVerifier = async (req, res, next) => {
  try {
    const { otp } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return errorResponse(res, 401, 'User not authenticated');
    }

    if (!otp) {
      return errorResponse(res, 400, 'OTP is required for this operation');
    }

    // Verify OTP
    const otpRecord = await otpModel.findOne({ userId, otp });
    if (!otpRecord) {
      return errorResponse(res, 400, 'Invalid or expired OTP');
    }

    // Delete OTP after successful verification
    await otpModel.deleteOne({ _id: otpRecord._id });

    // Attach verification status to request
    req.otpVerified = true;
    next();
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return errorResponse(res, 500, 'Error verifying OTP');
  }
};

module.exports = { otpVerifier };
