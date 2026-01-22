// Setup the application
const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const allRoutes = require('./src/Routes/allRoutes');

// Load environment variables from .env file
dotenv.config();
// Import the database connection function
const connectDB = require('./src/Configs/connection');


// Initialize Express app
const app = express();

// Custom Morgan token for full URL
morgan.token('full-url', function (req) {
  return req.protocol + '://' + req.get('host') + req.originalUrl;
});

// Middleware to parse JSON requests
app.use(express.json());
app.use(cors());

// Custom Morgan logging with colors and error messages
app.use(morgan(function (tokens, req, res) {
  const status = parseInt(tokens.status(req, res));
  const url = tokens['full-url'](req, res);
  const method = tokens.method(req, res);
  const responseTime = tokens['response-time'](req, res);

  // Color codes
  const green = '\x1b[32m';
  const red = '\x1b[31m';
  const reset = '\x1b[0m';

  // Determine color based on status
  let color = reset;
  if (status >= 200 && status < 300) {
    color = green;
  } else if (status >= 400) {
    color = red;
  }

  // Build log string
  let log = `${method} ${url} ${color}${status}${reset} ${responseTime} ms`;

  // Add error message if status >= 400 and message exists
  if (status >= 400) {
    log += ` - Error: ${res.locals.errorMessage}`;
  }

  return log;
}));

app.use('/', allRoutes);





module.exports = app;




