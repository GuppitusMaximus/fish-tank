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

    // Outer border — gold
    g.lineStyle(2, outer, 0.9);
    g.strokeRect(x + 1, y + 1, w - 2, h - 2);

    // Highlight bevel — bright gold line just inside outer border
    g.lineStyle(1, corner, 0.4);
    g.strokeRect(x + 3, y + 3, w - 6, h - 6);

    // Inner border — darker inset
    g.lineStyle(1, inner, 0.7);
    g.strokeRect(x + 5, y + 5, w - 10, h - 10);

    // Corner ornaments — larger diamonds with inner dot
    const cs = 5;
    const cornerPositions = [
        [x, y],
        [x + w, y],
        [x, y + h],
        [x + w, y + h]
    ];
    g.fillStyle(corner, 0.9);
    for (const [cx, cy] of cornerPositions) {
        g.fillTriangle(cx, cy - cs, cx + cs, cy, cx, cy + cs);
        g.fillTriangle(cx, cy - cs, cx - cs, cy, cx, cy + cs);
    }
    // Inner corner dots
    g.fillStyle(outer, 0.6);
    for (const [cx, cy] of cornerPositions) {
        g.fillCircle(cx, cy, 1.5);
    }

    // Edge midpoint ornaments — small diamonds centered on each edge
    const mx = x + w / 2;
    const my = y + h / 2;
    const ms = 3;
    g.fillStyle(corner, 0.7);
    // Top edge
    g.fillTriangle(mx - ms, y + 1, mx, y - ms + 2, mx + ms, y + 1);
    g.fillTriangle(mx - ms, y + 1, mx, y + ms, mx + ms, y + 1);
    // Bottom edge
    g.fillTriangle(mx - ms, y + h - 1, mx, y + h + ms - 2, mx + ms, y + h - 1);
    g.fillTriangle(mx - ms, y + h - 1, mx, y + h - ms, mx + ms, y + h - 1);
    // Left edge
    g.fillTriangle(x + 1, my - ms, x - ms + 2, my, x + 1, my + ms);
    g.fillTriangle(x + 1, my - ms, x + ms, my, x + 1, my + ms);
    // Right edge
    g.fillTriangle(x + w - 1, my - ms, x + w + ms - 2, my, x + w - 1, my + ms);
    g.fillTriangle(x + w - 1, my - ms, x + w - ms, my, x + w - 1, my + ms);

    // Decorative tick marks along edges
    g.lineStyle(1, corner, 0.3);
    const tickSpacing = 8;
    // Top and bottom ticks
    for (let tx = x + tickSpacing; tx < x + w - tickSpacing; tx += tickSpacing) {
        g.lineBetween(tx, y + 2, tx, y + 4);
        g.lineBetween(tx, y + h - 2, tx, y + h - 4);
    }
    // Left and right ticks
    for (let ty = y + tickSpacing; ty < y + h - tickSpacing; ty += tickSpacing) {
        g.lineBetween(x + 2, ty, x + 4, ty);
        g.lineBetween(x + w - 2, ty, x + w - 4, ty);
    }

    return g;
}
