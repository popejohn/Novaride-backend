// Create schema for Rider model using Mongoose
const mongoose = require('mongoose');
const riderSchema = new mongoose.Schema({
  //Reference the user model for rider personal details 
  riderInfo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  vehicleType: { type: String, required: true },
  plateNumber: { type: String, required: true, unique: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number] }, // [longitude, latitude]
  },
  isAvailable: { type: Boolean, default: false },
  socketId: { type: String, default: null },
  lastSeenAt: { type: Date, default: null },
  isVerified: { type: Boolean, default: true },
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
  reviews: [{
    passenger: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rating: { type: Number, required: true },
    feedback: { type: String },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

riderSchema.index({ location: '2dsphere' });

const riderModel = mongoose.model('Rider', riderSchema);

module.exports = riderModel;
