import SaveSystem from '../systems/SaveSystem.js';
import { coverBackground } from '../utils/zones.js';
import { addEffects } from '../effects/BackgroundEffects.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { UIButton, UILayout } from '../ui/index.js';

export default class VictoryScene extends Phaser.Scene {
    constructor() {
        super('VictoryScene');
    }

    init(data) {
        this.gameState = data.gameState;
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;
        const gs = this.gameState;

        // Dungeon heart background (floor 100 boss arena)
        coverBackground(this, 'bg_dungeon-heart');
        addEffects(this, 'bg_dungeon-heart');
        UILayout.overlay(this, { alpha: 0.35, depth: 0 });

        // Title
        this.add.text(W / 2, H * 0.15, '\u2605  DUNGEON CLEARED  \u2605',
            makeStyle(TEXT_STYLES.TITLE_LARGE, { fontSize: '20px', color: '#ffd700' })
        ).setOrigin(0.5);

        this.add.text(W / 2, H * 0.28, 'You conquered all 100 floors!',
            makeStyle(TEXT_STYLES.BODY, { fontSize: '14px', color: '#cccccc' })
        ).setOrigin(0.5);

        // Final party
        this.add.text(W / 2, H * 0.4, 'Final Party:',
            makeStyle(TEXT_STYLES.BODY, { color: '#aaaacc' })
        ).setOrigin(0.5);

        const isPortrait = this.registry.get('isPortrait');
        if (isPortrait) {
            gs.party.forEach((f, i) => {
                this.add.text(W / 2, H * 0.46 + i * 16, f.name + ' Lv.' + f.level,
                    makeStyle(TEXT_STYLES.FISH_NAME, { fontSize: '12px' })
                ).setOrigin(0.5);
            });
        } else {
            const partyLine = gs.party.map(f => f.name + ' Lv.' + f.level).join('  \u2022  ');
            this.add.text(W / 2, H * 0.5, partyLine,
                makeStyle(TEXT_STYLES.FISH_NAME, { fontSize: '12px' })
            ).setOrigin(0.5);
        }

        // Gold
        this.add.text(W / 2, H * 0.62, 'Gold earned: ' + gs.gold.toLocaleString(),
            TEXT_STYLES.GOLD
        ).setOrigin(0.5);

        // Play again
        UIButton.create(this, {
            x: W / 2, y: H * 0.78,
            label: '[ PLAY AGAIN ]',
            style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '16px' }),
            hoverColor: '#ffffff',
            onClick: () => {
                SaveSystem.deleteSave();
                this.scene.start('TitleScene');
            }
        });
    }
}
