const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema(
  {
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['superadmin', 'admin', 'support'], default: 'admin' }
  },
  { timestamps: true }
);

const Admin = mongoose.model('Admin', adminSchema);

module.exports = Admin;