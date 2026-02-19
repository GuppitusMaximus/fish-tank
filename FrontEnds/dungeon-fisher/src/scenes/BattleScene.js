export default class BattleScene extends Phaser.Scene {
    constructor() {
        super('BattleScene');
    }

    init(data) {
        this.gameState = data.gameState;
        this.monster = data.monster;
    }

    create() {
        const { width, height } = this.scale;
        this.add.text(width / 2, height / 2, 'BATTLE SCENE\n(Implemented in gameplay plan)', {
            fontSize: '10px', fontFamily: 'monospace', color: '#ffffff', align: 'center'
        }).setOrigin(0.5);
    }
}
