const fs = require('fs');
const path = require('path');
const env = require('../Configs/env');
const { Resend } = require('resend');
const cloudinary = require('../Configs/cloudinary');

let cachedLogoUrl = null;

async function getLogoUrl() {
  if (cachedLogoUrl) return cachedLogoUrl;

  try {
    const logoPath = path.join(__dirname, '../../asset/nova.png');
    if (fs.existsSync(logoPath)) {
      const result = await cloudinary.uploader.upload(logoPath, {
        folder: 'email_assets',
        public_id: 'nova_logo',
        overwrite: false, // reuse existing upload on Cloudinary if already uploaded
      });
      cachedLogoUrl = result.secure_url;
      return cachedLogoUrl;
    }
  } catch (err) {
    console.error('Failed to upload/fetch logo from Cloudinary:', err.message);
  }

  // Fallback to standard Cloudinary CDN URL structure
  const cloudName = cloudinary.config().cloud_name;
  if (cloudName) {
    return `https://res.cloudinary.com/${cloudName}/image/upload/email_assets/nova_logo.png`;
  }

  return null;
}

// Resend-based email OTP sender.
// - Keeps `from` fixed as onboarding@resend.dev
// - Uses the user email passed in as `toEmail`
// - Sends an HTML email containing the OTP
// - In development or when RESEND_API_KEY is missing, it skips sending and logs the OTP.
async function sendOtpEmail(otp, toEmail) {
  if (!toEmail) {
    throw new Error('Email address is required');
  }

  const from = `Novaride <${process.env.RESEND_FROM_EMAIL}>` || 'onboarding@resend.dev';
  const apiKey = env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error('Resend API key (RESEND_API_KEY) is not configured');
  }

  const resend = new Resend(apiKey);
  const logoUrl = await getLogoUrl();

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.5; background: #0a0a0a; padding: 24px;">
      <div style="max-width: 600px; margin: 0 auto; background: #111111; border-radius: 16px; padding: 32px; border: 1px solid #222222;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
          <h2 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800;">NOVA<span style="color: #f97316;">RIDE</span></h2>
        </div>
        <p style="margin: 0 0 12px 0; color: #d4d4d4; font-size: 16px;">
          Your NovaRide OTP is:
        </p>
        <div style="margin: 0 0 20px 0; background-color: #1a1a1a; border: 2px solid #f97316; border-radius: 10px; padding: 14px 20px; display: inline-block;">
          <span style="color: #f97316; font-size: 28px; font-weight: 900; letter-spacing: 4px;">${otp}</span>
        </div>
        <p style="margin: 0 0 12px 0; color: #a3a3a3; font-size: 14px;">
          This OTP expires in 60 seconds.
        </p>
        <p style="margin: 20px 0 0 0; color: #525252; font-size: 13px; border-top: 1px solid #222222; padding-top: 16px;">
          If you didn’t request this, you can ignore this email.
        </p>
      </div>
      <div style="max-width: 600px; margin: 12px auto 0; color: #525252; font-size: 12px; text-align: center;">
        Nova Crest OTP Service
      </div>
    </div>
  `;

  try {
    console.log(`Sending email OTP via Resend to ${toEmail}...`);
    const { data, error } = await resend.emails.send({
      from,
      to: toEmail,
      subject: 'Your OTP Code',
      text: `Verify with this OTP ${otp}`,
      html,
    });

    if (error) {
      console.error('Resend API Error details:', error);
      throw new Error(`Resend API Error: ${error.message || JSON.stringify(error)}`);
    }

    return {
      success: true,
      messageId: data?.id,
      recipients: [toEmail],
    };
  } catch (err) {
    console.error('Resend service exception:', err);
    throw err;
  }
}

module.exports = { sendOtpEmail };
