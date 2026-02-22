import { coverBackground } from '../utils/zones.js';
import { addEffects } from '../effects/BackgroundEffects.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { ZONE_THEMES } from '../data/themes.js';
import { themedPanel } from '../ui/ThemedPanel.js';

const ZONES = Object.values(ZONE_THEMES)
    .sort((a, b) => a.floorRange[0] - b.floorRange[0])
    .map(z => ({
        key: z.bgKey,
        name: z.name,
        floors: z.floorRange[0] + ' - ' + z.floorRange[1],
        flavor: z.flavor,
        theme: z
    }));

export default class ZonePreviewScene extends Phaser.Scene {
    constructor() {
        super('ZonePreviewScene');
    }

    create() {
        this.currentIndex = 0;
        this.transitioning = false;
        this.effectsHandle = null;

        this.showZone(0);
        this.setupInput();
    }

    showZone(index) {
        const { width, height } = this.scale;
        const zone = ZONES[index];

        this.children.removeAll();
        this.tweens.killAll();
        if (this.effectsHandle) {
            this.effectsHandle.cleanup();
            this.effectsHandle = null;
        }

        // Background + effects
        coverBackground(this, zone.key);
        this.effectsHandle = addEffects(this, zone.key);

        // Themed panels for text readability
        themedPanel(this, 0, 0, width, 40, zone.theme, { alpha: 0.85 });
        themedPanel(this, 0, height - 44, width, 44, zone.theme, { alpha: 0.85 });

        // Zone name
        this.add.text(width / 2, 10, zone.name,
            makeStyle(TEXT_STYLES.TITLE_MEDIUM, { fontSize: '16px' })
        ).setOrigin(0.5);

        // Floor range
        this.add.text(width / 2, 26, 'Floors ' + zone.floors,
            makeStyle(TEXT_STYLES.BODY_SMALL, { color: '#aaaaaa' })
        ).setOrigin(0.5);

        // Flavor text
        this.add.text(width / 2, height - 32, zone.flavor,
            makeStyle(TEXT_STYLES.FLAVOR, { color: '#aaaacc' })
        ).setOrigin(0.5);

        // Theme sample panel
        const sampleW = width * 0.6;
        const sampleH = 70;
        const sampleX = (width - sampleW) / 2;
        const sampleY = height * 0.4;
        themedPanel(this, sampleX, sampleY, sampleW, sampleH, zone.theme, { alpha: 0.9 });
        const accentHex = '#' + zone.theme.panel.accent.toString(16).padStart(6, '0');
        this.add.text(width / 2, sampleY + sampleH / 2, 'Theme Preview',
            makeStyle(TEXT_STYLES.BODY_SMALL, { color: accentHex })
        ).setOrigin(0.5);

        // Dot indicators
        const dotY = height - 18;
        const totalDots = ZONES.length;
        const dotSpacing = 10;
        const dotsStartX = width / 2 - ((totalDots - 1) * dotSpacing) / 2;
        for (let i = 0; i < totalDots; i++) {
            const x = dotsStartX + i * dotSpacing;
            this.add.circle(x, dotY, 2.5, i === index ? 0xf0c040 : 0x555566)
                .setAlpha(i === index ? 1.0 : 0.5);
        }

        // Back button
        const backBtn = this.add.text(width / 2, height - 7, '[ BACK ]',
            makeStyle(TEXT_STYLES.BUTTON, { fontSize: '11px' })
        ).setOrigin(0.5).setInteractive({ useHandCursor: true });
        backBtn.on('pointerover', () => backBtn.setColor('#ffffff'));
        backBtn.on('pointerout', () => backBtn.setColor('#aaaacc'));
        backBtn.on('pointerdown', () => this.scene.start('TitleScene'));

        // Navigation arrows
        const leftArrow = this.add.text(8, height / 2, '<',
            makeStyle(TEXT_STYLES.BUTTON, { fontSize: '18px', color: index > 0 ? '#aaaacc' : '#333344' })
        ).setOrigin(0, 0.5);
        if (index > 0) {
            leftArrow.setInteractive({ useHandCursor: true });
            leftArrow.on('pointerover', () => leftArrow.setColor('#ffffff'));
            leftArrow.on('pointerout', () => leftArrow.setColor('#aaaacc'));
            leftArrow.on('pointerdown', () => this.navigate(-1));
        }

        const rightArrow = this.add.text(width - 8, height / 2, '>',
            makeStyle(TEXT_STYLES.BUTTON, { fontSize: '18px', color: index < ZONES.length - 1 ? '#aaaacc' : '#333344' })
        ).setOrigin(1, 0.5);
        if (index < ZONES.length - 1) {
            rightArrow.setInteractive({ useHandCursor: true });
            rightArrow.on('pointerover', () => rightArrow.setColor('#ffffff'));
            rightArrow.on('pointerout', () => rightArrow.setColor('#aaaacc'));
            rightArrow.on('pointerdown', () => this.navigate(1));
        }

        this.currentIndex = index;
        this.transitioning = false;
    }

    navigate(direction) {
        if (this.transitioning) return;
        const newIndex = this.currentIndex + direction;
        if (newIndex < 0 || newIndex >= ZONES.length) return;

        this.transitioning = true;

        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.showZone(newIndex);
            this.cameras.main.fadeIn(300, 0, 0, 0);
        });
    }

    setupInput() {
        this.input.keyboard.on('keydown-LEFT', () => this.navigate(-1));
        this.input.keyboard.on('keydown-RIGHT', () => this.navigate(1));
        this.input.keyboard.on('keydown-ESC', () => this.scene.start('TitleScene'));

        let dragStartX = 0;
        this.input.on('pointerdown', (pointer) => {
            dragStartX = pointer.x;
        });
        this.input.on('pointerup', (pointer) => {
            const dx = pointer.x - dragStartX;
            const threshold = this.scale.width * 0.15;
            if (dx < -threshold) this.navigate(1);
            else if (dx > threshold) this.navigate(-1);
        });
    }
}
