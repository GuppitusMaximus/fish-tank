#!/usr/bin/env node
/**
 * QA test: qa-fix-atlas-panel-fx
 * Verifies NineSlice panel FX — shine sweep, glow pulse, scale entrance.
 *
 * Plan pass criteria:
 *   1. Shine effect:  preFX.addShine() with speed ~0.8, intensity ~0.3
 *   2. Glow effect:   preFX.addGlow() with theme.panel.accent; tween pulses outerStrength 0→2
 *   3. Scale entrance: starts at 0.95, tweens to 1.0 with Back.easeOut
 *   4. WebGL guard:   FX calls guarded by ns.preFX check
 *   5. Opt-out:       opts.fx !== false disables FX per panel
 *   6. Version bump:  PATCH increment from previous version
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

console.log('\nqa-fix-atlas-panel-fx — NineSlice Panel FX\n');

const panelSrc = readFileSync(join(ROOT, 'dungeon-fisher/src/ui/ThemedPanel.js'), 'utf8');
const versionSrc = readFileSync(join(ROOT, 'dungeon-fisher/src/version.js'), 'utf8');

// 1. Shine effect — speed 0.8, intensity 0.3
run('Shine: addShine called with speed 0.8 and intensity 0.3', () => {
  const ok = /preFX\.addShine\(0\.8\s*,\s*0\.3/.test(panelSrc);
  return check('preFX.addShine(0.8, 0.3, …)', ok);
});

// 2. Glow effect — theme.panel.accent color, outerStrength tweened to 2
run('Glow: addGlow called with theme.panel.accent', () => {
  const ok = /preFX\.addGlow\(theme\.panel\.accent/.test(panelSrc);
  return check('preFX.addGlow(theme.panel.accent, …)', ok);
});

run('Glow: tween pulses outerStrength to 2', () => {
  const ok = /outerStrength\s*:\s*2/.test(panelSrc);
  return check('outerStrength: 2 in tween', ok);
});

// 3. Scale entrance — setScale(0.95), Back.easeOut
run('Scale entrance: starts at 0.95', () => {
  const ok = /ns\.setScale\(0\.95\)/.test(panelSrc);
  return check('ns.setScale(0.95)', ok);
});

run('Scale entrance: eases with Back.easeOut', () => {
  const ok = /Back\.easeOut/.test(panelSrc);
  return check("ease: 'Back.easeOut'", ok);
});

// 4. WebGL guard — ns.preFX checked before FX calls
run('WebGL guard: preFX checked before shine call', () => {
  const ok = /if\s*\(\s*ns\.preFX[^)]*\)\s*\{[^}]*preFX\.addShine/.test(panelSrc.replace(/\n/g, ' '));
  return check('if (ns.preFX …) { …addShine }', ok);
});

run('WebGL guard: preFX checked before glow call', () => {
  const ok = /if\s*\(\s*ns\.preFX[^)]*\)\s*\{[^}]*preFX\.addGlow/.test(panelSrc.replace(/\n/g, ' '));
  return check('if (ns.preFX …) { …addGlow }', ok);
});

// 5. Opt-out — opts.fx !== false gates all three FX blocks
run('Opt-out: shine block checks opts.fx !== false', () => {
  // Match the guard that covers addShine
  const ok = /opts\.fx\s*!==\s*false[^}]*addShine|addShine[^{]*opts\.fx\s*!==\s*false/.test(panelSrc.replace(/\n/g, ' '));
  return check("opts.fx !== false guards addShine", ok);
});

run('Opt-out: glow block checks opts.fx !== false', () => {
  const ok = /opts\.fx\s*!==\s*false[^}]*addGlow|addGlow[^{]*opts\.fx\s*!==\s*false/.test(panelSrc.replace(/\n/g, ' '));
  return check("opts.fx !== false guards addGlow", ok);
});

run('Opt-out: scale block checks opts.fx !== false', () => {
  // scale entrance is a separate block
  const ok = /opts\.fx\s*!==\s*false[^{]*\{[^}]*setScale/.test(panelSrc.replace(/\n/g, ' '));
  return check("opts.fx !== false guards scale entrance", ok);
});

// 6. Version is PATCH bump (x.y.N >= 1 from prior x.y.(N-1))
run('Version: valid semver PATCH format', () => {
  const m = versionSrc.match(/VERSION\s*=\s*'(\d+)\.(\d+)\.(\d+)'/);
  if (!m) return check('VERSION in version.js', false, 'not found');
  const [, maj, min, patch] = m;
  const ok = parseInt(patch) >= 1;
  return check(`VERSION = ${maj}.${min}.${patch} (PATCH >= 1)`, ok);
});

console.log(`\n${passed + failed} checks — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
