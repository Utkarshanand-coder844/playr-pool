import dotenv from 'dotenv';

// Production secrets must come from the hosting platform's environment. Local
// development may use the git-ignored server/.env file (or ENV_FILE) so the
// application can run without putting secrets back into source control.
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: process.env.ENV_FILE || new URL('../.env', import.meta.url) });

  // A fresh local checkout should still be able to run the demo without
  // committing a credential file. These values are development-only; the
  // production startup validation in server.js still requires real secrets.
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'local-development-only-jwt-secret-not-for-production-2026';
    console.warn('⚠️  JWT_SECRET is not set. Using a development-only local secret.');
  }
  if (!process.env.ADMIN_SIGNUP_CODE) {
    process.env.ADMIN_SIGNUP_CODE = 'local-dev-admin-code-2026';
    console.warn('⚠️  ADMIN_SIGNUP_CODE is not set. Using the development-only local code.');
  }
}
