const userModel = require('../Schemas/user.schema.js');
const transactionModel = require('../Schemas/transaction.mongoose.schema');
const installmentModel = require('../Schemas/installment.mongoose.schema');
const rideModel = require('../Schemas/rideDetails.mongoose.schema');
const axios = require('axios');

const env = require('../Configs/env.js');
const PAYSTACK_SECRET_KEY = env.PAYSTACK_SECRET_KEY;

const verifyWalletFunding = async (req, res) => {
  try {
    const { reference } = req.body;
    const decodedToken = req.user;

    if (!reference) {
      return res.status(400).json({ message: 'Transaction reference is required' });
    }

    // Verify with Paystack
    const paystackResponse = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
      }
    });

    const paymentData = paystackResponse.data.data;

    if (paymentData.status !== 'success') {
      return res.status(400).json({ message: 'Payment was not successful' });
    }

    // Paystack amount is in kobo, convert to Naira
    const amountInNaira = paymentData.amount / 100;

    // Find user
    const user = await userModel.findById(decodedToken.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // ATOMIC LOCK: Create transaction record FIRST. If 'reference' is duplicate, it throws E11000.
    try {
      await transactionModel.create({
        user: user._id,
        type: 'funding',
        amount: amountInNaira,
        description: 'Wallet funding via Paystack',
        status: 'completed',
        reference: reference
      });
    } catch (txError) {
      if (txError.code === 11000) {
        return res.status(400).json({ message: 'Transaction reference already processed' });
      }
      throw txError;
    }

    // ONLY increment wallet after successful uniqueness lock
    user.wallet += amountInNaira;
    await user.save();

    return res.status(200).json({
      message: 'Wallet funded successfully',
      walletBalance: user.wallet
    });

  } catch (error) {
    console.error('Error verifying wallet funding payload:', error.response?.data || error.message);
    return res.status(500).json({ message: 'Server error during verification', error: error.message });
  }
};

const verifyInstallmentPayment = async (req, res) => {
  try {
    const { reference } = req.body;
    const decodedToken = req.user;

    if (!reference) {
      return res.status(400).json({ message: 'Transaction reference is required' });
    }

    // Verify with Paystack
    const paystackResponse = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
      }
    });

    const paymentData = paystackResponse.data.data;

    if (paymentData.status !== 'success') {
      return res.status(400).json({ message: 'Payment was not successful' });
    }

    const amountInNaira = paymentData.amount / 100;

    // Find user's active installment
    const installment = await installmentModel.findOne({ user: decodedToken.id, status: 'active' });
    if (!installment) {
      return res.status(404).json({ message: 'No active installment plan found' });
    }

    // ATOMIC LOCK: Create generalized transaction record FIRST
    try {
      await transactionModel.create({
        user: decodedToken.id,
        type: 'debit', // it's a payment outward
        amount: amountInNaira,
        description: `Installment payment for ${installment.vehicleName}`,
        status: 'completed',
        reference: reference
      });
    } catch (txError) {
      if (txError.code === 11000) {
        return res.status(400).json({ message: 'Transaction reference already processed' });
      }
      throw txError;
    }

    // ONLY modify installment state and user history after successful uniqueness lock
    installment.paidAmount += amountInNaira;
    // simplistic logic to push next payment date 
    // a real app would have more complex schedule logic
    installment.nextPaymentDate = new Date(installment.nextPaymentDate.getTime() + 7 * 24 * 60 * 60 * 1000); 
    await installment.save();

    // Add to user's installment history directly from user schema as well
    const user = await userModel.findById(decodedToken.id);
    if (user) {
      user.installmentHistory.push({
        amount: amountInNaira,
        status: 'completed',
        transactionId: reference
      });
      await user.save();
    }

    return res.status(200).json({
      message: 'Installment payment verified successfully',
      installment: installment
    });

  } catch (error) {
    console.error('Error verifying installment payment:', error.response?.data || error.message);
    return res.status(500).json({ message: 'Server error during verification', error: error.message });
  }
};

const verifyRidePayment = async (req, res) => {
  try {
    const { reference, rideId } = req.body;
    const decodedToken = req.user;

    if (!reference) {
      return res.status(400).json({ message: 'Transaction reference is required' });
    }

    if (!rideId) {
      return res.status(400).json({ message: 'Ride ID is required' });
    }

    // Verify with Paystack
    const paystackResponse = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
      }
    });

    const paymentData = paystackResponse.data.data;

    if (paymentData.status !== 'success') {
      return res.status(400).json({ message: 'Payment was not successful' });
    }

    // Paystack amount is in kobo, convert to Naira
    const amountInNaira = paymentData.amount / 100;

    // Find user
    const user = await userModel.findById(decodedToken.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Find ride
    const ride = await rideModel.findById(rideId);
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    // Verify the fare matches
    if (amountInNaira !== ride.fare) {
      return res.status(400).json({ 
        message: 'Payment amount does not match ride fare',
        expected: ride.fare,
        received: amountInNaira
      });
    }

    // ATOMIC LOCK: Create transaction record FIRST. If 'reference' is duplicate, it throws E11000.
    try {
      await transactionModel.create({
        user: user._id,
        type: 'debit',
        amount: amountInNaira,
        description: `Ride payment - ${ride.pickupLocation} to ${ride.destination}`,
        status: 'completed',
        reference: reference
      });
    } catch (txError) {
      if (txError.code === 11000) {
        return res.status(400).json({ message: 'Transaction reference already processed' });
      }
      throw txError;
    }

    // Note: The user paid via Paystack (card), so we DO NOT deduct from their wallet.
        
    // Update ride with payment status
    ride.paymentStatus = 'completed';
    ride.paymentReference = reference;
    ride.paymentMethod = 'card';
    await ride.save();

    return res.status(200).json({
      message: 'Ride payment verified successfully',
      walletBalance: user.wallet, // Wallet balance remains unchanged
      ride: ride
    });

  } catch (error) {
    console.error('Error verifying ride payment:', error.response?.data || error.message);
    return res.status(500).json({ message: 'Server error during verification', error: error.message });
  }
};

module.exports = { verifyWalletFunding, verifyInstallmentPayment, verifyRidePayment };
