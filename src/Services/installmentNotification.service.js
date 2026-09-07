const axios = require('axios');
const { Resend } = require('resend');
const env = require('../Configs/env');
const adminModel = require('../Models/admin.model');

const BESTBULK_URL = 'https://www.bestbulksms.com.ng/api/sms/send';
const BESTBULK_SENDER_ID = env.BESTBULK_SENDER_ID || 'NOVARIDE';

/**
 * Helper to send SMS via BestBulkSMS
 */
async function sendSMS(phone, message) {
  if (!phone || !message) return false;
  if (!env.BESTBULK_SMS_KEY) {
    console.log(`[SMS Simulation] To: ${phone} | Msg: ${message}`);
    return true;
  }

  try {
    const recipients = Array.isArray(phone) ? phone : [phone];
    await axios.post(BESTBULK_URL, {
      sender_id: BESTBULK_SENDER_ID,
      to: recipients,
      message: message,
      route: 'standard',
      source_url: `${env.BASE_URL}/installment-dashboard`
    }, {
      headers: {
        Authorization: `Bearer ${env.BESTBULK_SMS_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });
    return true;
  } catch (error) {
    console.error('BestBulkSMS error sending installment SMS:', error.response?.data || error.message);
    return false;
  }
}

/**
 * Helper to send Email via Resend
 */
async function sendEmail(toEmail, subject, htmlContent) {
  if (!toEmail || !subject || !htmlContent) return false;
  if (!env.RESEND_API_KEY) {
    console.log(`[Email Simulation] To: ${toEmail} | Subject: ${subject}`);
    return true;
  }

  try {
    const resend = new Resend(env.RESEND_API_KEY);
    const from = `NovaRide Installments <${process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'}>`;
    await resend.emails.send({
      from,
      to: toEmail,
      subject: subject,
      html: htmlContent
    });
    return true;
  } catch (error) {
    console.error('Resend error sending installment Email:', error.message);
    return false;
  }
}

/**
 * Send Daily Payment Reminder (1 of 3) to installment user
 */
async function sendPaymentReminder(user, installment, reminderHour) {
  if (!user || !installment) return;

  const amountDue = installment.depositPaid ? 18000 : 500000;
  const paymentType = installment.depositPaid ? "daily installment" : "initial deposit";
  const smsMessage = `NOVARIDE REMINDER: Your ${paymentType} of ₦${amountDue.toLocaleString()} is due today. Log in to your dashboard to pay and keep your maruwa active.`;
  
  const emailHtml = `
    <div style="font-family: Arial, sans-serif; background: #0a0a0a; color: #ffffff; padding: 24px;">
      <div style="max-width: 600px; margin: 0 auto; background: #171717; border-radius: 16px; padding: 32px; border: 1px solid #262626;">
        <h2 style="color: #f97316; margin-top: 0;">NOVA<span style="color: #ffffff;">RIDE</span> MARUWA</h2>
        <h3 style="color: #ffffff;">Payment Reminder (${reminderHour}:00 WAT)</h3>
        <p style="color: #d4d4d4; font-size: 15px;">Hello ${user.firstname},</p>
        <p style="color: #a3a3a3; font-size: 14px;">This is a friendly reminder that your ${paymentType} is due today.</p>
        
        <div style="background: #262626; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #f97316;">
          <p style="margin: 0; color: #a3a3a3; font-size: 13px;">Amount Due</p>
          <p style="margin: 5px 0 0 0; color: #f97316; font-size: 28px; font-weight: bold;">₦${amountDue.toLocaleString()}</p>
        </div>

        <p style="color: #737373; font-size: 12px;">Payment cutoff is at 8:00 PM WAT daily (Mon-Fri). Timely payment maintains your active partner status.</p>
      </div>
    </div>
  `;

  await Promise.allSettled([
    sendSMS(user.phone, smsMessage),
    sendEmail(user.email, `NovaRide: ${paymentType.toUpperCase()} Reminder`, emailHtml)
  ]);
}

/**
 * Send Default / Overdue Notification to user and Admin
 */
async function sendDefaultNotification(user, installment) {
  if (!user || !installment) return;

  const smsMessage = `NOVARIDE ALERT: Your daily installment of ₦18,000 for today was not completed before the 8:00 PM cutoff. Consecutive defaults risk vehicle retrieval. Please clear your balance immediately.`;

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; background: #0a0a0a; color: #ffffff; padding: 24px;">
      <div style="max-width: 600px; margin: 0 auto; background: #171717; border-radius: 16px; padding: 32px; border: 1px solid #dc2626;">
        <h2 style="color: #f97316; margin-top: 0;">NOVA<span style="color: #ffffff;">RIDE</span> MARUWA</h2>
        <h3 style="color: #ef4444;">⚠️ Payment Overdue Notification</h3>
        <p style="color: #d4d4d4;">Hello ${user.firstname},</p>
        <p style="color: #a3a3a3;">Your scheduled daily installment of ₦18,000 was not received before today's 8:00 PM WAT cutoff.</p>
        
        <div style="background: #262626; padding: 16px; border-radius: 10px; margin: 20px 0;">
          <p style="margin: 0; color: #ef4444; font-weight: bold;">Consecutive Default Count: ${installment.consecutiveDefaults || 1}</p>
          <p style="margin: 5px 0 0 0; color: #737373; font-size: 12px;">As per contract terms, 1 week of non-payment leads to vehicle retrieval without refund.</p>
        </div>
      </div>
    </div>
  `;

  await Promise.allSettled([
    sendSMS(user.phone, smsMessage),
    sendEmail(user.email, 'NovaRide: Installment Payment Overdue Notice', emailHtml),
    notifyAdmin('payment_overdue', {
      user: `${user.firstname} ${user.lastname}`,
      userId: user._id,
      phone: user.phone,
      amount: 18000,
      consecutiveDefaults: installment.consecutiveDefaults || 1,
      vehiclePlate: installment.vehiclePlate
    })
  ]);
}

/**
 * Send notification to Admin for important installment events
 */
async function notifyAdmin(eventType, payload) {
  try {
    const admins = await adminModel.find().select('email');
    const adminEmails = admins.map(a => a.email).filter(Boolean);

    let title = '';
    let details = '';

    switch (eventType) {
      case 'deposit_paid':
        title = '🎉 New Deposit Paid (₦500,000)';
        details = `Partner <b>${payload.user}</b> has paid the initial deposit of ₦500,000 via Paystack. Plan is now ACTIVE. Reference: ${payload.reference}`;
        break;
      case 'installment_paid':
        title = '💰 Installment Payment Received (₦18,000)';
        details = `Partner <b>${payload.user}</b> completed a daily installment of ₦${payload.amount?.toLocaleString()}. Total paid: ₦${payload.totalPaid?.toLocaleString()} / ₦7,500,000.`;
        break;
      case 'plan_completed':
        title = '🏆 Installment Plan Fully Completed!';
        details = `Partner <b>${payload.user}</b> has completed all payments! Target of ₦7,500,000 reached in full. Vehicle ownership transfer pending.`;
        break;
      case 'payment_overdue':
        title = '⚠️ Partner Default Alert';
        details = `Partner <b>${payload.user}</b> (${payload.phone}) defaulted on today's payment. Consecutive defaults: ${payload.consecutiveDefaults}. Plate: ${payload.vehiclePlate}`;
        break;
      case 'new_application':
        title = '📋 New Maruwa Installment Application';
        details = `Applicant <b>${payload.user}</b> (${payload.phone}) completed profile setup and accepted Terms & Conditions (v${payload.termsVersion}).`;
        break;
      default:
        title = `Installment Event: ${eventType}`;
        details = JSON.stringify(payload);
    }

    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; background: #111; color: #fff; border-radius: 10px;">
        <h3 style="color: #f97316;">NovaRide Admin Notification: ${title}</h3>
        <p>${details}</p>
        <p style="color: #666; font-size: 11px;">Timestamp: ${new Date().toISOString()} (Africa/Lagos)</p>
      </div>
    `;

    for (const email of adminEmails) {
      await sendEmail(email, `Admin Alert: ${title}`, html);
    }
  } catch (err) {
    console.error('Error in notifyAdmin:', err.message);
  }
}

module.exports = {
  sendSMS,
  sendEmail,
  sendPaymentReminder,
  sendDefaultNotification,
  notifyAdmin
};
