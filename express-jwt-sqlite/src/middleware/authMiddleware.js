const jwt = require('jsonwebtoken');
const db = require('../config/database');

async function authMiddleware(req, res, next) {
  const authorization = req.get('authorization');
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : null;

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }

  // Refresh role and blocked status from the database instead of trusting stale token claims.
  const user = await db.prepare('SELECT id, role, is_blocked FROM users WHERE id = ?').get(claims.id);
  if (!user) {
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }
  if (user.is_blocked) {
    return res.status(403).json({ message: 'This account has been blocked.' });
  }

  req.user = user;
  return next();
}

module.exports = authMiddleware;