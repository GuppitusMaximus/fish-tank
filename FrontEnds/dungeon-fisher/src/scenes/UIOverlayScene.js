import { VERSION } from '../version.js';
import { TEXT_STYLES } from '../constants/textStyles.js';

export default class UIOverlayScene extends Phaser.Scene {
    constructor() {
        super('UIOverlay');
    }

    create() {
        const { width, height } = this.scale;
        this.add.text(width - 4, height - 3, `v${VERSION}`, TEXT_STYLES.VERSION)
            .setOrigin(1, 1)
            .setDepth(1000)
            .setScrollFactor(0);
    }
}
