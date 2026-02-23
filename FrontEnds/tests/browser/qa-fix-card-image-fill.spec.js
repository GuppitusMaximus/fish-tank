/**
 * QA Regression: fix-card-image-fill
 *
 * Verifies that opaque fill rectangles (0x111111, alpha 1) are placed behind
 * card images in FloorScene to prevent zone background bleeding through
 * transparent PNG pixels.
 *
 * Plan: qa-fix-card-image-fill
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FLOOR_SCENE = path.resolve(__dirname, '../../dungeon-fisher/src/scenes/FloorScene.js');

function readScene() {
    return fs.readFileSync(FLOOR_SCENE, 'utf8');
}

test('fill rectangle (0x111111, alpha 1) exists inside cards.forEach loop', () => {
    const src = readScene();
    // Ensure it appears after 'cards.forEach' and before the end of that block
    const forEachIdx = src.indexOf('cards.forEach(');
    expect(forEachIdx).toBeGreaterThan(-1);

    const afterForEach = src.slice(forEachIdx);
    // Rectangle with color 0x111111 and alpha 1
    expect(afterForEach).toMatch(/add\.rectangle\(.*0x111111,\s*1\)/);
});

test('fill rectangle has depth 0.5', () => {
    const src = readScene();
    // The fill rectangle line should chain .setDepth(0.5)
    expect(src).toMatch(/add\.rectangle\([^)]*0x111111,\s*1\)[^;]*\.setDepth\(0\.5\)/);
});

test('fill rectangle has scrollFactor 0', () => {
    const src = readScene();
    // The fill rectangle line should chain .setScrollFactor(0)
    expect(src).toMatch(/add\.rectangle\([^)]*0x111111,\s*1\)[^;]*\.setScrollFactor\(0\)/);
});

test('fill rectangle is positioned at content center (cy + inset + contentH / 2)', () => {
    const src = readScene();
    expect(src).toMatch(/add\.rectangle\(midX,\s*cy\s*\+\s*inset\s*\+\s*contentH\s*\/\s*2/);
});

test('fill rectangle dimensions are cardW - inset * 2 by contentH', () => {
    const src = readScene();
    expect(src).toMatch(/add\.rectangle\(midX,\s*cy\s*\+\s*inset\s*\+\s*contentH\s*\/\s*2,\s*cardW\s*-\s*inset\s*\*\s*2,\s*contentH/);
});

test('fill rectangle is inside the cards.forEach loop (applies to all rendered cards)', () => {
    const src = readScene();
    const forEachIdx = src.indexOf('cards.forEach(');
    const fillIdx = src.indexOf('0x111111, 1)');
    expect(forEachIdx).toBeGreaterThan(-1);
    expect(fillIdx).toBeGreaterThan(forEachIdx);
    // Ensure the fill is before the closing of the forEach block (not after)
    // Check fill appears before the hit zone (which is also inside forEach)
    const hitIdx = src.indexOf("setInteractive({ useHandCursor: true })");
    expect(fillIdx).toBeLessThan(hitIdx);
});

test('version is at least 1.10.32 (PATCH bumped for fix)', () => {
    const versionFile = path.resolve(__dirname, '../../dungeon-fisher/src/version.js');
    const versionSrc = fs.readFileSync(versionFile, 'utf8');
    const match = versionSrc.match(/VERSION\s*=\s*'(\d+)\.(\d+)\.(\d+)'/);
    expect(match).not.toBeNull();
    const [, major, minor, patch] = match.map(Number);
    // Must be at least 1.10.32
    const isAtLeast =
        major > 1 ||
        (major === 1 && minor > 10) ||
        (major === 1 && minor === 10 && patch >= 32);
    expect(isAtLeast).toBe(true);
});
