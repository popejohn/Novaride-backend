const {
  ACTIVE_RIDE_STATUSES,
  INACTIVE_RIDE_STATUSES,
  isActiveRideStatus,
  shouldExpireRide,
  getIncomingRideQuery
} = require('../src/Services/rideLifecycle.service');

describe('ride lifecycle helpers', () => {
  test('treats only pending assignment states as active incoming rides', () => {
    expect(isActiveRideStatus('pending')).toBe(true);
    expect(isActiveRideStatus('waiting_for_acceptance')).toBe(true);
    expect(isActiveRideStatus('accepted')).toBe(false);
    expect(isActiveRideStatus('completed')).toBe(false);
    expect(isActiveRideStatus('expired')).toBe(false);
  });

  test('flags rides that exceed their pending timeout as expired', () => {
    const ride = {
      rideStatus: 'pending',
      createdAt: new Date(Date.now() - 10 * 60 * 1000)
    };

    expect(shouldExpireRide(ride, 5 * 60 * 1000)).toBe(true);
    expect(shouldExpireRide({ ...ride, rideStatus: 'accepted' }, 5 * 60 * 1000)).toBe(false);
  });

  test('provides incoming ride filters that exclude inactive statuses', () => {
    const query = getIncomingRideQuery({ riderId: 'rider-1' });
    expect(query.assignedDriver).toBe('rider-1');
    expect(query.rideStatus).toEqual({ $in: ACTIVE_RIDE_STATUSES });
  });

  test('keeps inactive statuses explicit for lifecycle tracking', () => {
    expect(INACTIVE_RIDE_STATUSES).toEqual(expect.arrayContaining(['completed', 'cancelled', 'expired', 'timed_out']));
  });
});
