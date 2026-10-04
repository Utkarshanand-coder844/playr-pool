import jwt from 'jsonwebtoken';
import '../config/env.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET must be configured before starting the server.');

/**
 * Middleware: authenticateToken
 * Verifies the JWT from the Authorization header and attaches the decoded user to req.user.
 */
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'] || req.headers['x-authorization'] || req.headers['x-access-token'];
  let token = null;

  if (authHeader && typeof authHeader === 'string') {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else {
      token = authHeader.trim();
    }
  }


  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied: No authorization token provided'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Invalid or expired authorization token'
      });
    }

    // Attach decoded user to req.user (normalized id & role)
    req.user = {
      id: decoded.id || decoded.userId,
      userId: decoded.userId || decoded.id,
      role: decoded.role
    };

    next();
  });
};

/**
 * Middleware: requireAdmin
 * Checks req.user.role === 'admin', for protecting admin-only routes.
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Admin privileges required'
    });
  }

  next();
};

/**
 * Middleware: optionalAuth
 * Like authenticateToken but does NOT block if no token is supplied.
 * Attaches decoded user to req.user when a valid token is present;
 * otherwise leaves req.user undefined and calls next().
 * Use on public routes that have extra features when a user is logged in.
 */
export const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'] || req.headers['x-authorization'] || req.headers['x-access-token'];
  let token = null;

  if (authHeader && typeof authHeader === 'string') {
    token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  }

  if (!token) return next(); // Guest — proceed without blocking

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (!err && decoded) {
      req.user = {
        id: decoded.id || decoded.userId,
        userId: decoded.userId || decoded.id,
        role: decoded.role
      };
    }
    next(); // Always proceed, even if token is invalid/expired
  });
};
