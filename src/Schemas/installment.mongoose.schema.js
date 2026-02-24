// Create schema for Installment model using Mongoose
const mongoose = require('mongoose');
const installmentSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    vehicleName: { type: String, required: true },
    vehiclePlate: { type: String, required: true },
    vehicleImage: { type: String },
    totalAmount: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    nextPaymentDate: { type: Date, required: true },
    installmentPlan: { type: String, required: true }, // e.g., 'Weekly', 'Monthly'
    status: { type: String, enum: ['active', 'completed', 'defaulted'], default: 'active' },
    specs: {
        engine: String,
        transmission: String,
        fuelType: String,
        mileage: String
    }
}, { timestamps: true });

const installmentModel = mongoose.model('Installment', installmentSchema);

module.exports = installmentModel;