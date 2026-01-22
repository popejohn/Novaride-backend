// Create schema for Installment model using Mongoose
const mongoose = require('mongoose');
const installmentSchema = new mongoose.Schema({
    paymentMethod: { type: String, required: true },
    installmentPlan: { type: String, required: true },
    // Add other installment-specific fields as needed
}, { timestamps: true });

const installmentModel = mongoose.model('Installment', installmentSchema);

module.exports = installmentModel;