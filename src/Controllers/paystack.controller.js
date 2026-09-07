const userModel = require('../Schemas/user.schema.js');
const transactionModel = require('../Schemas/transaction.mongoose.schema');
const installmentModel = require('../Schemas/installment.mongoose.schema');
const axios = require('axios');
const env = require('../Configs/env.js');
const INSTALLMENT_CONSTANTS = require('../Configs/installment.constants');
const {
  calculateNextAmountDue,
  getNextBusinessDay,
  calculateExpectedCompletionDate,
  formatInstallmentDashboardData
} = require('../Services/installment.service');
const { notifyAdmin, sendEmail } = require('../Services/installmentNotification.service');

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

/**
 * Initialize an installment payment (Deposit ₦500k or Daily ₦18k / adjusted balance)
 * Backend calculates and enforces exact payment amount.
 */
const initializeInstallmentPayment = async (req, res) => {
  try {
    const decodedToken = req.user;
    const user = await userModel.findById(decodedToken.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let installment = await installmentModel.findOne({ user: decodedToken.id });
    if (!installment) {
      return res.status(404).json({ message: 'No installment application found. Please complete profile setup first.' });
    }

    const expectedAmount = calculateNextAmountDue(installment);
    if (expectedAmount <= 0) {
      return res.status(400).json({ message: 'Installment plan is already completed in full.' });
    }

    const isDeposit = !installment.depositPaid;
    const paymentType = isDeposit ? 'deposit' : 'installment';
    const reference = `NVCR_${isDeposit ? 'DEP' : 'INST'}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

    let authorizationUrl = null;
    let accessCode = null;

    // Call Paystack API if secret key is configured
    if (PAYSTACK_SECRET_KEY) {
      try {
        const paystackInitRes = await axios.post(
          'https://api.paystack.co/transaction/initialize',
          {
            email: user.email,
            amount: expectedAmount * 100, // in kobo
            reference: reference,
            metadata: {
              userId: user._id.toString(),
              installmentId: installment._id.toString(),
              paymentType: paymentType,
              amountInNaira: expectedAmount,
              custom_fields: [
                {
                  display_name: "Payment Type",
                  variable_name: "payment_type",
                  value: isDeposit ? "Maruwa Initial Deposit" : "Maruwa Daily Installment"
                },
                {
                  display_name: "Customer Name",
                  variable_name: "customer_name",
                  value: `${user.firstname} ${user.lastname}`
                }
              ]
            }
          },
          {
            headers: {
              Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (paystackInitRes.data?.status) {
          authorizationUrl = paystackInitRes.data.data.authorization_url;
          accessCode = paystackInitRes.data.data.access_code;
        }
      } catch (paystackError) {
        console.error('Paystack initialization error:', paystackError.response?.data || paystackError.message);
      }
    }

    return res.status(200).json({
      message: 'Payment initialized successfully',
      reference,
      amount: expectedAmount,
      amountInKobo: expectedAmount * 100,
      paymentType,
      isDeposit,
      email: user.email,
      authorizationUrl,
      accessCode
    });

  } catch (error) {
    console.error('Error initializing installment payment:', error);
    return res.status(500).json({ message: 'Server error initializing payment', error: error.message });
  }
};

/**
 * Authoritatively verify installment payment server-side with Paystack & enforce idempotency.
 */
const verifyInstallmentPayment = async (req, res) => {
  try {
    const { reference } = req.body;
    const decodedToken = req.user;

    if (!reference) {
      return res.status(400).json({ message: 'Transaction reference is required' });
    }

    const user = await userModel.findById(decodedToken.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const installment = await installmentModel.findOne({ user: decodedToken.id });
    if (!installment) {
      return res.status(404).json({ message: 'No installment plan found' });
    }

    let verifiedAmountNaira = 0;
    let paymentChannel = 'paystack';

    // Verify directly with Paystack API if secret key is present
    if (PAYSTACK_SECRET_KEY) {
      const paystackResponse = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
        }
      });

      const paymentData = paystackResponse.data.data;
      if (paymentData.status !== 'success') {
        return res.status(400).json({ message: 'Payment verification failed: transaction was not successful' });
      }

      verifiedAmountNaira = paymentData.amount / 100;
      paymentChannel = paymentData.channel || 'paystack';
    } else {
      // Development fallback if key not yet supplied
      verifiedAmountNaira = calculateNextAmountDue(installment);
    }

    // Determine expected payment type
    const isDeposit = !installment.depositPaid;

    // Daily installments cannot be paid until admin assigns a vehicle
    if (!isDeposit && !installment.vehicleAssigned) {
      return res.status(400).json({
        message: 'Your Maruwa has not been assigned yet. Daily installment payments will open once a vehicle is assigned to your plan.'
      });
    }

    const expectedDue = calculateNextAmountDue(installment);

    // Validate that user did not tamper with or pay less than expected amount
    if (verifiedAmountNaira < expectedDue) {
      return res.status(400).json({
        message: `Incorrect payment amount. Expected ₦${expectedDue.toLocaleString()} but received ₦${verifiedAmountNaira.toLocaleString()}.`
      });
    }

    // ATOMIC IDEMPOTENCY LOCK: Insert into Transaction collection. Throws E11000 if already processed.
    try {
      await transactionModel.create({
        user: user._id,
        type: 'debit',
        amount: verifiedAmountNaira,
        description: isDeposit
          ? `Initial Deposit (₦${verifiedAmountNaira.toLocaleString()}) for Maruwa ${installment.vehicleName}`
          : `Daily Installment (₦${verifiedAmountNaira.toLocaleString()}) for Maruwa ${installment.vehicleName}`,
        status: 'completed',
        reference: reference
      });
    } catch (txError) {
      if (txError.code === 11000) {
        return res.status(400).json({ message: 'This transaction reference has already been processed.' });
      }
      throw txError;
    }

    const now = new Date();

    // UPDATE INSTALLMENT PLAN BASED ON PAYMENT TYPE
    if (isDeposit) {
      installment.depositPaid = true;
      installment.depositPaidAt = now;
      installment.depositReference = reference;
      // Plan stays inactive (no schedule/countdown) until admin assigns a vehicle
      installment.status = INSTALLMENT_CONSTANTS.STATUS.AWAITING_VEHICLE_ASSIGNMENT;
      installment.paidAmount = (installment.paidAmount || 0) + verifiedAmountNaira;
      installment.remainingBalance = Math.max(0, INSTALLMENT_CONSTANTS.TOTAL_CONTRACT_AMOUNT - installment.paidAmount);
      installment.completedDays = 0;
      installment.consecutiveDefaults = 0;

      installment.paymentsLog.push({
        date: now,
        scheduledDate: now,
        amount: verifiedAmountNaira,
        type: 'deposit',
        status: 'paid',
        reference: reference,
        paymentMethod: paymentChannel,
        paidAt: now
      });

      await installment.save();

      // Trigger Admin & User Notifications for Deposit
      notifyAdmin('deposit_paid', {
        user: `${user.firstname} ${user.lastname}`,
        userId: user._id,
        phone: user.phone,
        reference: reference
      }).catch(console.error);

      sendEmail(
        user.email,
        'NovaRide: Maruwa Deposit Confirmed - Awaiting Vehicle Assignment!',
        `<div style="font-family: Arial; padding: 20px; background: #111; color: #fff; border-radius: 10px;">
          <h2 style="color: #f97316;">🎉 Deposit Confirmed!</h2>
          <p>Hello ${user.firstname}, your initial deposit of <b>₦${verifiedAmountNaira.toLocaleString()}</b> has been received and verified.</p>
          <p>Our team will now assign your Maruwa. Daily installment payments of ₦18,000 will begin once your vehicle is assigned.</p>
        </div>`
      ).catch(console.error);

    } else {
      // Daily installment payment
      const newPaidAmount = Math.min(INSTALLMENT_CONSTANTS.TOTAL_CONTRACT_AMOUNT, (installment.paidAmount || 0) + verifiedAmountNaira);
      installment.paidAmount = newPaidAmount;
      installment.remainingBalance = Math.max(0, INSTALLMENT_CONSTANTS.TOTAL_CONTRACT_AMOUNT - newPaidAmount);
      installment.completedDays = (installment.completedDays || 0) + 1;
      installment.consecutiveDefaults = 0;

      // Advance schedule to next business day
      installment.nextPaymentDate = getNextBusinessDay(now);

      const isPlanCompleted = installment.paidAmount >= INSTALLMENT_CONSTANTS.TOTAL_CONTRACT_AMOUNT;
      if (isPlanCompleted) {
        installment.status = INSTALLMENT_CONSTANTS.STATUS.COMPLETED;
      }

      installment.paymentsLog.push({
        date: now,
        scheduledDate: now,
        amount: verifiedAmountNaira,
        type: 'installment',
        status: 'paid',
        reference: reference,
        paymentMethod: paymentChannel,
        paidAt: now
      });

      await installment.save();

      // Trigger Admin & User Notifications
      if (isPlanCompleted) {
        notifyAdmin('plan_completed', {
          user: `${user.firstname} ${user.lastname}`,
          userId: user._id,
          phone: user.phone,
          reference: reference
        }).catch(console.error);

        sendEmail(
          user.email,
          '🏆 Congratulations! You Own Your Maruwa in Full!',
          `<div style="font-family: Arial; padding: 20px; background: #111; color: #fff; border-radius: 10px;">
            <h2 style="color: #22c55e;">🏆 CONTRACT COMPLETED!</h2>
            <p>Hello ${user.firstname}, you have successfully paid the entire <b>₦7,500,000</b> target for your Maruwa!</p>
            <p>Our team will contact you for official title and vehicle handover procedures.</p>
          </div>`
        ).catch(console.error);
      } else {
        notifyAdmin('installment_paid', {
          user: `${user.firstname} ${user.lastname}`,
          amount: verifiedAmountNaira,
          totalPaid: installment.paidAmount,
          reference: reference
        }).catch(console.error);
      }
    }

    // Add to user installment history
    user.installmentHistory.push({
      date: now,
      amount: verifiedAmountNaira,
      type: isDeposit ? 'deposit' : 'installment',
      status: 'completed',
      transactionId: reference
    });
    await user.save();

    const formattedData = formatInstallmentDashboardData(installment, user);

    return res.status(200).json({
      message: `${isDeposit ? 'Deposit' : 'Installment'} payment verified successfully`,
      installment: formattedData
    });

  } catch (error) {
    console.error('Error verifying installment payment:', error.response?.data || error.message);
    return res.status(500).json({ message: 'Server error during verification', error: error.message });
  }
};

module.exports = {
  verifyWalletFunding,
  initializeInstallmentPayment,
  verifyInstallmentPayment
};
