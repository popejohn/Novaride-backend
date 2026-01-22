const mongoose = require('mongoose');
const env = require('./env');

// Function to connect to MongoDB using Mongoose
const connectDB = async () => {
  try {
    await mongoose.connect(env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1); // Exit process with failure
  }
};


module.exports = connectDB;