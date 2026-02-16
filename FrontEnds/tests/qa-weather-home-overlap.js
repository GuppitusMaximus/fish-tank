#!/usr/bin/env node

/**
 * QA Test: Verify weather/home overlap fix
 * Plan: qa-fix-weather-home-overlap
 *
 * Verifies that:
 * 1. renderHomeSummary() is guarded and only runs when #home is active
 * 2. Home summary still renders correctly when home view IS active
 * 3. switchView triggers loadHomeSummary() when switching to home
 * 4. No JS syntax errors in weather.js
 */

const fs = require('fs');
const path = require('path');

const PASS = '\x1b[32m✓ PASS\x1b[0m';
const FAIL = '\x1b[31m✗ FAIL\x1b[0m';

let failures = [];

function test(name, condition, details = '') {
  if (condition) {
    console.log(`${PASS} ${name}`);
    return true;
  } else {
    console.log(`${FAIL} ${name}`);
    if (details) console.log(`  → ${details}`);
    failures.push({ test: name, details });
    return false;
  }
}

console.log('\n=== QA: Weather/Home Overlap Fix ===\n');

// Step 1: Verify renderHomeSummary is guarded
console.log('Step 1: Verify renderHomeSummary is guarded\n');

const weatherJsPath = path.join(__dirname, '../the-fish-tank/js/weather.js');
const weatherJs = fs.readFileSync(weatherJsPath, 'utf8');

// Check that renderHomeSummary checks for home being active
const renderHomeSummaryMatch = weatherJs.match(/function renderHomeSummary\([^)]*\)\s*{([^}]*)}/s);
if (!renderHomeSummaryMatch) {
  test('renderHomeSummary() function exists', false, 'Function not found in weather.js');
} else {
  const funcBody = renderHomeSummaryMatch[1];

  test(
    'renderHomeSummary() does NOT run unconditionally from render()',
    !weatherJs.includes('render(data)') || !weatherJs.match(/function render\([^)]*\)\s*{[^}]*renderHomeSummary\([^)]*\)/),
    'renderHomeSummary should not be called unconditionally from render()'
  );
}

// Check that render() guards the call to renderHomeSummary
// Look for the pattern around line 782-785
const renderGuardPattern = /var homeEl = document\.getElementById\(['"]home['"]\);\s*if\s*\(\s*homeEl\s*&&\s*homeEl\.classList\.contains\(['"]active['"]\)\s*\)\s*{\s*renderHomeSummary\(data\);?\s*}/;
const hasRenderGuard = renderGuardPattern.test(weatherJs);

test(
  'render() only calls renderHomeSummary when #home has .active class',
  hasRenderGuard,
  'Expected: if (homeEl && homeEl.classList.contains(\'active\')) { renderHomeSummary(data); }'
);

// Step 2: Verify loadHomeSummary has early return
console.log('\nStep 2: Verify loadHomeSummary guards execution\n');

// Look for the pattern around line 1339-1340
const loadHomeGuardPattern = /var homeEl = document\.getElementById\(['"]home['"]\);\s*if\s*\(\s*!\s*homeEl\s*\|\|\s*!\s*homeEl\.classList\.contains\(['"]active['"]\)\s*\)\s*return;?/;
const hasLoadHomeGuard = loadHomeGuardPattern.test(weatherJs);

test(
  'loadHomeSummary() has early return when home is not active',
  hasLoadHomeGuard,
  'Expected: if (!homeEl || !homeEl.classList.contains(\'active\')) return;'
);

// Step 3: Verify home summary still works
console.log('\nStep 3: Verify home summary rendering logic intact\n');

test(
  'renderHomeSummary() renders current reading',
  renderHomeSummaryMatch && renderHomeSummaryMatch[1].includes('renderCurrentV2') ||
  renderHomeSummaryMatch && renderHomeSummaryMatch[1].includes('renderCurrent'),
  'Should call renderCurrentV2 or renderCurrent'
);

test(
  'renderHomeSummary() renders predictions',
  renderHomeSummaryMatch && renderHomeSummaryMatch[1].includes('renderPredictionsV2') ||
  renderHomeSummaryMatch && renderHomeSummaryMatch[1].includes('renderPrediction'),
  'Should call renderPredictionsV2 or renderPrediction'
);

// Check for home-cta in renderHomeSummary function
const hasHomeCTA = weatherJs.includes("'<div class=\"home-cta\">'") ||
                   weatherJs.includes('"<div class=\\"home-cta\\">"') ||
                   weatherJs.includes("'home-cta'") && weatherJs.includes("'#weather'");

test(
  'renderHomeSummary() includes CTA button',
  hasHomeCTA,
  'Should render .home-cta with link to #weather'
);

// Step 4: Verify switchView triggers loadHomeSummary
console.log('\nStep 4: Verify switchView integration\n');

const indexHtmlPath = path.join(__dirname, '../the-fish-tank/index.html');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

const switchViewMatch = indexHtml.match(/function switchView\([^)]*\)\s*{([\s\S]*?)(?=\n\s*function\s|\n\s*document\.addEventListener)/);
if (!switchViewMatch) {
  test('switchView() function exists in index.html', false, 'Function not found');
} else {
  const funcBody = switchViewMatch[1];

  const callsLoadHome = funcBody.includes('WeatherApp') &&
                        funcBody.includes('loadHomeSummary') &&
                        funcBody.match(/if\s*\([^)]*'home'[^)]*\)/);

  test(
    'switchView() calls loadHomeSummary() when switching to home',
    callsLoadHome,
    'Expected: if (name === \'home\') { WeatherApp.loadHomeSummary(); }'
  );
}

// Step 5: Verify no JS errors
console.log('\nStep 5: Verify no JS errors\n');

// Use node's --check flag to validate syntax without executing
const { execSync } = require('child_process');
try {
  execSync(`node --check "${weatherJsPath}"`, { encoding: 'utf8' });
  test('weather.js has no syntax errors', true);
} catch (e) {
  test('weather.js has no syntax errors', false, e.message);
}

// Summary
console.log('\n=== Test Summary ===\n');

if (failures.length === 0) {
  console.log(`${PASS} All tests passed!\n`);
  console.log('PASS: The fix correctly guards renderHomeSummary() to prevent');
  console.log('      overlap issues when refreshing on the weather view.\n');
  process.exit(0);
} else {
  console.log(`${FAIL} ${failures.length} test(s) failed:\n`);
  failures.forEach(f => {
    console.log(`  • ${f.test}`);
    if (f.details) console.log(`    ${f.details}`);
  });
  console.log('');
  process.exit(1);
}
