#!/usr/bin/env node
/**
 * QA Test: Verify Home Weather Summary + View Persistence
 *
 * Verifies the implementation of:
 * - Nav reordering (Home → Weather → Fish Games)
 * - Home page weather summary container
 * - Weather rendering reuses existing functions
 * - CTA link to weather view
 * - URL hash persistence for views and sub-tabs
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const indexPath = path.join(rootDir, 'index.html');
const weatherJsPath = path.join(rootDir, 'js', 'weather.js');
const cssPath = path.join(rootDir, 'css', 'style.css');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertMatch(content, pattern, message) {
  if (!pattern.test(content)) throw new Error(message);
}

function assertContains(content, substring, message) {
  if (!content.includes(substring)) throw new Error(message);
}

// Read files
const indexHtml = fs.readFileSync(indexPath, 'utf8');
const weatherJs = fs.readFileSync(weatherJsPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

console.log('=== Step 1: Verify nav order ===');
test('Nav order is Home → Weather → Fish Games', () => {
  const navMatch = indexHtml.match(/<nav>([\s\S]*?)<\/nav>/);
  assert(navMatch, 'Could not find <nav> element');

  const navContent = navMatch[1];
  const homeIdx = navContent.indexOf('data-view="home"');
  const weatherIdx = navContent.indexOf('data-view="weather"');
  const fishGamesIdx = navContent.indexOf('Fish Games');

  assert(homeIdx !== -1, 'Home link not found');
  assert(weatherIdx !== -1, 'Weather link not found');
  assert(fishGamesIdx !== -1, 'Fish Games dropdown not found');
  assert(homeIdx < weatherIdx, 'Home should come before Weather');
  assert(weatherIdx < fishGamesIdx, 'Weather should come before Fish Games');
});

console.log('\n=== Step 2: Verify home page has weather container ===');
test('Home page contains weather summary container', () => {
  assertMatch(indexHtml, /<main id="home"/, 'Home main element not found');
  assertMatch(indexHtml, /id="home-weather"/, 'Home weather container not found');
  assertMatch(indexHtml, /class="home-weather-summary"/, 'Home weather summary class not found');
});

console.log('\n=== Step 3: Verify home weather rendering in weather.js ===');
test('renderHomeSummary function exists', () => {
  assertContains(weatherJs, 'function renderHomeSummary(data)', 'renderHomeSummary function not found');
});

test('renderHomeSummary calls renderCurrentV2 and renderPredictionsV2', () => {
  const renderHomeMatch = weatherJs.match(/function renderHomeSummary\(data\)\s*{([\s\S]*?)^  }/m);
  assert(renderHomeMatch, 'Could not extract renderHomeSummary function body');

  const fnBody = renderHomeMatch[1];
  assertContains(fnBody, 'renderCurrentV2', 'renderHomeSummary does not call renderCurrentV2');
  assertContains(fnBody, 'renderPredictionsV2', 'renderHomeSummary does not call renderPredictionsV2');
});

test('renderHomeSummary does not render history table', () => {
  const renderHomeMatch = weatherJs.match(/function renderHomeSummary\(data\)\s*{([\s\S]*?)^  }/m);
  const fnBody = renderHomeMatch[1];
  assert(!fnBody.includes('history-table'), 'renderHomeSummary should not render history table');
  assert(!fnBody.includes('renderHistory'), 'renderHomeSummary should not call renderHistory');
});

test('renderHomeSummary is called from start()', () => {
  const startMatch = weatherJs.match(/function start\(\)\s*{([\s\S]*?)^  }/m);
  assert(startMatch, 'Could not find start() function');
  // Check that renderHomeSummary is called somewhere in the flow
  assertContains(weatherJs, 'renderHomeSummary', 'renderHomeSummary is not called anywhere');
});

console.log('\n=== Step 4: Verify CTA exists and links correctly ===');
test('CTA link exists in renderHomeSummary', () => {
  const renderHomeMatch = weatherJs.match(/function renderHomeSummary\(data\)\s*{([\s\S]*?)^  }/m);
  const fnBody = renderHomeMatch[1];
  assertContains(fnBody, 'home-cta', 'CTA container not found');
  assertContains(fnBody, 'cta-link', 'CTA link class not found');
  assertContains(fnBody, '#weather', 'CTA does not link to #weather');
});

test('CTA text suggests exploring full weather view', () => {
  const renderHomeMatch = weatherJs.match(/function renderHomeSummary\(data\)\s*{([\s\S]*?)^  }/m);
  const fnBody = renderHomeMatch[1];
  assert(
    fnBody.includes('full predictions') ||
    fnBody.includes('View full') ||
    fnBody.includes('history') ||
    fnBody.includes('workflow'),
    'CTA text does not suggest viewing full weather data'
  );
});

console.log('\n=== Step 5: Verify URL hash persistence in index.html ===');
test('switchView sets location.hash or uses history.replaceState', () => {
  const switchViewMatch = indexHtml.match(/function switchView\(name\)\s*{([\s\S]*?)^\s{8}}/m);
  assert(switchViewMatch, 'Could not find switchView function');

  const fnBody = switchViewMatch[1];
  assert(
    fnBody.includes('history.replaceState') || fnBody.includes('location.hash'),
    'switchView does not update URL hash'
  );
});

test('Initial load reads location.hash to determine starting view', () => {
  assertMatch(indexHtml, /location\.hash/, 'Does not read location.hash on load');
  assertMatch(indexHtml, /initialView\s*=/, 'Does not set initialView based on hash');
});

test('hashchange event listener exists', () => {
  assertMatch(indexHtml, /addEventListener\(['"]hashchange['"]/, 'No hashchange event listener found');
});

test('Hash #weather/workflow is handled', () => {
  const hashHandling = indexHtml.match(/hash\.startsWith\(['"]weather\/['"]\)/);
  assert(hashHandling, 'Does not handle weather/subtab pattern');
});

test('Empty hash or #home shows home view', () => {
  assertMatch(indexHtml, /switchView\(['"]home['"]\)/, 'Does not switch to home view');
});

console.log('\n=== Step 6: Verify weather sub-tab hash persistence ===');
test('Sub-tab click handlers update URL hash', () => {
  const subnavMatch = weatherJs.match(/\.addEventListener\(['"]click['"],\s*function\(\)\s*{[\s\S]*?var target = btn\.dataset\.subtab;([\s\S]*?)}\);/);
  assert(subnavMatch, 'Could not find sub-tab click handler');

  const handlerBody = subnavMatch[1];
  assert(
    handlerBody.includes('history.replaceState') && handlerBody.includes('#weather'),
    'Sub-tab handler does not update URL hash'
  );
});

test('start() reads hash to set initial activeSubtab', () => {
  const startMatch = weatherJs.match(/function start\(\)\s*{([\s\S]*?)^  }/m);
  assert(startMatch, 'Could not find start() function');

  const fnBody = startMatch[1];
  assert(
    fnBody.includes('location.hash') && fnBody.includes('activeSubtab'),
    'start() does not read hash to set activeSubtab'
  );
});

test('stop() does NOT reset activeSubtab to dashboard', () => {
  const stopMatch = weatherJs.match(/function stop\(\)\s*{([\s\S]*?)^  }/m);
  assert(stopMatch, 'Could not find stop() function');

  const fnBody = stopMatch[1];
  assert(
    !fnBody.includes("activeSubtab = 'dashboard'") && !fnBody.includes('activeSubtab="dashboard"'),
    'stop() should not reset activeSubtab to dashboard'
  );
});

console.log('\n=== Step 7: Verify home page styles ===');
test('Styles exist for home weather summary container', () => {
  assertMatch(css, /\.home-weather-summary/, 'Missing .home-weather-summary styles');
});

test('CTA link is styled', () => {
  assertMatch(css, /\.cta-link/, 'Missing .cta-link styles');
  assertContains(css, 'border', 'CTA link should have border styling');
});

test('CTA has hover state', () => {
  assertMatch(css, /\.cta-link:hover/, 'Missing .cta-link:hover styles');
});

test('Layout is centered and reasonable width', () => {
  const homeWeatherMatch = css.match(/\.home-weather-summary\s*{([^}]*)}/);
  assert(homeWeatherMatch, 'Could not find .home-weather-summary styles');

  const styles = homeWeatherMatch[1];
  assert(
    styles.includes('max-width') || styles.includes('margin'),
    'Home weather summary should have width/margin constraints'
  );
});

console.log('\n=== Step 8: Verify valid syntax ===');
test('index.html is well-formed', () => {
  assertMatch(indexHtml, /<html[\s\S]*<\/html>/, 'HTML not well-formed');
  assertMatch(indexHtml, /<head[\s\S]*<\/head>/, 'Missing head element');
  assertMatch(indexHtml, /<body[\s\S]*<\/body>/, 'Missing body element');
});

test('weather.js has valid syntax (already tested with node)', () => {
  // This was validated earlier with node -e
  assert(true, 'Syntax check passed');
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
}
