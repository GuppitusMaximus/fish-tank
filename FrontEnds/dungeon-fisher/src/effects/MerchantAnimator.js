export default class MerchantAnimator {
    constructor(scene, sprite) {
        this.scene = scene;
        this.sprite = sprite;
        this.baseX = sprite.x;
        this.baseY = sprite.y;
        this.baseScaleX = sprite.scaleX;
        this.baseScaleY = sprite.scaleY;
    }

    animate() {
        const s = this.sprite;
        const scene = this.scene;

        // Body sway — shifting weight side to side
        scene.tweens.add({
            targets: s,
            x: this.baseX - 2,
            duration: 1800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut'
        });

        // Breathing — gentle vertical bob
        scene.tweens.add({
            targets: s,
            y: this.baseY - 1.5,
            scaleY: this.baseScaleY * 1.02,
            duration: 1200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut'
        });

        // Shifty lean
        scene.tweens.add({
            targets: s,
            angle: 1.5,
            duration: 2200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut'
        });

        // Eye glow — periodic red tint pulse
        scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 800,
            yoyo: true,
            repeat: -1,
            repeatDelay: 2000,
            ease: 'Sine.InOut',
            onUpdate: (tween) => {
                const v = tween.getValue();
                const r = Math.floor(200 + v * 55);
                const g = Math.floor(180 - v * 80);
                const b = Math.floor(180 - v * 80);
                s.setTint(Phaser.Display.Color.GetColor(r, g, b));
            }
        });

        // Programmatic claws — two small hands that rub together
        const clawDepth = (s.depth || 0) + 1;
        const clawY = this.baseY + s.displayHeight * 0.15;
        const clawCenterX = this.baseX - s.displayWidth * 0.05;

        const leftClaw = this._drawClaw(scene, clawCenterX - 6, clawY, false, clawDepth);
        const rightClaw = this._drawClaw(scene, clawCenterX + 6, clawY, true, clawDepth);

        // Rubbing motion — hands slide past each other horizontally
        scene.tweens.add({
            targets: leftClaw,
            x: leftClaw.x + 5,
            duration: 400,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut',
            repeatDelay: 600
        });
        scene.tweens.add({
            targets: rightClaw,
            x: rightClaw.x - 5,
            duration: 400,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut',
            repeatDelay: 600
        });

        // Subtle vertical offset so hands aren't perfectly synced
        scene.tweens.add({
            targets: leftClaw,
            y: leftClaw.y - 1.5,
            duration: 500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut'
        });
        scene.tweens.add({
            targets: rightClaw,
            y: rightClaw.y + 1,
            duration: 450,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut'
        });

        return this;
    }

    _drawClaw(scene, x, y, mirrored, depth) {
        const g = scene.add.graphics().setDepth(depth).setScrollFactor(0);
        const dir = mirrored ? -1 : 1;

        // Arm stub from sleeve
        g.fillStyle(0x6b5a3a, 1);
        g.fillRect(-3 * dir, -1, 6, 4);

        // Wrist / palm
        g.fillStyle(0xc4a882, 1);
        g.fillRect(2 * dir, -2, 5, 5);

        // Three clawed fingers
        g.fillStyle(0xc4a882, 1);
        g.fillRect(6 * dir, -3, 3, 2);
        g.fillRect(7 * dir, 0, 3, 2);
        g.fillRect(6 * dir, 3, 3, 2);

        // Claw tips — yellowish
        g.fillStyle(0xccaa44, 1);
        g.fillRect(8 * dir, -3, 2, 1);
        g.fillRect(9 * dir, 0, 2, 1);
        g.fillRect(8 * dir, 3, 2, 1);

        g.setPosition(x, y);
        return g;
    }
}
