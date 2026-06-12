// Use BESTBULK_SMS_KEY from env variables to send OTP via BestBulkSMS API
const axios = require('axios');
const env = require('../Configs/env');

const BESTBULK_URL = "https://www.bestbulksms.com.ng/api/sms/send";
const BESTBULK_SENDER_ID = env.BESTBULK_SENDER_ID || 'NOVARIDE';

async function sendOTP(OTP, recipientNumber) {
  // Ensure recipientNumber is an array
  const recipients = Array.isArray(recipientNumber) ? recipientNumber : [recipientNumber];

  // Production mode: Send actual SMS
  const payload = {
    sender_id: BESTBULK_SENDER_ID,
    to: recipients,
    message: `Verify it's you: ${OTP}`,
    route: "standard",
    source_url: `${env.BASE_URL}/api/auth/forgot-password`, // Optional: Add your source URL for better deliverability
  };

  try {
    const response = await axios.post(BESTBULK_URL, payload, {
      headers: {
        Authorization: `Bearer ${env.BESTBULK_SMS_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000, // 30 second timeout
    });

    console.log("BestBulkSMS API Response:", response.data);
    return response.data;
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      console.error('BestBulkSMS Error: request timeout');
      throw new Error('BestBulkSMS request timed out');
    }
    
    const errorMessage = error.response?.data || error.message;
    console.error('BestBulkSMS Error:', errorMessage);
    throw new Error(`BestBulkSMS Error: ${JSON.stringify(errorMessage)}`);
  }
}

module.exports = {
    sendOTP
}