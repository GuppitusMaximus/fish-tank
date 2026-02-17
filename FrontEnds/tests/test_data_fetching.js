#!/usr/bin/env node
// Test: Data fetching verification
// Inspects weather.js for correct data fetch endpoints, auth headers, and absence of RAW_URL fallbacks.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../the-fish-tank');
const weatherSrc = fs.readFileSync(path.join(ROOT, 'js/weather.js'), 'utf8');

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

// 1. weather-public.json used in loadHomeSummary
check(
  "weather.js references 'data/weather-public.json' for home summary",
  weatherSrc.includes('weather-public.json') && weatherSrc.includes('loadHomeSummary')
);

// 2. Worker endpoint for weather dashboard: AUTH_API_URL + '/data/weather'
check(
  "weather.js fetches AUTH_API_URL + '/data/weather' for weather dashboard",
  weatherSrc.includes("AUTH_API_URL + '/data/weather'")
);

// 3. Worker endpoint for browse data: AUTH_API_URL + '/data/database'
check(
  "weather.js fetches AUTH_API_URL + '/data/database' for browse data",
  weatherSrc.includes("AUTH_API_URL + '/data/database'")
);

// 4. Authorization headers sent with fetches
check(
  'weather.js includes FishTankAuth.authHeaders() in fetch options',
  weatherSrc.includes('FishTankAuth.authHeaders()')
);

// 5. RAW_URL does not appear in weather.js
check(
  'weather.js does not reference RAW_URL',
  !weatherSrc.includes('RAW_URL')
);

// 6. DB_URL does not appear in weather.js
check(
  'weather.js does not reference DB_URL',
  !weatherSrc.includes('DB_URL')
);

// 7. Auth check before data load: isAuthenticated() called before weather data fetch
check(
  'weather.js calls FishTankAuth.isAuthenticated() before loading data',
  weatherSrc.includes('FishTankAuth.isAuthenticated()')
);

// 8. 401 handling: if Worker returns 401, calls FishTankAuth.signOut()
// Check that 401 handling and signOut are both present
const has401 = weatherSrc.includes('401');
const hasSignOutAfter401 = (function() {
  // Find the context around 401 checks
  const idx = weatherSrc.indexOf('status === 401');
  if (idx === -1) return false;
  // Look for signOut within 200 chars after the 401 check
  const context = weatherSrc.slice(idx, idx + 300);
  return context.includes('signOut');
})();
check(
  'weather.js calls FishTankAuth.signOut() when Worker returns 401',
  has401 && hasSignOutAfter401
);

console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
