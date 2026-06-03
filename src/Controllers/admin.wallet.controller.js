const User = require('../Schemas/user.schema.js');
const Transaction = require('../Schemas/transaction.mongoose.schema.js');
const axios = require('axios');
const env = require('../Configs/env.js');

const PAYSTACK_SECRET_KEY = env.PAYSTACK_SECRET_KEY;

const fundUserWallet = async (req, res) => {
  try {
    const { userIdentifier, amount, description } = req.body;

    if (!userIdentifier || !amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid user identifier (email or phone) and positive amount are required' });
    }

    const user = await User.findOne({
      $or: [
        { email: userIdentifier.toLowerCase().trim() },
        { phone: userIdentifier.trim() }
      ]
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found with matching email or phone number' });
    }

    user.wallet = (user.wallet || 0) + Number(amount);
    await user.save();

    const newTransaction = new Transaction({
      user: user._id,
      type: 'funding',
      amount: Number(amount),
      description: description || 'Admin manual wallet credit',
      status: 'completed',
      reference: `ADM-FUND-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`
    });

    await newTransaction.save();

    return res.status(200).json({
      message: `Successfully credited ${user.firstname} ${user.lastname}'s wallet with ${amount}`,
      walletBalance: user.wallet,
      transaction: newTransaction
    });
  } catch (error) {
    console.error('Error funding user wallet:', error);
    return res.status(500).json({ message: 'Server error funding user wallet' });
  }
};

const withdrawRiderWallet = async (req, res) => {
  try {
    const { riderId, amount, accountNumber, bankCode } = req.body;

    // Validate inputs
    if (!riderId || !amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid rider ID and positive amount are required' });
    }

    if (!accountNumber || !bankCode) {
      return res.status(400).json({ message: 'Account number and bank code are required' });
    }

    // Find rider
    const rider = await User.findById(riderId);
    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' });
    }

    // Verify rider is actually a rider (role is an array)
    if (!rider.role || !rider.role.includes('rider')) {
      return res.status(400).json({ message: 'User is not a rider' });
    }

    // Check if rider has sufficient wallet balance
    if ((rider.wallet || 0) < amount) {
      return res.status(400).json({ 
        message: 'Insufficient wallet balance',
        walletBalance: rider.wallet || 0,
        requestedAmount: amount
      });
    }

    // Initiate Paystack transfer
    try {
      const transferResponse = await axios.post('https://api.paystack.co/transfer', {
        source: 'balance',
        amount: Math.round(amount * 100), // Paystack expects amount in kobo
        recipient_code: `${accountNumber}-${bankCode}`, // This assumes bank account details are mapped
        reason: `Wallet withdrawal for ${rider.firstname} ${rider.lastname}`
      }, {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
        }
      });

      if (!transferResponse.data.status) {
        return res.status(400).json({ message: 'Paystack transfer initiation failed', error: transferResponse.data.message });
      }

      // Deduct from rider's wallet
      rider.wallet = (rider.wallet || 0) - Number(amount);
      await rider.save();

      // Create transaction record
      const transaction = new Transaction({
        user: rider._id,
        type: 'withdrawal',
        amount: Number(amount),
        description: `Wallet withdrawal to bank account ending in ${accountNumber.slice(-4)}`,
        status: 'pending',
        reference: `WD-${transferResponse.data.data.transfer_code}`,
        metadata: {
          accountNumber,
          bankCode,
          paystackTransferId: transferResponse.data.data.id
        }
      });

      await transaction.save();

      return res.status(200).json({
        message: `Withdrawal of ₦${amount.toLocaleString()} initiated successfully for ${rider.firstname} ${rider.lastname}`,
        walletBalance: rider.wallet,
        transaction: transaction,
        transferCode: transferResponse.data.data.transfer_code
      });
    } catch (paystackError) {
      console.error('Paystack transfer error:', paystackError.response?.data || paystackError.message);
      return res.status(500).json({ 
        message: 'Failed to process withdrawal via Paystack',
        error: paystackError.response?.data?.message || paystackError.message
      });
    }
  } catch (error) {
    console.error('Error processing rider wallet withdrawal:', error);
    return res.status(500).json({ message: 'Server error processing withdrawal' });
  }
};

const getWalletLogs = async (req, res) => {
  try {
    // Disable caching for real-time data
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const logs = await Transaction.find()
      .populate('user', 'firstname lastname email phone wallet role')
      .sort({ createdAt: -1 })
      .limit(150);

    return res.status(200).json(logs);
  } catch (error) {
    console.error('Error fetching transaction logs:', error);
    return res.status(500).json({ message: 'Server error fetching wallet logs' });
  }
};

module.exports = {
  fundUserWallet,
  withdrawRiderWallet,
  getWalletLogs
};