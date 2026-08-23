const {
  calculateRideFare,
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

  test('calculates the same fare as the wallet booking UI', () => {
    expect(calculateRideFare(12.5)).toBe(5625);
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
