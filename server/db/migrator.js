import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_TOURNAMENT_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Run migrations on the active database connection (pg.Pool or PGlite).
 * @param {{ query: Function, exec?: Function }} db
 */
export async function runMigrations(db) {
  // 1. Ensure migrations tracking table exists
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `);

  // 2. Read applied migrations
  const { rows: appliedRows } = await db.query(
    'SELECT name FROM schema_migrations ORDER BY id ASC;'
  );
  const appliedSet = new Set(appliedRows.map((r) => r.name));

  // 3. Ensure base schema.sql is executed if not yet applied
  if (!appliedSet.has('000_base_schema')) {
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      if (typeof db.exec === 'function') {
        await db.exec(schemaSql);
      } else {
        await db.query(schemaSql);
      }
      await db.query(
        'INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING;',
        ['000_base_schema']
      );
      appliedSet.add('000_base_schema');
    }
  }

  // 4. Run all files in server/db/migrations/ in sorted order
  const migrationsDir = path.join(__dirname, 'migrations');
  if (fs.existsSync(migrationsDir)) {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (!appliedSet.has(file)) {
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');
        if (typeof db.exec === 'function') {
          await db.exec(sql);
        } else {
          await db.query(sql);
        }
        await db.query(
          'INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING;',
          [file]
        );
      }
    }
  }

  // 5. Ensure System user and Default Tournament exist so legacy fixtures are never orphaned
  await db.query(`
    INSERT INTO users (id, college_id, name, department, campus, year, email, phone, password_hash, role)
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      'SYS-000',
      'Platform System',
      'Athletics',
      'Main Campus',
      'Staff',
      'system@playrpool.internal',
      '+0 000-000-0000',
      '$2a$10$dummyhashforplatfsystemusercreatedbydefault12345678',
      'admin'
    )
    ON CONFLICT (id) DO NOTHING;
  `);

  await db.query(`
    INSERT INTO tournaments (id, name, description, campus, sports, status, locked, created_by, verified)
    VALUES (
      '${DEFAULT_TOURNAMENT_ID}',
      'Default Tournament',
      'Campus tournament covering legacy fixtures and sports',
      'Main Campus',
      '{"Football", "Cricket", "Basketball", "Badminton", "Volleyball", "Table Tennis"}',
      'live',
      FALSE,
      '00000000-0000-0000-0000-000000000000',
      TRUE
    )
    ON CONFLICT (id) DO NOTHING;
  `);
}
