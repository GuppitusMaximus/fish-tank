export default class VictoryScene extends Phaser.Scene {
    constructor() {
        super('VictoryScene');
    }

    init(data) {
        this.gameState = data.gameState;
    }

    create() {
        const { width, height } = this.scale;
        this.add.text(width / 2, height / 2, 'VICTORY!\n(Implemented in gameplay plan)', {
            fontSize: '14px', fontFamily: 'monospace', color: '#f0c040', align: 'center'
        }).setOrigin(0.5);
    }
}
