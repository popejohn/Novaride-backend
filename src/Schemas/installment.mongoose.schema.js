const mongoose = require('mongoose');
const { TOTAL_CONTRACT_AMOUNT, DEPOSIT_AMOUNT, DAILY_INSTALLMENT_AMOUNT, TOTAL_SCHEDULED_DAYS, STATUS } = require('../Configs/installment.constants');

const installmentPaymentLogSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  scheduledDate: { type: Date },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['deposit', 'installment'], default: 'installment' },
  status: { type: String, enum: ['pending', 'paid', 'overdue', 'failed'], default: 'paid' },
  reference: { type: String, required: true },
  paymentMethod: { type: String, default: 'paystack' },
  paidAt: { type: Date, default: Date.now }
}, { _id: true });

const installmentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  vehicleName: { type: String, default: 'Tricycle (Maruwa) TVS King Deluxe' },
  vehiclePlate: { type: String, default: 'PENDING_ASSIGNMENT' },
  vehicleType: { type: String, default: 'Tricycle' },
  vehicleImage: { type: String, default: '' },
  vehicleModel: { type: String, default: 'TVS King 200cc' },
  vehicleColor: { type: String, default: 'Yellow' },
  vehicleOwnership: { type: String, enum: ['Company', 'Personal'], default: 'Company' },
  vehicleAssigned: { type: Boolean, default: false },
  vehicleAssignedAt: { type: Date },
  
  // Financial metrics
  totalAmount: { type: Number, default: TOTAL_CONTRACT_AMOUNT },
  depositAmount: { type: Number, default: DEPOSIT_AMOUNT },
  paidAmount: { type: Number, default: 0 },
  remainingBalance: { type: Number, default: TOTAL_CONTRACT_AMOUNT },
  dailyInstallment: { type: Number, default: DAILY_INSTALLMENT_AMOUNT },
  
  // Schedule & progress
  totalScheduledDays: { type: Number, default: TOTAL_SCHEDULED_DAYS },
  completedDays: { type: Number, default: 0 },
  consecutiveDefaults: { type: Number, default: 0 },
  depositPaid: { type: Boolean, default: false },
  depositPaidAt: { type: Date },
  depositReference: { type: String },
  
  startDate: { type: Date },
  nextPaymentDate: { type: Date },
  expectedCompletionDate: { type: Date },
  
  installmentPlan: { type: String, default: 'Maruwa Daily Ownership Plan (₦18,000 / day Mon-Fri)' },
  status: { 
    type: String, 
    enum: Object.values(STATUS), 
    default: STATUS.DEPOSIT_PENDING,
    index: true 
  },
  
  // Terms and conditions acceptance
  terms: {
    accepted: { type: Boolean, default: false },
    acceptedAt: { type: Date },
    termsVersion: { type: String }
  },
  
  // Stored Document references
  documents: {
    applicantPhoto: { type: String, default: '' },
    guarantor1Photo: { type: String, default: '' },
    guarantor2Photo: { type: String, default: '' },
    idDocument: { type: String, default: '' },
    idType: { type: String, default: '' },
    idNumber: { type: String, default: '' },
    driverLicense: { type: String, default: '' },
    driverLicenseNumber: { type: String, default: '' }
  },
  
  // Payments ledger
  paymentsLog: [installmentPaymentLogSchema],
  
  // Tracking for daily notifications/reminders
  lastReminderDate: { type: String }, // e.g. "YYYY-MM-DD" in Africa/Lagos
  remindersSentToday: { type: [Number], default: [] }, // e.g. [9, 13, 17]
  lastDefaultDate: { type: String }
}, { timestamps: true });

// Compound indexes for efficient querying
installmentSchema.index({ user: 1, status: 1 });
installmentSchema.index({ nextPaymentDate: 1, status: 1 });

const installmentModel = mongoose.model('Installment', installmentSchema);

module.exports = installmentModel;