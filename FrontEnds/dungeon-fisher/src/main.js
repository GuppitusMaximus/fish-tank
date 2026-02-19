import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import TitleScene from './scenes/TitleScene.js';
import BattleScene from './scenes/BattleScene.js';
import FloorScene from './scenes/FloorScene.js';
import ShopScene from './scenes/ShopScene.js';
import CampScene from './scenes/CampScene.js';
import VictoryScene from './scenes/VictoryScene.js';

const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: 480,
    height: 270,
    backgroundColor: '#1a1a2e',
    pixelArt: true,
    roundPixels: true,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [
        BootScene,
        TitleScene,
        FloorScene,
        BattleScene,
        ShopScene,
        CampScene,
        VictoryScene
    ]
};

export default new Phaser.Game(config);
