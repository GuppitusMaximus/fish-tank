#!/usr/bin/env node
/**
 * QA test: qa-fix-card-label-scrim
 * Verifies card label scrim over atlas bottom border in FloorScene.
 *
 * Plan pass criteria:
 *   1. No labelSpace variable: image sizing uses full contentH
 *   2. Image fills content area: centered at cy + inset + contentH / 2
 *   3. Scrim rectangle: 0x000000, alpha 0.75, height ~14px, width cardW - inset*2, depth 2.5
 *   4. Label on scrim: label Y is scrimY, depth 3
 *   5. Depth ordering: image(1) < frame(2) < scrim(2.5) < label(3) < hit(4)
 *   6. All three cards have scrim: scrim is inside cards.forEach loop
 *   7. Shimmer tween intact: per-card shimmer applies tint to label
 *   8. Version bumped: PATCH increment
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function check(name, pass, detail = '') {
  const symbol = pass ? '✓' : '✗';
  console.log(`  ${symbol} ${name}${detail ? ': ' + detail : ''}`);
  return pass;
}

let passed = 0;
let failed = 0;

function run(name, fn) {
  try {
    const ok = fn();
    if (ok) { passed++; } else { failed++; }
  } catch (e) {
    console.log(`  ✗ ${name}: THREW ${e.message}`);
    failed++;
  }
}

console.log('\nqa-fix-card-label-scrim — Card Label Scrim\n');

const floorSrc = readFileSync(join(ROOT, 'dungeon-fisher/src/scenes/FloorScene.js'), 'utf8');
const versionSrc = readFileSync(join(ROOT, 'dungeon-fisher/src/version.js'), 'utf8');

// 1. No labelSpace variable
run('No labelSpace: variable removed from FloorScene', () => {
  const ok = !/labelSpace/.test(floorSrc);
  return check('labelSpace not present', ok);
});

// 2. Image fills content area — centered at cy + inset + contentH / 2
run('Image: centered at cy + inset + contentH / 2', () => {
  const ok = /cy\s*\+\s*inset\s*\+\s*contentH\s*\/\s*2/.test(floorSrc);
  return check('cy + inset + contentH / 2', ok);
});

run('Image: scale uses contentH (not contentH minus offset)', () => {
  const ok = /contentH\s*\/\s*img\.height/.test(floorSrc);
  return check('imgScale uses contentH / img.height', ok);
});

// 3. Scrim rectangle — 0x000000, alpha 0.75, height 14, depth 2.5
run('Scrim: dark fill 0x000000, alpha 0.75', () => {
  const ok = /0x000000,\s*0\.75/.test(floorSrc);
  return check('rectangle(…, 0x000000, 0.75)', ok);
});

run('Scrim: height is 14px', () => {
  const ok = /scrimH\s*=\s*14/.test(floorSrc);
  return check('scrimH = 14', ok);
});

run('Scrim: depth is 2.5', () => {
  const ok = /\.setDepth\(2\.5\)/.test(floorSrc);
  return check('.setDepth(2.5)', ok);
});

// 4. Label on scrim — label Y is scrimY, depth 3
run('Label: positioned at scrimY', () => {
  // add.text(midX, scrimY, …) — scrimY used as label Y
  const ok = /add\.text\([^,]+,\s*scrimY/.test(floorSrc);
  return check('add.text(midX, scrimY, …)', ok);
});

run('Label: depth is 3', () => {
  // The label object uses setDepth(3)
  const ok = /\.setOrigin\(0\.5\)\.setDepth\(3\)/.test(floorSrc);
  return check('.setDepth(3) on label', ok);
});

// 5. Hit zone depth 4
run('Hit zone: depth is 4', () => {
  const ok = /\.setDepth\(4\)\.setInteractive/.test(floorSrc);
  return check('.setDepth(4).setInteractive', ok);
});

// 6. Scrim inside cards.forEach — all cards get the treatment
run('All cards: scrim inside cards.forEach loop', () => {
  // Find the forEach block and verify it contains scrimH and scrimY
  const forEachIdx = floorSrc.indexOf('cards.forEach(');
  const ok = forEachIdx !== -1 &&
    floorSrc.indexOf('scrimH', forEachIdx) !== -1 &&
    floorSrc.indexOf('scrimY', forEachIdx) !== -1;
  return check('scrimH and scrimY inside cards.forEach', ok);
});

// 7. Shimmer tween applies tint to label
run('Shimmer: per-card tween calls label.setTint', () => {
  const ok = /label\.setTint\(/.test(floorSrc);
  return check('label.setTint(…) in shimmer tween', ok);
});

// 8. Version is PATCH bump
run('Version: valid semver PATCH format', () => {
  const m = versionSrc.match(/VERSION\s*=\s*'(\d+)\.(\d+)\.(\d+)'/);
  if (!m) return check('VERSION in version.js', false, 'not found');
  const [, maj, min, patch] = m;
  const ok = parseInt(patch) >= 1;
  return check(`VERSION = ${maj}.${min}.${patch} (PATCH >= 1)`, ok);
});

console.log(`\n${passed + failed} checks — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
