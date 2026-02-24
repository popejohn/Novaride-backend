const mongoose = require('mongoose');

// Restructured userSchema to accommodate role-based profiles
const userSchema = new mongoose.Schema({
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    password: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    //Role is an array to support multiple roles per user
    role: { type: [String], required: true, enum: ['passenger', 'rider', 'installment'] },
    // Rider-specific fields
    profilePic: { type: String },
    dateOfBirth: { type: Date },
    address: { type: String },
    isSmsProtectionEnabled: { type: Boolean, default: false },
    profileCompleted: { type: Boolean, default: false },
    notificationSettings: {
        rideRequests: { type: Boolean, default: true },
        paymentAlerts: { type: Boolean, default: true },
        promotions: { type: Boolean, default: false },
        securityAlerts: { type: Boolean, default: true },
        rideUpdates: { type: Boolean, default: true }
    },
    privacySettings: {
        shareRideHistory: { type: Boolean, default: false },
        allowLocationTracking: { type: Boolean, default: true },
        receiveMarketingEmails: { type: Boolean, default: false }
    },
    wallet: { type: Number, default: 0 }
}, { timestamps: true });



const userModel = mongoose.model('User', userSchema);


module.exports = userModel;