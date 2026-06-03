const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');


// --- Middleware (inlined from Admin/adminBackend/src/Middlewares/auth.middleware.js)
const authenticateAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication required. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'admin_secret_key_nova_crest_999');

    req.admin = decoded;
    next();
  } catch (error) {
    console.error('Admin Auth Middleware Error:', error);
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

module.exports = authenticateAdmin;