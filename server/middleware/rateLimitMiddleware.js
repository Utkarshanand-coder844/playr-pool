/**
 * In-process rate limiter (no external Redis required).
 * Uses a token-bucket/sliding-window approach keyed by IP + path.
 *
 * Production note: if you run multiple server instances, switch to
 * a shared store (Redis, pg) so limits are enforced across replicas.
 */

const buckets = new Map();

// Periodically flush stale entries to prevent unbounded memory growth.
// Runs every 5 minutes and removes windows that expired more than
// 30 minutes ago.
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [key, times] of buckets) {
    const fresh = times.filter(t => t > cutoff);
    if (fresh.length === 0) {
      buckets.delete(key);
    } else {
      buckets.set(key, fresh);
    }
  }
}, 5 * 60 * 1000).unref(); // .unref() lets the process exit even if this is pending

/**
 * Internal sliding-window hit counter.
 * Returns { allowed, remaining, resetAt }.
 */
const checkLimit = (key, windowMs, max) => {
  const now = Date.now();
  const windowStart = now - windowMs;
  const hits = (buckets.get(key) || []).filter(t => t > windowStart);
  const allowed = hits.length < max;
  if (allowed) {
    hits.push(now);
    buckets.set(key, hits);
  }
  const resetAt = hits.length ? hits[0] + windowMs : now + windowMs;
  return { allowed, remaining: Math.max(0, max - hits.length), resetAt };
};

/**
 * Global API rate limit — applied to every request.
 * Blocks obvious scrapers / scanners (300 req / 5 min per IP).
 */
export const globalRateLimit = (req, res, next) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const key = `global:${ip}`;
  const { allowed, remaining, resetAt } = checkLimit(key, 5 * 60 * 1000, 300);
  res.setHeader('X-RateLimit-Limit', '300');
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
  if (!allowed) {
    const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please wait and try again.',
      retryAfter
    });
  }
  next();
};

/**
 * Credential rate limit — for login / signup / password-reset endpoints.
 * Strict per-IP limit to slow brute-force attacks.
 * Default: 10 attempts per 15 minutes.
 */
export const credentialRateLimit = ({ windowMs = 15 * 60 * 1000, max = 10 } = {}) =>
  (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const key = `cred:${ip}:${req.path}`;
    const { allowed, remaining, resetAt } = checkLimit(key, windowMs, max);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
    if (!allowed) {
      const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        message: 'Too many attempts. Please wait and try again.',
        retryAfter
      });
    }
    next();
  };

/**
 * Per-account action rate limit — for authenticated mutating actions.
 * Keyed by user ID so a single account can't spam even from many IPs.
 * Falls back to IP when no authenticated user is present.
 * Default: 10 actions per hour.
 */
export const actionRateLimit = ({ windowMs = 60 * 60 * 1000, max = 10 } = {}) =>
  (req, res, next) => {
    const accountId = req.user?.id || req.user?.userId || req.ip || 'unknown';
    const key = `action:${accountId}:${req.path}`;
    const { allowed, remaining, resetAt } = checkLimit(key, windowMs, max);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
    if (!allowed) {
      const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        retryAfter
      });
    }
    next();
  };
