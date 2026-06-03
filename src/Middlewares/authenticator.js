const jwt = require('jsonwebtoken');


const authenticate = (req, res, next) => {
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
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

module.exports = { authenticate };