/**
 * QA Regression: fix-card-image-fill
 *
 * Originally verified that opaque fill rectangles (0x111111, alpha 1) were
 * placed behind card images in FloorScene to prevent zone background bleeding.
 *
 * UPDATED: Plan fix-card-panels-use-nineslice superseded this approach.
 * The fill rectangle was removed — nineslice panels now render correctly
 * without requiring an opaque background fill. The card image (depth 3)
 * sits on top of the nineslice frame (depth 2) directly.
 *
 * These tests now verify the post-supersession state.
 *
 * Plan: qa-fix-card-image-fill (superseded by qa-browser-fix-card-panels-use-nineslice)
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FLOOR_SCENE = path.resolve(__dirname, '../../dungeon-fisher/src/scenes/FloorScene.js');

function readScene() {
    return fs.readFileSync(FLOOR_SCENE, 'utf8');
}

test('cards.forEach loop exists in FloorScene', () => {
    const src = readScene();
    const forEachIdx = src.indexOf('cards.forEach(');
    expect(forEachIdx).toBeGreaterThan(-1);
});

test('no opaque fill rectangle (0x111111, alpha 1) in card loop — superseded by nineslice', () => {
    const src = readScene();
    // The fill rectangle approach was removed in fix-card-panels-use-nineslice
    expect(src).not.toMatch(/add\.rectangle\([^)]*0x111111,\s*1\)/);
});

test('card image is created at depth 3 (above the panel frame at depth 2)', () => {
    const src = readScene();
    const forEachIdx = src.indexOf('cards.forEach(');
    const afterForEach = src.slice(forEachIdx);
    // Image is added via this.add.image(..., card.key) and later img.setDepth(3)
    expect(afterForEach).toMatch(/this\.add\.image\(.*card\.key\)/s);
    expect(afterForEach).toMatch(/img\.setScale\(.*\)\.setDepth\(3\)/s);
});

test('compositeKey is deleted from cardTheme (forces nineslice over composite atlas)', () => {
    const src = readScene();
    expect(src).toMatch(/delete cardTheme\.compositeKey/);
});

test('version is at least 1.13.28 (bumped for nineslice migration)', () => {
    const versionFile = path.resolve(__dirname, '../../dungeon-fisher/src/version.js');
    const versionSrc = fs.readFileSync(versionFile, 'utf8');
    const match = versionSrc.match(/VERSION\s*=\s*'(\d+)\.(\d+)\.(\d+)'/);
    expect(match).not.toBeNull();
    const [, major, minor, patch] = match.map(Number);
    // Must be at least 1.13.28
    const isAtLeast =
        major > 1 ||
        (major === 1 && minor > 13) ||
        (major === 1 && minor === 13 && patch >= 28);
    expect(isAtLeast).toBe(true);
});
