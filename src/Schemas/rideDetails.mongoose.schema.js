const mongoose = require('mongoose');

const rideDetailsSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  pickupLocation: { type: String, required: true },
  destination: { type: String, required: true },
  eta: { type: Number, required: true }, // in minutes
  fare: { type: Number, required: true },
  distance: { type: Number, required: true }, // in km
  rideStatus: {
    type: String,
    enum: ['pending', 'waiting_for_acceptance', 'accepted', 'at_pickup', 'starting', 'in_progress', 'awaiting_completion', 'completed', 'cancelled'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  paymentReference: { type: String }, // Paystack reference
  paymentMethod: { 
    type: String,
    enum: ['wallet', 'card', 'bank_transfer'],
    default: 'wallet'
  },
  pickupCoordinates: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true } // [longitude, latitude]
  },
  destinationCoordinates: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true } // [longitude, latitude]
  },
  assignedDriver: { type: mongoose.Schema.Types.ObjectId, ref: 'Rider' },
  rating: { type: Number, min: 1, max: 5 },
  feedback: { type: String },
  riderRating: { type: Number, min: 1, max: 5 },
  riderFeedback: { type: String },
  complaints: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['passenger', 'rider'] },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

// Index for geospatial queries on pickup location
rideDetailsSchema.index({ pickupCoordinates: '2dsphere' });
// Compound indexes for history and list queries
rideDetailsSchema.index({ user: 1, rideStatus: 1 });
rideDetailsSchema.index({ assignedDriver: 1, rideStatus: 1 });

const rideDetailsModel = mongoose.model('RideDetails', rideDetailsSchema);

module.exports = rideDetailsModel;
