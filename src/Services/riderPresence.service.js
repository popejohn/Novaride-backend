const riderModel = require('../Schemas/rider.mongoose.schema');

const RIDER_PRESENCE_TIMEOUT_MS = 45 * 1000;
const HEARTBEAT_INTERVAL_MS = 20 * 1000;

const isPresenceStale = (lastSeenAt, now = new Date()) => {
  if (!lastSeenAt) return true;

  const lastSeen = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
  if (Number.isNaN(lastSeen.getTime())) return true;

  return now.getTime() - lastSeen.getTime() > RIDER_PRESENCE_TIMEOUT_MS;
};

const getActiveRiderMatchQuery = (now = new Date()) => ({
  isAvailable: true,
  lastSeenAt: {
    $gte: new Date(now.getTime() - RIDER_PRESENCE_TIMEOUT_MS)
  }
});

const setRiderPresence = async ({ riderInfo, isAvailable, socketId = null, lastSeenAt = new Date() }) => {
  if (!riderInfo) return null;

  const rider = await riderModel.findOneAndUpdate(
    { riderInfo },
    {
      $set: {
        isAvailable: Boolean(isAvailable),
        lastSeenAt: new Date(lastSeenAt),
        socketId: socketId || null,
      }
    },
    { new: true }
  );

  return rider;
};

const markRiderOffline = async ({ riderInfo, socketId = null }) => {
  if (!riderInfo) return null;

  return setRiderPresence({
    riderInfo,
    isAvailable: false,
    socketId: socketId || null,
    lastSeenAt: new Date()
  });
};

const sweepStaleRiders = async (now = new Date()) => {
  const staleThreshold = new Date(now.getTime() - RIDER_PRESENCE_TIMEOUT_MS);

  const staleRiders = await riderModel.find({
    isAvailable: true,
    lastSeenAt: { $lt: staleThreshold }
  }).select('_id riderInfo');

  const updates = staleRiders.map(async (rider) => {
    await riderModel.findByIdAndUpdate(rider._id, {
      $set: {
        isAvailable: false,
        lastSeenAt: new Date(now),
        socketId: null
      }
    });
  });

  await Promise.all(updates);
  return staleRiders;
};

module.exports = {
  RIDER_PRESENCE_TIMEOUT_MS,
  HEARTBEAT_INTERVAL_MS,
  isPresenceStale,
  getActiveRiderMatchQuery,
  setRiderPresence,
  markRiderOffline,
  sweepStaleRiders
};
