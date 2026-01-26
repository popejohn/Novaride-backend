const rideDetailsModel = require('../Schemas/rideDetails.mongoose.schema');

//controller to create a ride
const createRide = async (req, res) => {
    try {
        const decodedToken = req.user;

        const {
            pickupLocation,
            destination,
            eta,
            fare,
            distance,
            pickupCoordinates,
            destinationCoordinates
        } = req.body;

        // Create the ride
        const ride = new rideDetailsModel({
            user: decodedToken.id,
            pickupLocation,
            destination,
            eta,
            fare,
            distance,
            pickupCoordinates,
            destinationCoordinates
        });

        await ride.save();

        return res.status(200).json({
            message: "Ride created successfully",
            ride: ride
        });

    } catch (error) {
        console.error('Error creating ride:', error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

module.exports = { createRide };
