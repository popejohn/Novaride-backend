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
            return res.status(401).json({ message: 'Invalid token' });
        }
        req.user = decoded;
        console.log(decoded);
        
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid or expired token' });
        console.log(error.message);
    }
};

module.exports = {authenticate};