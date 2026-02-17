#!/usr/bin/env node
// Test: Sign-out behavior verification
// Inspects auth.js source code for correct sign-out cleanup and navigation behavior.

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

// 1. Sign-out removes fishtank_weather_data from localStorage
check(
  "Sign-out removes 'fishtank_weather_data' from localStorage",
  authSrc.includes("'fishtank_weather_data'") && authSrc.includes('removeItem')
);

// 2. Sign-out calls indexedDB.deleteDatabase to clear database cache
check(
  "Sign-out calls indexedDB.deleteDatabase('fishtank_db')",
  authSrc.includes("indexedDB.deleteDatabase") && authSrc.includes("'fishtank_db'")
);

// 3. Sign-out removes fishtank_auth_token from localStorage
check(
  "Sign-out removes 'fishtank_auth_token' (token) from localStorage",
  authSrc.includes("'fishtank_auth_token'") && authSrc.includes('removeItem')
);

// 4. Navigation on sign-out: redirects to home when on a gated view
// Check that onSignedOut checks window.location.hash
check(
  'Sign-out checks window.location.hash and redirects if on gated view',
  authSrc.includes('window.location.hash') &&
  (authSrc.includes("window.location.hash = ''") || authSrc.includes("window.location.hash=''")||
   authSrc.includes('window.location.hash = "#"') || authSrc.includes("window.location.hash = '#'"))
);

// 5. Gated content hidden on sign-out: adds auth-hidden to .auth-gated elements
// onSignedOut should add auth-hidden to auth-gated
const onSignedOutIdx = authSrc.indexOf('function onSignedOut');
if (onSignedOutIdx !== -1) {
  const onSignedOutBody = authSrc.slice(onSignedOutIdx, onSignedOutIdx + 400);
  check(
    'onSignedOut adds auth-hidden to .auth-gated elements',
    onSignedOutBody.includes('.auth-gated') && onSignedOutBody.includes('auth-hidden') && onSignedOutBody.includes('add')
  );
} else {
  check('onSignedOut function exists', false);
}

console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
