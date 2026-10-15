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
 * Helper to resolve the tournament ID from params, headers, query, body, or related entities.
 */
export const resolveTournamentId = async (req) => {
  // 1. Direct param
  if (req.params?.tournamentId) return req.params.tournamentId;
  if (req.params?.tournament_id) return req.params.tournament_id;

  // If on a /api/tournaments/:id route or direct id parameter
  if (req.params?.id && (!req.baseUrl || req.baseUrl.includes('/tournaments') || req.path?.includes('/tournaments'))) {
    return req.params.id;
  }

  // 2. Body or query or header
  const direct = req.body?.tournament_id || req.body?.tournamentId ||
                 req.query?.tournament || req.query?.tournament_id ||
                 req.headers?.['x-tournament-id'];
  if (direct && typeof direct === 'string' && direct.trim()) {
    return direct.trim();
  }

  // 3. Match reference (:matchId or :id on match routes, or body.match_id)
  const matchId = req.params?.matchId ||
    (req.body?.match_id) ||
    ((req.baseUrl?.includes('/matches') || req.path?.includes('/matches')) && req.params?.id);

  if (matchId && typeof matchId === 'string' && /^[0-9a-f-]{36}$/i.test(matchId)) {
    try {
      const { MatchModel } = await import('../models/matchModel.js');
      const match = await MatchModel.getMatchById(matchId);
      if (match?.tournament_id) return match.tournament_id;
    } catch { /* proceed */ }
  }

  // 4. Announcement reference (:id on announcement routes)
  if ((req.baseUrl?.includes('/announcements') || req.path?.includes('/announcements')) && req.params?.id) {
    try {
      const { query } = await import('../config/db.js');
      const { rows } = await query('SELECT tournament_id FROM announcements WHERE id = $1 LIMIT 1;', [req.params.id]);
      if (rows[0]?.tournament_id) return rows[0].tournament_id;
    } catch { /* proceed */ }
  }

  return null;
};

/**
 * Middleware: requireAdmin (Platform Super Admin)
 * Checks req.user.role === 'admin'. Only platform super admins can pass.
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Super Admin privileges required'
    });
  }

  next();
};

/**
 * Middleware: requireTournamentAdmin
 * Resolves the tournament ID, then allows the request only if the user is in
 * tournament_admins for that tournament OR is a global super admin.
 */
export const requireTournamentAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Access denied: Authentication required'
    });
  }

  const userId = req.user.id || req.user.userId;
  const isSuperAdmin = req.user.role === 'admin';

  let tournamentId = await resolveTournamentId(req);

  // If no tournament ID is specified:
  if (!tournamentId) {
    const { TournamentModel } = await import('../models/tournamentModel.js');
    const { DEFAULT_TOURNAMENT_ID } = await import('../config/db.js');

    if (isSuperAdmin) {
      tournamentId = DEFAULT_TOURNAMENT_ID;
    } else {
      // Find tournaments this user admins
      const myTourneys = await TournamentModel.getForUser(userId);
      if (myTourneys.length === 1) {
        tournamentId = myTourneys[0].id;
      } else if (myTourneys.length > 1) {
        tournamentId = myTourneys[0].id; // default to first
      } else {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You do not manage any tournament'
        });
      }
    }
  }

  req.tournamentId = tournamentId;

  // Super admins always have full access to manage every tournament
  if (isSuperAdmin) {
    req.tournamentRole = 'owner';
    return next();
  }

  try {
    const { TournamentModel } = await import('../models/tournamentModel.js');
    const adminRecord = await TournamentModel.getAdmin(tournamentId, userId);
    if (!adminRecord) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You are not an administrator of this tournament'
      });
    }

    req.tournamentRole = adminRecord.role; // 'owner' or 'admin'
    next();
  } catch (err) {
    console.error('requireTournamentAdmin check error:', err);
    return res.status(500).json({ success: false, message: 'Internal authorization error' });
  }
};

/**
 * Middleware: requireTournamentOwner
 * Allows request only if caller has role === 'owner' for the tournament OR is super admin.
 */
export const requireTournamentOwner = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Access denied: Authentication required'
    });
  }

  const userId = req.user.id || req.user.userId;
  const isSuperAdmin = req.user.role === 'admin';

  let tournamentId = await resolveTournamentId(req);
  if (!tournamentId) {
    return res.status(400).json({
      success: false,
      message: 'Tournament context is required'
    });
  }

  req.tournamentId = tournamentId;

  if (isSuperAdmin) {
    req.tournamentRole = 'owner';
    return next();
  }

  try {
    const { TournamentModel } = await import('../models/tournamentModel.js');
    const adminRecord = await TournamentModel.getAdmin(tournamentId, userId);
    if (!adminRecord || adminRecord.role !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Tournament owner privileges required'
      });
    }

    req.tournamentRole = 'owner';
    next();
  } catch (err) {
    console.error('requireTournamentOwner check error:', err);
    return res.status(500).json({ success: false, message: 'Internal authorization error' });
  }
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
