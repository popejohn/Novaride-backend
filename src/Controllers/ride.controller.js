const rideDetailsModel = require('../Schemas/rideDetails.mongoose.schema');
const riderModel = require('../Schemas/rider.mongoose.schema');
const userModel = require('../Schemas/user.schema.js');
const transactionModel = require('../Schemas/transaction.mongoose.schema');

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

// Controller to get a specific ride by ID
const getRideById = async (req, res) => {
    try {
        const { id } = req.params;
        const decodedToken = req.user;

        const ride = await rideDetailsModel.findById(id).populate('user', 'firstname lastname profilePic phone').populate({
            path: 'assignedDriver',
            populate: { path: 'riderInfo', select: 'firstname lastname profilePic phone' }
        });

        if (!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        return res.status(200).json({
            message: "Ride details fetched successfully",
            ride: ride
        });
    } catch (error) {
        console.error('Error fetching ride details:', error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Controller to assign a driver to a ride
const assignDriver = async (req, res) => {
    try {
        const { id } = req.params;
        const { driverId } = req.body;
        const decodedToken = req.user;

        const ride = await rideDetailsModel.findById(id);

        if (!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        // Check if the ride belongs to the user
        if (ride.user.toString() !== decodedToken.id) {
            return res.status(403).json({ message: "Access denied: Unauthorized access to ride details" });
        }

        ride.assignedDriver = driverId;
        ride.rideStatus = 'waiting_for_acceptance';
        await ride.save();

        // Notify the specific driver via socket
        const io = req.app.get('io');
        // Find the rider to get their user ID (riderInfo)
        const rider = await riderModel.findById(driverId);
        if (rider) {
            io.to(rider.riderInfo.toString()).emit('incomingRideRequest', {
                rideId: ride._id,
                message: "New ride request assigned to you"
            });
            console.log(`Notified rider ${rider.riderInfo} about ride ${ride._id}`);
        }

        return res.status(200).json({
            message: "Driver assigned successfully, waiting for acceptance",
            ride: ride
        });
    } catch (error) {
        console.error('Error assigning driver:', error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Controller to reject a ride (by rider)
const rejectRide = async (req, res) => {
    try {
        const { rideId } = req.body;
        const decodedToken = req.user;
        const io = req.app.get('io');

        const ride = await rideDetailsModel.findById(rideId);
        if (!ride) return res.status(404).json({ message: "Ride not found" });

        // Ensure the ride was actually assigned to this rider
        const rider = await riderModel.findOne({ riderInfo: decodedToken.id });
        if (!rider || ride.assignedDriver.toString() !== rider._id.toString()) {
            return res.status(403).json({ message: "Access denied: You are not assigned to this ride" });
        }

        // Reset ride status and clear assigned driver
        ride.rideStatus = 'pending';
        ride.assignedDriver = null;
        await ride.save();

        // Notify the passenger!
        io.to(ride.user.toString()).emit('rideRejected', {
            rideId: ride._id,
            message: "The rider declined your request. Please select another rider."
        });

        // Also emit to the ride room
        io.to(rideId).emit('statusUpdate', { status: 'pending', message: 'Rider declined' });

        return res.status(200).json({
            message: "Ride rejected successfully",
            ride: ride
        });
    } catch (error) {
        console.error('Error rejecting ride:', error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Controller to update ride status
const updateRideStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const io = req.app.get('io');

        const ride = await rideDetailsModel.findById(id);

        if (!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        ride.rideStatus = status;
        await ride.save();

        // If ride is completed, handle wallet transactions
        if (status === 'completed') {
            const fare = ride.fare;

            // 1. Deduct from passenger
            await userModel.findByIdAndUpdate(ride.user, {
                $inc: { wallet: -fare }
            });

            // Create transaction for passenger
            await transactionModel.create({
                user: ride.user,
                type: 'debit',
                amount: fare,
                description: `Ride payment for trip to ${ride.destination}`,
                rideId: ride._id,
                reference: `RIDE-P-${Date.now()}`
            });

            // 2. Credit to rider
            const rider = await riderModel.findById(ride.assignedDriver);
            if (rider) {
                await userModel.findByIdAndUpdate(rider.riderInfo, {
                    $inc: { wallet: fare }
                });

                // Create transaction for rider
                await transactionModel.create({
                    user: rider.riderInfo,
                    type: 'credit',
                    amount: fare,
                    description: `Ride earning for trip to ${ride.destination}`,
                    rideId: ride._id,
                    reference: `RIDE-R-${Date.now()}`
                });
            }
        }

        // Broadcast status update to ride room
        io.to(id).emit('statusUpdate', { status });

        return res.status(200).json({
            message: `Ride status updated to ${status}`,
            ride: ride
        });
    } catch (error) {
        console.error('Error updating ride status:', error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Controller to get available rides (for riders)
const getAvailableRides = async (req, res) => {
    try {
        const decodedToken = req.user;

        // 1. Get the rider's ID
        const rider = await riderModel.findOne({ riderInfo: decodedToken.id });
        if (!rider) {
            return res.status(404).json({ message: "Rider profile not found" });
        }

        // 2. Fetch rides assigned specifically to this rider that are waiting for acceptance
        const rides = await rideDetailsModel.find({
            assignedDriver: rider._id,
            rideStatus: 'waiting_for_acceptance'
        }).populate('user', 'firstname lastname profilePic');

        return res.status(200).json({
            message: "Incoming rides fetched successfully",
            rides: rides
        });
    } catch (error) {
        console.error('Error fetching incoming rides:', error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Controller to accept a ride
const acceptRide = async (req, res) => {
    try {
        const { rideId } = req.body;
        const decodedToken = req.user;
        const io = req.app.get('io');

        const ride = await rideDetailsModel.findById(rideId);
        if (!ride) return res.status(404).json({ message: "Ride not found" });

        // Fetch the rider profile for this user and populate personal info (for phone, etc.)
        const rider = await riderModel.findOne({ riderInfo: decodedToken.id }).populate('riderInfo', 'firstname lastname phone profilePic');
        if (!rider) return res.status(404).json({ message: "Rider profile not found" });

        ride.rideStatus = 'accepted';
        ride.assignedDriver = rider._id;
        await ride.save();

        // Notify the passenger!
        // We can emit to a room based on the passenger's user ID
        io.to(ride.user.toString()).emit('rideAccepted', {
            rideId: ride._id,
            status: 'accepted',
            driver: {
                id: rider._id,
                name: `${rider.riderInfo.firstname} ${rider.riderInfo.lastname}`,
                phone: rider.riderInfo.phone,
                profilePic: rider.riderInfo.profilePic,
                rating: 4.8 // Mock rating for now
            }
        });

        // Also emit to the ride room if tracking already started
        io.to(rideId).emit('statusUpdate', { status: 'accepted' });

        return res.status(200).json({
            message: "Ride accepted successfully",
            ride: ride
        });
    } catch (error) {
        console.error('Error accepting ride:', error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Controller to get ride history
const getRideHistory = async (req, res) => {
    try {
        const decodedToken = req.user;
        const { role } = req.query; // 'passenger' or 'rider'

        let query = {};
        if (role === 'rider') {
            const rider = await riderModel.findOne({ riderInfo: decodedToken.id });
            if (!rider) return res.status(404).json({ message: "Rider profile not found" });
            query = { assignedDriver: rider._id, rideStatus: 'completed' };
        } else {
            query = { user: decodedToken.id, rideStatus: 'completed' };
        }

        const rides = await rideDetailsModel.find(query)
            .populate('user', 'firstname lastname profilePic')
            .populate({
                path: 'assignedDriver',
                populate: { path: 'riderInfo', select: 'firstname lastname profilePic' }
            })
            .sort({ createdAt: -1 });

        return res.status(200).json({
            message: "Ride history fetched successfully",
            rides: rides
        });
    } catch (error) {
        console.error('Error fetching ride history:', error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Controller to submit rating
const submitRating = async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, feedback } = req.body;

        const ride = await rideDetailsModel.findById(id);
        if (!ride) return res.status(404).json({ message: "Ride not found" });

        ride.rating = rating;
        ride.feedback = feedback;
        await ride.save();

        return res.status(200).json({
            message: "Rating submitted successfully",
            ride: ride
        });
    } catch (error) {
        console.error('Error submitting rating:', error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Controller to submit a complaint
const submitComplaint = async (req, res) => {
    try {
        const { id } = req.params;
        const { text, role } = req.body;
        const decodedToken = req.user;

        const ride = await rideDetailsModel.findById(id);
        if (!ride) return res.status(404).json({ message: "Ride not found" });

        ride.complaints.push({
            user: decodedToken.id,
            role: role, // 'passenger' or 'rider'
            text: text
        });

        await ride.save();

        return res.status(200).json({
            message: "Complaint submitted successfully",
            ride: ride
        });
    } catch (error) {
        console.error('Error submitting complaint:', error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

module.exports = { createRide, getRideById, assignDriver, updateRideStatus, getAvailableRides, acceptRide, rejectRide, getRideHistory, submitRating, submitComplaint };
