const { Redis } = require('@upstash/redis');
const env = require('./env');

let upstashRedis = null;
let upstashRedisReady = false;

if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    upstashRedis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });

    upstashRedisReady = true;
    console.log('✅ Upstash Redis client initialized successfully');

    // TEMPORARY CONNECTION TEST
    (async () => {
      try {
        await upstashRedis.set('startup-test', 'ok');
        const value = await upstashRedis.get('startup-test');
        console.log('✅ Redis connection test:', value);
      } catch (err) {
        console.error('❌ Redis connection test failed:', err);
      }
    })();

  } catch (err) {
    console.error('❌ Upstash Redis client initialization failed:', err.message);
  }
} else {
  console.warn('⚠️ UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is missing');
}

module.exports = {
  upstashRedis,
  upstashRedisReady
};