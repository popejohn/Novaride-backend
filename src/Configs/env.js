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
  LOCATIONIQ_API_KEY: str(),
  NODE_ENV: str({ choices: ['development', 'production', 'staging'], default: 'development' }),
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
  // Redis for caching and rate limiting
  REDIS_URL: str({ default: '' }),
  // Upstash Redis REST API credentials
  UPSTASH_REDIS_REST_URL: str({ default: '' }),
  UPSTASH_REDIS_REST_TOKEN: str({ default: '' }),
  RESEND_API_KEY: str({ default: '' }),
  RESEND_FROM_EMAIL: str({ default: '' }),
  BASE_URL: str({ default: '' }),
});

module.exports = env;

