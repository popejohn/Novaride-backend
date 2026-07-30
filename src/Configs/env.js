// Configure env variables and export after validating required fields using envalid
require('dotenv').config({
  path: `.env.${process.env.NODE_ENV || 'development'}`
});

const { cleanEnv, str, port, bool, num } = require('envalid');



const env = cleanEnv(process.env, {
  MONGODB_URI: str(),
  PORT: port({ default: 5000 }),
  JWT_SECRET: str(),
  FRONTEND_URL: str({default: ''}),
  ADMIN_CLIENT_URL: str({default: ''}),
  PAYSTACK_SECRET_KEY: str({ devDefault: '' }),
  GOOGLE_MAPS_API_KEY: str(),
  LOCATIONIQ_API_KEY: str({ default: '' }), // deprecated — remove after migration is verified
  NODE_ENV: str({ choices: ['development', 'production', 'staging', 'test'], default: 'development' }),
  BESTBULK_SMS_KEY: str(),
  BESTBULK_SENDER_ID: str({ default: 'NOVARIDE' }),
  RABBITMQ_URL: str(),
  CLOUDINARY_URL: str(),
  RABBITMQ_MANAGEMENT_URL: str({default: ''}),
  RABBITMQ_MANAGEMENT_USER: str({default: ''}),
  RABBITMQ_MANAGEMENT_PASS: str({default: ''}),
  // Database connection optimization
  DB_MAX_POOL_SIZE: num({ default: 10 }),
  DB_SOCKET_TIMEOUT: num({ default: 45000 }),
  // Redis for caching and rate limiting (legacy, prefer UPSTASH_REDIS_TCP_URL)
  REDIS_URL: str({ default: '' }),
  // Upstash Redis REST API credentials (used for HTTP-based rate limiting)
  UPSTASH_REDIS_REST_URL: str({ default: '' }),
  UPSTASH_REDIS_REST_TOKEN: str({ default: '' }),
  // Upstash Redis TCP URL (rediss://) — used for Socket.IO adapter pub/sub
  UPSTASH_REDIS_TCP_URL: str({ default: '' }),
  RESEND_API_KEY: str({ default: '' }),
  RESEND_FROM_EMAIL: str({ default: '' }),
  BASE_URL: str({ default: '' }),
  RIDE_REQUEST_TIMEOUT_MINUTES: num({ default: 5 }),
});

module.exports = env;

