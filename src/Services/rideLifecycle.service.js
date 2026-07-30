const rideDetailsModel = require('../Schemas/rideDetails.mongoose.schema');
const env = require('../Configs/env');

const ACTIVE_RIDE_STATUSES = ['pending', 'waiting_for_acceptance'];
const INACTIVE_RIDE_STATUSES = ['accepted', 'at_pickup', 'starting', 'in_progress', 'awaiting_completion', 'completed', 'cancelled', 'expired', 'timed_out'];

const isActiveRideStatus = (status) => ACTIVE_RIDE_STATUSES.includes(status);

const getRideTimeoutMs = (timeoutMinutes = env.RIDE_REQUEST_TIMEOUT_MINUTES || 5) => Number(timeoutMinutes) * 60 * 1000;

const buildRideExpiry = (createdAt = new Date(), timeoutMs = getRideTimeoutMs()) => {
  const reference = createdAt ? new Date(createdAt) : new Date();
  return new Date(reference.getTime() + timeoutMs);
};

const shouldExpireRide = (ride, timeoutMs = getRideTimeoutMs()) => {
  if (!ride || !isActiveRideStatus(ride.rideStatus)) {
    return false;
  }

  const createdAt = ride.createdAt ? new Date(ride.createdAt) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) {
    return false;
  }

  return Date.now() - createdAt.getTime() >= timeoutMs;
};

const getIncomingRideQuery = ({ riderId, statusFilter = ACTIVE_RIDE_STATUSES } = {}) => ({
  assignedDriver: riderId,
  rideStatus: { $in: statusFilter }
});

const transitionRideToInactive = async ({
  rideId,
  userId,
  currentRide,
  io,
  status = 'expired',
  reason = 'expired',
  broadcast = true,
  clearAssignedDriver = true
}) => {
  let ride = currentRide;

  if (!ride && rideId) {
    ride = await rideDetailsModel.findById(rideId);
  }

  if (!ride && userId) {
    ride = await rideDetailsModel.findOne({
      user: userId,
      rideStatus: { $in: ACTIVE_RIDE_STATUSES }
    });
  }

  if (!ride) {
    return null;
  }

  if (!isActiveRideStatus(ride.rideStatus)) {
    return ride;
  }

  const update = {
    rideStatus: status,
    ...(clearAssignedDriver ? { assignedDriver: null } : {}),
    ...(reason ? { cancellationReason: reason } : {}),
    expiresAt: null
  };

  ride = await rideDetailsModel.findByIdAndUpdate(ride._id, update, { new: true });

  if (broadcast && io) {
    const payload = { rideId: ride._id, status, reason, ride };
    if (ride.user) {
      io.to(ride.user.toString()).emit('rideLifecycleUpdated', payload);
    }
    if (ride._id) {
      io.to(ride._id.toString()).emit('rideLifecycleUpdated', payload);
    }
    io.emit('rideLifecycleUpdated', payload);
  }

  return ride;
};

const expirePendingRides = async (io, timeoutMs = getRideTimeoutMs()) => {
  const cutoff = new Date(Date.now() - timeoutMs);
  const rides = await rideDetailsModel.find({
    rideStatus: { $in: ACTIVE_RIDE_STATUSES },
    createdAt: { $lte: cutoff }
  });

  const updatedRides = [];
  for (const ride of rides) {
    const updatedRide = await transitionRideToInactive({
      currentRide: ride,
      io,
      status: 'expired',
      reason: 'expired',
      broadcast: true
    });
    updatedRides.push(updatedRide);
  }

  return updatedRides;
};

const markPendingRidesInactiveForUser = async ({ userId, io, status = 'cancelled', reason = 'user_logout' }) => {
  const rides = await rideDetailsModel.find({
    user: userId,
    rideStatus: { $in: ACTIVE_RIDE_STATUSES }
  });

  const updatedRides = [];
  for (const ride of rides) {
    const updatedRide = await transitionRideToInactive({
      currentRide: ride,
      io,
      status,
      reason,
      broadcast: true
    });
    updatedRides.push(updatedRide);
  }

  return updatedRides;
};

module.exports = {
  ACTIVE_RIDE_STATUSES,
  INACTIVE_RIDE_STATUSES,
  buildRideExpiry,
  getRideTimeoutMs,
  isActiveRideStatus,
  shouldExpireRide,
  getIncomingRideQuery,
  transitionRideToInactive,
  expirePendingRides,
  markPendingRidesInactiveForUser
};
