const jwt  = require('jsonwebtoken');

const auth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { ...decoded, _id: decoded._id || decoded.id };
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = { ...decoded, _id: decoded._id || decoded.id };
    } catch {
      req.user = null;
    }
  }
  next(); // ✅ sirf ek baar — bahar
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role))
    return res.status(403).json({ message: 'Forbidden' });
  next();
};

module.exports = { auth, optionalAuth, requireRole };