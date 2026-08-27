const RIDE_PRICING = Object.freeze({
  baseFare: 1000,
  farePerKilometer: 200,
  includedDistanceKm: 1,
  minimumFare: 1000,
  bookingFee: 200,
  trafficDelayRatePerMinute: 20,
  roundingIncrement: 10,
  quoteExpiryMinutes: 5
});

const roundToIncrement = (amount, increment) => Math.round(amount / increment) * increment;

const calculateRideFare = (distanceKm, trafficDurationMinutes = 0, staticDurationMinutes = 0) => {
  const normalizedDistanceKm = Number(distanceKm);
  const normalizedTrafficDurationMinutes = Number(trafficDurationMinutes);
  const normalizedStaticDurationMinutes = Number(staticDurationMinutes);

  if (!Number.isFinite(normalizedDistanceKm) || normalizedDistanceKm <= 0 ||
    !Number.isFinite(normalizedTrafficDurationMinutes) || !Number.isFinite(normalizedStaticDurationMinutes)) {
    return null;
  }

  const billableDistanceKm = Math.max(0, normalizedDistanceKm - RIDE_PRICING.includedDistanceKm);
  const trafficDelayMinutes = Math.max(0, normalizedTrafficDurationMinutes - normalizedStaticDurationMinutes);
  const distanceCharge = billableDistanceKm * RIDE_PRICING.farePerKilometer;
  const trafficCharge = trafficDelayMinutes * RIDE_PRICING.trafficDelayRatePerMinute;
  const subtotal = RIDE_PRICING.baseFare + distanceCharge + trafficCharge + RIDE_PRICING.bookingFee;

  return roundToIncrement(Math.max(RIDE_PRICING.minimumFare, subtotal), RIDE_PRICING.roundingIncrement);
};

const isValidPoint = (point) => {
  if (!point || point.type !== 'Point' || !Array.isArray(point.coordinates) || point.coordinates.length !== 2) {
    return false;
  }

  const [longitude, latitude] = point.coordinates.map(Number);
  return Number.isFinite(longitude) && Number.isFinite(latitude) &&
    longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90;
};

const validateRideRequest = ({ pickupLocation, destination, pickupCoordinates, destinationCoordinates }) => {
  if (typeof pickupLocation !== 'string' || !pickupLocation.trim() || typeof destination !== 'string' || !destination.trim()) {
    return 'Pickup and destination are required';
  }

  if (!isValidPoint(pickupCoordinates) || !isValidPoint(destinationCoordinates)) {
    return 'Valid pickup and destination coordinates are required';
  }

  return null;
};

module.exports = {
  RIDE_PRICING,
  calculateRideFare,
  isValidPoint,
  validateRideRequest
};
