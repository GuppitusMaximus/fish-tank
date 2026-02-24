import dungeonPanel from './DungeonPanel.js';

export function themedPanel(scene, x, y, w, h, theme, opts = {}) {
  // Composite atlas — tiled pieces, best for ornate art
  if (theme.compositeKey && scene.textures.exists(theme.compositeKey)) {
    return createCompositePanel(scene, x, y, w, h, theme, opts);
  }
  // Nineslice — whole-texture stretch
  if (theme.atlasKey && scene.textures.exists(theme.atlasKey)) {
    return createNineSlicePanel(scene, x, y, w, h, theme, opts);
  }
  // Procedural fallback
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

function createCompositePanel(scene, x, y, w, h, theme, opts) {
  const ps = theme.pieceSize || 32;
  const key = theme.compositeKey;

  const rt = scene.add.renderTexture(x + w / 2, y + h / 2, w, h);

  // Corners (always drawn, may overlap on small panels)
  rt.drawFrame(key, 'corner_tl', 0, 0);
  rt.drawFrame(key, 'corner_tr', w - ps, 0);
  rt.drawFrame(key, 'corner_bl', 0, h - ps);
  rt.drawFrame(key, 'corner_br', w - ps, h - ps);

  // Top/bottom edges — tiled
  for (let xi = ps; xi < w - ps; xi += ps) {
    rt.drawFrame(key, 'edge_top', xi, 0);
    rt.drawFrame(key, 'edge_bottom', xi, h - ps);
  }

  // Left/right edges — tiled
  for (let yi = ps; yi < h - ps; yi += ps) {
    rt.drawFrame(key, 'edge_left', 0, yi);
    rt.drawFrame(key, 'edge_right', w - ps, yi);
  }

  // Center fill — tiled (fillAlpha: 0 makes center transparent for card image layering)
  const fillAlpha = opts.fillAlpha !== undefined ? opts.fillAlpha : 1;
  if (fillAlpha > 0) {
    for (let yi = ps; yi < h - ps; yi += ps) {
      for (let xi = ps; xi < w - ps; xi += ps) {
        rt.drawFrame(key, 'center', xi, yi, fillAlpha);
      }
    }
  }

  rt.setDepth(opts.depth || 0);
  rt.setAlpha(opts.alpha !== undefined ? opts.alpha : 1);
  rt.setScrollFactor(0);

  if (rt.preFX && opts.fx !== false) {
    rt.preFX.addShine(0.8, 0.3, 3);
  }
  if (rt.preFX && opts.fx !== false && theme.panel) {
    const glow = rt.preFX.addGlow(theme.panel.accent, 0, 0, false, 0.1, 16);
    scene.tweens.add({
      targets: glow, outerStrength: 2, duration: 2000,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
  }
  if (opts.fx !== false) {
    rt.setScale(0.95);
    scene.tweens.add({
      targets: rt, scaleX: 1, scaleY: 1,
      duration: 400, ease: 'Back.easeOut'
    });
  }

  return rt;
}

function createNineSlicePanel(scene, x, y, w, h, theme, opts) {
  const cornerSize = opts.cornerSize || Math.min(16, Math.floor(Math.min(w, h) / 12));
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

  // Rounded corner mask
  const radius = opts.borderRadius !== undefined ? opts.borderRadius : 6;
  if (radius > 0) {
    const maskGfx = scene.make.graphics({ add: false });
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillRoundedRect(x, y, w, h, radius);
    ns.setMask(maskGfx.createGeometryMask());
  }

  // FX — shine sweep across the surface
  if (ns.preFX && opts.fx !== false) {
    ns.preFX.addShine(0.8, 0.3, 3);
  }

  // Glow — zone-colored, starts subtle
  if (ns.preFX && opts.fx !== false && theme.panel) {
    const glow = ns.preFX.addGlow(theme.panel.accent, 0, 0, false, 0.1, 16);
    scene.tweens.add({
      targets: glow,
      outerStrength: 2,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  // Scale entrance — pop in from 0.95
  if (opts.fx !== false) {
    ns.setScale(0.95);
    scene.tweens.add({
      targets: ns,
      scaleX: 1,
      scaleY: 1,
      duration: 400,
      ease: 'Back.easeOut'
    });
  }

  return ns;
}
