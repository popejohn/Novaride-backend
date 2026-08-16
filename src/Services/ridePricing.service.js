const FARE_PER_KILOMETER = 450;

const calculateRideFare = (distance) => {
  const normalizedDistance = Number(distance);

  if (!Number.isFinite(normalizedDistance) || normalizedDistance <= 0) {
    return null;
  }

  return Math.round(normalizedDistance * FARE_PER_KILOMETER);
};

const isValidPoint = (point) => {
  if (!point || point.type !== 'Point' || !Array.isArray(point.coordinates) || point.coordinates.length !== 2) {
    return false;
  }

  const [longitude, latitude] = point.coordinates.map(Number);
  return Number.isFinite(longitude) && Number.isFinite(latitude) &&
    longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90;
};

const validateRideRequest = ({ pickupLocation, destination, eta, distance, pickupCoordinates, destinationCoordinates }) => {
  if (typeof pickupLocation !== 'string' || !pickupLocation.trim() || typeof destination !== 'string' || !destination.trim()) {
    return 'Pickup and destination are required';
  }

  if (!Number.isFinite(Number(eta)) || Number(eta) <= 0) {
    return 'A valid estimated duration is required';
  }

  if (!isValidPoint(pickupCoordinates) || !isValidPoint(destinationCoordinates)) {
    return 'Valid pickup and destination coordinates are required';
  }

  if (calculateRideFare(distance) === null) {
    return 'A valid ride distance is required';
  }

  return null;
};

module.exports = {
  FARE_PER_KILOMETER,
  calculateRideFare,
  isValidPoint,
  validateRideRequest
};
