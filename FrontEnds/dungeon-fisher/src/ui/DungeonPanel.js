// Retro dungeon-styled UI panel with beveled stone borders and corner ornaments.
// Usage: dungeonPanel(scene, x, y, w, h, opts)
//   x, y = top-left corner (not center)
//   opts.alpha = fill opacity (default 0.7)
//   opts.fill  = fill color  (default 0x0a0a1e)
//   opts.outer = outer border color (default 0x8a7a5a)
//   opts.inner = inner border color (default 0x554433)
//   opts.corner = corner ornament color (default 0xccaa66)
//   opts.depth = depth value (default 0)
//   Returns the Graphics object

export default function dungeonPanel(scene, x, y, w, h, opts = {}) {
    const alpha = opts.alpha ?? 0.7;
    const fill  = opts.fill  ?? 0x0a0a1e;
    const outer = opts.outer ?? 0x8a7a5a;
    const inner = opts.inner ?? 0x554433;
    const corner = opts.corner ?? 0xccaa66;
    const depth = opts.depth ?? 0;

    const g = scene.add.graphics().setDepth(depth).setScrollFactor(0);

    // Fill
    g.fillStyle(fill, alpha);
    g.fillRect(x, y, w, h);

    // Outer border
    g.lineStyle(1, outer, 0.9);
    g.strokeRect(x, y, w, h);

    // Inner border (2px inset)
    g.lineStyle(1, inner, 0.7);
    g.strokeRect(x + 2, y + 2, w - 4, h - 4);

    // Corner ornaments - small diamonds at each corner
    const cs = 3;
    const corners = [
        [x, y],
        [x + w, y],
        [x, y + h],
        [x + w, y + h]
    ];
    g.fillStyle(corner, 0.8);
    for (const [cx, cy] of corners) {
        g.fillTriangle(cx, cy - cs, cx + cs, cy, cx, cy + cs);
        g.fillTriangle(cx, cy - cs, cx - cs, cy, cx, cy + cs);
    }

    return g;
}
