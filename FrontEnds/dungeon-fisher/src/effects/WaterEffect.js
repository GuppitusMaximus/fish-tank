export default class WaterEffect {
    constructor(scene, x, y, opts = {}) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        const depth = opts.depth ?? 1;
        const discW = opts.width ?? 70;
        const discH = opts.height ?? 30;

        // Dark water disc (ellipse)
        this.disc = scene.add.graphics().setDepth(depth);
        this.disc.fillStyle(0x0a2a4a, 0.7);
        this.disc.fillEllipse(x, y + 18, discW, discH);
        this.disc.fillStyle(0x1a4a6a, 0.4);
        this.disc.fillEllipse(x, y + 18, discW - 12, discH - 8);

        // Ripple rings — two concentric ellipses that pulse
        this.ripple1 = scene.add.graphics().setDepth(depth).setAlpha(0.5);
        this.ripple2 = scene.add.graphics().setDepth(depth).setAlpha(0.3);
        this._drawRipple(this.ripple1, x, y + 18, discW + 4, discH + 2, 0x4a8aaa);
        this._drawRipple(this.ripple2, x, y + 18, discW + 10, discH + 5, 0x3a7a9a);

        // Pulse ripples
        scene.tweens.add({
            targets: this.ripple1,
            alpha: { from: 0.5, to: 0.1 },
            scaleX: { from: 1, to: 1.15 },
            scaleY: { from: 1, to: 1.2 },
            duration: 2000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut'
        });
        scene.tweens.add({
            targets: this.ripple2,
            alpha: { from: 0.3, to: 0.05 },
            scaleX: { from: 1, to: 1.2 },
            scaleY: { from: 1, to: 1.25 },
            duration: 2800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut'
        });

        // Bubbles — 3 small circles rising with wobble
        this.bubbles = [];
        for (let i = 0; i < 3; i++) {
            const bx = x + (Math.random() - 0.5) * (discW * 0.6);
            const by = y + 10 - Math.random() * 20;
            const r = 1.5 + Math.random() * 1.5;
            const bubble = scene.add.graphics().setDepth(depth + 1);
            bubble.fillStyle(0x88ccee, 0.6);
            bubble.fillCircle(0, 0, r);
            bubble.lineStyle(0.5, 0xaaddff, 0.8);
            bubble.strokeCircle(0, 0, r);
            bubble.setPosition(bx, by);
            this.bubbles.push({ gfx: bubble, startX: bx, baseY: y + 18, r });

            // Rise + wobble + fade, then reset
            this._animateBubble(bubble, bx, y + 18, i * 800);
        }
    }

    _drawRipple(gfx, x, y, w, h, color) {
        gfx.lineStyle(1, color, 1);
        gfx.strokeEllipse(x, y, w, h);
    }

    _animateBubble(bubble, startX, baseY, delay) {
        const rise = 35 + Math.random() * 20;
        const duration = 2500 + Math.random() * 1500;
        const wobble = 4 + Math.random() * 4;

        bubble.setPosition(startX + (Math.random() - 0.5) * 20, baseY);
        bubble.setAlpha(0);

        this.scene.tweens.add({
            targets: bubble,
            y: baseY - rise,
            alpha: { from: 0.6, to: 0 },
            duration: duration,
            delay: delay,
            ease: 'Sine.Out',
            onUpdate: (tween) => {
                const p = tween.progress;
                bubble.x = startX + Math.sin(p * Math.PI * 2) * wobble;
            },
            onComplete: () => {
                this._animateBubble(bubble, startX, baseY, 200 + Math.random() * 600);
            }
        });
    }

    destroy() {
        this.disc.destroy();
        this.ripple1.destroy();
        this.ripple2.destroy();
        for (const b of this.bubbles) b.gfx.destroy();
        this.bubbles = [];
    }
}
