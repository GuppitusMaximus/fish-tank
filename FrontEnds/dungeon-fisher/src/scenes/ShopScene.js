export default class ShopScene extends Phaser.Scene {
    constructor() {
        super('ShopScene');
    }

    init(data) {
        this.gameState = data.gameState;
    }

    create() {
        const { width, height } = this.scale;
        this.add.text(width / 2, height / 2, 'SHOP SCENE\n(Implemented in gameplay plan)', {
            fontSize: '10px', fontFamily: 'monospace', color: '#ffffff', align: 'center'
        }).setOrigin(0.5);

        const backBtn = this.add.text(width / 2, height * 0.75, '[ BACK ]', {
            fontSize: '10px', fontFamily: 'monospace', color: '#aaaacc'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        backBtn.on('pointerdown', () => this.scene.start('FloorScene', { gameState: this.gameState }));
    }
}
