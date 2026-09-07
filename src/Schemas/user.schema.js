const mongoose = require('mongoose');

// Restructured userSchema to accommodate role-based profiles
const userSchema = new mongoose.Schema({
  firstname: { type: String, required: true },
  lastname: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  //Role is an array to support multiple roles per user
  role: { type: [String], required: true, enum: ['passenger', 'rider', 'installment'] },
  // Rider-specific fields
  profilePic: { type: String },
  dateOfBirth: { type: Date },
  address: { type: String },
  isSmsProtectionEnabled: { type: Boolean, default: false },
  // Legacy aggregate flag retained for existing consumers; role-specific flags drive authorization.
  profileCompleted: { type: Boolean, default: false },
  riderProfileCompleted: { type: Boolean, default: false },
  installmentProfileCompleted: { type: Boolean, default: false },
  notificationSettings: {
    rideRequests: { type: Boolean, default: true },
    paymentAlerts: { type: Boolean, default: true },
    promotions: { type: Boolean, default: false },
    securityAlerts: { type: Boolean, default: true },
    rideUpdates: { type: Boolean, default: true }
  },
  privacySettings: {
    shareRideHistory: { type: Boolean, default: false },
    allowLocationTracking: { type: Boolean, default: true },
    receiveMarketingEmails: { type: Boolean, default: false }
  },
  wallet: { type: Number, default: 0 },
  // Installment-specific fields
  installmentProfile: {
    personal: {
      firstname: { type: String },
      lastname: { type: String },
      email: { type: String },
      phone: { type: String },
      dateOfBirth: { type: Date },
      gender: { type: String },
      maritalStatus: { type: String },
      address: { type: String },
      city: { type: String },
      state: { type: String },
      stateOfOrigin: { type: String },
      lga: { type: String }
    },
    nextOfKin: {
      name: { type: String },
      relationship: { type: String },
      phone: { type: String },
      address: { type: String }
    },
    vehicle: {
      vehicleType: { type: String, default: 'Tricycle' },
      plateNumber: { type: String, default: 'PENDING' },
      modelMake: { type: String, default: 'TVS King 200cc' },
      color: { type: String, default: 'Yellow' },
      ownership: { type: String, default: 'Company' }
    },
    guarantors: [{
      name: { type: String },
      phone: { type: String },
      relationship: { type: String },
      homeAddress: { type: String },
      address: { type: String },
      occupation: { type: String },
      officeAddress: { type: String },
      meansOfId: { type: String },
      idNumber: { type: String },
      photoUrl: { type: String },
      employment: {
        employerName: { type: String },
        jobTitle: { type: String },
        monthlyIncome: { type: Number }
      }
    }],
    documents: {
      applicantPhotoUrl: { type: String },
      idType: { type: String },
      idNumber: { type: String },
      idDocumentUrl: { type: String },
      driverLicenseNumber: { type: String },
      driverLicenseUrl: { type: String },
      idExpiry: { type: Date },
      bvn: { type: String },
      nin: { type: String },
      isBVNVerified: { type: Boolean, default: false },
      isNINVerified: { type: Boolean, default: false }
    },
    terms: {
      accepted: { type: Boolean, default: false },
      acceptedAt: { type: Date },
      termsVersion: { type: String }
    },
    references: [{
      name: { type: String },
      phone: { type: String },
      relationship: { type: String }
    }],
    paymentDetails: {
      bankName: { type: String },
      accountNumber: { type: String },
      accountName: { type: String }
    }
  },
  installmentPlan: {
    planName: { type: String },
    depositAmount: { type: Number },
    totalAmount: { type: Number },
    dailyInstallment: { type: Number },
    monthlyPayment: { type: Number },
    remainingMonths: { type: Number }
  },
  installmentHistory: [{
    date: { type: Date, default: Date.now },
    amount: { type: Number },
    type: { type: String, default: 'installment' },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    transactionId: { type: String }
  }]
}, { timestamps: true });



userSchema.index({ role: 1 });

const userModel = mongoose.model('User', userSchema);


module.exports = userModel;