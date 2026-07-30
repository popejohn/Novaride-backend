const app = require('./app');
const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const jwt = require('jsonwebtoken');
const redis = require('redis');
const { upstashRedis, upstashRedisReady } = require('./src/Configs/upstash');
const connectDB = require('./src/Configs/connection');
const env = require('./src/Configs/env');
const { expirePendingRides } = require('./src/Services/rideLifecycle.service');
// Global error handlers for uncaught exceptions and unhandled rejections
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  // Redis connection errors handling based on environment
  if (err && (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.message?.includes('ECONNREFUSED') || err.message?.includes('ENOTFOUND') || err.message?.includes('Redis'))) {
    if (env.NODE_ENV === 'production') {
      console.error('❌ CRITICAL: Redis connection failed in production. Redis is required for scaling and rate limiting.');
      gracefulShutdown('Redis connection failure in production');
      return;
    } else {
      console.warn('⚠️ Redis error ignored in development mode; continuing in fallback mode.');
      return;
    }
  }
  // Database connection errors in development should be logged but not crash app.
  if (err && err.name === 'MongoParseError') {
    console.warn('MongoDB connection issue detected in development; app continues with offline mode.');
    return;
  }
  gracefulShutdown('unhandledRejection');
});
// Connect to MongoDB
(async () => {
  try {
    await connectDB();
  } catch (error) {
    console.error('Failed to initialize MongoDB connection:', error);
  }
})();
// Use shared Upstash Redis client for socket rate limiting
const socketRedis = upstashRedis;
const socketRedisReady = upstashRedisReady;

if (env.NODE_ENV === 'production' && (!socketRedis || !socketRedisReady)) {
  console.error('❌ CRITICAL: Upstash Redis is required in production for socket rate limiting. Exiting.');
  process.exit(1);
} else if (!socketRedisReady) {
  console.warn('⚠️ Running in development mode with socket rate limiting disabled (Upstash Redis not configured)');
} else {
  console.log('✅ Shared Upstash Redis client configured for socket rate limiting');
}
// Create HTTP server
const server = http.createServer(app);
// Initialize Socket.io with connection limits and error handling
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests without an Origin header
      // (Postman, mobile apps, server-to-server requests)
      if (!origin) {
        return callback(null, true);
      }
      const allowedOrigins = [
        process.env.FRONTEND_URL,
        process.env.ADMIN_CLIENT_URL
      ].filter(Boolean);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST']
  },
  // Connection limits to prevent abuse
  maxHttpBufferSize: 1e6, // 1MB max message size
  pingTimeout: 60000, // 60 seconds
  pingInterval: 25000, // 25 seconds
  maxConnections: 1000 // Limit concurrent connections
});
// Set up Redis adapter for Socket.IO (required for multi-instance pub/sub)
// Uses UPSTASH_REDIS_TCP_URL (rediss://) — get this from your Upstash dashboard
// under "Connect" > "ioredis" or "node-redis" (the TCP endpoint, not the REST URL).
// Falls back to legacy REDIS_URL if UPSTASH_REDIS_TCP_URL is not set.
const socketAdapterUrl = env.UPSTASH_REDIS_TCP_URL || env.REDIS_URL;
if (socketAdapterUrl) {
  try {
    const pubClient = redis.createClient({ url: socketAdapterUrl });
    const subClient = pubClient.duplicate();
    pubClient.on('error', (err) => {
      console.warn('⚠️ Redis pub client error:', err.message);
      if (env.NODE_ENV === 'production') {
        console.error('❌ CRITICAL: Redis pub client failed in production');
      }
    });
    subClient.on('error', (err) => {
      console.warn('⚠️ Redis sub client error:', err.message);
      if (env.NODE_ENV === 'production') {
        console.error('❌ CRITICAL: Redis sub client failed in production');
      }
    });
    Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      console.log('✅ Socket.IO Redis Adapter configured (Upstash TCP)');
    }).catch((err) => {
      console.error('❌ Socket.IO Redis adapter connection failed:', err.message);
      if (env.NODE_ENV === 'production') {
        console.error('❌ CRITICAL: Cannot configure Redis adapter in production.');
        process.exit(1);
      } else {
        console.warn('⚠️ Continuing with default in-memory adapter for development');
      }
    });
  } catch (err) {
    console.error('❌ Error setting up Redis adapter:', err.message);
    if (env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
} else {
  if (env.NODE_ENV === 'production') {
    console.error('❌ CRITICAL: UPSTASH_REDIS_TCP_URL is not set. Socket.IO adapter requires a TCP Redis URL in production.');
    process.exit(1);
  }
  console.warn('ℹ️ UPSTASH_REDIS_TCP_URL not set. Using in-memory Socket.IO adapter (single-instance / development only).');
}
// Attach io to app for access in controllers
app.set('io', io);
// Socket.io connection tracking
const connectedSockets = new Map();
let connectionCount = 0;
const MAX_CONNECTIONS = 1000;
// Handle Socket.io connections with error handling and rate limiting
io.on('connection', (socket) => {
  // Authenticate socket via JWT token in handshake
  const token = socket.handshake.auth && socket.handshake.auth.token ? socket.handshake.auth.token : (socket.handshake.query && socket.handshake.query.token);
  if (!token) {
    socket.emit('error', { message: 'Authentication token required' });
    socket.disconnect(true);
    return;
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
  } catch (authError) {
    console.warn('Socket authentication failed:', authError.message);
    socket.emit('error', { message: 'Invalid or expired token' });
    socket.disconnect(true);
    return;
  }
  // Check connection limit
  if (connectionCount >= MAX_CONNECTIONS) {
    socket.emit('error', { message: 'Server at capacity, please try again later' });
    socket.disconnect(true);
    return;
  }
  connectionCount++;
  connectedSockets.set(socket.id, socket);
  console.log(`--- Socket Connected --- ID: ${socket.id} (Total: ${connectionCount})`);
  // Handle connection errors
  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
  // Join a room based on the user's role/id with error handling
  socket.on('join', (userId) => {
    try {
      if (!userId || typeof userId !== 'string') {
        socket.emit('error', { message: 'Invalid user ID' });
        return;
      }
      socket.join(userId);
      console.log(`[Socket] User ${userId} joined personal room`);
    } catch (error) {
      console.error(`Error joining room for user ${userId}:`, error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });
  // Join a specific ride room for live tracking with error handling
  socket.on('joinRide', (rideId) => {
    try {
      if (!rideId || typeof rideId !== 'string') {
        socket.emit('error', { message: 'Invalid ride ID' });
        return;
      }

      socket.join(rideId);

      console.log(
        `[Socket] Ride Room Joined: ${rideId}. Members:`,
        [...(io.sockets.adapter.rooms.get(rideId) || [])]
      );
    } catch (error) {
      console.error(`Error joining ride room ${rideId}:`, error);
      socket.emit('error', { message: 'Failed to join ride room' });
    }
  });
  // Join a support chat room
  socket.on('joinSupportChat', (chatId) => {
    try {
      if (!chatId || typeof chatId !== 'string') {
        socket.emit('error', { message: 'Invalid chat ID' });
        return;
      }
      socket.join(`chat:${chatId}`);
      console.log(`[Socket] Joined Support Chat Room: chat:${chatId}`);
    } catch (error) {
      console.error(`Error joining support chat room ${chatId}:`, error);
      socket.emit('error', { message: 'Failed to join support chat room' });
    }
  });
  // Handle rider location updates with rate limiting and batching
  socket.on('updateLocation', async (data) => {
    try {
      const userKey = socket.user && socket.user.id ? `location:${socket.user.id}` : `location:${socket.id}`;
      const maxPerMinute = 20; // Reduced from 30 for better scalability
      const ttlSeconds = 60;
      // Redis-only rate limiting (Redis is required in production)
      if (!socketRedisReady || !socketRedis) {
        if (env.NODE_ENV === 'production') {
          socket.emit('error', { message: 'Redis connection unavailable' });
          return;
        }
        console.warn('⚠️ Rate limiting bypassed: Redis connection unavailable in development');
      } else {
        try {
          const counter = await socketRedis.incr(userKey);
          if (counter === 1) {
            await socketRedis.expire(userKey, ttlSeconds);
          }
          if (counter > maxPerMinute) {
            socket.emit('error', { message: 'Too many location updates, please slow down' });
            return;
          }
        } catch (redisErr) {
          console.error('Redis rate limit check failed:', redisErr);
          socket.emit('error', { message: 'Rate limiting service unavailable' });
          return;
        }
      }
      const { rideId, location } = data;
      if (!rideId || !location || typeof location !== 'object' ||
        location.lat === undefined || location.lng === undefined) {
        socket.emit('error', { message: 'Invalid location data' });
        return;
      }
      // Broadcast to everyone in the ride room EXCEPT the sender
      socket.to(rideId).emit('driverLocationUpdate', { location, timestamp: Date.now() });
      console.log(`[Socket] Location Broadcast for Ride ${rideId}`);
    } catch (error) {
      console.error(`Error updating location for socket ${socket.id}:`, error);
      socket.emit('error', { message: 'Failed to update location' });
    }
  });
  socket.on('disconnect', (reason) => {
    connectionCount--;
    connectedSockets.delete(socket.id);
    console.log(`User disconnected: ${socket.id} (Reason: ${reason}) (Total: ${connectionCount})`);
  });
  // Handle connection timeout
  socket.on('connect_timeout', () => {
    console.log(`Connection timeout for socket: ${socket.id}`);
    socket.disconnect(true);
  });
});
// Graceful shutdown handling
function gracefulShutdown(signal) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  // Stop accepting new connections
  server.close((err) => {
    if (err) {
      console.error('Error during server shutdown:', err);
      process.exit(1);
    }
    console.log('HTTP server closed.');
    // Close all socket connections
    io.close(() => {
      console.log('Socket.io server closed.');
      // Close database connections
      const mongoose = require('mongoose');
      mongoose.connection.close(() => {
        console.log('Database connection closed.');
        process.exit(0);
      });
    });
  });
  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
// Define a simple route
app.get('/', (req, res) => {
  res.send('API is running with Socket.io...');
});
// Start the server
const PORT = process.env.PORT || 5000;
setInterval(() => {
  expirePendingRides(io).catch((error) => {
    console.error('Ride expiration job failed:', error.message);
  });
}, 60 * 1000);

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
});
