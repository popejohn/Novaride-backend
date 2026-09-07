// Installment Business Constants
const INSTALLMENT_CONSTANTS = {
  TOTAL_CONTRACT_AMOUNT: 7500000,       // ₦7,500,000 Total Target Amount
  DEPOSIT_AMOUNT: 500000,               // ₦500,000 Deposit
  DAILY_INSTALLMENT_AMOUNT: 18000,      // ₦18,000 Daily Installment (Mon-Fri)
  REMAINING_AFTER_DEPOSIT: 7000000,     // ₦7,000,000 (7.5M - 500k)
  // 7,000,000 / 18,000 = 388 full payments of 18,000 (= 6,984,000) + 1 final payment of 16,000
  FULL_PAYMENT_DAYS: 388,
  FINAL_PAYMENT_AMOUNT: 16000,          // ₦16,000
  TOTAL_SCHEDULED_DAYS: 389,            // 388 + 1 = 389 business days
  PAYMENT_DAYS: [1, 2, 3, 4, 5],        // Monday=1, Tuesday=2, Wednesday=3, Thursday=4, Friday=5 (ISO Day)
  CURRENT_TERMS_VERSION: 'v1.0-2026',
  TIMEZONE: 'Africa/Lagos',
  REMINDER_HOURS_LAGOS: [9, 13, 17],    // 9:00 AM, 1:00 PM, 5:00 PM West Africa Time
  CUTOFF_HOUR_LAGOS: 20,                // 8:00 PM West Africa Time (Daily payment cutoff)
  MAX_DEFAULT_DAYS_BEFORE_RETRIEVAL: 7, // 1 week of continuous default noted in Novacrest agreement
  STATUS: {
    PENDING_REVIEW: 'pending_review',
    DEPOSIT_PENDING: 'deposit_pending',
    AWAITING_VEHICLE_ASSIGNMENT: 'awaiting_vehicle_assignment',
    ACTIVE: 'active',
    COMPLETED: 'completed',
    DEFAULTED: 'defaulted',
    SUSPENDED: 'suspended'
  },
  PAYMENT_STATUS: {
    PENDING: 'pending',
    DUE_TODAY: 'due_today',
    PAID: 'paid',
    OVERDUE: 'overdue',
    DEFAULTED: 'defaulted',
    WEEKEND: 'weekend'
  }
};

module.exports = INSTALLMENT_CONSTANTS;
