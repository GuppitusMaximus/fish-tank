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
        this.detach();

        const id = fisherId || 'andy';
        const key = `cursor_${id}`;
        if (!scene.textures.exists(key)) {
            if (id !== 'andy' && scene.textures.exists('cursor_andy')) {
                return this.attach(scene, 'andy');
            }
            return;
        }

        scene.input.setDefaultCursor('none');

        this._scene = scene;
        this._fisherId = id;

        // Position at current pointer immediately — not (0,0)
        const pointer = scene.input.activePointer;
        this._sprite = scene.add.image(pointer.x, pointer.y, key)
            .setDepth(10000)
            .setScrollFactor(0)
            .setOrigin(0, 0);
        this._baseY = pointer.y;

        // Track pointer every frame via update loop — more reliable than pointermove events
        scene.events.on('update', this._onUpdate, this);
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
        if (this._scene) {
            this._scene.events.off('update', this._onUpdate, this);
            if (this._scene.input) {
                this._scene.input.off('pointerdown', this._onDown, this);
            }
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

    _onUpdate() {
        if (!this._sprite || !this._sprite.active) return;
        if (!this._scene || !this._scene.input) return;
        const pointer = this._scene.input.activePointer;
        this._sprite.x = pointer.x;
        this._baseY = pointer.y;
        // Don't set y directly — let the idle bob tween handle y offset from _baseY
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
        // Bob around the pointer's y position — update target each frame
        this._idleTween = scene.tweens.addCounter({
            from: 0,
            to: Math.PI * 2,
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
