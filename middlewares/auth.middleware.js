const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    // Handle Bearer token format
    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader;

    jwt.verify(token, process.env.JWT_SECRET, (err, authData) => {
      if (err) {
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({ message: 'Access denied. Token expired.' });
        } else if (err.name === 'JsonWebTokenError') {
          return res.status(403).json({ message: 'Access denied. Invalid token.' });
        } else {
          return res.status(403).json({ message: 'Access denied. Token verification failed.' });
        }
      } else {
        // Use consistent naming with auth controller
        req.user = authData;
        next();
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

module.exports = authMiddleware;