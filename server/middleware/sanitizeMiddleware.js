/**
 * Input Sanitization & Anti-XSS Middleware
 * Strips script tags, javascript: pseudo-protocols, and inline event handlers
 * while protecting against Prototype Pollution attacks.
 */

// Regex patterns for dangerous XSS constructs
const SCRIPT_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const JS_PROTO_REGEX = /javascript\s*:/gi;
const DANGEROUS_TAGS_REGEX = /<\s*(?:iframe|embed|object|applet|meta|link|style|base)\b[^>]*>/gi;
const INLINE_EVENT_REGEX = /\bon[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi;

/**
 * Sanitize a single string value to prevent stored and reflected XSS.
 * Does not corrupt base64 photo data or standard punctuation.
 */
export function sanitizeString(val) {
  if (typeof val !== 'string') return val;

  // Don't strip base64 data URLs for user profile photos
  if (val.startsWith('data:image/')) return val;

  let cleaned = val
    .replace(SCRIPT_REGEX, '')
    .replace(JS_PROTO_REGEX, '')
    .replace(DANGEROUS_TAGS_REGEX, '')
    .replace(INLINE_EVENT_REGEX, '');

  return cleaned.trim();
}

/**
 * Recursively clean an object, array, or primitive while guarding against Prototype Pollution.
 */
export function sanitizeInput(obj, depth = 0) {
  if (depth > 10) return obj; // Prevent deep recursion attacks
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeInput(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const cleanedObj = {};
    for (const key of Object.keys(obj)) {
      // Prototype pollution defense: ignore prototype-altering keys
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }
      cleanedObj[key] = sanitizeInput(obj[key], depth + 1);
    }
    return cleanedObj;
  }

  return obj;
}

/**
 * Express middleware to sanitize req.body, req.query, and req.params
 */
export function sanitizeRequest(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeInput(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeInput(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeInput(req.params);
  }
  next();
}

export default sanitizeRequest;
