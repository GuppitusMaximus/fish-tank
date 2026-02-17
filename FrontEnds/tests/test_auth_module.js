#!/usr/bin/env node
// Test: Auth module logic verification
// Inspects auth.js source code for required constants, patterns, and behaviors.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../the-fish-tank');
const authSrc = fs.readFileSync(path.join(ROOT, 'js/auth.js'), 'utf8');

let pass = 0;
let fail = 0;

function check(desc, result) {
  if (result) {
    console.log('PASS:', desc);
    pass++;
  } else {
    console.log('FAIL:', desc);
    fail++;
  }
}

// 1. SESSION_MAX_MS equals 604800000 (7 days)
check(
  'SESSION_MAX_MS equals 604800000 (7 days)',
  authSrc.includes('SESSION_MAX_MS') &&
  (authSrc.includes('604800000') || authSrc.includes('7 * 24 * 60 * 60 * 1000'))
);

// 2. TOKEN_KEY is 'fishtank_auth_token'
check(
  "Token storage key is 'fishtank_auth_token'",
  authSrc.includes("'fishtank_auth_token'") || authSrc.includes('"fishtank_auth_token"')
);

// 3. Sign-in calls fetch with AUTH_API_URL + '/auth/login' and POST method
check(
  "signIn fetches AUTH_API_URL + '/auth/login' with POST",
  authSrc.includes("AUTH_API_URL + '/auth/login'") &&
  authSrc.includes("method: 'POST'")
);

// 4. JWT parsing: isTokenExpired parses payload and checks exp claim
check(
  'isTokenExpired parses JWT payload and checks exp claim',
  authSrc.includes('isTokenExpired') &&
  authSrc.includes('payload.exp') &&
  (authSrc.includes('atob') || authSrc.includes('base64'))
);

// 5. authHeaders returns { 'Authorization': 'Bearer ' + token }
check(
  "authHeaders returns Authorization: Bearer token",
  authSrc.includes("'Authorization': 'Bearer ' + token")
);

// 6. Content gating: toggles auth-hidden on auth-gated and auth-public-only elements
check(
  'Content gating toggles auth-hidden on auth-gated elements',
  authSrc.includes('.auth-gated') &&
  authSrc.includes('auth-hidden')
);
check(
  'Content gating toggles auth-hidden on auth-public-only elements',
  authSrc.includes('.auth-public-only') &&
  authSrc.includes('auth-hidden')
);

// 7. Sign-out removes fishtank_auth_token from localStorage
check(
  "Sign-out removes 'fishtank_auth_token' from localStorage",
  authSrc.includes("'fishtank_auth_token'") &&
  (authSrc.includes('removeItem') || authSrc.includes('clearToken'))
);

// 8. Sign-out removes fishtank_weather_data from localStorage
check(
  "Sign-out removes 'fishtank_weather_data' from localStorage",
  authSrc.includes("'fishtank_weather_data'") &&
  authSrc.includes('removeItem')
);

// 9. Sign-out calls indexedDB.deleteDatabase('fishtank_db')
check(
  "Sign-out calls indexedDB.deleteDatabase('fishtank_db')",
  authSrc.includes("indexedDB.deleteDatabase") &&
  authSrc.includes("'fishtank_db'")
);

console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
