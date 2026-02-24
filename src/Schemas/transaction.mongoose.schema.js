const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['credit', 'debit', 'funding', 'withdrawal'], required: true },
    amount: { type: Number, required: true },
    description: { type: String, required: true },
    rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'RideDetails' }, // Optional, for ride-related transactions
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' },
    reference: { type: String, unique: true }
}, { timestamps: true });

const transactionModel = mongoose.model('Transaction', transactionSchema);

module.exports = transactionModel;
