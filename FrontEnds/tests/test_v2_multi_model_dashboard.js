#!/usr/bin/env node
/**
 * QA Tests for Multi-Model Dashboard UI (V2)
 * Tests the v2 schema detection, data-driven rendering, filtering, sorting, lazy loading
 */

const fs = require('fs');
const path = require('path');

// Read the weather.js implementation
const weatherJsPath = path.join(__dirname, '../the-fish-tank/js/weather.js');
const weatherJs = fs.readFileSync(weatherJsPath, 'utf-8');

// Read the CSS
const cssPath = path.join(__dirname, '../the-fish-tank/css/style.css');
const css = fs.readFileSync(cssPath, 'utf-8');

const tests = [];
let passCount = 0;
let failCount = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passCount++;
  } else {
    console.log(`  ✗ ${message}`);
    failCount++;
  }
}

// ========== Test 1: V1 fallback ==========
test('V1 fallback for old data', () => {
  // Check renderV1 function exists
  assert(
    /function renderV1\(data\)/.test(weatherJs),
    'renderV1 function exists'
  );

  // Check v1 renders current, prediction, history
  assert(
    /renderCurrent\(data\.current\)/.test(weatherJs),
    'V1 renders current reading'
  );

  assert(
    /renderPrediction\(data\.next_prediction\)/.test(weatherJs),
    'V1 renders next_prediction'
  );

  assert(
    /renderHistory\(data\.history\)/.test(weatherJs),
    'V1 renders history'
  );

  // Check fallback logic in render()
  assert(
    /else\s*\{[^}]*renderV1/.test(weatherJs),
    'Falls back to v1 if not v2 schema'
  );
});

// ========== Test 2: V2 schema detection ==========
test('V2 schema detection', () => {
  // Verify render() checks for schema_version >= 2
  assert(
    /schema_version\s*>=\s*2/.test(weatherJs),
    'Checks schema_version >= 2'
  );

  // Verify validates required v2 fields
  assert(
    /current\.readings/.test(weatherJs),
    'Checks for current.readings'
  );

  assert(
    /Array\.isArray\(.*predictions\)/.test(weatherJs),
    'Validates predictions is an array'
  );

  // Verify try-catch wrapper
  assert(
    /try\s*\{[^}]*renderV2/.test(weatherJs),
    'Has try-catch around v2 rendering'
  );

  // Verify fallback to v1
  assert(
    /renderV1\(data\)/.test(weatherJs) && /catch/.test(weatherJs),
    'Has fallback to v1 on error'
  );
});

// ========== Test 3: Shared property utilities exist ==========
test('Shared property utilities', () => {
  // Check getPropertyLabel exists
  assert(
    /function getPropertyLabel\(key,\s*propertyMeta\)/.test(weatherJs),
    'getPropertyLabel function exists'
  );

  // Check it returns propertyMeta[key].label if available
  assert(
    /propertyMeta\[key\]\.label/.test(weatherJs),
    'Uses propertyMeta[key].label'
  );

  // Check title-case fallback
  assert(
    /replace\(.*\bw.*toUpperCase/.test(weatherJs),
    'Has title-case fallback'
  );

  // Check formatProperty exists
  assert(
    /function formatProperty\(key,\s*value,\s*propertyMeta\)/.test(weatherJs),
    'formatProperty function exists'
  );

  // Check returns '—' for null/undefined
  assert(
    /value === undefined \|\| value === null.*return.*[—\u2014]/.test(weatherJs),
    'Returns em dash for null/undefined'
  );

  // Check uses formatTemp for temperature
  assert(
    /formatTemp\(value\)/.test(weatherJs),
    'Uses formatTemp for temperature format'
  );

  // Check discoverHistoryProperties exists
  assert(
    /function discoverHistoryProperties\(historyEntry\)/.test(weatherJs),
    'discoverHistoryProperties function exists'
  );

  // Check extracts property suffixes
  assert(
    /actual.*predicted.*delta/.test(weatherJs) && /suffix/.test(weatherJs),
    'Extracts actual/predicted/delta suffixes'
  );
});

// ========== Test 4: Current reading renders dynamically ==========
test('Current reading renders dynamically', () => {
  // Check renderCurrentV2 exists
  assert(
    /function renderCurrentV2\(current,\s*propertyMeta\)/.test(weatherJs),
    'renderCurrentV2 function exists'
  );

  // Check iterates current.readings dynamically
  assert(
    /Object\.keys\(current\.readings\)/.test(weatherJs),
    'Iterates current.readings dynamically'
  );

  // Check uses getPropertyLabel for labels
  assert(
    /getPropertyLabel\(key/.test(weatherJs),
    'Uses getPropertyLabel for display labels'
  );

  // Check uses formatProperty for values
  assert(
    /formatProperty\(key/.test(weatherJs),
    'Uses formatProperty for values'
  );

  // Check shows timestamp
  assert(
    /current\.timestamp/.test(weatherJs),
    'Shows current.timestamp'
  );

  // Check CSS for current reading prominence
  assert(
    /dash-card-current/.test(css),
    'Has dash-card-current CSS class'
  );

  assert(
    /dash-card-current[\s\S]*?border-left/.test(css),
    'Current reading has accent border'
  );

  assert(
    /dash-card-current[\s\S]*?temp-value[\s\S]*?font-size:\s*2\.2rem/.test(css),
    'Current reading has larger font size'
  );
});

// ========== Test 5: Prediction cards render per model ==========
test('Prediction cards render per model', () => {
  // Check renderPredictionsV2 exists
  assert(
    /function renderPredictionsV2\(predictions,\s*propertyMeta\)/.test(weatherJs),
    'renderPredictionsV2 function exists'
  );

  // Check iterates predictions array
  assert(
    /predictions\.map\(function\(pred\)/.test(weatherJs),
    'Iterates predictions array with map'
  );

  // Check shows model_type and model_version
  assert(
    /pred\.model_type/.test(weatherJs) && /model-badge/.test(weatherJs),
    'Shows model_type in badge'
  );

  assert(
    /pred\.model_version/.test(weatherJs),
    'Shows model_version'
  );

  // Check shows prediction_for timestamp
  assert(
    /pred\.prediction_for/.test(weatherJs),
    'Shows prediction_for timestamp'
  );

  // Check iterates values object dynamically
  assert(
    /Object\.keys\(values\)/.test(weatherJs),
    'Iterates prediction values dynamically'
  );

  // Check missing values show em dash
  assert(
    /values\s*\|\|\s*\{\}/.test(weatherJs),
    'Handles missing values object'
  );
});

// ========== Test 6: Empty predictions handled ==========
test('Empty predictions handled', () => {
  // Check for empty array check
  assert(
    /predictions\.length === 0/.test(weatherJs),
    'Checks if predictions array is empty'
  );

  // Check for placeholder message
  assert(
    /No predictions available/.test(weatherJs),
    'Shows "No predictions available" placeholder'
  );

  // Check CSS for empty state
  assert(
    /empty-state/.test(css),
    'Has empty-state CSS class'
  );
});

// ========== Test 7: History table — dynamic columns ==========
test('History table dynamic columns', () => {
  // Check Time column always first
  assert(
    /<th.*sortable.*timestamp.*Time/.test(weatherJs),
    'Time column is first and sortable'
  );

  // Check Model and Version columns present
  assert(
    /<th.*sortable.*model_type.*Model/.test(weatherJs),
    'Model Type column exists'
  );

  assert(
    /<th.*sortable.*model_version.*Version/.test(weatherJs),
    'Model Version column exists'
  );

  // Check property columns discovered dynamically
  assert(
    /props\.forEach/.test(weatherJs) && /suffix/.test(weatherJs),
    'Property columns discovered dynamically'
  );

  // Check missing values render as em dash
  assert(
    /undefined.*null.*return/.test(weatherJs) && /formatProperty/.test(weatherJs),
    'Missing values render as em dash'
  );

  // Check deltaClass for color coding
  assert(
    /deltaClass\(delta\)/.test(weatherJs),
    'Uses deltaClass for delta color coding'
  );
});

// ========== Test 8: History filtering — model type ==========
test('History filtering model type', () => {
  // Check model type dropdown exists
  assert(
    /<select.*filter-model/.test(weatherJs),
    'Model type filter dropdown exists'
  );

  // Check "All" option
  assert(
    /<option value="all">All Models<\/option>/.test(weatherJs),
    'Has "All Models" option'
  );

  // Check filtering logic
  assert(
    /filterModel.*model_type/.test(weatherJs),
    'Filters by model_type'
  );

  // Check row count updates
  assert(
    /Showing.*of.*predictions/.test(weatherJs),
    'Shows row count (e.g., "Showing X of Y predictions")'
  );
});

// ========== Test 9: History filtering — date range ==========
test('History filtering date range', () => {
  // Check date range inputs exist
  assert(
    /<input type="date".*filter-date-start/.test(weatherJs),
    'Date start input exists'
  );

  assert(
    /<input type="date".*filter-date-end/.test(weatherJs),
    'Date end input exists'
  );

  // Check date filtering logic
  assert(
    /filterDateStart.*filterDateEnd/.test(weatherJs),
    'Has date range filtering logic'
  );

  // Check filters combine with model type
  assert(
    /applyHistoryFilters/.test(weatherJs),
    'Has applyHistoryFilters function'
  );
});

// ========== Test 10: History column sorting ==========
test('History column sorting', () => {
  // Check sortable class
  assert(
    /<th class="sortable"/.test(weatherJs) || /sortable/.test(css),
    'Has sortable column headers'
  );

  // Check cursor pointer in CSS
  assert(
    /\.sortable[\s\S]*?cursor:\s*pointer/.test(css),
    'Sortable headers have cursor: pointer'
  );

  // Check sort indicator function
  assert(
    /sortIndicator/.test(weatherJs),
    'Has sortIndicator function'
  );

  // Check ascending/descending toggle
  assert(
    /sortAsc\s*=\s*!sortAsc/.test(weatherJs) || /!historyState\.sortAsc/.test(weatherJs),
    'Toggles between ascending and descending'
  );

  // Check default sort
  assert(
    /sortCol.*timestamp/.test(weatherJs) && /sortAsc.*false/.test(weatherJs),
    'Default sort is timestamp descending'
  );
});

// ========== Test 11: Lazy loading ==========
test('Lazy loading', () => {
  // Check pageSize
  assert(
    /pageSize:\s*50/.test(weatherJs),
    'Has pageSize of 50'
  );

  // Check "Show more" button
  assert(
    /<button.*show-more-btn/.test(weatherJs) || /history-show-more/.test(weatherJs),
    'Has "Show more" button'
  );

  // Check button visibility logic
  assert(
    /showMore.*sorted\.length/.test(weatherJs) || /limit < sorted\.length/.test(weatherJs),
    'Show more button visibility based on remaining rows'
  );

  // Check reset on filter/sort
  assert(
    /rendered\s*=\s*0/.test(weatherJs),
    'Resets rendered count on filter/sort'
  );
});

// ========== Test 12: localStorage caching ==========
test('localStorage caching', () => {
  // Check cache key and TTL
  assert(
    /CACHE_KEY/.test(weatherJs) && /CACHE_TTL/.test(weatherJs),
    'Has cache key and TTL constants'
  );

  // Check 5-minute TTL
  assert(
    /5\s*\*\s*60\s*\*\s*1000/.test(weatherJs) || /300000/.test(weatherJs),
    'TTL is 5 minutes (300000ms)'
  );

  // Check reads from cache
  assert(
    /localStorage\.getItem\(CACHE_KEY\)/.test(weatherJs),
    'Reads from localStorage'
  );

  // Check writes to cache
  assert(
    /localStorage\.setItem\(CACHE_KEY/.test(weatherJs),
    'Writes to localStorage'
  );

  // Check graceful failure
  assert(
    /catch.*localStorage/.test(weatherJs) || /try.*localStorage.*catch/.test(weatherJs),
    'Has try-catch for localStorage failures'
  );

  // Check no cache-busting for weather.json
  assert(
    !(/cacheBust\(RAW_URL\)/.test(weatherJs)),
    'Does not use cacheBust for weather.json'
  );
});

// ========== Test 13: Mobile responsive (393px) ==========
test('Mobile responsive CSS', () => {
  // Check mobile media query
  assert(
    /@media.*max-width:\s*600px/.test(css),
    'Has mobile media query'
  );

  // Check current reading responsive
  assert(
    /dash-card-current/.test(css),
    'Has dash-card-current styles'
  );

  // Check prediction cards stack
  assert(
    /dash-predictions.*flex-direction:\s*column/.test(css),
    'Prediction cards stack vertically on mobile'
  );

  // Check filter controls stack
  assert(
    /history-filters.*flex-direction:\s*column/.test(css),
    'Filter controls stack vertically on mobile'
  );

  // Check table horizontal scroll
  assert(
    /table-scroll/.test(css),
    'History table has horizontal scroll'
  );

  // Check Model Version column hidden on mobile
  assert(
    /model-version-col.*display:\s*none/.test(css),
    'Model Version column hidden on mobile'
  );
});

// ========== Test 14: Browse tab compatibility ==========
test('Browse tab v2 compatibility', () => {
  // Check handles v2 prediction files with values object
  assert(
    /prediction\.values/.test(weatherJs),
    'Handles prediction.values object'
  );

  // Check iterates keys dynamically
  assert(
    /Object\.keys.*prediction\.values/.test(weatherJs),
    'Iterates prediction.values keys dynamically'
  );

  // Check fallback to flat temp_indoor/temp_outdoor
  assert(
    /prediction\.temp_indoor/.test(weatherJs) && /prediction\.temp_outdoor/.test(weatherJs),
    'Has fallback to flat temperature fields'
  );

  // Check handles model_type badge
  assert(
    /model_type/.test(weatherJs) && /model-badge/.test(weatherJs),
    'Shows model_type badge if present'
  );
});

// ========== Test 15: No hardcoded field names in v2 path ==========
test('No hardcoded field names in v2 path', () => {
  // Extract renderV2 function and related v2 functions
  const v2Section = weatherJs.substring(
    weatherJs.indexOf('function renderV2'),
    weatherJs.lastIndexOf('function renderV1')
  );

  // Check v2 functions don't contain hardcoded property references
  // Allow them in formatProperty checks but not in rendering logic
  const hasHardcodedInV2 = /current\.readings\['temp_indoor'\]/.test(v2Section) ||
    /current\.readings\['temp_outdoor'\]/.test(v2Section) ||
    /values\['temp_indoor'\]/.test(v2Section);

  assert(
    !hasHardcodedInV2,
    'V2 rendering does not hardcode temp_indoor/temp_outdoor property names'
  );

  // Check uses Object.keys for dynamic iteration
  assert(
    /Object\.keys\(current\.readings\)/.test(weatherJs),
    'Uses Object.keys for current readings'
  );

  assert(
    /Object\.keys\(values\)/.test(weatherJs),
    'Uses Object.keys for prediction values'
  );
});

// Run all tests
console.log('\n=== Multi-Model Dashboard UI (V2) Tests ===\n');

tests.forEach(({ name, fn }) => {
  console.log(`Test: ${name}`);
  try {
    fn();
  } catch (e) {
    console.log(`  ✗ ERROR: ${e.message}`);
    failCount++;
  }
  console.log('');
});

console.log('='.repeat(50));
console.log(`Results: ${passCount} passed, ${failCount} failed`);
console.log('='.repeat(50));

process.exit(failCount > 0 ? 1 : 0);
