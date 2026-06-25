const env = require('../Configs/env');
const { Resend } = require('resend');

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

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.5; background: #f8fafc; padding: 24px;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb;">
        <h2 style="margin: 0 0 12px 0; color: #0f172a;">Verify your OTP</h2>
        <p style="margin: 0 0 12px 0; color: #334155; font-size: 16px;">
          Verify with this OTP <strong>${otp}</strong>
        </p>

        <p style="margin: 20px 0 0 0; color: #64748b; font-size: 14px;">
          If you didn’t request this, you can ignore this email.
        </p>
      </div>
      <div style="max-width: 600px; margin: 12px auto 0; color: #94a3b8; font-size: 12px; text-align: center;">
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
