/**
 * Automated Verification Script for College Sports Tournament Auth API
 */
import fs from 'fs';
import path from 'path';
import './server/config/env.js';

const BASE_URL = 'http://localhost:5000/api/auth';
const PAYMENTS_URL = 'http://localhost:5000/api/payments';
const ADMIN_CODE = process.env.ADMIN_SIGNUP_CODE || 'local-dev-admin-code-2026';

let passedCount = 0;
let failedCount = 0;

const logResult = (testName, passed, detail) => {
  if (passed) {
    console.log(`✅ PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`❌ FAIL: ${testName} - ${detail}`);
    failedCount++;
  }
};

async function runTests() {
  console.log('🏁 Starting Authentication System Verification Suite...\n');

  try {
    // 1. Test validation: missing fields
    const invalidSignup = await fetch(`${BASE_URL}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ college_id: 'TEST01', password: '123' })
    });
    const invalidData = await invalidSignup.json();
    logResult(
      'Reject missing required fields',
      invalidSignup.status === 400 && !invalidData.success,
      JSON.stringify(invalidData)
    );

    // 2. Test validation: password length < 8
    const shortPassSignup = await fetch(`${BASE_URL}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        college_id: 'TEST02',
        name: 'Short Pass User',
        department: 'CS',
        year: '2nd Year',
        campus: 'Main Campus',
        email: 'test@college.edu',
        phone: '1234567890',
        sports: ['Football'],
        password: '1234567' // 7 chars, less than 8
      })
    });
    const shortPassData = await shortPassSignup.json();
    logResult(
      'Reject password shorter than 8 chars',
      shortPassSignup.status === 400 && shortPassData.message.includes('8 characters'),
      JSON.stringify(shortPassData)
    );

    // 3. Test successful Player Signup
    const testId = `CS2026-${Date.now().toString().slice(-4)}`;
    const testEmail = `messi_${Date.now()}@college.edu`;
    const playerSignup = await fetch(`${BASE_URL}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        college_id: testId,
        name: 'Lionel Messi',
        department: 'Sports Science',
        campus: 'Main Campus',
        year: '3rd Year',
        email: testEmail,
        phone: '+1 800 1010 10',
        role: 'player',
        sports: ['Football'],
        password: 'securePassword123'
      })
    });
    const playerData = await playerSignup.json();
    logResult(
      'Player Signup (POST /api/auth/signup)',
      playerSignup.status === 201 && playerData.success && !!playerData.token,
      JSON.stringify(playerData)
    );
    const playerToken = playerData.token;

    // 4. Test duplicate college_id rejection
    const duplicateSignup = await fetch(`${BASE_URL}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        college_id: testId,
        name: 'Imposter Messi',
        department: 'Sports Science',
        campus: 'Main Campus',
        year: '1st Year',
        email: `imposter_${Date.now()}@college.edu`,
        phone: '9999999999',
        sports: ['Football'],
        password: 'password123'
      })
    });
    const duplicateData = await duplicateSignup.json();
    logResult(
      'Reject duplicate college_id (409 Conflict)',
      duplicateSignup.status === 409 && !duplicateData.success,
      JSON.stringify(duplicateData)
    );

    // 5. Test Player Login
    const playerLogin = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        college_id: testId,
        password: 'securePassword123'
      })
    });
    const loginData = await playerLogin.json();
    logResult(
      'Player Login (POST /api/auth/login)',
      playerLogin.status === 200 && loginData.success && !!loginData.token,
      JSON.stringify(loginData)
    );

    // 6. Test Login with wrong password
    const wrongPassLogin = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        college_id: testId,
        password: 'wrongPassword!'
      })
    });
    logResult(
      'Reject invalid password on login (401)',
      wrongPassLogin.status === 401,
      'Status: ' + wrongPassLogin.status
    );

    // 7. Test GET /api/auth/me with player token
    const meRes = await fetch(`${BASE_URL}/me`, {
      headers: { 'Authorization': `Bearer ${playerToken}` }
    });
    const meData = await meRes.json();
    logResult(
      'GET /api/auth/me returns profile with valid JWT',
      meRes.status === 200 && meData.user && meData.user.college_id === testId,
      JSON.stringify(meData)
    );

    // 8. Test authenticateToken without token
    const unauthorizedRes = await fetch(`${BASE_URL}/me`);
    logResult(
      'Reject request without Authorization token (401)',
      unauthorizedRes.status === 401,
      'Status: ' + unauthorizedRes.status
    );

    // 9. Test requireAdmin middleware with player token (should be 403 Forbidden)
    const adminForbiddenRes = await fetch(`${BASE_URL}/admin-only`, {
      headers: { 'Authorization': `Bearer ${playerToken}` }
    });
    logResult(
      'requireAdmin blocks Player from admin-only route (403)',
      adminForbiddenRes.status === 403,
      'Status: ' + adminForbiddenRes.status
    );

    // 10. Test Admin Signup with admin_code and Admin access
    const adminId = `ADM-${Date.now().toString().slice(-4)}`;
    const adminSignup = await fetch(`${BASE_URL}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        college_id: adminId,
        name: 'Tournament Director',
        department: 'Athletic Department',
        campus: 'Main Campus',
        year: 'Staff/Faculty',
        email: `director_${Date.now()}@college.edu`,
        phone: '+1 800 2020 20',
        role: 'admin',
        admin_code: ADMIN_CODE,
        password: 'adminSecretPassword123'
      })
    });
    const adminData = await adminSignup.json();
    const adminToken = adminData.token;

    const adminAllowedRes = await fetch(`${BASE_URL}/admin-only`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const adminAllowedData = await adminAllowedRes.json();
    logResult(
      'requireAdmin allows Admin to access admin route (200)',
      adminAllowedRes.status === 200 && adminAllowedData.success,
      JSON.stringify(adminAllowedData)
    );

    // 11. Acceptance Check: Reject token passed via query parameter (?token=...)
    const queryTokenRes = await fetch(`${BASE_URL}/me?token=${playerToken}`);
    logResult(
      'Reject request with token in query params (?token=...) without Authorization header (401)',
      queryTokenRes.status === 401,
      'Status: ' + queryTokenRes.status
    );

    // 12. Acceptance Check: Password reset increments token_version and invalidates old token
    const forgotRes = await fetch(`${BASE_URL}/password-reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail })
    });
    const forgotData = await forgotRes.json();
    const devResetToken = forgotData.devResetToken;

    let resetTokenInvalidatedOldJwt = false;
    if (devResetToken) {
      const confirmRes = await fetch(`${BASE_URL}/password-reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: devResetToken,
          password: 'newBrandPassword456'
        })
      });
      const confirmData = await confirmRes.json();

      // Now verify that the old playerToken is rejected because token_version was incremented
      const oldTokenRes = await fetch(`${BASE_URL}/me`, {
        headers: { 'Authorization': `Bearer ${playerToken}` }
      });
      resetTokenInvalidatedOldJwt = confirmRes.status === 200 && oldTokenRes.status === 401;
    }
    logResult(
      'Reject old token after password reset (token_version incremented)',
      resetTokenInvalidatedOldJwt,
      'Reset confirmed and old token returned 401'
    );

    // 13. Acceptance Check: Login with new password works and new token is valid
    const newLoginRes = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        college_id: testId,
        password: 'newBrandPassword456'
      })
    });
    const newLoginData = await newLoginRes.json();
    const newTokenMeRes = await fetch(`${BASE_URL}/me`, {
      headers: { 'Authorization': `Bearer ${newLoginData.token}` }
    });
    logResult(
      'New password login succeeds and new token works',
      newLoginRes.status === 200 && newTokenMeRes.status === 200,
      'Login status: ' + newLoginRes.status
    );

    // 14. Acceptance Check: No payments routes remain (404)
    const paymentsOrderRes = await fetch(`${PAYMENTS_URL}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 500 })
    });
    logResult(
      'No payments code remains (/api/payments returns 404)',
      paymentsOrderRes.status === 404,
      'Status: ' + paymentsOrderRes.status
    );

    // 15. Acceptance Check: vercel.json has no wildcard CORS
    const vercelJsonPath = path.resolve('client/vercel.json');
    const vercelJsonContent = fs.readFileSync(vercelJsonPath, 'utf8');
    const hasWildcardCors = vercelJsonContent.includes('Access-Control-Allow-Origin') && vercelJsonContent.includes('*');
    logResult(
      'client/vercel.json has no wildcard CORS',
      !hasWildcardCors,
      'Checked client/vercel.json'
    );

    console.log(`\n🎉 Verification Complete: ${passedCount} passed, ${failedCount} failed!\n`);
    if (failedCount > 0) {
      process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    console.error('Fatal error during test suite:', err);
    process.exit(1);
  }
}

runTests();
