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

        // Slow body sway — shifting weight side to side
        this.scene.tweens.add({
            targets: s,
            x: this.baseX - 2,
            duration: 1800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut'
        });

        // Breathing — gentle vertical bob + scale pulse
        this.scene.tweens.add({
            targets: s,
            y: this.baseY - 1.5,
            scaleY: this.baseScaleY * 1.02,
            duration: 1200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut'
        });

        // Hand rubbing — periodic quick horizontal squish/stretch
        this.scene.tweens.add({
            targets: s,
            scaleX: this.baseScaleX * 1.04,
            duration: 300,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut',
            repeatDelay: 1500
        });

        // Shifty lean — periodic tilt left and right
        this.scene.tweens.add({
            targets: s,
            angle: 1.5,
            duration: 2200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut'
        });

        // Eye glow — periodic red tint pulse
        this.scene.tweens.addCounter({
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
                const tint = Phaser.Display.Color.GetColor(r, g, b);
                s.setTint(tint);
            }
        });

        return this;
    }
}
