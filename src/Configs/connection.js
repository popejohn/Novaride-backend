const mongoose = require('mongoose');
const env = require('./env');

// Function to connect to MongoDB using Mongoose
const connectDB = async () => {
  try {
    await mongoose.connect(env.MONGODB_URI, {
      maxPoolSize: env.DB_MAX_POOL_SIZE || 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: env.DB_SOCKET_TIMEOUT || 45000, // Close sockets after 45 seconds of inactivity
      bufferCommands: false, // Disable mongoose buffering
    });

    console.log('✅ MongoDB connected successfully');

    // Add connection event listeners
    mongoose.connection.on('connected', () => {
      console.log('✅ MongoDB connected successfully');
    });

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err.message);
      if (env.NODE_ENV === 'production') {
        console.error('❌ CRITICAL: MongoDB connection failed in production');
      }
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
      if (env.NODE_ENV === 'production') {
        console.error('❌ CRITICAL: MongoDB disconnected in production');
      }
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed through app termination');
      process.exit(0);
    });

    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ CRITICAL: Cannot start in production without MongoDB. Exiting.');
      process.exit(1);
    } else {
      console.warn('⚠️ Continuing in development mode without a database connection.');
      return false;
    }
  }
};

module.exports = connectDB;