const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { createUser, loginUser, getUserByPhone, updateUserProfilePic, updateUserProfile, updatePassword, updateSmsProtection } = require('../Models/auth.models')
const { errorResponse, successResponse } = require('../Utils/responseHelper')
const multer = require('multer');
const cloudinary = require('../Configs/cloudinary');
// const{ createOTP } = require('../Utils/createOTP');
// const { publishOTPJob } = require('../Utils/rabbitmq');
// const {otpModel} = require('../Schemas/otp.model');






const registerUser = async (req, res) => {
    try {
        const { firstname, lastname, phone, password, role } = req.validatedUserData;
        console.log(req.validatedUserData);

        // Normalize role to an array to support multiple roles
        const roles = Array.isArray(role) ? role : (role ? [role] : []);

        if (!firstname || !lastname || !phone || !password || roles.length === 0) {
            return errorResponse(res, 400, 'Firstname, lastname, phone, password and at least one role are required');
        }
        const hashedPassword = await bcrypt.hash(password, 10);

        // Build user document using only fields defined in the User schema
        const userData = {
            firstname,
            lastname,
            phone,
            password: hashedPassword,
            role: roles,
        };

        // Check if user already exists
        const existingUser = await getUserByPhone(phone);
        if (existingUser) {
            return errorResponse(res, 409, 'User with this phone number already exists');
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
}



const loginUserController = async (req, res) => {
    try {
        const { phone, password } = req.validatedLoginData;

        const user = await loginUser(phone, password);
        if (!user) {
            return errorResponse(res, 401, "Invalid phone or password");
        }

        const token = jwt.sign(
            { id: user._id, phone: user.phone, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        // Generate OTP
        // const otp = createOTP(6);

        // // Publish OTP job
        // const otpData = {
        //     phone: user.phone,
        //     otp: otp,
        //     timestamp: Date.now()
        // };

        // const published = await publishOTPJob(otpData);

        // if (!published) {
        //     return errorResponse(res, 500, "Failed to queue OTP job");
        // }


        // Store OTP in database
        // const otpEntry = new otpModel({
        //     userId: user._id,
        //     otp: otp
        // });
        // await otpEntry.save();
        // if (!otpEntry) {
        //     return errorResponse(res, 500, "Failed to store OTP");
        // }
        const respData = { user, token: token };
        return successResponse(res, 200, "Login successful", respData);
    } catch (error) {
        console.error('Error logging in user:', error);
        return errorResponse(res, 500, 'Internal server error');
    }
};

const authenticateUser = async (req, res) => {
    try {
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

module.exports = {
    registerUser, loginUserController,
    authenticateUser, uploadProfilePic, upload,
    updateProfile, changePassword, updateSecuritySettings
}