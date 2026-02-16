#!/usr/bin/env node

/**
 * QA Test: Multi-Select History Filters
 *
 * Verifies that the multi-select dropdown filters for model type and version
 * were implemented correctly in the weather dashboard.
 *
 * Tests:
 * 1. historyState uses arrays for filterModel and filterVersion
 * 2. createMultiSelect function exists and has correct signature
 * 3. Filter UI uses multi-select containers instead of text inputs
 * 4. applyHistoryFilters uses array-based filtering (indexOf)
 * 5. Version dropdown updates based on model selection
 * 6. Multi-select CSS classes exist in style.css
 * 7. Old text inputs and datalists are removed
 * 8. Date filters still work (not affected by changes)
 */

const fs = require('fs');
const path = require('path');

const WEATHER_JS = path.join(__dirname, '../the-fish-tank/js/weather.js');
const STYLE_CSS = path.join(__dirname, '../the-fish-tank/css/style.css');

let passCount = 0;
let failCount = 0;

function pass(message) {
  console.log(`✓ PASS: ${message}`);
  passCount++;
}

function fail(message, details) {
  console.log(`✗ FAIL: ${message}`);
  if (details) console.log(`  Details: ${details}`);
  failCount++;
}

function testHistoryStateArrays() {
  console.log('\n--- Test 1: historyState uses arrays ---');
  const content = fs.readFileSync(WEATHER_JS, 'utf-8');

  // Check filterModel is initialized as array
  if (/filterModel:\s*\[\]/.test(content)) {
    pass('historyState.filterModel initialized as array');
  } else {
    fail('historyState.filterModel not initialized as array', 'Expected: filterModel: []');
  }

  // Check filterVersion is initialized as array
  if (/filterVersion:\s*\[\]/.test(content)) {
    pass('historyState.filterVersion initialized as array');
  } else {
    fail('historyState.filterVersion not initialized as array', 'Expected: filterVersion: []');
  }
}

function testCreateMultiSelectFunction() {
  console.log('\n--- Test 2: createMultiSelect function exists ---');
  const content = fs.readFileSync(WEATHER_JS, 'utf-8');

  // Check function exists with correct signature
  if (/function createMultiSelect\(id,\s*options,\s*selected,\s*onChange\)/.test(content)) {
    pass('createMultiSelect function exists with correct signature (id, options, selected, onChange)');
  } else {
    fail('createMultiSelect function signature incorrect or missing');
  }

  // Check it creates dropdown container
  if (/container\.className\s*=\s*['"]multi-select['"]/.test(content)) {
    pass('createMultiSelect creates multi-select container');
  } else {
    fail('createMultiSelect does not create multi-select container');
  }

  // Check it creates trigger button
  if (/trigger\.className\s*=\s*['"]multi-select-trigger['"]/.test(content)) {
    pass('createMultiSelect creates trigger button');
  } else {
    fail('createMultiSelect does not create trigger button');
  }

  // Check it shows "All" when appropriate
  if (/selected\.length\s*===\s*0\s*\?\s*['"]All['"]/.test(content)) {
    pass('createMultiSelect shows "All" when no selections');
  } else {
    fail('createMultiSelect does not show "All" correctly');
  }

  // Check it has clear button
  if (/clearBtn\.className\s*=\s*['"]multi-select-clear['"]/.test(content)) {
    pass('createMultiSelect has "Clear all" button');
  } else {
    fail('createMultiSelect missing "Clear all" button');
  }
}

function testFilterUIUsesMultiSelect() {
  console.log('\n--- Test 3: Filter UI uses multi-select components ---');
  const content = fs.readFileSync(WEATHER_JS, 'utf-8');

  // Check for placeholder containers
  if (/['"]<span id="filter-model-container"><\/span>['"]/.test(content)) {
    pass('buildHistoryFilters creates filter-model-container placeholder');
  } else {
    fail('buildHistoryFilters missing filter-model-container placeholder');
  }

  if (/['"]<span id="filter-version-container"><\/span>['"]/.test(content)) {
    pass('buildHistoryFilters creates filter-version-container placeholder');
  } else {
    fail('buildHistoryFilters missing filter-version-container placeholder');
  }

  // Check buildFilterDropdowns creates multi-selects
  if (/createMultiSelect\(['"]filter-model['"]/.test(content)) {
    pass('buildFilterDropdowns creates model multi-select');
  } else {
    fail('buildFilterDropdowns does not create model multi-select');
  }

  if (/createMultiSelect\(['"]filter-version['"]/.test(content)) {
    pass('buildFilterDropdowns creates version multi-select');
  } else {
    fail('buildFilterDropdowns does not create version multi-select');
  }
}

function testArrayBasedFiltering() {
  console.log('\n--- Test 4: applyHistoryFilters uses array membership ---');
  const content = fs.readFileSync(WEATHER_JS, 'utf-8');

  // Check model filter uses indexOf
  if (/historyState\.filterModel\.indexOf\(entry\.model_type\)\s*===\s*-1/.test(content)) {
    pass('applyHistoryFilters uses array indexOf for model filtering');
  } else {
    fail('applyHistoryFilters does not use indexOf for model filtering');
  }

  // Check version filter uses indexOf with String conversion
  if (/historyState\.filterVersion\.indexOf\(String\(entry\.model_version\)\)\s*===\s*-1/.test(content)) {
    pass('applyHistoryFilters uses array indexOf for version filtering with String conversion');
  } else {
    fail('applyHistoryFilters does not use indexOf correctly for version filtering');
  }

  // Check empty array means "show all"
  if (/historyState\.filterModel\.length\s*>\s*0/.test(content)) {
    pass('applyHistoryFilters checks array length (empty = show all)');
  } else {
    fail('applyHistoryFilters does not check array length correctly');
  }
}

function testVersionOptionsUpdate() {
  console.log('\n--- Test 5: Version options update based on model selection ---');
  const content = fs.readFileSync(WEATHER_JS, 'utf-8');

  // Check version dropdown filters by selected models
  const versionBuildRegex = /historyState\.filterModel\.length\s*>\s*0\s*&&\s*historyState\.filterModel\.indexOf\(entry\.model_type\)\s*===\s*-1/;
  if (versionBuildRegex.test(content)) {
    pass('buildFilterDropdowns filters version options by selected models');
  } else {
    fail('buildFilterDropdowns does not filter version options by model selection');
  }

  // Check model onChange clears version selection
  const modelOnChangeMatch = content.match(/historyState\.filterModel\s*=\s*selected;[\s\S]{0,100}historyState\.filterVersion\s*=\s*\[\]/);
  if (modelOnChangeMatch) {
    pass('Model onChange callback clears version selection');
  } else {
    fail('Model onChange callback does not clear version selection');
  }
}

function testMultiSelectCSS() {
  console.log('\n--- Test 6: Multi-select CSS styles exist ---');
  const content = fs.readFileSync(STYLE_CSS, 'utf-8');

  const requiredClasses = [
    '.multi-select',
    '.multi-select-trigger',
    '.multi-select-dropdown',
    '.multi-select-option',
    '.multi-select-clear'
  ];

  for (const className of requiredClasses) {
    const escaped = className.replace(/\./g, '\\.').replace(/\s+/g, '\\s+');
    const regex = new RegExp(escaped + '\\s*\\{');
    if (regex.test(content)) {
      pass(`CSS class ${className} exists`);
    } else {
      fail(`CSS class ${className} missing`);
    }
  }

  // Check for .multi-select.open state (may be in a compound selector)
  if (/\.multi-select\.open/.test(content)) {
    pass('CSS class .multi-select.open exists');
  } else {
    fail('CSS class .multi-select.open missing');
  }
}

function testOldInputsRemoved() {
  console.log('\n--- Test 7: Old text inputs removed ---');
  const content = fs.readFileSync(WEATHER_JS, 'utf-8');

  // Check no old text inputs
  const oldInputPatterns = [
    /input type="text".*filter-model/i,
    /input type="text".*filter-version/i,
    /datalist.*model-type-list/i,
    /datalist.*model-version-list/i
  ];

  let foundOld = false;
  for (const pattern of oldInputPatterns) {
    if (pattern.test(content)) {
      fail(`Found old pattern: ${pattern}`, 'Old text input elements should be removed');
      foundOld = true;
    }
  }

  if (!foundOld) {
    pass('No old text input elements found (all removed)');
  }

  // Check no getElementById for old inputs
  if (/getElementById\(['"]filter-model['"]\)/.test(content) || /getElementById\(['"]filter-version['"]\)/.test(content)) {
    fail('Found getElementById for old filter inputs', 'Should use container IDs instead');
  } else {
    pass('No getElementById calls for old filter inputs');
  }
}

function testDateFiltersIntact() {
  console.log('\n--- Test 8: Date filters still work ---');
  const content = fs.readFileSync(WEATHER_JS, 'utf-8');

  // Check date inputs still exist
  if (/input type="date".*filter-date-start/.test(content)) {
    pass('Date start input still exists');
  } else {
    fail('Date start input missing');
  }

  if (/input type="date".*filter-date-end/.test(content)) {
    pass('Date end input still exists');
  } else {
    fail('Date end input missing');
  }

  // Check date filtering logic intact
  if (/historyState\.filterDateStart\s*&&\s*d\s*<\s*historyState\.filterDateStart/.test(content)) {
    pass('Date start filtering logic intact');
  } else {
    fail('Date start filtering logic broken');
  }

  if (/historyState\.filterDateEnd\s*&&\s*d\s*>\s*historyState\.filterDateEnd/.test(content)) {
    pass('Date end filtering logic intact');
  } else {
    fail('Date end filtering logic broken');
  }
}

// Run all tests
console.log('='.repeat(60));
console.log('QA Test: Multi-Select History Filters');
console.log('='.repeat(60));

testHistoryStateArrays();
testCreateMultiSelectFunction();
testFilterUIUsesMultiSelect();
testArrayBasedFiltering();
testVersionOptionsUpdate();
testMultiSelectCSS();
testOldInputsRemoved();
testDateFiltersIntact();

// Summary
console.log('\n' + '='.repeat(60));
console.log(`SUMMARY: ${passCount} passed, ${failCount} failed`);
console.log('='.repeat(60));

process.exit(failCount > 0 ? 1 : 0);
