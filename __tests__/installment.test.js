const INSTALLMENT_CONSTANTS = require('../src/Configs/installment.constants');
const {
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
} = require('../src/Services/installment.service');

describe('Maruwa Installment Business Rules & Calculation Engine', () => {
  describe('Constants and Mathematical Integrity', () => {
    test('Contractual target amount is exactly ₦7,500,000', () => {
      expect(INSTALLMENT_CONSTANTS.TOTAL_CONTRACT_AMOUNT).toBe(7500000);
    });

    test('Initial deposit is exactly ₦500,000', () => {
      expect(INSTALLMENT_CONSTANTS.DEPOSIT_AMOUNT).toBe(500000);
    });

    test('Daily installment is exactly ₦18,000 for Monday-Friday', () => {
      expect(INSTALLMENT_CONSTANTS.DAILY_INSTALLMENT_AMOUNT).toBe(18000);
    });

    test('Remaining balance after deposit is ₦7,000,000', () => {
      expect(INSTALLMENT_CONSTANTS.TOTAL_CONTRACT_AMOUNT - INSTALLMENT_CONSTANTS.DEPOSIT_AMOUNT).toBe(7000000);
    });

    test('Repayment schedule math reconciles to exactly ₦7,500,000 without overcharging', () => {
      const deposit = INSTALLMENT_CONSTANTS.DEPOSIT_AMOUNT;
      const fullDays = INSTALLMENT_CONSTANTS.FULL_PAYMENT_DAYS; // 388 days
      const daily = INSTALLMENT_CONSTANTS.DAILY_INSTALLMENT_AMOUNT; // 18,000
      const finalPayment = INSTALLMENT_CONSTANTS.FINAL_PAYMENT_AMOUNT; // 16,000
      const totalDays = INSTALLMENT_CONSTANTS.TOTAL_SCHEDULED_DAYS; // 389 days

      expect(fullDays + 1).toBe(totalDays);
      expect(deposit + (fullDays * daily) + finalPayment).toBe(INSTALLMENT_CONSTANTS.TOTAL_CONTRACT_AMOUNT);
    });
  });

  describe('Business Days and Africa/Lagos Timezone Logic', () => {
    test('isBusinessDay returns true for Monday through Friday and false for Saturday/Sunday', () => {
      // 2026-09-01 is Tuesday (business day)
      const tuesday = new Date('2026-09-01T12:00:00Z');
      expect(isBusinessDay(tuesday)).toBe(true);

      // 2026-09-05 is Saturday (weekend)
      const saturday = new Date('2026-09-05T12:00:00Z');
      expect(isBusinessDay(saturday)).toBe(false);

      // 2026-09-06 is Sunday (weekend)
      const sunday = new Date('2026-09-06T12:00:00Z');
      expect(isBusinessDay(sunday)).toBe(false);
    });

    test('getNextBusinessDay skips Saturday and Sunday', () => {
      // Friday 2026-09-04 -> next business day should be Monday 2026-09-07
      const friday = new Date('2026-09-04T12:00:00Z');
      const nextDay = getNextBusinessDay(friday);
      expect(isBusinessDay(nextDay)).toBe(true);
      expect(getLagosDayOfWeek(nextDay)).toBe(1); // Monday
    });
  });

  describe('Next Amount Due and Dynamic Final Payment Adjustment', () => {
    test('Returns deposit amount (₦500,000) when deposit is not yet paid', () => {
      const plan = {
        depositPaid: false,
        paidAmount: 0
      };
      expect(calculateNextAmountDue(plan)).toBe(500000);
    });

    test('Returns regular daily amount (₦18,000) when plan is active and remaining > ₦18,000', () => {
      const plan = {
        depositPaid: true,
        paidAmount: 500000 // ₦7,000,000 remaining
      };
      expect(calculateNextAmountDue(plan)).toBe(18000);
    });

    test('Adjusts final payment to exact remaining balance (₦16,000) on final day', () => {
      const plan = {
        depositPaid: true,
        paidAmount: 7484000 // 7,500,000 - 16,000 = 7,484,000
      };
      // Remaining is 16,000 which is less than regular 18,000
      expect(calculateNextAmountDue(plan)).toBe(16000);
    });

    test('Returns 0 when plan is 100% completed (₦7,500,000)', () => {
      const plan = {
        depositPaid: true,
        paidAmount: 7500000
      };
      expect(calculateNextAmountDue(plan)).toBe(0);
    });
  });

  describe('Today Payment Details & Status Mapping', () => {
    test('Identifies deposit pending state correctly', () => {
      const plan = {
        depositPaid: false,
        paidAmount: 0,
        paymentsLog: []
      };
      const details = getTodayPaymentDetails(plan);
      expect(details.status).toBe(INSTALLMENT_CONSTANTS.STATUS.DEPOSIT_PENDING);
      expect(details.amountDue).toBe(500000);
      expect(details.isPaidToday).toBe(false);
    });

    test('Identifies completed state correctly', () => {
      const plan = {
        depositPaid: true,
        status: INSTALLMENT_CONSTANTS.STATUS.COMPLETED,
        paidAmount: 7500000,
        paymentsLog: []
      };
      const details = getTodayPaymentDetails(plan);
      expect(details.status).toBe(INSTALLMENT_CONSTANTS.STATUS.COMPLETED);
      expect(details.amountDue).toBe(0);
      expect(details.isPaidToday).toBe(true);
    });

    test('Identifies paid today state correctly when log entry exists for today', () => {
      const todayStr = getLagosDateString();
      const plan = {
        depositPaid: true,
        status: 'active',
        paidAmount: 518000,
        paymentsLog: [
          {
            type: 'installment',
            status: 'paid',
            amount: 18000,
            paidAt: new Date()
          }
        ]
      };
      const details = getTodayPaymentDetails(plan);
      expect(details.status).toBe(INSTALLMENT_CONSTANTS.PAYMENT_STATUS.PAID);
      expect(details.isPaidToday).toBe(true);
      expect(details.amountDue).toBe(0);
    });
  });

  describe('Dashboard Data Formatting', () => {
    test('Properly calculates remaining balance, progress percentage, and completed days', () => {
      const plan = {
        _id: 'inst-123',
        depositPaid: true,
        paidAmount: 2300000,
        completedDays: 100,
        status: 'active',
        vehicleName: 'Tricycle (TVS King)',
        vehiclePlate: 'Oyo-123-ABC',
        paymentsLog: []
      };
      const user = {
        _id: 'user-123',
        firstname: 'Adebayo',
        lastname: 'Ogunlesi',
        email: 'adebayo@example.com',
        phone: '08012345678'
      };

      const formatted = formatInstallmentDashboardData(plan, user);
      expect(formatted.financials.totalContractAmount).toBe(7500000);
      expect(formatted.financials.paidAmount).toBe(2300000);
      expect(formatted.financials.remainingBalance).toBe(5200000);
      expect(formatted.financials.percentageCompleted).toBeCloseTo(30.67, 1);
      expect(formatted.schedule.completedDays).toBe(100);
      expect(formatted.schedule.remainingDays).toBe(289);
    });
  });
});
