import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🔒 Starting Comprehensive Security Audit...\n');

let issues = [];

// 1. Scan for SQL Injection patterns (template literals with variable interpolation in query)
console.log('1️⃣ Scanning for SQL query parameterization...');

/**
 * Known-safe SQL interpolation patterns that have been manually reviewed.
 * Each entry is a substring that uniquely identifies the safe pattern.
 * Only add here after confirming the interpolated value is properly sanitized.
 */
const SQL_SAFE_ALLOWLIST = [
  // clean-db.js: table names sourced from pg_tables (system catalog) and filtered
  // through /^[a-zA-Z0-9_]+$/ regex then double-quoted before interpolation.
  'TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE',
];

function isSafePattern(snippet) {
  return SQL_SAFE_ALLOWLIST.some(safe => snippet.includes(safe));
}

function scanSQL(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist') {
        scanSQL(full);
      }
    } else if (entry.name.endsWith('.js')) {
      const content = fs.readFileSync(full, 'utf8');
      // Match query(`...${...}...`)
      const matches = content.match(/query\s*\(\s*`[^`]*?\$\{[^}]+\}[^`]*?`/g);
      if (matches) {
        for (const m of matches) {
          if (isSafePattern(m)) {
            // This pattern has been manually reviewed and confirmed safe — skip it
            continue;
          }
          issues.push({
            type: 'SQL Injection Risk',
            file: path.relative(rootDir, full),
            snippet: m.slice(0, 100).replace(/\n/g, ' ')
          });
        }
      }
    }
  }
}
scanSQL(path.join(rootDir, 'server'));

// 2. Scan for hardcoded secrets / private keys / passwords
console.log('2️⃣ Scanning source files for hardcoded secrets...');
const secretPatterns = [
  { name: 'Private Key', regex: /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/ },
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'Stripe Secret Key', regex: /sk_live_[0-9a-zA-Z]{24}/ },
  { name: 'GitHub Token', regex: /gh[pousr]_[0-9a-zA-Z]{36}/ },
  { name: 'Slack Token', regex: /xox[baprs]-[0-9a-zA-Z]{10,48}/ }
];

function scanSecrets(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist') {
        scanSecrets(full);
      }
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.jsx') || entry.name.endsWith('.json')) {
      if (entry.name === 'package-lock.json') continue;
      const content = fs.readFileSync(full, 'utf8');
      for (const p of secretPatterns) {
        if (p.regex.test(content)) {
          issues.push({
            type: `Hardcoded ${p.name}`,
            file: path.relative(rootDir, full),
            snippet: 'Pattern match found'
          });
        }
      }
    }
  }
}
scanSecrets(path.join(rootDir, 'server'));
scanSecrets(path.join(rootDir, 'client', 'src'));

// 3. Scan client files for leaked server-only environment variables
console.log('3️⃣ Checking frontend client for leaked backend environment variables...');
function scanClientEnv(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanClientEnv(full);
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.jsx')) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes('JWT_SECRET') || content.includes('ADMIN_SIGNUP_CODE') || content.includes('DATABASE_URL') || content.includes('RESEND_API_KEY')) {
        issues.push({
          type: 'Server Secret in Frontend',
          file: path.relative(rootDir, full),
          snippet: 'Contains reference to backend-only secret'
        });
      }
    }
  }
}
scanClientEnv(path.join(rootDir, 'client', 'src'));

// Output Results
console.log('\n========================================');
if (issues.length === 0) {
  console.log('Security Scan Finished: ✅ CLEAN — 0 issues detected');
} else {
  console.log(`Security Scan Finished: ⚠️  ${issues.length} potential issue(s) detected`);
}
console.log('========================================');

if (issues.length > 0) {
  console.log('\nFindings:');
  for (const issue of issues) {
    console.log(`⚠️  [${issue.type}] in ${issue.file}`);
    console.log(`   Snippet: ${issue.snippet}\n`);
  }
  console.log('ACTION REQUIRED: Review and fix the above findings before deploying to production.');
  process.exit(1);
} else {
  console.log('\n✅ No hardcoded secrets, SQL injection risks, or leaked env vars found!');
  console.log('✅ All checks passed. Codebase is clean.');
  process.exit(0);
}
