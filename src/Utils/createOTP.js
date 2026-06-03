//The createOTP funcion should return a sixdigit number (not separated by dots)
const crypto = require('crypto');

function createOTP() {
  return crypto.randomInt(100000, 999999).toString();
}





module.exports = { createOTP };