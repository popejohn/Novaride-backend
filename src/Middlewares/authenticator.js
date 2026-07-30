const jwt = require('jsonwebtoken');
const { markPendingRidesInactiveForUser } = require('../Services/rideLifecycle.service');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization header missing or malformed' });
  }
  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded) {
      console.error('JWT Verification failed: No decoded data');
      return res.status(401).json({ message: 'Invalid token' });
    }
    req.user = decoded;
    next();
  } catch (error) {
    console.error('JWT Verification Error:', error.message);
    if (error.name === 'TokenExpiredError') {
      console.error('Token expired at:', error.expiredAt);
    }

    let payload = null;
    try {
      payload = jwt.decode(token);
    } catch (decodeError) {
      console.error('JWT Decode Error:', decodeError.message);
    }

    if (payload?.id) {
      try {
        await markPendingRidesInactiveForUser({
          userId: payload.id,
          io: req.app.get('io'),
          status: 'cancelled',
          reason: error.name === 'TokenExpiredError' ? 'session_expired' : 'invalid_token'
        });
      } catch (transitionError) {
        console.error('Failed to transition rides on auth failure:', transitionError.message);
      }
    }

    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

module.exports = { authenticate };