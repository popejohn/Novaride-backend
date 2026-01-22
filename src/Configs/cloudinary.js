const { v2: cloudinary } = require('cloudinary');
const env = require('./env');

// Parse CLOUDINARY_URL: cloudinary://api_key:api_secret@cloud_name
const url = env.CLOUDINARY_URL;
const api_key = url.split('://')[1].split(':')[0];
const api_secret = url.split(':')[2].split('@')[0];
const cloud_name = url.split('@')[1];

cloudinary.config({
  cloud_name,
  api_key,
  api_secret,
});

module.exports = cloudinary;