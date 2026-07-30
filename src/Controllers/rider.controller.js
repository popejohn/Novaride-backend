//import user model
const userModel = require('../Schemas/user.schema');
const riderModel = require('../Schemas/rider.mongoose.schema');
const rideDetailsModel = require('../Schemas/rideDetails.mongoose.schema');
const { getUserByPhone } = require('../Models/auth.models');

//controller to get rider details
const getRiderDetails = async (req, res) => {
  try {
    // Since authentication is handled by middleware, req.user is set
    const decodedToken = req.user;

    if (!decodedToken.role.includes('rider')) {
      return res.status(403).json({ message: 'Access denied: Not a rider' });
    }
    const phone = decodedToken.phone;

    // Find the user in the database using the user ID from the token
    const rider = await getUserByPhone(phone);

    // If user not found, return a not found error
    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' });
    }

    // If rider found, return the rider details
    return res.status(200).json({ rider });
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

    if (!decodedToken.role.includes('rider')) {
      return res.status(403).json({ message: 'Access denied: Not a rider' });
    }

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
    await userModel.findByIdAndUpdate(user._id, {
      firstname: personal.firstname,
      lastname: personal.lastname,
      phone: personal.phone,
      dateOfBirth: personal.dateOfBirth,
      address: personal.address,
      profileCompleted: true
    });

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
      rider: rider
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

    const { latitude, longitude, isAvailable } = req.body;

    // Validate coordinates (if providing them)
    if (isAvailable !== false && (typeof latitude !== 'number' || typeof longitude !== 'number')) {
      return res.status(400).json({ message: 'Invalid coordinates' });
    }

    // Update rider location and availability
    let updateData = {};
    if (isAvailable === false) {
      updateData = {
        $unset: { location: '' },
        isAvailable: false
      };
    } else {
      updateData = {
        location: {
          type: 'Point',
          coordinates: [longitude, latitude] // MongoDB GeoJSON format: [lng, lat]
        },
        isAvailable: true
      };
    }

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

//controller to get nearby drivers
const getNearbyDrivers = async (req, res) => {
  try {
    const { lat, lng, maxDistance = 5000 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ message: 'Latitude and longitude are required' });
    }

    // Find drivers within the specified distance (in meters)
    const drivers = await riderModel.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseInt(maxDistance)
        }
      },
      // Use rider availability flag as the source of truth for "online/available" drivers
      isAvailable: { $eq: true },
      // isVerified: true // Relaxed for testing
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

module.exports = { getRiderDetails, createRiderProfile, updateRiderLocation, getNearbyDrivers };
