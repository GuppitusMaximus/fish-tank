# QA Report: Wire Generated Sprites into Dungeon Fisher
Plan: qa-wire-sprites-dungeon-fisher
Status: completed
Date: 2026-02-19
Agent: qa-frontend

## Summary

All 7 verification checks passed. Sprite integration is correct — placeholder `generateTexture` calls have been fully replaced with real pixel art image loads, scale values are appropriate for 128px sprites, texture keys are consistent throughout all scenes, and no dead references remain.

## Results

### Check 1: BootScene loads all sprites ✅ PASS
- `BootScene.js` has a `preload()` method
- Loads exactly **10 fish** sprites: guppy, pufferfish, swordfish, clownfish, anglerfish, barracuda, jellyfish, seahorse, manta_ray, golden_koi
- Loads exactly **13 monster** sprites: sewer_rat, cave_bat, goblin, spider, skeleton, slime, ogre, wraith, golem, demon, dragon, shadow_lord, dungeon_lord
- **No `generateTexture` calls remain** anywhere in the codebase

### Check 2: All sprite files exist ✅ PASS
- `public/sprites/fish/` — 10 PNGs present, filenames match BootScene IDs exactly
- `public/sprites/monsters/` — 13 PNGs present, filenames match BootScene IDs exactly

### Check 3: pixelArt mode ✅ PASS
- `main.js` has `pixelArt: true` (plus `roundPixels: true`)

### Check 4: Scale factors appropriate for 128px sprites ✅ PASS
- **BattleScene**: monster `setScale(0.5)`, fish `setScale(0.75)` — correct for 128px sprites
- **TitleScene**: starter fish `setScale(0.5)` in both portrait and landscape layouts
- **FloorScene**: fish reward `setScale(0.75)` — correct
- No old `setScale(3)` or `setScale(2)` values remain

### Check 5: Texture key consistency ✅ PASS
All `fish_` and `monster_` references in scene files use keys that exactly match BootScene's loaded keys:
- BattleScene uses `'monster_' + this.monster.id` and `'fish_' + this.fish.speciesId` dynamically
- TitleScene uses `fish_${species.id}` from FISH_SPECIES data
- FloorScene uses `'fish_' + species.id` for recruit display
- FISH_SPECIES IDs and MONSTER_TYPES IDs match BootScene load keys 1:1

### Check 6: button_bg removal ✅ PASS
- No references to `button_bg` exist anywhere in the codebase

### Check 7: Regression checks ✅ PASS
- Fish switch menu in BattleScene (line 303): `this.fishSpr.setTexture('fish_' + this.fish.speciesId)` — correct
- FloorScene recruit display (line 159): `this.add.image(W / 2, H * 0.52, 'fish_' + species.id).setScale(0.75)` — correct

## Files Verified

- `dungeon-fisher/src/scenes/BootScene.js` — preload(), 10 fish + 13 monsters
- `dungeon-fisher/src/main.js` — pixelArt: true
- `dungeon-fisher/src/scenes/BattleScene.js` — scale(0.5/0.75), setTexture, no button_bg
- `dungeon-fisher/src/scenes/TitleScene.js` — scale(0.5), fish_ key references
- `dungeon-fisher/src/scenes/FloorScene.js` — scale(0.75), fish_ key references
- `dungeon-fisher/src/data/fish.js` — 10 species IDs match BootScene
- `dungeon-fisher/src/data/monsters.js` — 13 monster IDs match BootScene
- `dungeon-fisher/public/sprites/fish/` — 10 PNG files
- `dungeon-fisher/public/sprites/monsters/` — 13 PNG files

## Bugs Filed

None.
