const {
  calculateRideFare,
  RIDE_PRICING,
  isValidPoint,
  validateRideRequest
} = require('../src/Services/ridePricing.service');

// Ride-controller access checks must support Mongoose's populated references.
const isRidePassenger = (ride, userId) => String(ride.user?._id || ride.user) === String(userId);

describe('ride pricing and request validation', () => {
  const validRequest = {
    pickupLocation: 'Ikeja',
    destination: 'Yaba',
    eta: 20,
    distance: 12.5,
    pickupCoordinates: { type: 'Point', coordinates: [3.35, 6.6] },
    destinationCoordinates: { type: 'Point', coordinates: [3.37, 6.53] }
  };

  test('uses the configured base, booking, distance, traffic, and rounding rules', () => {
    expect(RIDE_PRICING).toMatchObject({
      baseFare: 1000,
      farePerKilometer: 200,
      minimumFare: 1000,
      bookingFee: 200,
      trafficDelayRatePerMinute: 20,
      roundingIncrement: 10,
      quoteExpiryMinutes: 5
    });
    expect(calculateRideFare(0.5, 10, 10)).toBe(1200);
    expect(calculateRideFare(1, 10, 10)).toBe(1200);
    expect(calculateRideFare(2.25, 20, 15)).toBe(1550);
    expect(calculateRideFare(2.276, 20, 15)).toBe(1560);
    expect(calculateRideFare(0)).toBeNull();
  });

  test('accepts valid GeoJSON points and rejects invalid coordinates', () => {
    expect(isValidPoint(validRequest.pickupCoordinates)).toBe(true);
    expect(isValidPoint({ type: 'Point', coordinates: [200, 6.6] })).toBe(false);
  });

  test('validates booking details without trusting client pricing fields', () => {
    expect(validateRideRequest(validRequest)).toBeNull();
    expect(validateRideRequest({ ...validRequest, distance: -1, eta: -1, fare: 1 })).toBeNull();
    expect(validateRideRequest({ ...validRequest, pickupCoordinates: { type: 'Point', coordinates: [200, 6.6] } }))
      .toBe('Valid pickup and destination coordinates are required');
  });

  test('recognizes a passenger when the ride user has been populated', () => {
    expect(isRidePassenger({ user: { _id: 'passenger-1' } }, 'passenger-1')).toBe(true);
    expect(isRidePassenger({ user: 'passenger-1' }, 'passenger-2')).toBe(false);
  });
});
