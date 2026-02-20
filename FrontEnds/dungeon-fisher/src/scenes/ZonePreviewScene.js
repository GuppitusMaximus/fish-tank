import { coverBackground } from '../utils/zones.js';
import { addEffects } from '../effects/BackgroundEffects.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';

const ZONES = [
    { key: 'bg_sewers', name: 'The Sewers', floors: '1 - 10', flavor: 'Damp sewers echo around you...' },
    { key: 'bg_goblin-caves', name: 'Goblin Caves', floors: '11 - 20', flavor: 'Goblin laughter echoes in the dark...' },
    { key: 'bg_bone-crypts', name: 'Bone Crypts', floors: '21 - 30', flavor: 'Bones crunch underfoot...' },
    { key: 'bg_deep-dungeon', name: 'Deep Dungeon', floors: '31 - 50', flavor: 'The air grows heavy...' },
    { key: 'bg_shadow-realm', name: 'Shadow Realm', floors: '51 - 70', flavor: 'Shadows move on their own...' },
    { key: 'bg_ancient-chambers', name: 'Ancient Chambers', floors: '71 - 90', flavor: 'Ancient power radiates from the walls...' },
    { key: 'bg_dungeon-heart', name: 'Dungeon Heart', floors: '91 - 100', flavor: "The dungeon's heart beats..." }
];

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

        // Dark overlay strips for text readability
        this.add.rectangle(width / 2, 20, width, 40, 0x000000, 0.5);
        this.add.rectangle(width / 2, height - 22, width, 44, 0x000000, 0.5);

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
