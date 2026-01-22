// Configure env variables and export after validating required fields using envalid
require('dotenv').config();
const { cleanEnv, str, port, bool } = require('envalid');


const env = cleanEnv(process.env, {
  MONGODB_URI: str(),
  PORT: port({ default: 5000 }),   
    JWT_SECRET: str(),
    NODE_ENV: str({ choices: ['development', 'production', 'test'], default: 'development' }),
    KUDI_SMS_KEY: str(),
    RABBITMQ_URL: str(),
    CLOUDINARY_URL: str(),
});



module.exports = env;

