// Create a ratelimiter middleware to limit repeated requests with standardheaders, legacy headers, handler and skip.

const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 100 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req, res) => {
        return res.status(429).json({
            message: 'Too many requests from this IP, please try again after 15 minutes'
        });
    },
    skip: (req, res) => {
        // Optionally skip rate limiting for certain requests
        return false; // Change this condition as needed
    }
});



module.exports = {
    authLimiter
};