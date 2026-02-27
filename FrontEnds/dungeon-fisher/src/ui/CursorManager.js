/**
 * Software cursor that follows the pointer with idle and click animations.
 *
 * Usage:
 *   CursorManager.attach(scene, fisherId)  — show custom cursor
 *   CursorManager.detach(scene)            — restore default cursor
 */
const CursorManager = {
    _sprite: null,
    _scene: null,
    _fisherId: null,
    _idleTween: null,
    _baseY: 0,

    attach(scene, fisherId) {
        // Skip software cursor on touch devices — users tap with fingers
        if (window.matchMedia?.('(pointer: coarse)')?.matches) return;

        this.detach();

        const id = fisherId || 'andy';
        const key = `cursor_${id}`;
        if (!scene.textures.exists(key)) {
            // Fallback to andy if character cursor missing
            if (id !== 'andy' && scene.textures.exists('cursor_andy')) {
                return this.attach(scene, 'andy');
            }
            return;
        }

        scene.input.setDefaultCursor('none');

        this._scene = scene;
        this._fisherId = id;

        // Position at current pointer — not (0,0)
        const pointer = scene.input.activePointer;
        this._sprite = scene.add.image(pointer.x, pointer.y, key)
            .setDepth(10000)
            .setScrollFactor(0)
            .setOrigin(0, 0);

        scene.input.on('pointermove', this._onMove, this);
        scene.input.on('pointerdown', this._onDown, this);

        this._startIdleBob(scene);
    },

    detach(optScene) {
        if (this._idleTween) {
            this._idleTween.destroy();
            this._idleTween = null;
        }
        if (this._sprite && this._sprite.active) {
            this._sprite.destroy();
        }
        this._sprite = null;
        if (this._scene && this._scene.input) {
            this._scene.input.off('pointermove', this._onMove, this);
            this._scene.input.off('pointerdown', this._onDown, this);
        }
        // Restore browser cursor — try scene first, fall back to canvas directly
        const cursorScene = optScene || this._scene;
        if (cursorScene && cursorScene.input && cursorScene.input.manager) {
            cursorScene.input.setDefaultCursor('default');
        } else if (typeof document !== 'undefined') {
            const canvas = document.querySelector('canvas');
            if (canvas) canvas.style.cursor = 'default';
        }
        this._scene = null;
        this._fisherId = null;
    },

    _ensureSprite() {
        if (this._sprite && this._sprite.active) {
            // Sprite may have been removed from display list by children.removeAll()
            if (this._scene.children.exists(this._sprite)) return true;
            this._scene.add.existing(this._sprite);
            this._sprite.setDepth(10000);
            this._startIdleBob(this._scene);
            return true;
        }
        if (!this._scene || !this._scene.textures) return false;
        const key = `cursor_${this._fisherId || 'andy'}`;
        if (!this._scene.textures.exists(key)) return false;
        this._sprite = this._scene.add.image(0, 0, key)
            .setDepth(10000)
            .setScrollFactor(0)
            .setOrigin(0, 0);
        this._startIdleBob(this._scene);
        return true;
    },

    _onMove(pointer) {
        if (!this._ensureSprite()) return;
        this._sprite.setPosition(pointer.x, pointer.y);
        this._baseY = pointer.y;
    },

    _onDown() {
        if (!this._sprite || !this._sprite.active || !this._scene) return;
        this._scene.tweens.add({
            targets: this._sprite,
            angle: { from: 0, to: 15 },
            duration: 80,
            yoyo: true,
            ease: 'Quad.easeOut',
        });
    },

    _startIdleBob(scene) {
        if (this._idleTween) {
            this._idleTween.destroy();
            this._idleTween = null;
        }
        if (!this._sprite) return;
        this._idleTween = scene.tweens.addCounter({
            from: 0, to: Math.PI * 2,
            duration: 1600,
            repeat: -1,
            onUpdate: (tween) => {
                if (this._sprite && this._sprite.active) {
                    this._sprite.y = this._baseY + Math.sin(tween.getValue()) * 2;
                }
            }
        });
    },
};

export default CursorManager;
