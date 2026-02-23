import { themedPanel } from './ThemedPanel.js';

export class UIPanel {
    constructor(scene, config) {
        this.scene = scene;
        this.config = config;
        this.children = [];

        const padding = config.padding ?? 6;

        this.content = {
            x: config.x + padding,
            y: config.y + padding,
            width: config.width - padding * 2,
            height: config.height - padding * 2,
        };

        const opts = {
            depth: config.depth || 0,
        };
        if (config.alpha !== undefined) opts.alpha = config.alpha;
        if (config.cornerSize !== undefined) opts.cornerSize = config.cornerSize;
        if (config.fx === false) opts.fx = false;

        this.bg = themedPanel(scene, config.x, config.y, config.width, config.height, config.theme, opts);

        this._childDepth = config.childDepth ?? ((config.depth || 0) + 1);
    }

    addText(text, style, opts = {}) {
        const align = opts.align || 'left';
        const offsetX = opts.offsetX || 0;
        const offsetY = opts.offsetY || 0;

        let x;
        if (align === 'right') {
            x = this.content.x + this.content.width + offsetX;
        } else if (align === 'center') {
            x = this.content.x + this.content.width / 2 + offsetX;
        } else {
            x = this.content.x + offsetX;
        }
        const y = this.content.y + offsetY;

        const textObj = this.scene.add.text(x, y, text, style);
        textObj.setDepth(this._childDepth);
        textObj.setScrollFactor(0);

        if (align === 'right') {
            textObj.setOrigin(1, 0);
        } else if (align === 'center') {
            textObj.setOrigin(0.5, 0);
        }

        this.children.push(textObj);
        return textObj;
    }

    setVisible(visible) {
        if (this.bg && this.bg.setVisible) this.bg.setVisible(visible);
        for (const child of this.children) {
            if (child && child.setVisible) child.setVisible(visible);
        }
    }

    destroy() {
        if (this.bg && this.bg.destroy) this.bg.destroy();
        for (const child of this.children) {
            if (child && child.destroy) child.destroy();
        }
        this.children.length = 0;
    }
}
