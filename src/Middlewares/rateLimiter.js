// Enhanced rate limiting middleware with Upstash Redis support for distributed scaling
const rateLimit = require('express-rate-limit');
const { upstashRedis, upstashRedisReady } = require('../Configs/upstash');
const env = require('../Configs/env');

// Key generator to avoid locking shared IP users and improve per-user fairness
const keyGenerator = (req) => {
  if (req.user && req.user.id) {
    return `user-${req.user.id}`;
  }
  if (req.ip) {
    return `ip-${req.ip}`;
  }
  return 'anonymous';
};

class UpstashRedisStore {
  constructor(client, prefix = 'rl:') {
    this.client = client;
    this.prefix = prefix;
  }

  init(options) {

    this.windowMs = options.windowMs;
  }

  async increment(key) {
    if (!this.client) {
      console.warn('⚠️ Upstash client not ready, bypassing count increment');
      return {
        totalHits: 1,
        resetTime: new Date(Date.now() + this.windowMs)
      };
    }

    const redisKey = `${this.prefix}${key}`;
    const ttlSeconds = Math.ceil(this.windowMs / 1000);

    try {
      const p = this.client.pipeline();
      p.incr(redisKey);
      p.ttl(redisKey);
      const [current, ttl] = await p.exec();

      if (ttl === -1 || current === 1) {
        await this.client.expire(redisKey, ttlSeconds);
      }

      const actualTtl = (ttl && ttl > 0) ? ttl : ttlSeconds;

      return {
        totalHits: current,
        resetTime: new Date(Date.now() + (actualTtl * 1000))
      };
    } catch (err) {
      console.error(`Upstash Redis increment failed for key ${redisKey}:`, err);
      // Fallback: fail open so application doesn't completely block users on Redis issues
      return {
        totalHits: 1,
        resetTime: new Date(Date.now() + this.windowMs)
      };
    }
  }

  async decrement(key) {
    if (!this.client) return;
    const redisKey = `${this.prefix}${key}`;
    try {
      await this.client.decr(redisKey);
    } catch (err) {
      console.error(`Upstash Redis decrement failed for key ${redisKey}:`, err);
    }
  }

  async resetKey(key) {
    if (!this.client) return;
    const redisKey = `${this.prefix}${key}`;
    try {
      await this.client.del(redisKey);
    } catch (err) {
      console.error(`Upstash Redis resetKey failed for key ${redisKey}:`, err);
    }
  }
}

// Create store based on Redis availability
const createStore = (prefix) => {
  if (upstashRedisReady && upstashRedis) {
    return new UpstashRedisStore(upstashRedis, prefix);
  } else {
    if (env.NODE_ENV === 'production') {
      console.error('❌ CRITICAL: Upstash Redis not available in production for rate limiting.');
    } else {
      console.warn('📊 Using memory store fallback for rate limiting (Upstash Redis not available)');
    }
    return undefined; // Uses default in-memory store of express-rate-limit
  }
};

// General API rate limiter (higher limits for general endpoints)
const generalLimiter = rateLimit({
  store: createStore('rl:general:'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each key to 100 requests per windowMs
  keyGenerator,
  validate: false,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later'
  },
  skip: (req) => {
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
  store: createStore('rl:auth:'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each key to 10 failed auth attempts per windowMs
  keyGenerator,
  validate: false,
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
  store: createStore('rl:payment:'),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // limit each IP to 20 payment requests per hour
  keyGenerator,
  validate: false,
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
  store: createStore('rl:ride:'),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // limit each IP to 30 ride requests per hour
  keyGenerator,
  validate: false,
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
  store: createStore('rl:sensitive:'),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // limit each IP to 3 sensitive operations per hour
  keyGenerator,
  validate: false,
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
  store: createStore('rl:createAccount:'),
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 3, // limit each IP to 3 account creations per day
  keyGenerator,
  validate: false,
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

module.exports = {
  generalLimiter,
  authLimiter,
  paymentLimiter,
  rideLimiter,
  sensitiveLimiter,
  createAccountLimiter
};