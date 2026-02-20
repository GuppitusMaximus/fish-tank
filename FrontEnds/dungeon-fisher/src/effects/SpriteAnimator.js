/**
 * Tween-based sprite animations.
 * Attach to any Phaser.GameObjects.Image to add idle/attack/hit/faint animations.
 */
export default class SpriteAnimator {
    constructor(scene, sprite) {
        this.scene = scene;
        this.sprite = sprite;
        this.baseX = sprite.x;
        this.baseY = sprite.y;
        this.baseScaleX = sprite.scaleX;
        this.baseScaleY = sprite.scaleY;
        this.idleTween = null;
        this.breathTween = null;
    }

    /** Gentle bobbing + breathing loop. Call once after placing the sprite. */
    idle() {
        // Vertical bob
        this.idleTween = this.scene.tweens.add({
            targets: this.sprite,
            y: this.baseY - 2,
            duration: 1200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut'
        });

        // Subtle scale breathing
        this.breathTween = this.scene.tweens.add({
            targets: this.sprite,
            scaleX: this.baseScaleX * 1.03,
            scaleY: this.baseScaleY * 0.97,
            duration: 1800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut'
        });

        return this;
    }

    /** Quick lunge toward target position, flash white, snap back. Returns a Promise. */
    attack(targetX, targetY) {
        return new Promise(resolve => {
            // Stop idle during attack
            this.stopIdle();

            const lungeX = this.baseX + (targetX - this.baseX) * 0.4;
            const lungeY = this.baseY + (targetY - this.baseY) * 0.2;

            // Lunge forward
            this.scene.tweens.add({
                targets: this.sprite,
                x: lungeX,
                y: lungeY,
                scaleX: this.baseScaleX * 1.15,
                scaleY: this.baseScaleY * 1.15,
                duration: 150,
                ease: 'Back.Out',
                onComplete: () => {
                    // Flash white at impact
                    this.sprite.setTintFill(0xffffff);
                    this.scene.time.delayedCall(80, () => {
                        this.sprite.clearTint();
                    });

                    // Snap back
                    this.scene.tweens.add({
                        targets: this.sprite,
                        x: this.baseX,
                        y: this.baseY,
                        scaleX: this.baseScaleX,
                        scaleY: this.baseScaleY,
                        duration: 300,
                        ease: 'Sine.Out',
                        onComplete: () => {
                            this.idle();
                            resolve();
                        }
                    });
                }
            });
        });
    }

    /** Brief red flash + shake on taking damage. Returns a Promise. */
    hit() {
        return new Promise(resolve => {
            this.sprite.setTint(0xff4444);

            // Shake horizontally
            this.scene.tweens.add({
                targets: this.sprite,
                x: this.baseX - 3,
                duration: 50,
                yoyo: true,
                repeat: 3,
                onComplete: () => {
                    this.sprite.x = this.baseX;
                    this.scene.time.delayedCall(100, () => {
                        this.sprite.clearTint();
                        resolve();
                    });
                }
            });
        });
    }

    /** Tilt, fade, and drop on KO. Returns a Promise. */
    faint() {
        return new Promise(resolve => {
            this.stopIdle();
            this.scene.tweens.add({
                targets: this.sprite,
                angle: 90,
                alpha: 0.3,
                y: this.baseY + 10,
                duration: 600,
                ease: 'Sine.In',
                onComplete: () => resolve()
            });
        });
    }

    /** Stop idle tweens (called internally before attack/faint). */
    stopIdle() {
        if (this.idleTween) { this.idleTween.destroy(); this.idleTween = null; }
        if (this.breathTween) { this.breathTween.destroy(); this.breathTween = null; }
        this.sprite.x = this.baseX;
        this.sprite.y = this.baseY;
        this.sprite.scaleX = this.baseScaleX;
        this.sprite.scaleY = this.baseScaleY;
    }

    /** Clean up all tweens. */
    destroy() {
        this.stopIdle();
    }
}
