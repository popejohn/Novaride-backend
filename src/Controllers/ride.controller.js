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

    // Check if user has enough balance
    const user = await userModel.findById(decodedToken.id);
    if (!user || user.wallet < fare) {
      return res.status(400).json({ message: 'insufficient fund. Pls fund wallet' });
    }

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

    // Populate user details for the ride object
    await ride.populate('user', 'firstname lastname profilePic');

    // Emit event to all online riders when a new ride is available
    const io = req.app.get('io');
    io.emit('newRideAvailable', {
      rideId: ride._id,
      ride: ride,
      message: 'New ride available in your area'
    });
    console.log(`[Socket] Broadcasted new ride ${ride._id} to all online riders`);

    return res.status(200).json({
      message: 'Ride created successfully',
      ride: ride
    });

  } catch (error) {
    console.error('Error creating ride:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
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
      return res.status(404).json({ message: 'Ride not found' });
    }

    return res.status(200).json({
      message: 'Ride details fetched successfully',
      ride: ride
    });
  } catch (error) {
    console.error('Error fetching ride details:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
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
      return res.status(404).json({ message: 'Ride not found' });
    }

    // Check if the ride belongs to the user
    if (ride.user.toString() !== decodedToken.id) {
      return res.status(403).json({ message: 'Access denied: Unauthorized access to ride details' });
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
        message: 'New ride request assigned to you'
      });
      console.log(`Notified rider ${rider.riderInfo} about ride ${ride._id}`);
    }

    return res.status(200).json({
      message: 'Driver assigned successfully, waiting for acceptance',
      ride: ride
    });
  } catch (error) {
    console.error('Error assigning driver:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Controller to reject a ride (by rider)
const rejectRide = async (req, res) => {
  try {
    const { rideId } = req.body;
    const decodedToken = req.user;
    const io = req.app.get('io');

    const ride = await rideDetailsModel.findById(rideId);
    if (!ride) return res.status(404).json({ message: 'Ride not found' });

    // Ensure the ride was actually assigned to this rider
    const rider = await riderModel.findOne({ riderInfo: decodedToken.id });
    if (!rider || ride.assignedDriver.toString() !== rider._id.toString()) {
      return res.status(403).json({ message: 'Access denied: You are not assigned to this ride' });
    }

    // Reset ride status and clear assigned driver
    ride.rideStatus = 'pending';
    ride.assignedDriver = null;
    await ride.save();

    // Notify the passenger!
    io.to(ride.user.toString()).emit('rideRejected', {
      rideId: ride._id,
      message: 'The rider declined your request. Please select another rider.'
    });

    // Also emit to the ride room
    io.to(rideId).emit('statusUpdate', { status: 'pending', message: 'Rider declined' });

    // Broadcast to all riders that this ride is available again
    await ride.populate('user', 'firstname lastname profilePic');
    io.emit('newRideAvailable', {
      rideId: ride._id,
      ride: ride,
      message: 'Ride is now available again'
    });
    console.log(`[Socket] Broadcasted ride rejection for ${rideId} - now available again`);

    return res.status(200).json({
      message: 'Ride rejected successfully',
      ride: ride
    });
  } catch (error) {
    console.error('Error rejecting ride:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Controller to update ride status
const updateRideStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const io = req.app.get('io');
        
    let ride;

    if (status === 'in_progress') {
      // First fetch to check passenger funds without mutating
      const checkRide = await rideDetailsModel.findById(id);
      if (!checkRide) return res.status(404).json({ message: 'Ride not found' });
      if (checkRide.rideStatus === 'in_progress') {
        return res.status(200).json({
          message: 'Ride is already in progress',
          ride: checkRide
        });
      }
      if (checkRide.rideStatus === 'completed' || checkRide.rideStatus === 'cancelled') {
        return res.status(400).json({ message: 'Cannot start a completed or cancelled ride' });
      }

      const fare = checkRide.fare;
      const passenger = await userModel.findById(checkRide.user);
      if (!passenger || passenger.wallet < fare) {
        return res.status(400).json({ message: 'insufficient fund. Pls fund wallet' });
      }

      // ATOMIC LOCK: transition to in_progress
      ride = await rideDetailsModel.findOneAndUpdate(
        { _id: id, rideStatus: { $ne: 'in_progress' } },
        { rideStatus: 'in_progress' },
        { new: true }
      );

      if (!ride) {
        return res.status(400).json({ message: 'Ride is already in progress or altered' });
      }

      // Deduct full fare from passenger atomically
      await userModel.findByIdAndUpdate(ride.user, { $inc: { wallet: -fare } });
      await transactionModel.create({
        user: ride.user,
        type: 'debit',
        amount: fare,
        description: `Ride payment for trip to ${ride.destination}`,
        rideId: ride._id,
        reference: `RIDE-P-${Date.now()}`
      });
    } else if (status === 'completed') {
      const checkRide = await rideDetailsModel.findById(id);
      if (!checkRide) return res.status(404).json({ message: 'Ride not found' });
      if (checkRide.rideStatus === 'completed') {
        return res.status(400).json({ message: 'Ride is already completed' });
      }

      // ATOMIC LOCK: transition to completed
      ride = await rideDetailsModel.findOneAndUpdate(
        { _id: id, rideStatus: { $ne: 'completed' } },
        { rideStatus: 'completed' },
        { new: true }
      );

      if (!ride) {
        return res.status(400).json({ message: 'Ride is already completed or altered' });
      }

      // Credit 85% to rider atomically
      const fare = ride.fare;
      const riderEarnings = fare * 0.85;
      const rider = await riderModel.findById(ride.assignedDriver);
      if (rider) {
        await userModel.findByIdAndUpdate(rider.riderInfo, { $inc: { wallet: riderEarnings } });
        await transactionModel.create({
          user: rider.riderInfo,
          type: 'credit',
          amount: riderEarnings,
          description: `Ride earning (85%) for trip to ${ride.destination}`,
          rideId: ride._id,
          reference: `RIDE-R-${Date.now()}`
        });
      }
    } else {
      // For other statuses, standard update (e.g. pending, starting, accepted, at_pickup)
      const updateObject = { rideStatus: status };
      if (status === 'pending') {
        updateObject.assignedDriver = null;
      }
      ride = await rideDetailsModel.findByIdAndUpdate(
        id,
        updateObject,
        { new: true }
      );
      if (!ride) return res.status(404).json({ message: 'Ride not found' });
    }

    // Broadcast status update to ride room
    io.to(id).emit('statusUpdate', { status });

    return res.status(200).json({
      message: `Ride status updated to ${status}`,
      ride: ride
    });
  } catch (error) {
    console.error('Error updating ride status:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Controller to get available rides (for riders)
const getAvailableRides = async (req, res) => {
  try {
    const decodedToken = req.user;

    // 1. Get the rider's ID
    const rider = await riderModel.findOne({ riderInfo: decodedToken.id });
    if (!rider) {
      return res.status(404).json({ message: 'Rider profile not found' });
    }

    // 2. Fetch rides assigned specifically to this rider that are waiting for acceptance
    const { limit = 20 } = req.query;
    const rides = await rideDetailsModel.find({
      assignedDriver: rider._id,
      rideStatus: 'waiting_for_acceptance'
    }).limit(parseInt(limit)).populate('user', 'firstname lastname profilePic');

    return res.status(200).json({
      message: 'Incoming rides fetched successfully',
      rides: rides
    });
  } catch (error) {
    console.error('Error fetching incoming rides:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Controller to accept a ride
const acceptRide = async (req, res) => {
  try {
    const { rideId } = req.body;
    const decodedToken = req.user;
    const io = req.app.get('io');

    const ride = await rideDetailsModel.findById(rideId);
    if (!ride) return res.status(404).json({ message: 'Ride not found' });

    // Fetch the rider profile for this user and populate personal info (for phone, etc.)
    const rider = await riderModel.findOne({ riderInfo: decodedToken.id }).populate('riderInfo', 'firstname lastname phone profilePic');
    if (!rider) return res.status(404).json({ message: 'Rider profile not found' });

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

    // Broadcast to all riders that this ride is no longer available
    io.emit('rideAccepted', {
      rideId: ride._id,
      status: 'accepted'
    });
    console.log(`[Socket] Broadcasted ride acceptance for ${rideId} to all riders`);

    return res.status(200).json({
      message: 'Ride accepted successfully',
      ride: ride
    });
  } catch (error) {
    console.error('Error accepting ride:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Controller to get ride history
const getRideHistory = async (req, res) => {
  try {
    const decodedToken = req.user;
    const { role, page = 1, limit = 20 } = req.query; // 'passenger' or 'rider'
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = {};
    if (role === 'rider') {
      const rider = await riderModel.findOne({ riderInfo: decodedToken.id });
      if (!rider) return res.status(404).json({ message: 'Rider profile not found' });
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
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
            
    const total = await rideDetailsModel.countDocuments(query);

    return res.status(200).json({
      message: 'Ride history fetched successfully',
      rides: rides,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching ride history:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Controller to submit rating
const submitRating = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, feedback } = req.body;
    const decodedToken = req.user;

    const ride = await rideDetailsModel.findById(id);
    if (!ride) return res.status(404).json({ message: 'Ride not found' });

    // Check if the current user is the assigned driver
    const rider = await riderModel.findOne({ riderInfo: decodedToken.id });
    const isDriver = rider && ride.assignedDriver && ride.assignedDriver.toString() === rider._id.toString();

    if (isDriver) {
      ride.riderRating = rating;
      ride.riderFeedback = feedback;
      await ride.save();
    } else {
      ride.rating = rating;
      ride.feedback = feedback;
      await ride.save();

      // Append review to Rider's schema reviews list
      if (ride.assignedDriver) {
        await riderModel.findByIdAndUpdate(ride.assignedDriver, {
          $push: {
            reviews: {
              passenger: decodedToken.id,
              rating: rating,
              feedback: feedback,
              createdAt: new Date()
            }
          }
        });
      }
    }

    return res.status(200).json({
      message: 'Rating submitted successfully',
      ride: ride
    });
  } catch (error) {
    console.error('Error submitting rating:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Controller to submit a complaint
const submitComplaint = async (req, res) => {
  try {
    const { id } = req.params;
    const { text, role } = req.body;
    const decodedToken = req.user;

    const ride = await rideDetailsModel.findById(id);
    if (!ride) return res.status(404).json({ message: 'Ride not found' });

    ride.complaints.push({
      user: decodedToken.id,
      role: role, // 'passenger' or 'rider'
      text: text
    });

    await ride.save();

    return res.status(200).json({
      message: 'Complaint submitted successfully',
      ride: ride
    });
  } catch (error) {
    console.error('Error submitting complaint:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { createRide, getRideById, assignDriver, updateRideStatus, getAvailableRides, acceptRide, rejectRide, getRideHistory, submitRating, submitComplaint };
