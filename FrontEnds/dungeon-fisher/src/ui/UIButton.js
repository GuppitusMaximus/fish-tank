import { themedPanel } from './ThemedPanel.js';

export class UIButton {
    static create(scene, config) {
        const originX = config.origin ? config.origin.x : 0.5;
        const originY = config.origin ? config.origin.y : 0.5;
        const depth = config.depth || 0;

        const text = scene.add.text(config.x, config.y, config.label, config.style)
            .setOrigin(originX, originY)
            .setDepth(depth + 1)
            .setScrollFactor(0);

        if (config.color) text.setColor(config.color);

        let panel = null;

        if (config.theme) {
            const padX = config.padX ?? 12;
            const padY = config.padY ?? 6;
            const bounds = text.getBounds();
            const pw = bounds.width + padX * 2;
            const ph = bounds.height + padY * 2;
            const px = config.x - pw * originX;
            const py = config.y - ph * originY;

            const panelOpts = { depth: depth, alpha: 0.7, fx: false };
            if (config.cornerSize !== undefined) panelOpts.cornerSize = config.cornerSize;
            panel = themedPanel(scene, px, py, pw, ph, config.theme, panelOpts);

            text.setInteractive({
                hitArea: new Phaser.Geom.Rectangle(
                    -(padX) / text.scaleX,
                    -(padY) / text.scaleY,
                    pw / text.scaleX,
                    ph / text.scaleY
                ),
                hitAreaCallback: Phaser.Geom.Rectangle.Contains,
                useHandCursor: true,
            });
        } else {
            text.setInteractive({ useHandCursor: true });
        }

        const hoverScale = config.hoverScale ?? 1;
        const normalColor = config.color || text.style.color;

        text.on('pointerover', () => {
            if (config.hoverColor) text.setColor(config.hoverColor);
            if (hoverScale !== 1) {
                scene.tweens.add({
                    targets: text,
                    scaleX: hoverScale,
                    scaleY: hoverScale,
                    duration: 100,
                    ease: 'Sine.easeOut',
                });
            }
            if (panel && panel.setAlpha) panel.setAlpha(1);
        });

        text.on('pointerout', () => {
            text.setColor(normalColor);
            if (hoverScale !== 1) {
                scene.tweens.add({
                    targets: text,
                    scaleX: 1,
                    scaleY: 1,
                    duration: 100,
                    ease: 'Sine.easeOut',
                });
            }
            if (panel && panel.setAlpha) panel.setAlpha(0.7);
        });

        if (config.onClick) {
            text.on('pointerdown', config.onClick);
        }

        return {
            text,
            panel,
            setVisible(visible) {
                text.setVisible(visible);
                if (panel && panel.setVisible) panel.setVisible(visible);
            },
            destroy() {
                text.destroy();
                if (panel && panel.destroy) panel.destroy();
            },
        };
    }
}
