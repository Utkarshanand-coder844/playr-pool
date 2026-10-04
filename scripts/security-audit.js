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
          // Check if interpolation is sanitized or dynamic WHERE clause
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
console.log(`Security Scan Finished: ${issues.length} potential issue(s) detected`);
console.log('========================================');

if (issues.length > 0) {
  console.log('\nFindings:');
  for (const issue of issues) {
    console.log(`⚠️  [${issue.type}] in ${issue.file}`);
    console.log(`   Snippet: ${issue.snippet}\n`);
  }
} else {
  console.log('✅ No hardcoded secrets, SQL injection template interpolations, or leaked env vars found in codebase!');
}
