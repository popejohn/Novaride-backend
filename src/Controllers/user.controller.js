const userModel = require('../Schemas/user.schema.js');
const transactionModel = require('../Schemas/transaction.mongoose.schema');
const installmentModel = require('../Schemas/installment.mongoose.schema');

const getWalletData = async (req, res) => {
    try {
        const decodedToken = req.user;

        const user = await userModel.findById(decodedToken.id).select('wallet');
        if (!user) return res.status(404).json({ message: "User not found" });

        const transactions = await transactionModel.find({ user: decodedToken.id })
            .sort({ createdAt: -1 })
            .limit(20);

        return res.status(200).json({
            message: "Wallet data fetched successfully",
            walletBalance: user.wallet,
            transactions: transactions
        });
    } catch (error) {
        console.error('Error fetching wallet data:', error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getInstallmentData = async (req, res) => {
    try {
        const decodedToken = req.user;
        const installment = await installmentModel.findOne({ user: decodedToken.id });

        if (!installment) {
            return res.status(200).json({
                message: "No active installment plan found",
                installment: null
            });
        }

        return res.status(200).json({
            message: "Installment data fetched successfully",
            installment: installment
        });
    } catch (error) {
        console.error('Error fetching installment data:', error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

const saveInstallmentProfile = async (req, res) => {
    try {
        const decodedToken = req.user;
        const profileData = req.body;

        // In a real app, you'd save this to a Profile schema or update User
        await userModel.findByIdAndUpdate(decodedToken.id, {
            $set: { installmentProfile: profileData, profileCompleted: true }
        });

        return res.status(200).json({ message: "Installment profile saved successfully" });
    } catch (error) {
        console.error('Error saving installment profile:', error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

const saveInstallmentApplication = async (req, res) => {
    try {
        const decodedToken = req.user;
        const { vehicle, installmentPlan, application } = req.body;

        const newInstallment = new installmentModel({
            user: decodedToken.id,
            vehicleName: vehicle.name,
            vehiclePlate: "PENDING",
            vehicleImage: vehicle.image,
            totalAmount: installmentPlan.totalAmount,
            paidAmount: application.downPayment, // First payment is the down payment
            nextPaymentDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next week
            installmentPlan: `${installmentPlan.months} Months`,
            status: 'active',
            specs: vehicle.specs
        });

        await newInstallment.save();

        return res.status(200).json({ message: "Installment application submitted successfully" });
    } catch (error) {
        console.error('Error saving installment application:', error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

module.exports = { getWalletData, getInstallmentData, saveInstallmentProfile, saveInstallmentApplication };
