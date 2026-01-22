const mongoose = require('mongoose');

// Restructured userSchema to accommodate role-based profiles
const userSchema = new mongoose.Schema({
    firstname: {type: String, required: true},
    lastname: {type:String, required: true},
    password: {type: String, required: true},
    phone: {type: String, required: true, unique: true},
    //Role is an array to support multiple roles per user
    role: {type: [String], required: true, enum: ['passenger', 'rider', 'installment']},
    // Rider-specific fields
    profilePic: {type: String},
    dateOfBirth: {type: Date},
    address: {type: String},
    profileCompleted: {type: Boolean, default: false},
}, { timestamps: true });



const userModel = mongoose.model('User', userSchema);


module.exports = userModel;