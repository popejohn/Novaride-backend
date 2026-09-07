// --- Dependencies from main backend ---
const User = require('../Schemas/user.schema.js');
const Rider = require('../Schemas/rider.mongoose.schema.js');
const RideDetails = require('../Schemas/rideDetails.mongoose.schema.js');
const Installment = require('../Schemas/installment.mongoose.schema.js');
const Transaction = require('../Schemas/transaction.mongoose.schema.js');
const Admin = require('../Models/admin.model');
const INSTALLMENT_CONSTANTS = require('../Configs/installment.constants');
const { getNextBusinessDay, calculateExpectedCompletionDate } = require('../Services/installment.service');
const { sendEmail } = require('../Services/installmentNotification.service');



const getStats = async (req, res) => {
  try {
    // Disable caching for real-time stats
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const totalRiders = await User.countDocuments({ role: 'rider' });
    const totalPassengers = await User.countDocuments({ role: 'passenger' });
    const totalPartners = await User.countDocuments({ role: 'installment' });
    const totalAdmins = await Admin.countDocuments();

    const totalRides = await RideDetails.countDocuments();
    const activeRides = await RideDetails.countDocuments({
      rideStatus: { $in: ['accepted', 'at_pickup', 'starting', 'in_progress', 'awaiting_completion'] }
    });
    const completedRides = await RideDetails.countDocuments({ rideStatus: 'completed' });
    const cancelledRides = await RideDetails.countDocuments({ rideStatus: 'cancelled' });

    const walletAggregation = await User.aggregate([
      { $group: { _id: null, totalBalance: { $sum: '$wallet' } } }
    ]);
    const totalWalletBalance = walletAggregation[0]?.totalBalance || 0;

    const fundingAggregation = await Transaction.aggregate([
      { $match: { type: 'funding', status: 'completed' } },
      { $group: { _id: null, totalFunded: { $sum: '$amount' } } }
    ]);
    const totalRevenue = fundingAggregation[0]?.totalFunded || 0;

    const totalInstallments = await Installment.countDocuments();
    const installmentAggregation = await Installment.aggregate([
      {
        $group: {
          _id: null,
          totalAmountSum: { $sum: '$totalAmount' },
          totalPaidSum: { $sum: '$paidAmount' }
        }
      }
    ]);
    const totalInstallmentAmount = installmentAggregation[0]?.totalAmountSum || 0;
    const totalInstallmentPaid = installmentAggregation[0]?.totalPaidSum || 0;
    const totalInstallmentPending = totalInstallmentAmount - totalInstallmentPaid;

    const completedInstallmentPlans = await Installment.countDocuments({ status: 'completed' });
    const activeInstallmentPlans = await Installment.countDocuments({ status: 'active' });
    const defaultedInstallmentPlans = await Installment.countDocuments({ status: 'defaulted' });

    // Fetch monthly activity data from database (last 6 months)
    const monthlyRiderActivity = await User.aggregate([
      {
        $match: { role: 'rider', createdAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const monthlyPassengerActivity = await User.aggregate([
      {
        $match: { role: 'passenger', createdAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const monthlyPartnerActivity = await User.aggregate([
      {
        $match: { role: 'installment', createdAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const monthlyRevenueActivity = await Transaction.aggregate([
      {
        $match: { type: 'funding', status: 'completed', createdAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          totalRevenue: { $sum: '$amount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Combine monthly data
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyActivity = monthlyRiderActivity.map(riderMonth => {
      const passengerData = monthlyPassengerActivity.find(p => p._id.year === riderMonth._id.year && p._id.month === riderMonth._id.month);
      const partnerData = monthlyPartnerActivity.find(p => p._id.year === riderMonth._id.year && p._id.month === riderMonth._id.month);
      const revenueData = monthlyRevenueActivity.find(r => r._id.year === riderMonth._id.year && r._id.month === riderMonth._id.month);

      return {
        month: monthNames[riderMonth._id.month - 1],
        riders: riderMonth.count,
        passengers: passengerData?.count || 0,
        partners: partnerData?.count || 0,
        revenue: revenueData?.totalRevenue || 0
      };
    });

    return res.status(200).json({
      users: {
        riders: totalRiders,
        passengers: totalPassengers,
        partners: totalPartners,
        admins: totalAdmins
      },
      rides: {
        total: totalRides,
        active: activeRides,
        completed: completedRides,
        cancelled: cancelledRides
      },
      wallets: {
        totalBalance: totalWalletBalance,
        totalRevenue: totalRevenue
      },
      installments: {
        total: totalInstallments,
        active: activeInstallmentPlans,
        completed: completedInstallmentPlans,
        defaulted: defaultedInstallmentPlans,
        totalAmount: totalInstallmentAmount,
        totalPaid: totalInstallmentPaid,
        totalPending: totalInstallmentPending
      },
      monthlyActivity
    });
  } catch (error) {
    console.error('Error fetching dashboard statistics:', error);
    return res.status(500).json({ message: 'Server error fetching statistics' });
  }
};

const getRiders = async (req, res) => {
  try {
    // Disable caching for real-time data
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const riders = await Rider.find().populate('riderInfo', 'firstname lastname email phone wallet');
    return res.status(200).json(riders);
  } catch (error) {
    console.error('Error fetching riders list:', error);
    return res.status(500).json({ message: 'Server error fetching riders' });
  }
};

const getPassengers = async (req, res) => {
  try {
    // Disable caching for real-time data
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const passengers = await User.find({ role: 'passenger' }).select('-password');
    return res.status(200).json(passengers);
  } catch (error) {
    console.error('Error fetching passengers list:', error);
    return res.status(500).json({ message: 'Server error fetching passengers' });
  }
};

const getPartners = async (req, res) => {
  try {
    // Disable caching for real-time data
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const installments = await Installment.find()
      .populate('user', 'firstname lastname email phone wallet installmentProfile role')
      .sort({ createdAt: -1 });
    return res.status(200).json(installments);
  } catch (error) {
    console.error('Error fetching partners list:', error);
    return res.status(500).json({ message: 'Server error fetching partners' });
  }
};

const getActivityLog = async (req, res) => {
  try {
    // Disable caching for real-time data
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const limit = Math.min(parseInt(req.query.limit, 10) || 40, 100);
    const fetchCount = 25;

    const [recentUsers, recentRides, recentTransactions, recentInstallments] = await Promise.all([
      User.find().select('firstname lastname role createdAt').sort({ createdAt: -1 }).limit(fetchCount),
      RideDetails.find().populate('user', 'firstname lastname').select('user rideStatus pickupLocation destination createdAt').sort({ createdAt: -1 }).limit(fetchCount),
      Transaction.find().populate('user', 'firstname lastname').select('user type amount description status createdAt').sort({ createdAt: -1 }).limit(fetchCount),
      Installment.find().populate('user', 'firstname lastname').select('user paymentsLog vehicleName').sort({ updatedAt: -1 }).limit(fetchCount)
    ]);

    const activities = [];

    recentUsers.forEach(u => {
      activities.push({
        type: 'signup',
        label: `New ${u.role} registered`,
        detail: `${u.firstname || ''} ${u.lastname || ''}`.trim() || 'Unnamed user',
        timestamp: u.createdAt
      });
    });

    recentRides.forEach(r => {
      const passengerName = r.user ? `${r.user.firstname || ''} ${r.user.lastname || ''}`.trim() : 'A passenger';
      activities.push({
        type: 'ride',
        label: `Ride ${r.rideStatus}`,
        detail: `${passengerName} — ${r.pickupLocation || 'Pickup'} → ${r.destination || 'Dropoff'}`,
        timestamp: r.createdAt
      });
    });

    recentTransactions.forEach(t => {
      const userName = t.user ? `${t.user.firstname || ''} ${t.user.lastname || ''}`.trim() : 'A user';
      activities.push({
        type: 'transaction',
        label: `${t.type} - ₦${(t.amount || 0).toLocaleString()}`,
        detail: `${userName}: ${t.description}`,
        timestamp: t.createdAt
      });
    });

    recentInstallments.forEach(inst => {
      const userName = inst.user ? `${inst.user.firstname || ''} ${inst.user.lastname || ''}`.trim() : 'A partner';
      (inst.paymentsLog || []).forEach(log => {
        activities.push({
          type: 'installment',
          label: log.type === 'deposit' ? 'Installment deposit paid' : 'Daily installment paid',
          detail: `${userName} paid ₦${(log.amount || 0).toLocaleString()} for ${inst.vehicleName || 'Maruwa'}`,
          timestamp: log.paidAt || log.date
        });
      });
    });

    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return res.status(200).json({ activities: activities.slice(0, limit) });
  } catch (error) {
    console.error('Error fetching activity log:', error);
    return res.status(500).json({ message: 'Server error fetching activity log' });
  }
};

const assignVehicle = async (req, res) => {
  try {    const { installmentId, vehicleName, vehiclePlate, vehicleType, vehicleModel, vehicleColor, vehicleOwnership, vehicleImage } = req.body;

    if (!installmentId || !vehiclePlate) {
      return res.status(400).json({ message: 'installmentId and vehiclePlate are required' });
    }

    const installment = await Installment.findById(installmentId).populate('user', 'firstname lastname email');
    if (!installment) {
      return res.status(404).json({ message: 'Installment plan not found' });
    }

    if (!installment.depositPaid) {
      return res.status(400).json({ message: 'Cannot assign a vehicle before the initial deposit is paid' });
    }

    if (vehicleName) installment.vehicleName = vehicleName;
    installment.vehiclePlate = vehiclePlate;
    if (vehicleType) installment.vehicleType = vehicleType;
    if (vehicleModel) installment.vehicleModel = vehicleModel;
    if (vehicleColor) installment.vehicleColor = vehicleColor;
    if (vehicleOwnership) installment.vehicleOwnership = vehicleOwnership;
    if (vehicleImage) installment.vehicleImage = vehicleImage;

    const now = new Date();
    installment.vehicleAssigned = true;
    installment.vehicleAssignedAt = now;
    installment.status = INSTALLMENT_CONSTANTS.STATUS.ACTIVE;
    installment.startDate = now;
    installment.nextPaymentDate = getNextBusinessDay(now);
    installment.expectedCompletionDate = calculateExpectedCompletionDate(now);
    installment.completedDays = 0;
    installment.consecutiveDefaults = 0;

    await installment.save();

    if (installment.user?.email) {
      sendEmail(
        installment.user.email,
        'NovaRide: Your Maruwa Has Been Assigned - Plan Active!',
        `<div style="font-family: Arial; padding: 20px; background: #111; color: #fff; border-radius: 10px;">
          <h2 style="color: #f97316;">🛺 Vehicle Assigned!</h2>
          <p>Hello ${installment.user.firstname}, your Maruwa (<b>${installment.vehicleName}</b>, Plate: <b>${installment.vehiclePlate}</b>) has been assigned.</p>
          <p>Your installment plan is now <b>ACTIVE</b>. First scheduled daily installment of ₦18,000 is due on <b>${installment.nextPaymentDate.toDateString()}</b> (Mon-Fri).</p>
        </div>`
      ).catch(console.error);
    }

    return res.status(200).json({ message: 'Vehicle assigned successfully. Installment plan is now active.', installment });
  } catch (error) {
    console.error('Error assigning vehicle:', error);
    return res.status(500).json({ message: 'Server error assigning vehicle' });
  }
};

const getRidesList = async (req, res) => {
  try {
    // Disable caching for real-time data
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const rides = await RideDetails.find()
      .populate('user', 'firstname lastname email phone')
      .populate({
        path: 'assignedDriver',
        populate: { path: 'riderInfo', select: 'firstname lastname phone' }
      })
      .sort({ createdAt: -1 })
      .limit(100);

    return res.status(200).json(rides);
  } catch (error) {
    console.error('Error fetching rides list:', error);
    return res.status(500).json({ message: 'Server error fetching rides' });
  }
};

module.exports = {
  getStats,
  getRiders,
  getPassengers,
  getPartners,
  getActivityLog,
  assignVehicle,
  getRidesList
};
