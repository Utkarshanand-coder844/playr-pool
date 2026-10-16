import './env.js';

const getConfiguredOrigins = () => {
  const originStr = [
    process.env.FRONTEND_ORIGIN,
    process.env.FRONTEND_URL,
    'https://playr-pool-two.vercel.app',
    'https://playr-pool.vercel.app'
  ].filter(Boolean).join(',');
  return originStr
    .split(',')
    .map(origin => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
};

export const isOriginAllowed = (origin) => {
  if (!origin) return true; // allow non-browser requests (server-to-server, curl, mobile apps)
  const clean = origin.trim().replace(/\/$/, '');
  const allowed = getConfiguredOrigins();
  if (allowed.includes(clean)) return true;

  // In non-production, allow localhost development
  if (process.env.NODE_ENV !== 'production') {
    try {
      const url = new URL(clean);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1') {
        return true;
      }
    } catch {
      // ignore invalid URL formats
    }
  }

  return false;
};

export const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    console.warn(`⚠️ CORS: Rejected origin "${origin}". Allowed origins:`, getConfiguredOrigins());
    return callback(new Error('Origin not allowed'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-authorization', 'X-Authorization', 'x-access-token', 'X-Access-Token'],
  credentials: true
};

