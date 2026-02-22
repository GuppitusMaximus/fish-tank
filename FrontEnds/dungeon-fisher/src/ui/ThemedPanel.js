import dungeonPanel from './DungeonPanel.js';

export function themedPanel(scene, x, y, w, h, theme, opts = {}) {
  if (theme.atlasKey && scene.textures.exists(theme.atlasKey)) {
    return createNineSlicePanel(scene, x, y, w, h, theme, opts);
  }
  return dungeonPanel(scene, x, y, w, h, {
    fill: theme.panel.fill,
    outer: theme.panel.outer,
    inner: theme.panel.inner,
    corner: theme.panel.accent,
    depth: opts.depth || 0,
    alpha: opts.alpha || 0.7,
    ...opts,
  });
}

function createNineSlicePanel(scene, x, y, w, h, theme, opts) {
  const cornerSize = Math.min(16, Math.floor(Math.min(w, h) / 12));
  const ns = scene.add.nineslice(
    x + w / 2, y + h / 2,
    theme.atlasKey,
    null,
    w, h,
    cornerSize, cornerSize, cornerSize, cornerSize
  );
  ns.setDepth(opts.depth || 0);
  ns.setAlpha(opts.alpha !== undefined ? opts.alpha : 1);
  ns.setScrollFactor(0);
  return ns;
}
