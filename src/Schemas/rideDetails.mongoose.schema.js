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
        enum: ['pending', 'accepted', 'completed'],
        default: 'pending'
    },
    pickupCoordinates: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true } // [longitude, latitude]
    },
    destinationCoordinates: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true } // [longitude, latitude]
    },
    assignedDriver: { type: mongoose.Schema.Types.ObjectId, ref: 'Rider' }
}, { timestamps: true });

// Index for geospatial queries on pickup location
rideDetailsSchema.index({ pickupCoordinates: '2dsphere' });

const rideDetailsModel = mongoose.model('RideDetails', rideDetailsSchema);

module.exports = rideDetailsModel;
