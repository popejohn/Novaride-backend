const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createUser, loginUser, getUserByPhone, getUserByEmail, updateUserProfilePic, updateUserProfile, updatePassword, updateSmsProtection, verifyOtpForPasswordReset } = require('../Models/auth.models');
const { errorResponse, successResponse } = require('../Utils/responseHelper');
const multer = require('multer');
const cloudinary = require('../Configs/cloudinary');
const { createOTP } = require('../Utils/createOTP');
const { otpModel } = require('../Schemas/otp.model');
const { sendOTP } = require('../Services/message.service');
const { sendOtpEmail } = require('../Services/emailOTP.service');
const { markPendingRidesInactiveForUser } = require('../Services/rideLifecycle.service');
const { markRiderOffline } = require('../Services/riderPresence.service');



const registerUser = async (req, res) => {
  try {
    const { firstname, lastname, email, phone, password, role } = req.validatedUserData;
    console.log(req.validatedUserData);

    // Normalize role to an array to support multiple roles
    const roles = Array.isArray(role) ? role : (role ? [role] : []);

    if (!firstname || !lastname || !email || !phone || !password || roles.length === 0) {
      return errorResponse(res, 400, 'Firstname, lastname, email, phone, password and at least one role are required');
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    // Build user document using only fields defined in the User schema
    const userData = {
      firstname,
      lastname,
      email: email.toLowerCase().trim(),
      phone,
      password: hashedPassword,
      role: roles,
    };

    // Check if user already exists by phone
    const existingUserByPhone = await getUserByPhone(phone);
    if (existingUserByPhone) {
      return errorResponse(res, 409, 'User with this phone number already exists');
    }

    // Check if user already exists by email
    const existingUserByEmail = await getUserByEmail(email);
    if (existingUserByEmail) {
      return errorResponse(res, 409, 'User with this email already exists');
    }

    // Create user using only the User schema
    const user = await createUser(userData);
    if (!user) {
      return errorResponse(res, 500, 'User registration failed');
    }

    return successResponse(res, 201, 'User registered successfully', null);
  }
  catch (error) {
    console.error('Error registering user:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
};



const loginUserController = async (req, res) => {
  try {
    const { phone, password } = req.validatedLoginData;

    const user = await loginUser(phone, password);
    if (!user) {
      return errorResponse(res, 401, 'Incorrect phone number or password');
    }

    const token = jwt.sign(
      { id: user._id, phone: user.phone, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

        
    const respData = { user, token: token };
    return successResponse(res, 200, 'Login successful', respData);
  } catch (error) {
    console.error('Error logging in user:', error);
    return errorResponse(res, 401, 'Incorrect phone number or password');
  }
};

const logoutUser = async (req, res) => {
  try {
    const user = req.user;
    if (!user?.id) {
      return errorResponse(res, 401, 'User not authenticated');
    }

    await markPendingRidesInactiveForUser({
      userId: user.id,
      io: req.app.get('io'),
      status: 'cancelled',
      reason: 'user_logout'
    });

    await markRiderOffline({ riderInfo: user.id, socketId: null });

    return successResponse(res, 200, 'Logout successful');
  } catch (error) {
    console.error('Error during logout:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
};

const authenticateUser = async (req, res) => {
  try {
    // Disable caching for auth endpoints
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const user = req.user;
    if (!user) {
      return errorResponse(res, 401, 'User not authenticated');
    }
    const userData = await getUserByPhone(user.phone);
    console.log(userData);

    if (!userData) {
      return errorResponse(res, 404, 'User not found');
    }
    return successResponse(res, 200, 'User authenticated', userData);
  } catch (error) {
    console.error('Error authenticating user:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
};

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const uploadProfilePic = async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 400, 'No file uploaded');
    }

    const user = req.user;
    if (!user) {
      return errorResponse(res, 401, 'User not authenticated');
    }

    // Upload to Cloudinary using upload_stream for buffer
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'profile_pictures',
          resource_type: 'auto'
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            reject(error);
          } else {
            resolve(result);
          }
        }
      );
      stream.end(req.file.buffer);
    });

    // Update user profile picture URL
    const updatedUser = await updateUserProfilePic(user.phone, result.secure_url);

    return successResponse(res, 200, 'Profile picture uploaded successfully', {
      profilePic: result.secure_url,
      user: updatedUser
    });
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
};

const updateProfile = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return errorResponse(res, 401, 'User not authenticated');
    }

    const { firstname, lastname, phone, dateOfBirth, address, notificationSettings, privacySettings } = req.body;

    // Prepare update data
    const updateData = {};
    if (firstname) updateData.firstname = firstname;
    if (lastname) updateData.lastname = lastname;
    if (phone) updateData.phone = phone;
    if (dateOfBirth) updateData.dateOfBirth = dateOfBirth;
    if (address) updateData.address = address;
    if (notificationSettings) updateData.notificationSettings = notificationSettings;
    if (privacySettings) updateData.privacySettings = privacySettings;

    const updatedUser = await updateUserProfile(user.phone, updateData);

    return successResponse(res, 200, 'Profile updated successfully', updatedUser);
  } catch (error) {
    console.error('Error updating profile:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
};

const changePassword = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return errorResponse(res, 401, 'User not authenticated');
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return errorResponse(res, 400, 'Current and new password are required');
    }

    const userData = await getUserByPhone(user.phone);
    const isPasswordValid = await bcrypt.compare(currentPassword, userData.password);
    if (!isPasswordValid) {
      return errorResponse(res, 401, 'Invalid current password');
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await updatePassword(user.phone, hashedNewPassword);

    return successResponse(res, 200, 'Password changed successfully');
  } catch (error) {
    console.error('Error changing password:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
};

const updateSecuritySettings = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return errorResponse(res, 401, 'User not authenticated');
    }

    const { isSmsProtectionEnabled } = req.body;
    const updatedUser = await updateSmsProtection(user.phone, isSmsProtectionEnabled);

    return successResponse(res, 200, 'Security settings updated successfully', updatedUser);
  } catch (error) {
    console.error('Error updating security settings:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
};

const sendOtpSms = async (otp, phone) => {
  try {
    await sendOTP(otp, phone);
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message || 'SMS send error' };
  }
};

const sendOtpEmailHelper = async (otp, email) => {
  try {
    await sendOtpEmail(otp, email);
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message || 'Email send error' };
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return errorResponse(res, 400, 'Phone number is required');
    }
    const user = await getUserByPhone(phone);
    if (!user) {
      return errorResponse(res, 404, 'User with this phone number not found');
    }

    const otp = createOTP(6);
    const otpEntry = new otpModel({
      userId: user._id,
      otp: otp
    });
    await otpEntry.save();

    const smsRes = await sendOtpSms(otp, phone);
    const emailRes = await sendOtpEmailHelper(otp, user.email);

    if (!smsRes.success && !emailRes.success) {
      console.error(`Failed to send OTP: SMS failed (${smsRes.message}) and Email failed (${emailRes.message})`);
      return errorResponse(res, 500, 'Failed to send verification code. Please try again.');
    }

    if (!smsRes.success) {
      console.error(`Failed to send OTP via SMS: ${smsRes.message}`);
      return errorResponse(res, 500, 'Failed to send verification SMS. Please try again.');
    }

    if (!emailRes.success) {
      console.error(`Failed to send OTP via Email: ${emailRes.message}`);
      return errorResponse(res, 500, 'Failed to send verification Email. Please try again.');
    }

    const { OTP_EXPIRY_SECONDS } = require('../Configs/otp.config');
    const expiresAt = Date.now() + OTP_EXPIRY_SECONDS * 1000;

    return successResponse(res, 200, 'OTP sent successfully.', {
      phone,
      expiresAt,
      expiresInSeconds: OTP_EXPIRY_SECONDS
    });
  } catch (error) {
    console.error('Error in forgot password:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
};

const verifyOnlyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return errorResponse(res, 400, 'Phone number and OTP are required');
    }

    const user = await getUserByPhone(phone);
    if (!user) {
      return errorResponse(res, 404, 'User with this phone number not found');
    }

    const cleanOtp = otp.replace(/\D/g, '');
    const dottedOtp = cleanOtp.split('').join('.');

    const otpRecord = await otpModel.findOne({
      userId: user._id,
      $or: [
        { otp: otp },
        { otp: cleanOtp },
        { otp: dottedOtp }
      ]
    });
    if (!otpRecord) {
      return errorResponse(res, 400, 'Invalid or expired OTP');
    }

    return successResponse(res, 200, 'OTP verified successfully.', { phone, otp: cleanOtp });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
};

// resend is same as forgot-password for a given phone
const resendOtp = async (req, res) => {
  try {
    // reuse forgotPassword logic by calling it directly
    // (keeps response format consistent for frontend)
    return forgotPassword(req, res);
  } catch (error) {
    console.error('Error in resend OTP:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
};

const verifyResetOtp = async (req, res) => {
  try {
    const { phone, otp, newPassword } = req.body;
        
    if (!phone || !otp || !newPassword) {
      return errorResponse(res, 400, 'Phone number, OTP, and new password are required');
    }

    if (newPassword.length < 6) {
      return errorResponse(res, 400, 'Password must be at least 6 characters long');
    }

    // Verify OTP
    await verifyOtpForPasswordReset(phone, otp);

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
        
    // Update password
    await updatePassword(phone, hashedPassword);

    return successResponse(res, 200, 'Password reset successfully. You can now login with your new password.');
  } catch (error) {
    console.error('Error in verify reset OTP:', error);
    if (error.message.includes('User not found')) {
      return errorResponse(res, 404, 'User not found');
    }
    if (error.message.includes('Invalid or expired OTP')) {
      return errorResponse(res, 400, 'Invalid or expired OTP');
    }
    return errorResponse(res, 500, 'Internal server error');
  }
};

module.exports = {
  registerUser,
  loginUserController,
  logoutUser,
  authenticateUser,
  uploadProfilePic,
  upload,
  updateProfile,
  changePassword,
  updateSecuritySettings,
  forgotPassword,
  resendOtp,
  verifyResetOtp,
  verifyOnlyOtp
};
