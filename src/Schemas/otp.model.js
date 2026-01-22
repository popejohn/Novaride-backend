const mongoose = require('mongoose')


// create a schema for token storage for a user
const otpSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    otp: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 65 // token will expire in 1 hour
    }
})


const otpModel = mongoose.model('Token', otpSchema);


module.exports = {otpModel};
