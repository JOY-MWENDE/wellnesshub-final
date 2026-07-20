const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'wellnesshub_dev_secret';

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const token = authHeader.split(' ')[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, email: user.email, role: user.role || 'user' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function adminMiddleware(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Admin access denied' });
  }
}

function assertUserAccess(req, res, userId) {
  if (req.user && req.user.role === 'admin') {
    return true; // Admin can access any user's logs
  }
  if (userId && String(userId) !== String(req.user.id)) {
    res.status(403).json({ error: 'Access denied' });
    return false;
  }
  return true;
}

module.exports = { authMiddleware, adminMiddleware, signToken, assertUserAccess, JWT_SECRET };
