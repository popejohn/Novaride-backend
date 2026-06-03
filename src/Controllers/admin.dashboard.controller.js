// --- Dependencies from main backend ---
const User = require('../Schemas/user.schema.js');
const Rider = require('../Schemas/rider.mongoose.schema.js');
const RideDetails = require('../Schemas/rideDetails.mongoose.schema.js');
const Installment = require('../Schemas/installment.mongoose.schema.js');
const Transaction = require('../Schemas/transaction.mongoose.schema.js');
const Admin = require('../Models/admin.model');



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

    const installments = await Installment.find().populate('user', 'firstname lastname email phone wallet installmentPlan');
    return res.status(200).json(installments);
  } catch (error) {
    console.error('Error fetching partners list:', error);
    return res.status(500).json({ message: 'Server error fetching partners' });
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
  getRidesList
};
