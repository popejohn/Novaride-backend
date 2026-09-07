const installmentModel = require('../Schemas/installment.mongoose.schema');
const userModel = require('../Schemas/user.schema');
const { getLagosDateString, getLagosHour, isBusinessDay } = require('./installment.service');
const { sendPaymentReminder, sendDefaultNotification } = require('./installmentNotification.service');
const INSTALLMENT_CONSTANTS = require('../Configs/installment.constants');

let isRunning = false;

/**
 * Execute periodic check for daily reminders and cutoff defaults.
 * Idempotent: Tracks state in MongoDB to ensure reminders and defaults fire at most once per slot.
 */
async function processInstallmentSchedules() {
  if (isRunning) return;
  isRunning = true;

  try {
    const now = new Date();
    const todayStr = getLagosDateString(now);
    const currentHour = getLagosHour(now);
    const isTodayBusinessDay = isBusinessDay(now);

    // Business day checks (Mon-Fri)
    if (!isTodayBusinessDay) {
      return;
    }

    // 1. Process 3x Daily Payment Reminders
    const reminderSlot = INSTALLMENT_CONSTANTS.REMINDER_HOURS_LAGOS.find(h => currentHour === h);
    if (reminderSlot !== undefined) {
      const activePlans = await installmentModel.find({
        status: { $in: [INSTALLMENT_CONSTANTS.STATUS.ACTIVE, INSTALLMENT_CONSTANTS.STATUS.DEPOSIT_PENDING] }
      }).populate('user');

      for (const plan of activePlans) {
        if (!plan.user) continue;

        // Reset tracking if new day
        if (plan.lastReminderDate !== todayStr) {
          plan.lastReminderDate = todayStr;
          plan.remindersSentToday = [];
        }

        // Check if already sent for this specific hour slot
        if (plan.remindersSentToday.includes(reminderSlot)) {
          continue;
        }

        // Check if already paid today
        const isPaidToday = (plan.paymentsLog || []).some(log => {
          if (log.status !== 'paid') return false;
          const logDateStr = getLagosDateString(new Date(log.paidAt || log.date));
          return logDateStr === todayStr && log.type === 'installment';
        });

        if (isPaidToday) {
          continue; // Stop reminders immediately if already paid today
        }

        // Send reminder
        try {
          await sendPaymentReminder(plan.user, plan, reminderSlot);
          plan.remindersSentToday.push(reminderSlot);
          await plan.save();
        } catch (err) {
          console.error(`Error sending reminder to user ${plan.user._id}:`, err.message);
        }
      }
    }

    // 2. Process Cutoff / Overdue marking at 8:00 PM (Cutoff hour)
    if (currentHour >= INSTALLMENT_CONSTANTS.CUTOFF_HOUR_LAGOS) {
      const activePlans = await installmentModel.find({
        status: INSTALLMENT_CONSTANTS.STATUS.ACTIVE
      }).populate('user');

      for (const plan of activePlans) {
        if (!plan.user) continue;

        // If default already processed today, skip
        if (plan.lastDefaultDate === todayStr) {
          continue;
        }

        // Check if paid today
        const isPaidToday = (plan.paymentsLog || []).some(log => {
          if (log.status !== 'paid') return false;
          const logDateStr = getLagosDateString(new Date(log.paidAt || log.date));
          return logDateStr === todayStr && log.type === 'installment';
        });

        if (!isPaidToday) {
          plan.lastDefaultDate = todayStr;
          plan.consecutiveDefaults = (plan.consecutiveDefaults || 0) + 1;
          
          if (plan.consecutiveDefaults >= INSTALLMENT_CONSTANTS.MAX_DEFAULT_DAYS_BEFORE_RETRIEVAL) {
            plan.status = INSTALLMENT_CONSTANTS.STATUS.DEFAULTED;
          }

          await plan.save();

          try {
            await sendDefaultNotification(plan.user, plan);
          } catch (err) {
            console.error(`Error sending default notification for user ${plan.user._id}:`, err.message);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in processInstallmentSchedules:', error);
  } finally {
    isRunning = false;
  }
}

/**
 * Initialize scheduler loop
 */
function startInstallmentScheduler(intervalMs = 5 * 60 * 1000) { // check every 5 minutes
  console.log('⏱️ Installment schedule monitoring initialized (Africa/Lagos WAT)');
  // Run once immediately
  processInstallmentSchedules().catch(console.error);
  // Recurring interval
  return setInterval(() => {
    processInstallmentSchedules().catch(console.error);
  }, intervalMs);
}

module.exports = {
  processInstallmentSchedules,
  startInstallmentScheduler
};
