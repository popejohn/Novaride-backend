const rideDetailsModel = require('../Schemas/rideDetails.mongoose.schema');
const riderModel = require('../Schemas/rider.mongoose.schema');
const userModel = require('../Schemas/user.schema.js');
const transactionModel = require('../Schemas/transaction.mongoose.schema');
const { ACTIVE_RIDE_STATUSES, buildRideExpiry, getRideTimeoutMs, getIncomingRideQuery, transitionRideToInactive } = require('../Services/rideLifecycle.service');
const { calculateRideFare, validateRideRequest } = require('../Services/ridePricing.service');
const { getDistanceAndDuration } = require('../Services/googleMapsService');

const isRidePassenger = (ride, userId) => String(ride.user?._id || ride.user) === String(userId);
const isAssignedRider = (ride, userId) => String(ride.assignedDriver?.riderInfo?._id || ride.assignedDriver?.riderInfo) === String(userId);

//controller to create a ride
const createRide = async (req, res) => {
  try {
    const decodedToken = req.user;

    const {
      pickupLocation,
      destination,
      eta,
      distance,
      pickupCoordinates,
      destinationCoordinates
    } = req.body;

    const validationError = validateRideRequest({
      pickupLocation,
      destination,
      eta,
      distance,
      pickupCoordinates,
      destinationCoordinates
    });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const [pickupLongitude, pickupLatitude] = pickupCoordinates.coordinates;
    const [destinationLongitude, destinationLatitude] = destinationCoordinates.coordinates;
    const route = await getDistanceAndDuration(
      `${pickupLongitude},${pickupLatitude};${destinationLongitude},${destinationLatitude}`
    );
    const routeDetails = route?.routes?.[0];
    const serverDistance = Number(routeDetails?.distance) / 1000;
    const serverEta = Math.ceil(Number(routeDetails?.duration) / 60);
    const calculatedFare = calculateRideFare(serverDistance);

    if (!Number.isFinite(serverDistance) || serverDistance <= 0 || !Number.isFinite(serverEta) || serverEta <= 0 || calculatedFare === null) {
      return res.status(502).json({ message: 'Unable to calculate a route for this ride' });
    }

    // A ride can only be requested when its wallet-funded fare is available.
    const user = await userModel.findById(decodedToken.id);
    if (!user || user.wallet < calculatedFare) {
      return res.status(400).json({ message: 'insufficient fund. Pls fund wallet' });
    }

    // Create the ride
    const ride = new rideDetailsModel({
      user: decodedToken.id,
      pickupLocation,
      destination,
      eta: serverEta,
      fare: calculatedFare,
      distance: Number(serverDistance.toFixed(2)),
      pickupCoordinates,
      destinationCoordinates,
      rideStatus: 'pending',
      expiresAt: buildRideExpiry(new Date(), getRideTimeoutMs())
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

    const ride = await rideDetailsModel.findById(id).populate('user', 'firstname lastname profilePic phone').populate({
      path: 'assignedDriver',
      populate: { path: 'riderInfo', select: 'firstname lastname profilePic phone' }
    });

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    if (!isRidePassenger(ride, req.user.id) && !isAssignedRider(ride, req.user.id)) {
      return res.status(403).json({ message: 'Access denied: You are not a participant in this ride' });
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

    const rider = await riderModel.findOne({ _id: driverId, isAvailable: true, isVerified: true });
    if (!rider) {
      return res.status(400).json({ message: 'Selected rider is no longer available' });
    }

    const ride = await rideDetailsModel.findOneAndUpdate(
      { _id: id, user: decodedToken.id, rideStatus: 'pending' },
      {
        $set: {
          assignedDriver: rider._id,
          rideStatus: 'waiting_for_acceptance',
          expiresAt: buildRideExpiry(new Date(), getRideTimeoutMs())
        }
      },
      { new: true }
    );

    if (!ride) {
      const existingRide = await rideDetailsModel.findOne({ _id: id, user: decodedToken.id });
      if (existingRide?.rideStatus === 'waiting_for_acceptance' && String(existingRide.assignedDriver) === String(rider._id)) {
        return res.status(200).json({
          message: 'Driver is already assigned and awaiting acceptance',
          ride: existingRide
        });
      }

      return res.status(409).json({
        message: existingRide
          ? `This ride can no longer be assigned because it is ${existingRide.rideStatus}`
          : 'This ride no longer exists or is not yours'
      });
    }

    await ride.populate('user', 'firstname lastname profilePic');

    // Notify the selected rider with the complete ride needed by the live dashboard.
    const io = req.app.get('io');
    io.to(rider.riderInfo.toString()).emit('incomingRideRequest', {
      rideId: ride._id,
      ride,
      message: 'New ride request assigned to you'
    });
    console.log(`Notified rider ${rider.riderInfo} about ride ${ride._id}`);

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

    const rider = await riderModel.findOne({ riderInfo: decodedToken.id });
    if (!rider) return res.status(403).json({ message: 'Access denied: Rider profile not found' });

    const ride = await rideDetailsModel.findOneAndUpdate(
      { _id: rideId, assignedDriver: rider._id, rideStatus: 'waiting_for_acceptance' },
      {
        $set: {
          rideStatus: 'pending',
          assignedDriver: null,
          expiresAt: buildRideExpiry(new Date(), getRideTimeoutMs())
        }
      },
      { new: true }
    );
    if (!ride) return res.status(409).json({ message: 'This ride is no longer assigned to you' });

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
    const currentRide = await rideDetailsModel.findById(id);
    if (!currentRide) return res.status(404).json({ message: 'Ride not found' });

    const isPassenger = isRidePassenger(currentRide, req.user.id);
    const actorRider = isPassenger ? null : await riderModel.findOne({ riderInfo: req.user.id });
    const isDriver = actorRider && String(currentRide.assignedDriver) === String(actorRider._id);

    if (!isPassenger && !isDriver) {
      return res.status(403).json({ message: 'Access denied: You are not a participant in this ride' });
    }

    let ride;

    if (status === 'cancelled') {
      const cancellableStatuses = ['accepted', 'at_pickup', 'starting'];
      if (!cancellableStatuses.includes(currentRide.rideStatus)) {
        return res.status(409).json({ message: 'This ride can no longer be cancelled' });
      }

      ride = await rideDetailsModel.findOneAndUpdate(
        { _id: id, rideStatus: { $in: cancellableStatuses } },
        {
          $set: {
            rideStatus: 'cancelled',
            cancellationReason: isPassenger ? 'passenger_cancelled' : 'rider_cancelled',
            expiresAt: null
          }
        },
        { new: true }
      );
      if (!ride) return res.status(409).json({ message: 'This ride can no longer be cancelled' });

      io.to(id).emit('statusUpdate', { status: 'cancelled' });
      return res.status(200).json({ message: 'Ride cancelled', ride });
    }

    const passengerTransitions = { starting: ['accepted', 'at_pickup'] };
    const riderTransitions = {
      at_pickup: ['accepted'],
      awaiting_completion: ['in_progress']
    };

    if (passengerTransitions[status]) {
      if (!isPassenger) return res.status(403).json({ message: 'Only the passenger can request this status change' });
      ride = await rideDetailsModel.findOneAndUpdate(
        { _id: id, user: req.user.id, rideStatus: { $in: passengerTransitions[status] } },
        { $set: { rideStatus: status } },
        { new: true }
      );
    } else if (riderTransitions[status]) {
      if (!isDriver) return res.status(403).json({ message: 'Only the assigned rider can update this status' });
      ride = await rideDetailsModel.findOneAndUpdate(
        { _id: id, assignedDriver: actorRider._id, rideStatus: { $in: riderTransitions[status] } },
        { $set: { rideStatus: status } },
        { new: true }
      );
    } else if (status === 'in_progress') {
      if (!isDriver) return res.status(403).json({ message: 'Only the assigned rider can start this ride' });

      ride = await rideDetailsModel.findOneAndUpdate(
        { _id: id, assignedDriver: actorRider._id, rideStatus: 'starting', paymentStatus: 'pending' },
        { $set: { rideStatus: 'in_progress', paymentStatus: 'completed', paymentMethod: 'wallet' } },
        { new: true }
      );
      if (!ride) return res.status(409).json({ message: 'Ride is not ready to start or has already been paid' });

      const chargedUser = await userModel.findOneAndUpdate(
        { _id: ride.user, wallet: { $gte: ride.fare } },
        { $inc: { wallet: -ride.fare } },
        { new: true }
      );
      if (!chargedUser) {
        await rideDetailsModel.findOneAndUpdate(
          { _id: ride._id, rideStatus: 'in_progress' },
          { $set: { rideStatus: 'starting', paymentStatus: 'pending' } }
        );
        return res.status(400).json({ message: 'Insufficient wallet balance to start this ride' });
      }

      try {
        await transactionModel.create({
          user: ride.user,
          type: 'debit',
          amount: ride.fare,
          description: `Ride payment for trip to ${ride.destination}`,
          rideId: ride._id,
          reference: `RIDE-P-${ride._id}`
        });
      } catch (error) {
        await userModel.findByIdAndUpdate(ride.user, { $inc: { wallet: ride.fare } });
        await rideDetailsModel.findOneAndUpdate(
          { _id: ride._id, rideStatus: 'in_progress' },
          { $set: { rideStatus: 'starting', paymentStatus: 'pending' } }
        );
        throw error;
      }
    } else if (status === 'completed') {
      if (!isPassenger) return res.status(403).json({ message: 'Only the passenger can complete this ride' });
      const assignedRider = await riderModel.findById(currentRide.assignedDriver);
      if (!assignedRider) return res.status(409).json({ message: 'Assigned rider is unavailable' });

      ride = await rideDetailsModel.findOneAndUpdate(
        { _id: id, user: req.user.id, rideStatus: 'awaiting_completion', paymentStatus: 'completed' },
        { $set: { rideStatus: 'completed' } },
        { new: true }
      );
      if (!ride) return res.status(409).json({ message: 'Ride is not ready for completion' });

      const riderEarnings = ride.fare * 0.85;
      await userModel.findByIdAndUpdate(assignedRider.riderInfo, { $inc: { wallet: riderEarnings } });
      try {
        await transactionModel.create({
          user: assignedRider.riderInfo,
          type: 'credit',
          amount: riderEarnings,
          description: `Ride earning (85%) for trip to ${ride.destination}`,
          rideId: ride._id,
          reference: `RIDE-R-${ride._id}`
        });
      } catch (error) {
        await userModel.findByIdAndUpdate(assignedRider.riderInfo, { $inc: { wallet: -riderEarnings } });
        await rideDetailsModel.findOneAndUpdate({ _id: ride._id, rideStatus: 'completed' }, { $set: { rideStatus: 'awaiting_completion' } });
        throw error;
      }
    } else {
      return res.status(400).json({ message: 'Invalid ride status transition' });
    }

    if (!ride) return res.status(409).json({ message: 'This ride is no longer in a valid state for that action' });

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
    const rides = await rideDetailsModel.find(getIncomingRideQuery({ riderId: rider._id })).limit(parseInt(limit)).populate('user', 'firstname lastname profilePic');

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

    // Fetch the rider profile for this user and populate personal info (for phone, etc.)
    const rider = await riderModel.findOne({ riderInfo: decodedToken.id }).populate('riderInfo', 'firstname lastname phone profilePic');
    if (!rider) return res.status(404).json({ message: 'Rider profile not found' });

    const ride = await rideDetailsModel.findOneAndUpdate(
      { _id: rideId, assignedDriver: rider._id, rideStatus: 'waiting_for_acceptance' },
      { $set: { rideStatus: 'accepted', expiresAt: null } },
      { new: true }
    );
    if (!ride) {
      return res.status(409).json({ message: 'This ride is no longer assigned to you for acceptance' });
    }

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

    if (ride.rideStatus !== 'completed') {
      return res.status(409).json({ message: 'Ratings can only be submitted after a completed ride' });
    }

    // Check whether the current user participated in this ride.
    const rider = await riderModel.findOne({ riderInfo: decodedToken.id });
    const isDriver = rider && ride.assignedDriver && ride.assignedDriver.toString() === rider._id.toString();
    const isPassenger = isRidePassenger(ride, decodedToken.id);

    if (!isDriver && !isPassenger) {
      return res.status(403).json({ message: 'Access denied: You are not a participant in this ride' });
    }

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
    const { text } = req.body;
    const decodedToken = req.user;

    const ride = await rideDetailsModel.findById(id);
    if (!ride) return res.status(404).json({ message: 'Ride not found' });

    const rider = await riderModel.findOne({ riderInfo: decodedToken.id });
    const isDriver = rider && ride.assignedDriver && String(ride.assignedDriver) === String(rider._id);
    const isPassenger = isRidePassenger(ride, decodedToken.id);
    if (!isDriver && !isPassenger) {
      return res.status(403).json({ message: 'Access denied: You are not a participant in this ride' });
    }
    if (typeof text !== 'string' || !text.trim() || text.length > 2000) {
      return res.status(400).json({ message: 'Complaint text must be between 1 and 2000 characters' });
    }

    ride.complaints.push({
      user: decodedToken.id,
      role: isDriver ? 'rider' : 'passenger',
      text: text.trim()
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
