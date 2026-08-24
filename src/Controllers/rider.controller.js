//import user model
const userModel = require('../Schemas/user.schema');
const riderModel = require('../Schemas/rider.mongoose.schema');
const rideDetailsModel = require('../Schemas/rideDetails.mongoose.schema');
const { getUserByPhone } = require('../Models/auth.models');
const { getActiveRiderMatchQuery } = require('../Services/riderPresence.service');

const MAX_NEARBY_RIDER_DISTANCE_METERS = 5000;

//controller to get rider details
const getRiderDetails = async (req, res) => {
  try {
    // Since authentication is handled by middleware, req.user is set
    const decodedToken = req.user;

    const phone = decodedToken.phone;

    // Find the user in the database using the user ID from the token
    const rider = await getUserByPhone(phone);

    // If user not found, return a not found error
    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' });
    }

    const riderProfile = await riderModel.exists({ riderInfo: rider._id });

    // A role alone is insufficient: dashboard access requires the profile setup.
    return res.status(200).json({ rider, profileCompleted: Boolean(riderProfile) });
  } catch (error) {
    // Handle any errors that may occur
    return res.status(500).json({ message: 'Server error', error: error.message });
    console.log(error.message);
  }
};

//controller to create/update rider profile
const createRiderProfile = async (req, res) => {
  try {
    const decodedToken = req.user;

    const phone = decodedToken.phone;
    const user = await getUserByPhone(phone);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const {
      personal,
      vehicle,
      documents,
      payment
    } = req.body;

    // Validate BVN (11 digits)
    if (!/^\d{11}$/.test(payment.bvn)) {
      return res.status(400).json({ message: 'BVN must be exactly 11 digits' });
    }

    // Validate account number (10 digits)
    if (!/^\d{10}$/.test(payment.accountNumber)) {
      return res.status(400).json({ message: 'Account number must be exactly 10 digits' });
    }

    // Update user personal details
    const updatedUser = await userModel.findByIdAndUpdate(user._id, {
      firstname: personal.firstname,
      lastname: personal.lastname,
      phone: personal.phone,
      dateOfBirth: personal.dateOfBirth,
      address: personal.address,
      profileCompleted: true,
      riderProfileCompleted: true,
      $addToSet: { role: 'rider' }
    }, { new: true }).select('-password');

    // Create or update rider profile
    const riderData = {
      riderInfo: user._id,
      vehicleType: vehicle.vehicleType,
      plateNumber: vehicle.plateNumber,
      driverLicenseNumber: documents.licenseNumber,
      driverLicenseExpiry: documents.licenseExpiry,
      insuranceNumber: documents.insuranceNumber || null,
      insuranceExpiry: documents.insuranceExpiry || null,
      nextOfKin: {
        name: personal.nextOfKinName,
        phone: personal.nextOfKinPhone,
        address: personal.nextOfKinAddress
      },
      paymentDetails: {
        bankName: payment.bankName,
        accountNumber: payment.accountNumber,
        accountName: payment.accountName,
        BVN: payment.bvn
      }
    };

    // Set default location (can be updated later)
    riderData.location = {
      type: 'Point',
      coordinates: [0, 0] // Default coordinates
    };

    const rider = await riderModel.findOneAndUpdate(
      { riderInfo: user._id },
      riderData,
      { upsert: true, new: true }
    );

    return res.status(200).json({
      message: 'Rider profile created/updated successfully',
      rider: rider,
      user: updatedUser
    });

  } catch (error) {
    console.error('Error creating rider profile:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Duplicate entry found. Please check plate number, license number, or insurance number.' });
    }
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

//controller to update rider location and availability status
const updateRiderLocation = async (req, res) => {
  try {
    const decodedToken = req.user;

    if (!decodedToken.role.includes('rider')) {
      return res.status(403).json({ message: 'Access denied: Not a rider' });
    }

    const phone = decodedToken.phone;
    const user = await getUserByPhone(phone);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { latitude, longitude } = req.body;

    // Validate coordinates
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ message: 'Invalid coordinates' });
    }

    // Update only location and lastSeenAt (for presence heartbeat)
    // Do NOT update isAvailable here - that should only change via dedicated endpoint
    const updateData = {
      location: {
        type: 'Point',
        coordinates: [longitude, latitude] // MongoDB GeoJSON format: [lng, lat]
      },
      lastSeenAt: new Date() // Update heartbeat timestamp
    };

    const rider = await riderModel.findOneAndUpdate(
      { riderInfo: user._id },
      updateData,
      { new: true }
    );

    if (!rider) {
      return res.status(404).json({ message: 'Rider profile not found' });
    }

    return res.status(200).json({
      message: 'Location updated successfully',
      rider: rider
    });

  } catch (error) {
    console.error('Error updating rider location:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// New controller to handle only status changes (online/offline)
const updateRiderStatus = async (req, res) => {
  try {
    const decodedToken = req.user;

    if (!decodedToken.role.includes('rider')) {
      return res.status(403).json({ message: 'Access denied: Not a rider' });
    }

    const phone = decodedToken.phone;
    const user = await getUserByPhone(phone);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { isAvailable, latitude, longitude } = req.body;

    if (typeof isAvailable !== 'boolean') {
      return res.status(400).json({ message: 'isAvailable must be a boolean' });
    }

    // Update only status and location if coming online
    let updateData = {
      isAvailable: isAvailable,
      lastSeenAt: new Date()
    };

    // If going online, require coordinates
    if (isAvailable === true) {
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return res.status(400).json({ message: 'Coordinates required when going online' });
      }
      updateData.location = {
        type: 'Point',
        coordinates: [longitude, latitude]
      };
    } else {
      // If going offline, clear location
      updateData.$unset = { location: '' };
    }

    const rider = await riderModel.findOneAndUpdate(
      { riderInfo: user._id },
      updateData,
      { new: true }
    );

    if (!rider) {
      return res.status(404).json({ message: 'Rider profile not found' });
    }

    const io = req.app.get('io');
    if (io) {
      if (isAvailable) {
        io.emit('riderOnline', {
          riderId: String(user._id),
          riderName: `${user.firstname || 'Unknown'} ${user.lastname || ''}`.trim(),
          vehicleType: rider.vehicleType,
          plateNumber: rider.plateNumber,
          location: rider.location,
          profilePic: user.profilePic,
          isAvailable: true,
          timestamp: new Date()
        });
      } else {
        io.emit('riderOffline', {
          riderId: String(user._id),
          timestamp: new Date()
        });
      }
    }

    return res.status(200).json({
      message: `Rider status updated to ${isAvailable ? 'online' : 'offline'}`,
      rider: rider
    });

  } catch (error) {
    console.error('Error updating rider status:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

//controller to get nearby drivers
const getNearbyDrivers = async (req, res) => {
  try {
    const { lat, lng } = req.query;
    const latitude = Number(lat);
    const longitude = Number(lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ message: 'Valid latitude and longitude are required' });
    }

    // The list is real-time availability data. Prevent HTTP caching from returning a stale 304 response.
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
      Expires: '0'
    });

    // A fresh server heartbeat is the connection proof. socketId is only an
    // ephemeral diagnostic value and may lag a successful socket reconnect.
    const drivers = await riderModel.find({
      ...getActiveRiderMatchQuery(new Date()),
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude]
          },
          $maxDistance: MAX_NEARBY_RIDER_DISTANCE_METERS
        }
      }
    }).populate('riderInfo', 'firstname lastname profilePic');

    return res.status(200).json({
      message: 'Nearby drivers fetched successfully',
      drivers: drivers
    });

  } catch (error) {
    console.error('Error fetching nearby drivers:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { getRiderDetails, createRiderProfile, updateRiderLocation, updateRiderStatus, getNearbyDrivers };
