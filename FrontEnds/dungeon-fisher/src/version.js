// Semantic Versioning: MAJOR.MINOR.PATCH
//   MAJOR — large game changes, system overhauls, breaking save changes
//   MINOR — new features, content additions (fish, scenes, mechanics)
//   PATCH — bug fixes, UI tweaks, balance tuning
export const VERSION = '0.10.0';

// Save format version — bump when save data structure changes.
// This is separate from the game version because UI/balance changes
// (which bump MINOR/PATCH) don't affect save compatibility.
// Only bump this when the save schema actually changes.
export const SAVE_FORMAT_VERSION = 2;
