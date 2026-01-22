// Create schema for Rider model using Mongoose
const mongoose = require('mongoose');
const riderSchema = new mongoose.Schema({
    //Reference the user model for rider personal details 
    riderInfo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    vehicleType: { type: String, required: true },
    plateNumber: { type: String, required: true, unique: true },
    location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true }, // [longitude, latitude]
    },
    isAvailable: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    driverLicenseNumber: { type: String, required: true, unique: true },
    driverLicenseExpiry: { type: Date, required: true },
    insuranceNumber: { type: String },
    insuranceExpiry: { type: Date },
    nextOfKin: {
        name: { type: String, required: true },
        phone: { type: String, required: true },
        address: { type: String, required: true },
    },
    paymentDetails: {
        bankName: { type: String, required: true },
        accountNumber: { type: String, required: true },
        accountName: { type: String, required: true },
        BVN: { type: String, required: true }
    },
}, { timestamps: true });



const riderModel = mongoose.model('Rider', riderSchema);

module.exports = riderModel;
