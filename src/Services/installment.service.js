const INSTALLMENT_CONSTANTS = require('../Configs/installment.constants');

/**
 * Get current date in Africa/Lagos timezone formatted as YYYY-MM-DD
 */
function getLagosDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: INSTALLMENT_CONSTANTS.TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

/**
 * Get current hour in Africa/Lagos timezone (0-23)
 */
function getLagosHour(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: INSTALLMENT_CONSTANTS.TIMEZONE,
    hour: 'numeric',
    hour12: false
  }).formatToParts(date);
  const hourPart = parts.find(p => p.type === 'hour');
  return parseInt(hourPart?.value || '0', 10);
}

/**
 * Get the day of week in Africa/Lagos timezone (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 */
function getLagosDayOfWeek(date = new Date()) {
  // Use Intl to format weekday index
  const weekdayStr = new Intl.DateTimeFormat('en-US', {
    timeZone: INSTALLMENT_CONSTANTS.TIMEZONE,
    weekday: 'short'
  }).format(date);

  const days = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
  return days[weekdayStr] !== undefined ? days[weekdayStr] : date.getDay();
}

/**
 * Check if a date is a scheduled business payment day (Mon-Fri) in Lagos
 */
function isBusinessDay(date = new Date()) {
  const day = getLagosDayOfWeek(date);
  return day >= 1 && day <= 5;
}

/**
 * Add business days (excluding Saturday & Sunday) to a date
 */
function addBusinessDays(startDate, numDays) {
  let cur = new Date(startDate.getTime());
  let added = 0;
  while (added < numDays) {
    cur.setDate(cur.getDate() + 1);
    const day = getLagosDayOfWeek(cur);
    if (day >= 1 && day <= 5) {
      added++;
    }
  }
  return cur;
}

/**
 * Get next business day (Monday-Friday) starting from or after given date
 */
function getNextBusinessDay(fromDate = new Date()) {
  let next = new Date(fromDate.getTime());
  next.setDate(next.getDate() + 1);
  while (!isBusinessDay(next)) {
    next.setDate(next.getDate() + 1);
  }
  // Set to 00:00:00 Lagos time
  return next;
}

/**
 * Calculate expected completion date given a start date and 389 business days
 */
function calculateExpectedCompletionDate(startDate = new Date()) {
  return addBusinessDays(startDate, INSTALLMENT_CONSTANTS.TOTAL_SCHEDULED_DAYS);
}

/**
 * Calculate the exact next payment amount due for an installment plan.
 * Guarantees total paid will never exceed TOTAL_CONTRACT_AMOUNT (₦7,500,000).
 */
function calculateNextAmountDue(installment) {
  if (!installment) return INSTALLMENT_CONSTANTS.DEPOSIT_AMOUNT;

  // If deposit is not paid, deposit of ₦500,000 is due
  if (!installment.depositPaid || installment.paidAmount < INSTALLMENT_CONSTANTS.DEPOSIT_AMOUNT) {
    return INSTALLMENT_CONSTANTS.DEPOSIT_AMOUNT;
  }

  // No daily installment is due until admin assigns a vehicle
  if (!installment.vehicleAssigned) {
    return 0;
  }

  const remaining = Math.max(0, INSTALLMENT_CONSTANTS.TOTAL_CONTRACT_AMOUNT - (installment.paidAmount || 0));
  if (remaining === 0) {
    return 0; // Plan completed
  }

  // If regular daily amount (18,000) exceeds remaining balance, charge exact remaining balance
  return Math.min(INSTALLMENT_CONSTANTS.DAILY_INSTALLMENT_AMOUNT, remaining);
}

/**
 * Determine today's payment status for an installment plan
 */
function getTodayPaymentDetails(installment) {
  if (!installment) {
    return {
      status: INSTALLMENT_CONSTANTS.PAYMENT_STATUS.PENDING,
      amountDue: INSTALLMENT_CONSTANTS.DEPOSIT_AMOUNT,
      isPaidToday: false,
      message: 'No installment plan found'
    };
  }

  if (installment.status === INSTALLMENT_CONSTANTS.STATUS.COMPLETED || installment.paidAmount >= INSTALLMENT_CONSTANTS.TOTAL_CONTRACT_AMOUNT) {
    return {
      status: INSTALLMENT_CONSTANTS.STATUS.COMPLETED,
      amountDue: 0,
      isPaidToday: true,
      message: 'Installment plan completed in full!'
    };
  }

  // If deposit pending
  if (!installment.depositPaid) {
    return {
      status: INSTALLMENT_CONSTANTS.STATUS.DEPOSIT_PENDING,
      amountDue: INSTALLMENT_CONSTANTS.DEPOSIT_AMOUNT,
      isPaidToday: false,
      isDeposit: true,
      message: 'Initial deposit of ₦500,000 is pending.'
    };
  }

  // Deposit paid, but admin has not yet assigned a vehicle - no daily countdown yet
  if (!installment.vehicleAssigned) {
    return {
      status: INSTALLMENT_CONSTANTS.STATUS.AWAITING_VEHICLE_ASSIGNMENT,
      amountDue: 0,
      isPaidToday: false,
      message: 'Deposit received! Your Maruwa is being assigned by the admin. Daily installments begin once your vehicle is assigned.'
    };
  }

  const todayStr = getLagosDateString();
  const isWeekend = !isBusinessDay(new Date());

  // Check if a payment has already been made today (either in logs or marked today)
  const paidToday = (installment.paymentsLog || []).some(log => {
    if (log.status !== 'paid') return false;
    const logDateStr = getLagosDateString(new Date(log.paidAt || log.date));
    return logDateStr === todayStr && log.type === 'installment';
  });

  if (paidToday) {
    return {
      status: INSTALLMENT_CONSTANTS.PAYMENT_STATUS.PAID,
      amountDue: 0,
      isPaidToday: true,
      message: "Today's installment of ₦18,000 has been paid successfully."
    };
  }

  if (isWeekend) {
    return {
      status: INSTALLMENT_CONSTANTS.PAYMENT_STATUS.WEEKEND,
      amountDue: 0,
      isPaidToday: false,
      message: 'No payment scheduled on weekends. Next payment due on Monday.'
    };
  }

  const currentHour = getLagosHour();
  const amountDue = calculateNextAmountDue(installment);

  if (currentHour >= INSTALLMENT_CONSTANTS.CUTOFF_HOUR_LAGOS) {
    return {
      status: INSTALLMENT_CONSTANTS.PAYMENT_STATUS.OVERDUE,
      amountDue,
      isPaidToday: false,
      message: `Payment for today is overdue (Cutoff: ${INSTALLMENT_CONSTANTS.CUTOFF_HOUR_LAGOS}:00 WAT). Please pay now.`
    };
  }

  return {
    status: INSTALLMENT_CONSTANTS.PAYMENT_STATUS.DUE_TODAY,
    amountDue,
    isPaidToday: false,
    message: `Today's installment of ₦${amountDue.toLocaleString()} is due.`
  };
}

/**
 * Format dashboard metrics for an installment plan
 */
function formatInstallmentDashboardData(installment, user) {
  if (!installment) return null;

  const totalAmount = INSTALLMENT_CONSTANTS.TOTAL_CONTRACT_AMOUNT;
  const depositAmount = INSTALLMENT_CONSTANTS.DEPOSIT_AMOUNT;
  const paidAmount = installment.paidAmount || 0;
  const remainingBalance = Math.max(0, totalAmount - paidAmount);
  const percentageCompleted = Math.min(100, Math.round((paidAmount / totalAmount) * 10000) / 100);
  
  const todayDetails = getTodayPaymentDetails(installment);
  const nextAmountDue = calculateNextAmountDue(installment);

  const totalScheduledDays = INSTALLMENT_CONSTANTS.TOTAL_SCHEDULED_DAYS;
  const completedDays = installment.completedDays || 0;
  const remainingDays = Math.max(0, totalScheduledDays - completedDays);

  return {
    id: installment._id,
    user: {
      id: user?._id,
      firstname: user?.firstname,
      lastname: user?.lastname,
      email: user?.email,
      phone: user?.phone,
      profilePic: user?.profilePic || installment.documents?.applicantPhoto
    },
    vehicle: {
      name: installment.vehicleName,
      plateNumber: installment.vehiclePlate,
      type: installment.vehicleType,
      image: installment.vehicleImage,
      model: installment.vehicleModel,
      color: installment.vehicleColor,
      ownership: installment.vehicleOwnership,
      assigned: !!installment.vehicleAssigned
    },
    financials: {
      totalContractAmount: totalAmount,
      depositAmount: depositAmount,
      paidAmount: paidAmount,
      remainingBalance: remainingBalance,
      percentageCompleted: percentageCompleted,
      dailyInstallment: installment.dailyInstallment || INSTALLMENT_CONSTANTS.DAILY_INSTALLMENT_AMOUNT,
      depositPaid: installment.depositPaid,
      depositPaidAt: installment.depositPaidAt,
      nextAmountDue: nextAmountDue
    },
    schedule: {
      status: installment.status,
      startDate: installment.startDate,
      nextPaymentDate: installment.nextPaymentDate,
      expectedCompletionDate: installment.expectedCompletionDate,
      totalScheduledDays: totalScheduledDays,
      completedDays: completedDays,
      remainingDays: remainingDays,
      consecutiveDefaults: installment.consecutiveDefaults || 0
    },
    today: todayDetails,
    terms: installment.terms,
    documents: installment.documents,
    payments: (installment.paymentsLog || []).sort((a, b) => new Date(b.date || b.paidAt) - new Date(a.date || a.paidAt))
  };
}

module.exports = {
  getLagosDateString,
  getLagosHour,
  getLagosDayOfWeek,
  isBusinessDay,
  addBusinessDays,
  getNextBusinessDay,
  calculateExpectedCompletionDate,
  calculateNextAmountDue,
  getTodayPaymentDetails,
  formatInstallmentDashboardData
};
