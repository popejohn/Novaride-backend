const env = require('../Configs/env');

// Enhanced centralized error handling middleware with comprehensive error types
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.stack = err.stack;

  // Log comprehensive error details
  const errorLog = {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString(),
    ...(req.user && { userId: req.user.id })
  };

  console.error('🚨 Error occurred:', errorLog);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = { message, statusCode: 404 };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `${field} already exists`;
    error = { message, statusCode: 409 };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = { message, statusCode: 400 };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = { message, statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = { message, statusCode: 401 };
  }

  // Authentication errors
  if (err.name === 'AuthenticationError' || err.message.includes('authentication')) {
    const message = 'Authentication failed';
    error = { message, statusCode: 401 };
  }

  // Authorization errors
  if (err.name === 'AuthorizationError' || err.message.includes('authorization')) {
    const message = 'Insufficient permissions';
    error = { message, statusCode: 403 };
  }

  // CORS error
  if (err.message && err.message.includes('Not allowed by CORS')) {
    const message = 'CORS policy violation';
    error = { message, statusCode: 403 };
  }

  // Rate limiting errors
  if (err.message && err.message.includes('Too many')) {
    error = { message: err.message, statusCode: 429 };
  }

  // File upload errors
  if (err.name === 'MulterError') {
    let message = 'File upload error';
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'File too large';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = 'Too many files';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Unexpected file field';
    }
    error = { message, statusCode: 400 };
  }

  // Network/External service errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
    const message = 'Service temporarily unavailable';
    error = { message, statusCode: 503 };
  }

  // RabbitMQ errors
  if (err.message && err.message.includes('RabbitMQ')) {
    const message = 'Message queue service error';
    error = { message, statusCode: 503 };
  }

  // Redis errors
  if (err.message && err.message.includes('Redis')) {
    const message = 'Cache service error';
    error = { message, statusCode: 503 };
  }

  // Socket.io errors
  if (err.message && err.message.includes('Socket')) {
    const message = 'Real-time connection error';
    error = { message, statusCode: 503 };
  }

  // Default error response
  const statusCode = error.statusCode || 500;
  const response = {
    success: false,
    error: error.message || 'Internal Server Error',
    ...(env.NODE_ENV === 'development' && {
      stack: error.stack,
      details: error.details
    })
  };

  // Add rate limit headers if applicable
  if (statusCode === 429) {
    res.set({
      'Retry-After': Math.ceil((error.windowMs || 900000) / 1000), // Default 15 minutes
      'X-RateLimit-Reset': new Date(Date.now() + (error.windowMs || 900000)).toISOString()
    });
  }

  res.status(statusCode).json(response);
};

// Async error wrapper for routes that use async/await
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { errorHandler, asyncHandler };