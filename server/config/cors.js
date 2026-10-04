import './env.js';

const defaultOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://playr-pool-two.vercel.app',
  'https://campusclash.onrender.com'
];

const envOrigins = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .concat((process.env.FRONTEND_URL || '').split(','))
  .map(origin => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const allowedOriginsSet = new Set([...defaultOrigins, ...envOrigins]);

export const isOriginAllowed = (origin) => {
  if (!origin) return true; // allow non-browser requests (server-to-server, curl, mobile apps)
  const clean = origin.trim().replace(/\/$/, '');
  if (allowedOriginsSet.has(clean)) return true;

  try {
    const url = new URL(clean);
    // Allow local development on localhost or loopback
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
    // Only allow verified preview deployments belonging to playr-pool
    if (/^playr-pool[a-z0-9-]*\.vercel\.app$/i.test(url.hostname)) return true;
  } catch {
    // ignore invalid URL formats
  }
  return false;
};

export const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    console.warn(`⚠️ CORS: Rejected origin "${origin}". Configured origins:`, rawOrigins);
    return callback(new Error('Origin not allowed'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-authorization', 'X-Authorization', 'x-access-token', 'X-Access-Token'],
  credentials: true
};
