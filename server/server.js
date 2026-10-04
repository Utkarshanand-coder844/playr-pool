import express from 'express';
import './config/env.js';
import { createServer } from 'http';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import teamRoutes from './routes/teamRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import leaderboardRoutes from './routes/leaderboardRoutes.js';
import matchRoutes from './routes/matchRoutes.js';
import bracketRoutes from './routes/bracketRoutes.js';
import announcementRoutes from './routes/announcementRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import sportsAdminRoutes from './routes/sportsAdminRoutes.js';
import playerSportRoutes from './routes/playerSportRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import liveScoringRoutes from './routes/liveScoringRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import { initDb } from './config/db.js';
import { initSocket } from './config/socket.js';
import { corsOptions } from './config/cors.js';
import { globalRateLimit } from './middleware/rateLimitMiddleware.js';

if (process.env.NODE_ENV === 'production') {
  const missing = ['DATABASE_URL', 'JWT_SECRET', 'ADMIN_SIGNUP_CODE', 'FRONTEND_ORIGIN', 'FRONTEND_URL', 'RESEND_API_KEY', 'PASSWORD_RESET_EMAIL_FROM']
    .filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing required production configuration: ${missing.join(', ')}`);
  if (process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET === 'super_secret_sports_jwt_key_change_in_production_2026') {
    throw new Error('JWT_SECRET must be a unique production secret of at least 32 characters.');
  }
  if (process.env.ADMIN_SIGNUP_CODE.length < 12) {
    throw new Error('ADMIN_SIGNUP_CODE must be a strong private production secret.');
  }
}

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);

// Initialize Socket.io on the HTTP server
initSocket(httpServer);

// Middlewares
app.use(cors(corsOptions));

// Remove X-Powered-By to avoid fingerprinting the stack
app.disable('x-powered-by');

// Security headers (Helmet-equivalent, no extra dependency needed)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  // Strict CSP: only allow our own origin + no inline scripts on the API
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none';"
  );
  // Prevent clients from caching sensitive API responses
  if (req.path.startsWith('/api/auth') || req.path.startsWith('/api/admin') || req.path.startsWith('/api/payments')) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
  }
  next();
});

// Global rate limit — must come early, after CORS (so OPTIONS passes) but before routes
app.use(globalRateLimit);
// JSON body parser with rawBody preservation for cryptographic webhook signature verification
app.use(express.json({
  limit: '5mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/brackets', bracketRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/sports-admins', sportsAdminRoutes);
app.use('/api/player-sports', playerSportRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/live-scoring', liveScoringRoutes);
app.use('/api/payments', paymentRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'College Sports Tournament Server',
    timestamp: new Date().toISOString()
  });
});

// Dynamic sitemap for match deep links — called by the static sitemap or directly
app.get('/api/sitemap.xml', async (req, res) => {
  try {
    const { MatchModel } = await import('./models/matchModel.js');
    const matches = await MatchModel.getAllMatches();
    const siteUrl = process.env.FRONTEND_URL || 'https://playr-pool-two.vercel.app';
    const today = new Date().toISOString().split('T')[0];

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    // Homepage
    xml += `  <url>\n    <loc>${siteUrl}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;
    // Each match gets its own URL
    for (const m of matches) {
      const freq = m.status === 'live' ? 'always' : m.status === 'upcoming' ? 'hourly' : 'weekly';
      const prio = m.status === 'live' ? '0.9' : m.status === 'upcoming' ? '0.7' : '0.5';
      xml += `  <url>\n    <loc>${siteUrl}/?match=${m.id}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${freq}</changefreq>\n    <priority>${prio}</priority>\n  </url>\n`;
    }
    xml += '</urlset>';
    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error('Sitemap generation error:', err);
    res.status(500).send('Error generating sitemap');
  }
});

// 404 Handler — do NOT echo the full path (prevents log injection / path disclosure)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'The requested endpoint was not found'
  });
});

// Global Error Handler — never leak internal error details in production
app.use((err, req, res, next) => {
  // Only log internally — never expose stack traces to clients
  console.error('Unhandled server error:', err);
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(err.status || 500).json({
    success: false,
    message: isDev ? (err.message || 'Internal server error') : 'Internal server error'
  });
});

// Start server using httpServer (not app.listen) so Socket.io works
const startServer = async () => {
  await initDb();
  httpServer.once('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Stop the other local server or set PORT to another value before starting CampusClash.`);
      return;
    }
    console.error('Unable to start HTTP server:', error.message);
  });
  httpServer.listen(PORT, () => {
    console.log(`🚀 Sports Tournament Server running on http://localhost:${PORT}`);
    console.log(`🔌 Socket.io ready for real-time leaderboard updates`);
    console.log(
      process.env.ADMIN_SIGNUP_CODE
        ? '🔐 Admin signup code loaded'
        : '⚠️  ADMIN_SIGNUP_CODE not set in .env — admin signup will always be rejected'
    );
  });
};

startServer();

export default app;
