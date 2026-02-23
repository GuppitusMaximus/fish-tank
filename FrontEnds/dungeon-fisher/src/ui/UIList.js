export class UIList {
    constructor(scene, config) {
        this.scene = scene;
        this.x = config.x;
        this.spacing = config.spacing ?? 18;
        this.depth = config.depth || 0;
        this.currentY = config.y;
        this._rows = [];
    }

    addRow(callback) {
        const objects = callback(this.x, this.currentY);
        if (Array.isArray(objects)) {
            for (const obj of objects) {
                if (obj && obj.setScrollFactor) obj.setScrollFactor(0);
            }
            this._rows.push(objects);
        }
        this.currentY += this.spacing;
        return objects;
    }

    get bottomY() {
        return this.currentY;
    }

    destroy() {
        for (const row of this._rows) {
            for (const obj of row) {
                if (obj && obj.destroy) obj.destroy();
            }
        }
        this._rows.length = 0;
    }
}
