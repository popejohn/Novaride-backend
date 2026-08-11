const {
  isPresenceStale,
  getActiveRiderMatchQuery,
  RIDER_PRESENCE_TIMEOUT_MS,
} = require('../src/Services/riderPresence.service');

describe('rider presence validation', () => {
  test('marks a rider stale when heartbeat is older than the timeout', () => {
    const staleTimestamp = new Date(Date.now() - RIDER_PRESENCE_TIMEOUT_MS - 1000);
    expect(isPresenceStale(staleTimestamp)).toBe(true);
  });

  test('keeps a rider active when heartbeat is still fresh', () => {
    const freshTimestamp = new Date(Date.now() - 15000);
    expect(isPresenceStale(freshTimestamp)).toBe(false);
  });

  test('excludes stale riders from passenger matching', () => {
    const now = new Date();
    const query = getActiveRiderMatchQuery(now);

    expect(query.isAvailable).toBe(true);
    expect(query.lastSeenAt).toEqual({ $gte: expect.any(Date) });
  });
});
