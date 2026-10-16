import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { runMigrations, DEFAULT_TOURNAMENT_ID } from '../db/migrator.js';
import './env.js';

export { DEFAULT_TOURNAMENT_ID };

const { Pool } = pg;

let pool = null;
let pgliteDb = null;
let isPgConnected = false;

// If a connection string is provided, configure the pg.Pool
if (process.env.DATABASE_URL) {
  try {
    const requiresSSL =
      process.env.NODE_ENV === 'production' ||
      process.env.DATABASE_URL.includes('neon.tech') ||
      process.env.DATABASE_URL.includes('sslmode=require');

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: requiresSSL ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 10000
    });

    pool.on('error', (err) => {
      console.warn('⚠️  PostgreSQL Pool warning:', err.message);
      isPgConnected = false;
    });
  } catch (err) {
    console.warn('⚠️  Failed to initialize PostgreSQL pool:', err.message);
  }
}

let pgliteInitPromise = null;

export const getPGLite = async () => {
  if (pgliteDb) return pgliteDb;
  if (!pgliteInitPromise) {
    pgliteInitPromise = (async () => {
      const db = new PGlite();
      await runMigrations(db);
      pgliteDb = db;
      console.log('✅ PGlite in-memory PostgreSQL engine initialized and migrations applied.');
      return db;
    })();
  }
  return await pgliteInitPromise;
};

/**
 * Initialize Database connection and run migrations.
 * In dev / test when DATABASE_URL is not set or unavailable,
 * seamlessly uses PGlite (in-memory WebAssembly PostgreSQL).
 */
export const initDb = async () => {
  if (pool) {
    try {
      const client = await pool.connect();
      isPgConnected = true;
      console.log('✅ Connected to PostgreSQL database.');
      await runMigrations(client);
      client.release();
      console.log('✅ PostgreSQL migrations applied/verified.');
      return;
    } catch (err) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(`Production DATABASE_URL unreachable: ${err.message}`);
      }
      console.warn(`⚠️  PostgreSQL unreachable (${err.message}). Using PGlite in-memory database.`);
      isPgConnected = false;
    }
  }

  await getPGLite();
};

/**
 * Universal query runner: executes against PostgreSQL pool or PGlite instance.
 */
export const query = async (text, params = []) => {
  if (isPgConnected && pool) {
    return await pool.query(text, params);
  }

  const db = await getPGLite();
  return await db.query(text, params);
};

/**
 * Execute a callback within an isolated database transaction.
 * Automatically commits on success and rolls back on error.
 * @param {Function} fn - async (clientOrTx) => result
 */
export const withTransaction = async (fn) => {
  if (isPgConnected && pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  const db = await getPGLite();
  return await db.transaction(async (tx) => {
    return await fn(tx);
  });
};

/**
 * Helper to reset test DB state between test suites if needed
 */
export const resetTestDb = async () => {
  pgliteDb = null;
  pgliteInitPromise = null;
  return await getPGLite();
};
