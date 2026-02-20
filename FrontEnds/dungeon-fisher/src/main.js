import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import TitleScene from './scenes/TitleScene.js';
import BattleScene from './scenes/BattleScene.js';
import FloorScene from './scenes/FloorScene.js';
import ShopScene from './scenes/ShopScene.js';
import CampScene from './scenes/CampScene.js';
import VictoryScene from './scenes/VictoryScene.js';

const isPortrait = window.innerHeight > window.innerWidth;

const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: isPortrait ? 270 : 480,
    height: isPortrait ? 480 : 270,
    backgroundColor: '#1a1a2e',
    pixelArt: false,
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

const game = new Phaser.Game(config);
game.registry.set('isPortrait', isPortrait);

// Reload on orientation change to reinitialize with correct resolution
let currentOrientation = isPortrait;
window.addEventListener('resize', () => {
    const nowPortrait = window.innerHeight > window.innerWidth;
    if (nowPortrait !== currentOrientation) {
        currentOrientation = nowPortrait;
        window.location.reload();
    }
});

export default game;
