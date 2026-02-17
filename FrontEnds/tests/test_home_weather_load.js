/**
 * Test: Home weather summary loads on first visit
 *
 * Verifies that the home page weather summary:
 * 1. Has a loadHomeSummary function that can be called independently
 * 2. Fetches data from cache or RAW_URL without requiring weather tab visit
 * 3. Renders into #home-weather container
 * 4. Is called automatically on page load
 * 5. Uses the correct CTA text
 *
 * Related plan: fix-home-weather-load
 */

const fs = require('fs');
const path = require('path');

// Read source files
const weatherJsPath = path.join(__dirname, '../the-fish-tank/js/weather.js');
const indexHtmlPath = path.join(__dirname, '../the-fish-tank/index.html');

const weatherJs = fs.readFileSync(weatherJsPath, 'utf8');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

console.log('Testing home weather summary first-load behavior...\n');

let passed = 0;
let failed = 0;

function test(name, condition, details) {
  if (condition) {
    console.log(`✓ ${name}`);
    passed++;
  } else {
    console.log(`✗ ${name}`);
    if (details) console.log(`  Details: ${details}`);
    failed++;
  }
}

// Test 1: loadHomeSummary function exists
test(
  'loadHomeSummary function exists',
  weatherJs.includes('function loadHomeSummary()'),
  'Expected to find "function loadHomeSummary()" in weather.js'
);

// Test 2: loadHomeSummary is exported on window.WeatherApp
test(
  'loadHomeSummary is exported',
  /return\s*\{[^}]*loadHomeSummary\s*:\s*loadHomeSummary/.test(weatherJs),
  'Expected loadHomeSummary to be in the return object'
);

// Test 3: loadHomeSummary fetches from cache or RAW_URL
test(
  'loadHomeSummary uses cache',
  weatherJs.includes('localStorage.getItem(CACHE_KEY)') &&
  weatherJs.match(/function loadHomeSummary\(\)[^]*?localStorage\.getItem/s),
  'Expected loadHomeSummary to check localStorage cache'
);

test(
  'loadHomeSummary fetches from RAW_URL',
  weatherJs.includes('fetch(RAW_URL)') &&
  weatherJs.match(/function loadHomeSummary\(\)[^]*?fetch\(RAW_URL\)/s),
  'Expected loadHomeSummary to fetch from RAW_URL'
);

// Test 4: loadHomeSummary calls renderHomeSummary
test(
  'loadHomeSummary calls renderHomeSummary',
  weatherJs.match(/function loadHomeSummary\(\)[^]*?renderHomeSummary/s),
  'Expected loadHomeSummary to call renderHomeSummary'
);

// Test 5: Page load calls loadHomeSummary
test(
  'index.html calls loadHomeSummary on page load',
  indexHtml.includes('WeatherApp.loadHomeSummary()'),
  'Expected index.html to call WeatherApp.loadHomeSummary()'
);

test(
  'loadHomeSummary called after view switch',
  indexHtml.match(/switchView[^]*?WeatherApp\.loadHomeSummary/s),
  'Expected loadHomeSummary to be called after switchView'
);

// Test 6: CTA has been removed — no home-cta or cta-link in weather.js
test(
  'No home-cta in weather.js (CTA removed)',
  !weatherJs.includes('home-cta'),
  'home-cta was removed in remove-predictions-cta plan — should not appear'
);

test(
  'No cta-link in weather.js (CTA removed)',
  !weatherJs.includes('cta-link'),
  'cta-link was removed in remove-predictions-cta plan — should not appear'
);

// Test 8: No obvious syntax errors in critical sections
test(
  'No syntax errors in loadHomeSummary',
  !weatherJs.match(/function loadHomeSummary\(\)[^}]*\n\s*function/s),
  'Detected possible syntax error (unexpected function declaration)'
);

// Summary
console.log('\n' + '='.repeat(50));
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
}
