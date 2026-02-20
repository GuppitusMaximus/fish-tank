import CombatSystem from '../systems/CombatSystem.js';
import PartySystem from '../systems/PartySystem.js';
import EconomySystem from '../systems/EconomySystem.js';
import { ITEMS } from '../data/items.js';
import MOVES from '../data/moves.js';
import { getBackgroundKey, coverBackground } from '../utils/zones.js';
import { addEffects } from '../effects/BackgroundEffects.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';

export default class BattleScene extends Phaser.Scene {
    constructor() {
        super('BattleScene');
    }

    init(data) {
        this.gameState = data.gameState;
        this.monster = data.monster;
        this.activeFishIndex = this.gameState.party.findIndex(f => f.hp > 0);
        this.busy = false;
    }

    get fish() {
        return this.gameState.party[this.activeFishIndex];
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;
        const isPortrait = this.registry.get('isPortrait');

        this.layout = isPortrait ? {
            monsterX: W * 0.5, monsterY: H * 0.18,
            fishX: W * 0.5, fishY: H * 0.45,
            hpBarW: Math.floor(W * 0.4),
            fishInfoY: Math.floor(H * 0.55),
            msgY: Math.floor(H * 0.68),
            btnY: H - 60, btnW: Math.floor(W * 0.42), btnCols: 2
        } : {
            monsterX: W * 0.68, monsterY: H * 0.28,
            fishX: W * 0.28, fishY: H * 0.52,
            hpBarW: 120,
            fishInfoY: Math.floor(H * 0.65),
            msgY: Math.floor(H * 0.82),
            btnY: H - 18, btnW: 100, btnCols: 4
        };

        const L = this.layout;

        // Zone background
        const bgKey = getBackgroundKey(this.gameState.floor);
        coverBackground(this, bgKey);
        addEffects(this, bgKey);

        // Readability panels over text-heavy areas
        this.add.rectangle(W * 0.25, 18, W * 0.5, 30, 0x000000, 0.5);
        this.add.rectangle(W * 0.25, L.fishInfoY + 15, W * 0.5, 30, 0x000000, 0.5);
        this.add.rectangle(W / 2, L.msgY, W * 0.7, 22, 0x000000, 0.5);

        // Monster info (top-left)
        this.monsterNameTxt = this.add.text(10, 8, this.monster.name, TEXT_STYLES.MONSTER_NAME);
        this.add.graphics().fillStyle(0x333333, 1).fillRect(10, 22, L.hpBarW, 8);
        this.monsterHpBar = this.add.graphics();
        this.monsterHpTxt = this.add.text(L.hpBarW + 15, 21, '',
            makeStyle(TEXT_STYLES.BODY_SMALL, { color: '#aaaaaa' })
        );

        // Floor (top-right)
        this.add.text(W - 10, 8, 'Floor ' + this.gameState.floor,
            makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '12px', color: '#666666' })
        ).setOrigin(1, 0);

        // Sprites
        this.monsterSpr = this.add.image(L.monsterX, L.monsterY, 'monster_' + this.monster.id).setScale(0.5);
        this.fishSpr = this.add.image(L.fishX, L.fishY, 'fish_' + this.fish.speciesId).setScale(0.75);

        // Fish info
        this.fishInfoY = L.fishInfoY;
        this.fishNameTxt = this.add.text(10, this.fishInfoY, '', TEXT_STYLES.FISH_NAME);
        this.add.graphics().fillStyle(0x333333, 1).fillRect(10, this.fishInfoY + 14, L.hpBarW, 8);
        this.fishHpBar = this.add.graphics();
        this.fishHpTxt = this.add.text(L.hpBarW + 15, this.fishInfoY + 13, '',
            makeStyle(TEXT_STYLES.BODY_SMALL, { color: '#aaaaaa' })
        );
        this.add.graphics().fillStyle(0x333333, 1).fillRect(10, this.fishInfoY + 25, L.hpBarW, 4);
        this.fishXpBar = this.add.graphics();

        // Message text
        this.msgTxt = this.add.text(W / 2, L.msgY, '',
            makeStyle(TEXT_STYLES.BODY, { fontSize: '12px', color: '#cccccc', align: 'center', wordWrap: { width: W - 20 } })
        ).setOrigin(0.5);

        // UI containers
        this.actionBtns = [];
        this.menuBg = this.add.graphics().setVisible(false);
        this.menuItems = [];

        this.refreshBars();
        this.showActions();
    }

    // --- HP/XP bar updates ---

    refreshBars() {
        const m = this.monster;
        this.monsterHpBar.clear();
        const mRatio = Math.max(0, m.hp / m.maxHp);
        this.monsterHpBar.fillStyle(mRatio > 0.25 ? 0xcc3333 : 0xcc6633, 1)
            .fillRect(10, 22, mRatio * this.layout.hpBarW, 8);
        this.monsterHpTxt.setText(m.hp + '/' + m.maxHp);

        const f = this.fish;
        this.fishNameTxt.setText(f.name + ' Lv.' + f.level);
        this.fishHpBar.clear();
        const fRatio = Math.max(0, f.hp / f.maxHp);
        const fColor = fRatio > 0.5 ? 0x33cc33 : fRatio > 0.25 ? 0xcccc33 : 0xcc3333;
        this.fishHpBar.fillStyle(fColor, 1)
            .fillRect(10, this.fishInfoY + 14, fRatio * this.layout.hpBarW, 8);
        this.fishHpTxt.setText(f.hp + '/' + f.maxHp);

        this.fishXpBar.clear();
        const xRatio = f.xpToNext > 0 ? Math.min(1, f.xp / f.xpToNext) : 0;
        this.fishXpBar.fillStyle(0x6666cc, 1)
            .fillRect(10, this.fishInfoY + 25, xRatio * this.layout.hpBarW, 4);
    }

    // --- Action menu (move buttons + items) ---

    showActions() {
        this.clearActionBtns();
        if (this.busy) return;
        const W = this.scale.width;
        const L = this.layout;
        const moves = this.fish.moves;
        const cols = L.btnCols;
        const bw = L.btnW;
        const gap = 4;

        const btns = [];
        for (const moveId of moves) {
            btns.push({ label: MOVES[moveId].name, color: '#aaccff', cb: () => this.onMove(moveId) });
        }
        btns.push({ label: 'Items', color: '#ccaa66', cb: () => this.showItemMenu() });

        const usedCols = Math.min(cols, btns.length);
        const rowW = usedCols * bw + (usedCols - 1) * gap;
        const startX = (W - rowW) / 2 + bw / 2;

        btns.forEach((b, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = startX + col * (bw + gap);
            const y = L.btnY + row * 22;
            this.actionBtns.push(this.makeBtn(x, y, b.label, b.color, b.cb));
        });
    }

    clearActionBtns() {
        for (const b of this.actionBtns) b.destroy();
        this.actionBtns = [];
    }

    makeBtn(x, y, label, color, cb) {
        const btn = this.add.text(x, y, label,
            makeStyle(TEXT_STYLES.BUTTON, {
                fontSize: '12px', color: color,
                backgroundColor: '#2a2a4a', padding: { x: 6, y: 4 },
                fixedWidth: this.layout.btnW, align: 'center'
            })
        ).setOrigin(0.5).setInteractive({ useHandCursor: true });
        btn.on('pointerover', () => btn.setColor('#ffffff'));
        btn.on('pointerout', () => btn.setColor(color));
        btn.on('pointerdown', () => { if (!this.busy) cb(); });
        return btn;
    }

    // --- Turn execution ---

    onMove(moveId) {
        this.busy = true;
        this.clearActionBtns();
        const order = CombatSystem.getTurnOrder(this.fish, this.monster);
        const monsterMoveId = CombatSystem.getMonsterMove(this.monster);

        if (order[0] === 'fish') {
            this.execAttack(this.fish, this.monster, moveId, this.monsterSpr, () => {
                if (this.monster.hp <= 0) return this.onMonsterDead();
                this.time.delayedCall(400, () => {
                    this.execAttack(this.monster, this.fish, monsterMoveId, this.fishSpr, () => {
                        if (this.fish.hp <= 0) return this.onFishDead();
                        this.endOfTurn();
                    });
                });
            });
        } else {
            this.execAttack(this.monster, this.fish, monsterMoveId, this.fishSpr, () => {
                if (this.fish.hp <= 0) return this.onFishDead();
                this.time.delayedCall(400, () => {
                    this.execAttack(this.fish, this.monster, moveId, this.monsterSpr, () => {
                        if (this.monster.hp <= 0) return this.onMonsterDead();
                        this.endOfTurn();
                    });
                });
            });
        }
    }

    execAttack(attacker, defender, moveId, defenderSpr, cb) {
        const result = CombatSystem.executeMove(attacker, defender, moveId);
        this.msgTxt.setText(result.message);
        this.refreshBars();
        if (result.type === 'attack') {
            this.tweens.add({
                targets: defenderSpr, alpha: 0.2, duration: 100, yoyo: true,
                onComplete: () => this.time.delayedCall(300, cb)
            });
        } else {
            this.time.delayedCall(500, cb);
        }
    }

    endOfTurn() {
        const msgs = [];
        const fp = CombatSystem.processPoison(this.fish);
        if (fp) msgs.push(fp);
        const mp = CombatSystem.processPoison(this.monster);
        if (mp) msgs.push(mp);
        CombatSystem.processBuffs(this.fish);
        CombatSystem.processBuffs(this.monster);
        this.refreshBars();

        if (msgs.length > 0) {
            this.msgTxt.setText(msgs.join(' '));
            this.time.delayedCall(600, () => this.postTurnCheck());
        } else {
            this.postTurnCheck();
        }
    }

    postTurnCheck() {
        if (this.monster.hp <= 0) return this.onMonsterDead();
        if (this.fish.hp <= 0) return this.onFishDead();
        this.busy = false;
        this.showActions();
    }

    // --- Battle outcomes ---

    onMonsterDead() {
        this.gameState.gold += this.monster.goldReward;
        const xpMsgs = PartySystem.awardXP(this.fish, this.monster.xpReward);
        this.refreshBars();
        const lines = [this.monster.name + ' defeated! +' + this.monster.goldReward + 'g +' + this.monster.xpReward + 'xp'];
        lines.push(...xpMsgs);
        this.msgTxt.setText(lines.join('\n'));

        this.time.delayedCall(1500, () => {
            if (this.fish.pendingMove) {
                this.showLearnMenu();
            } else {
                this.advanceFloor();
            }
        });
    }

    advanceFloor() {
        for (const f of this.gameState.party) PartySystem.clearCombatState(f);
        this.gameState.floor++;
        if (this.gameState.floor > 100) {
            this.scene.start('VictoryScene', { gameState: this.gameState });
        } else {
            this.scene.start('FloorScene', { gameState: this.gameState, fromBattle: true });
        }
    }

    onFishDead() {
        const alive = PartySystem.getAliveFish(this.gameState.party);
        if (alive.length === 0) {
            this.msgTxt.setText('All fish fainted!');
            this.time.delayedCall(1000, () => {
                for (const f of this.gameState.party) PartySystem.fullHeal(f);
                this.gameState.floor = this.gameState.campFloor;
                this.msgTxt.setText('Returning to camp...');
                this.time.delayedCall(1000, () => {
                    this.scene.start('FloorScene', { gameState: this.gameState });
                });
            });
        } else {
            this.msgTxt.setText(this.fish.name + ' fainted!');
            this.time.delayedCall(600, () => this.showSwitchMenu());
        }
    }

    // --- Switch fish menu ---

    showSwitchMenu() {
        this.clearMenu();
        this.showMenuBg();
        const W = this.scale.width;
        const H = this.scale.height;

        this.addMenuItem(W / 2, H * 0.3, 'Choose next fish:', '#ffffff');

        const alive = this.gameState.party
            .map((f, i) => ({ fish: f, idx: i }))
            .filter(e => e.fish.hp > 0 && e.idx !== this.activeFishIndex);

        alive.forEach((e, i) => {
            const f = e.fish;
            this.addMenuItem(W / 2, H * 0.42 + i * 24,
                f.name + ' Lv.' + f.level + ' HP:' + f.hp + '/' + f.maxHp,
                '#88cc88', () => {
                    this.activeFishIndex = e.idx;
                    this.fishSpr.setTexture('fish_' + this.fish.speciesId);
                    this.clearMenu();
                    this.refreshBars();
                    this.busy = false;
                    this.showActions();
                });
        });
    }

    // --- Item menu ---

    showItemMenu() {
        this.busy = true;
        this.clearActionBtns();
        this.clearMenu();
        this.showMenuBg();
        const W = this.scale.width;
        const H = this.scale.height;
        const inv = this.gameState.inventory;

        if (inv.length === 0) {
            this.addMenuItem(W / 2, H * 0.4, 'No items!', '#888888');
        } else {
            const counts = {};
            inv.forEach(function(id, i) {
                if (!counts[id]) counts[id] = { id: id, firstIdx: i, count: 0 };
                counts[id].count++;
            });
            const entries = Object.values(counts);
            entries.forEach((e, i) => {
                const item = ITEMS[e.id];
                this.addMenuItem(W / 2, H * 0.3 + i * 18,
                    item.name + ' x' + e.count, '#ccaa66',
                    () => this.showItemTargets(e.firstIdx));
            });
        }

        this.addMenuItem(W / 2, H * 0.85, '[ BACK ]', '#aaaacc', () => {
            this.clearMenu();
            this.busy = false;
            this.showActions();
        });
    }

    showItemTargets(invIdx) {
        this.clearMenu();
        this.showMenuBg();
        const W = this.scale.width;
        const H = this.scale.height;
        const itemId = this.gameState.inventory[invIdx];
        const item = ITEMS[itemId];

        this.addMenuItem(W / 2, H * 0.25, 'Use ' + item.name + ' on:', '#ffffff');

        this.gameState.party.forEach((f, i) => {
            const canUse = (item.type === 'revive' && f.hp <= 0) ||
                           (item.type === 'heal' && f.hp > 0 && f.hp < f.maxHp) ||
                           (item.type === 'stat' && f.hp > 0);
            const label = f.name + ' HP:' + f.hp + '/' + f.maxHp;
            if (canUse) {
                this.addMenuItem(W / 2, H * 0.38 + i * 22, label, '#88cc88',
                    () => this.useItem(invIdx, i));
            } else {
                this.addMenuItem(W / 2, H * 0.38 + i * 22, label, '#555555');
            }
        });

        this.addMenuItem(W / 2, H * 0.85, '[ BACK ]', '#aaaacc',
            () => this.showItemMenu());
    }

    useItem(invIdx, fishIdx) {
        this.clearMenu();
        const target = this.gameState.party[fishIdx];
        const result = EconomySystem.useItem(this.gameState, invIdx, target);
        this.msgTxt.setText(result || 'Failed!');
        this.refreshBars();

        this.time.delayedCall(500, () => {
            const mMove = CombatSystem.getMonsterMove(this.monster);
            this.execAttack(this.monster, this.fish, mMove, this.fishSpr, () => {
                if (this.fish.hp <= 0) return this.onFishDead();
                this.endOfTurn();
            });
        });
    }

    // --- Learn move menu ---

    showLearnMenu() {
        this.clearMenu();
        this.showMenuBg();
        const W = this.scale.width;
        const H = this.scale.height;
        const f = this.fish;
        const newMoveId = f.pendingMove;
        const newMove = MOVES[newMoveId];

        this.addMenuItem(W / 2, H * 0.2,
            f.name + ' wants to learn ' + newMove.name + '!', '#f0c040');
        this.addMenuItem(W / 2, H * 0.28, 'Replace which move?', '#cccccc');

        f.moves.forEach((mid, i) => {
            const m = MOVES[mid];
            const info = m.type === 'attack' ? ' Pow:' + m.power : ' (' + m.type + ')';
            this.addMenuItem(W / 2, H * 0.38 + i * 22,
                m.name + info, '#aaccff', () => {
                    const oldName = m.name;
                    f.moves[i] = newMoveId;
                    f.pendingMove = null;
                    this.clearMenu();
                    this.msgTxt.setText('Forgot ' + oldName + ', learned ' + newMove.name + '!');
                    this.time.delayedCall(800, () => this.advanceFloor());
                });
        });

        // New move info
        const newInfo = newMove.type === 'attack' ? ' Pow:' + newMove.power : ' (' + newMove.type + ')';
        this.addMenuItem(W / 2, H * 0.38 + f.moves.length * 22,
            'NEW: ' + newMove.name + newInfo, '#f0c040');

        this.addMenuItem(W / 2, H * 0.38 + (f.moves.length + 1) * 22,
            "[ DON'T LEARN ]", '#888888', () => {
                f.pendingMove = null;
                this.clearMenu();
                this.advanceFloor();
            });
    }

    // --- Menu helpers ---

    showMenuBg() {
        const W = this.scale.width;
        const H = this.scale.height;
        this.menuBg.clear().setVisible(true);
        this.menuBg.fillStyle(0x1a1a2e, 0.92);
        this.menuBg.fillRect(15, H * 0.15, W - 30, H * 0.72);
        this.menuBg.lineStyle(1, 0x4a4a8a, 1);
        this.menuBg.strokeRect(15, H * 0.15, W - 30, H * 0.72);
    }

    addMenuItem(x, y, label, color, cb) {
        const style = makeStyle(TEXT_STYLES.BODY, { color: color });
        if (cb) {
            style.backgroundColor = '#2a2a4a';
            style.padding = { x: 10, y: 3 };
        }
        const txt = this.add.text(x, y, label, style).setOrigin(0.5);
        if (cb) {
            txt.setInteractive({ useHandCursor: true });
            txt.on('pointerover', () => txt.setColor('#ffffff'));
            txt.on('pointerout', () => txt.setColor(color));
            txt.on('pointerdown', cb);
        }
        this.menuItems.push(txt);
        return txt;
    }

    clearMenu() {
        for (const item of this.menuItems) item.destroy();
        this.menuItems = [];
        this.menuBg.clear().setVisible(false);
    }
}
