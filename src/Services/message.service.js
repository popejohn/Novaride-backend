// Use KUDI_SMS_KEY from env variables to send OTP via Kudi SMS API
const env = require('../Configs/env');

function sendOTP(OTP, recipientNumber) {
    var myHeaders = new Headers();
myHeaders.append("Content-Type", "application/json");

var raw = JSON.stringify({
  "token": process.env.KUDI_SMS_KEY,
  "senderID": "NovaCrest",
  "recipients": recipientNumber,
  "message": "verify it's you " + OTP,
  "gateway": "2"
});

var requestOptions = {
  method: 'POST',
  headers: myHeaders,
  body: raw,
  redirect: 'follow'
};

fetch("https://my.kudisms.net/api/sms", requestOptions)
  .then(response => response.text())
  .then(result => console.log(result))
  .catch(error => console.log('error', error));
}



module.exports = {
    sendOTP
}