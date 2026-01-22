const mongoose = require('mongoose');
const userModel = require('../Schemas/user.schema');
const { otpModel } = require('../Schemas/otp.model');
const bcrypt = require('bcrypt');


const createUser = async (userData) => {
    try {
        const user = new userModel(userData);
        await user.save();
        return user;
    } catch (error) {
        throw new Error('Error creating user: ' + error.message);
    }
};


const getUserByPhone = async (phone) => {
    try {
        const user = await userModel.findOne({ phone });
        return user;
    } catch (error) {
        throw new Error('Error fetching user: ' + error.message);
    }
};

const loginUser = async (phone, password) => {
    try {
        const user = await getUserByPhone(phone);
        if (!user) {
            throw new Error('User not found');
        }
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            throw new Error('Invalid password');
        }
        const safeUser = { ...user._doc };
        delete safeUser.password;
        return safeUser;
    } catch (error) {
        throw new Error('Error logging in user: ' + error.message);
    }
};

const verifyOtp = async (userId, otp) => {
    try {
        const otpRecord = await otpModel.findOne({ userId, otp });
        if (!otpRecord) {
            throw new Error('Invalid OTP');
        }
        return true;
    } catch (error) {
        throw new Error('Error verifying OTP: ' + error.message);
    }
};

const updateUserProfilePic = async (phone, profilePicUrl) => {
    try {
        const user = await userModel.findOneAndUpdate(
            { phone },
            { profilePic: profilePicUrl },
            { new: true }
        );
        return user;
    } catch (error) {
        throw new Error('Error updating profile picture: ' + error.message);
    }
};


module.exports = { createUser, getUserByPhone, loginUser, verifyOtp, updateUserProfilePic };