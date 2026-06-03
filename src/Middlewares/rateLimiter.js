// Enhanced rate limiting middleware with Redis support for distributed scaling
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const Redis = require('redis');

// Redis client for rate limiting (uses REDIS_URL if available for TCP connections)
// Note: Upstash REST API is used for Socket.IO rate limiting in server.js
let redisClient;

try {
  // Only try to connect if REDIS_URL is set (not using Upstash REST API)
  if (process.env.REDIS_URL) {
    redisClient = Redis.createClient({
      url: process.env.REDIS_URL,
      socket: {
        connectTimeout: 60000,
        reconnectStrategy: false
      }
    });

    redisClient.on('error', (err) => {
      console.error('Redis client error:', err);
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis connected for rate limiting');
    });

    redisClient.connect().then(() => {
      console.log('✅ Redis connection established');
    }).catch((err) => {
      console.error('⚠️ Redis connection failed during init, using MemoryStore:', err);
      redisClient = null;
    });
  } else {
    console.log('ℹ️ REDIS_URL not set, using in-memory store for Express rate limiting');
  }
} catch (error) {
  console.warn('⚠️ Redis setup failed, using memory store:', error.message);
  redisClient = null;
}

// Key generator to avoid locking shared IP users and improve per-user fairness
const keyGenerator = (req/*, res*/) => {
  if (req.user && req.user.id) {
    return `user-${req.user.id}`;
  }
  if (req.ip) {
    return `ip-${req.ip}`;
  }
  return 'anonymous';
};

// Create store based on Redis availability
const createStore = () => {
  if (redisClient && (redisClient.status === 'ready' || redisClient.isOpen)) {
    try {
      return new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
        prefix: 'rl:',
      });
    } catch (storeErr) {
      console.warn('📊 RedisStore init failed, falling back to memory store:', storeErr);
      return undefined;
    }
  } else {
    console.warn('📊 Using memory store for rate limiting (Redis not available)');
    return undefined; // Uses default memory store
  }
};

// General API rate limiter (higher limits for general endpoints)
const generalLimiter = rateLimit({
  store: createStore(),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each key to 100 requests per windowMs
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later'
  },
  skip: (req, res) => {
    // Skip rate limiting for health checks
    return req.path.startsWith('/health');
  },
  handler: (req, res) => {
    console.warn(`Rate limit exceeded for key: ${keyGenerator(req)}, Path: ${req.path}`);
    res.status(429).json({
      success: false,
      message: 'Too many requests, please try again later'
    });
  }
});

// Strict rate limiter for authentication endpoints
const authLimiter = rateLimit({
  store: createStore(),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each key to 10 failed auth attempts per windowMs
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again after 15 minutes'
  },
  skipFailedRequests: false, // Count failed requests
  skipSuccessfulRequests: true, // Don't count successful logins
  handler: (req, res) => {
    console.warn(`Auth rate limit exceeded for key: ${keyGenerator(req)}`);
    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts, please try again after 15 minutes'
    });
  }
});

// Rate limiter for payment endpoints (moderate)
const paymentLimiter = rateLimit({
  store: createStore(),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // limit each IP to 20 payment requests per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many payment requests, please try again later'
  },
  handler: (req, res) => {
    console.warn(`Payment rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Too many payment requests, please try again later'
    });
  }
});

// Rate limiter for ride booking (moderate)
const rideLimiter = rateLimit({
  store: createStore(),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // limit each IP to 30 ride requests per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many ride requests, please try again later'
  },
  handler: (req, res) => {
    console.warn(`Ride rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Too many ride requests, please try again later'
    });
  }
});

// Strict rate limiter for sensitive operations (password reset, etc.)
const sensitiveLimiter = rateLimit({
  store: createStore(),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // limit each IP to 3 sensitive operations per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many sensitive operations, please try again later'
  },
  handler: (req, res) => {
    console.warn(`Sensitive operation rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Too many sensitive operations, please try again later'
    });
  }
});

// Create account limiter (very strict)
const createAccountLimiter = rateLimit({
  store: createStore(),
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 3, // limit each IP to 3 account creations per day
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many account creation attempts, please try again tomorrow'
  },
  handler: (req, res) => {
    console.warn(`Account creation rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Too many account creation attempts, please try again tomorrow'
    });
  }
});

// Graceful shutdown for Redis
process.on('SIGTERM', () => {
  if (redisClient) {
    redisClient.quit();
  }
});

process.on('SIGINT', () => {
  if (redisClient) {
    redisClient.quit();
  }
});

module.exports = {
  generalLimiter,
  authLimiter,
  paymentLimiter,
  rideLimiter,
  sensitiveLimiter,
  createAccountLimiter
};