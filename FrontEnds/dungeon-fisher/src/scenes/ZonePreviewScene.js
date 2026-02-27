import { coverBackground } from '../utils/zones.js';
import { addEffects } from '../effects/BackgroundEffects.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { ZONE_THEMES } from '../data/themes.js';
import { UIPanel, UIButton } from '../ui/index.js';
import CursorManager from '../ui/CursorManager.js';
import { loadZoneTheme } from '../systems/ThemeAssetLoader.js';
import ConfigLoader from '../systems/ConfigLoader.js';

const ZONES = Object.values(ZONE_THEMES)
    .sort((a, b) => a.floorRange[0] - b.floorRange[0])
    .map(z => ({
        key: z.bgKey,
        name: z.name,
        floors: z.floorRange[0] + ' - ' + z.floorRange[1],
        floorRange: z.floorRange,
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

    showZone(index, fadeIn) {
        const { width, height } = this.scale;
        const zone = ZONES[index];

        this.children.removeAll();
        this.tweens.killAll();
        if (this.effectsHandle) {
            this.effectsHandle.cleanup();
            this.effectsHandle = null;
        }

        this.cameras.main.setBackgroundColor(zone.theme.panel.fill);

        loadZoneTheme(this, zone.theme, () => {
            // Background + effects
            coverBackground(this, zone.key);
            this.effectsHandle = addEffects(this, zone.key);

            // Top panel — zone number + name + floor range
            const zoneNumber = index + 1;
            const topPanel = new UIPanel(this, {
                x: 0, y: 0, width, height: 40, theme: zone.theme, alpha: 0.85, padding: 0
            });
            topPanel.addText('Zone ' + zoneNumber + ': ' + zone.name,
                makeStyle(TEXT_STYLES.TITLE_MEDIUM, { fontSize: '16px' }),
                { align: 'center', offsetY: 10 }
            );
            topPanel.addText('Floors ' + zone.floors,
                makeStyle(TEXT_STYLES.BODY_SMALL, { color: '#aaaaaa' }),
                { align: 'center', offsetY: 26 }
            );

            // Monster types for this zone
            const allMonsters = ConfigLoader.getAllMonsters();
            const zoneMonsters = Object.values(allMonsters).filter(
                m => m.floorRange[0] <= zone.floorRange[1] && m.floorRange[1] >= zone.floorRange[0]
            );
            if (zoneMonsters.length > 0) {
                const monsterNames = zoneMonsters.map(m => m.name).join(', ');
                this.add.text(width / 2, 50, 'Monsters: ' + monsterNames,
                    makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '10px', color: '#cc8888' })
                ).setOrigin(0.5);
            }

            // Theme sample panel
            const sampleW = width * 0.6;
            const sampleH = 70;
            const sampleX = (width - sampleW) / 2;
            const sampleY = height * 0.4;
            const accentHex = '#' + zone.theme.panel.accent.toString(16).padStart(6, '0');
            const samplePanel = new UIPanel(this, {
                x: sampleX, y: sampleY, width: sampleW, height: sampleH,
                theme: zone.theme, alpha: 0.9, padding: 0
            });
            samplePanel.addText('Theme Preview',
                makeStyle(TEXT_STYLES.BODY_SMALL, { color: accentHex }),
                { align: 'center', offsetY: sampleH / 2 - 5 }
            );

            // Bottom panel — flavor text + deaths remaining
            const encounterConfig = ConfigLoader.getEncounterConfig();
            const maxDeaths = encounterConfig.maxPveDeaths || 4;
            const bottomPanel = new UIPanel(this, {
                x: 0, y: height - 50, width, height: 50, theme: zone.theme, alpha: 0.85, padding: 0
            });
            bottomPanel.addText(zone.flavor,
                makeStyle(TEXT_STYLES.FLAVOR, { color: '#aaaacc' }),
                { align: 'center', offsetY: 8 }
            );
            bottomPanel.addText('Lives: ' + maxDeaths,
                makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '10px', color: '#ff8888' }),
                { align: 'center', offsetY: 24 }
            );

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
            UIButton.create(this, {
                x: width / 2, y: height - 7,
                label: '[ BACK ]',
                style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '11px' }),
                hoverColor: '#ffffff',
                onClick: () => this.scene.start('TitleScene')
            });

            // Navigation arrows
            if (index > 0) {
                UIButton.create(this, {
                    x: 8, y: height / 2,
                    label: '<',
                    style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '18px' }),
                    origin: { x: 0, y: 0.5 },
                    hoverColor: '#ffffff',
                    onClick: () => this.navigate(-1)
                });
            } else {
                this.add.text(8, height / 2, '<',
                    makeStyle(TEXT_STYLES.BUTTON, { fontSize: '18px', color: '#333344' })
                ).setOrigin(0, 0.5);
            }

            if (index < ZONES.length - 1) {
                UIButton.create(this, {
                    x: width - 8, y: height / 2,
                    label: '>',
                    style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '18px' }),
                    origin: { x: 1, y: 0.5 },
                    hoverColor: '#ffffff',
                    onClick: () => this.navigate(1)
                });
            } else {
                this.add.text(width - 8, height / 2, '>',
                    makeStyle(TEXT_STYLES.BUTTON, { fontSize: '18px', color: '#333344' })
                ).setOrigin(1, 0.5);
            }

            this.currentIndex = index;
            this.transitioning = false;

            CursorManager.attach(this, this.registry.get('gameState')?.fisherId);

            if (fadeIn) this.cameras.main.fadeIn(300, 0, 0, 0);

            // Preload adjacent zones for smoother swiping
            if (index > 0) loadZoneTheme(this, ZONES[index - 1].theme);
            if (index < ZONES.length - 1) loadZoneTheme(this, ZONES[index + 1].theme);
        });
    }

    navigate(direction) {
        if (this.transitioning) return;
        const newIndex = this.currentIndex + direction;
        if (newIndex < 0 || newIndex >= ZONES.length) return;

        this.transitioning = true;

        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.showZone(newIndex, true);
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
