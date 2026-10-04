import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const connectionString = process.argv[2] || process.env.DATABASE_URL;

if (!connectionString || connectionString.includes('YOUR_USER')) {
  console.error('❌ Error: No valid DATABASE_URL provided.');
  console.log('Usage: node db/clean-db.js "postgresql://user:pass@host/db?sslmode=require"');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function cleanDatabase() {
  const client = await pool.connect();
  try {
    console.log('Connecting to database...');
    
    // Find all tables in public schema
    const tablesRes = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
    `);

    if (tablesRes.rows.length === 0) {
      console.log('ℹ️ No tables found in public schema.');
      return;
    }

    const validTableNames = tablesRes.rows
      .map(r => r.tablename)
      .filter(t => /^[a-zA-Z0-9_]+$/.test(t));

    if (validTableNames.length === 0) {
      console.log('ℹ️ No valid tables to wipe.');
      return;
    }

    const tableNames = validTableNames.map(t => `"${t}"`).join(', ');
    console.log(`Found ${tablesRes.rows.length} table(s): ${tableNames}`);
    
    await client.query(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE;`);
    console.log('✅ Successfully wiped all data from all tables!');
  } catch (err) {
    console.error('❌ Error cleaning database:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

cleanDatabase();
