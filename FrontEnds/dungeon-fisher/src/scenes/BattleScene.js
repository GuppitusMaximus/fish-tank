import CombatSystem from '../systems/CombatSystem.js';
import PartySystem from '../systems/PartySystem.js';
import MOVES from '../data/moves.js';
import { getBackgroundKey, coverBackground } from '../utils/zones.js';
import { addEffects } from '../effects/BackgroundEffects.js';
import SpriteAnimator from '../effects/SpriteAnimator.js';
import WaterEffect from '../effects/WaterEffect.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { UIPanel } from '../ui/index.js';
import { getZoneByFloor, getCharacterTheme, accentHex } from '../data/themes.js';

export default class BattleScene extends Phaser.Scene {
    constructor() {
        super('BattleScene');
    }

    init(data) {
        this.gameState = data.gameState;
        this.monster = data.monster;
        this.combatState = CombatSystem.createCombatState(this.gameState.party, this.monster);
        this.eventQueue = [];
        this.eventTimer = 0;
        this.fishSprites = [];
        this.fishAnimators = [];
        this.cooldownGfx = [];
        this.displayedMonsterHp = this.monster.hp;
        this.displayedChunkHps = this.combatState.hpBar.chunks.map(c => c.hp);
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;
        const isPortrait = this.registry.get('isPortrait');

        this.layout = isPortrait ? {
            monsterX: W * 0.72, monsterY: H * 0.28,
            fishBaseX: W * 0.22, fishBaseY: H * 0.30,
            hpBarX: W * 0.1, hpBarY: H * 0.55, hpBarW: W * 0.8, hpBarH: 14,
            monsterHpX: W * 0.45, monsterHpY: 22, monsterHpW: W * 0.45
        } : {
            monsterX: W * 0.72, monsterY: H * 0.32,
            fishBaseX: W * 0.22, fishBaseY: H * 0.38,
            hpBarX: W * 0.1, hpBarY: H * 0.68, hpBarW: W * 0.8, hpBarH: 14,
            monsterHpX: W * 0.45, monsterHpY: 22, monsterHpW: W * 0.45
        };

        const L = this.layout;

        const zone = getZoneByFloor(this.gameState.floor);
        const character = getCharacterTheme(this.gameState.fisherId);

        // Zone background
        const bgKey = getBackgroundKey(this.gameState.floor);
        coverBackground(this, bgKey);
        addEffects(this, bgKey);

        // Floor indicator (top-right)
        const floorPanel = new UIPanel(this, {
            x: W - 74, y: 4, width: 70, height: 20, theme: zone, padding: 6
        });
        floorPanel.addText('Floor ' + this.gameState.floor,
            makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '12px', color: accentHex(zone) }),
            { align: 'right', offsetY: -2 }
        );

        // --- Monster ---
        // Name
        const namePanel = new UIPanel(this, {
            x: 2, y: 2, width: W * 0.5, height: 22, theme: zone, padding: 6
        });
        namePanel.addText(this.monster.name, TEXT_STYLES.MONSTER_NAME,
            { offsetX: 2, offsetY: -2 }
        );

        // Monster HP bar
        this.add.graphics().fillStyle(0x333333, 1).fillRect(L.monsterHpX, L.monsterHpY, L.monsterHpW, 8);
        this.monsterHpBar = this.add.graphics();
        this.monsterHpTxt = this.add.text(L.monsterHpX + L.monsterHpW + 5, L.monsterHpY - 1, '',
            makeStyle(TEXT_STYLES.BODY_SMALL, { color: '#aaaaaa' })
        );

        // Monster sprite
        this.monsterSpr = this.add.image(L.monsterX, L.monsterY, 'monster_' + this.monster.id).setScale(0.5).setDepth(2);
        this.monsterAnim = new SpriteAnimator(this, this.monsterSpr).idle();

        // --- Fish (triangle formation) ---
        const positions = this._getFormationPositions(this.combatState.fish.length, L);
        for (let i = 0; i < this.combatState.fish.length; i++) {
            const f = this.combatState.fish[i];
            const pos = positions[i];
            new WaterEffect(this, pos.x, pos.y);
            const spr = this.add.image(pos.x, pos.y, 'fish_' + f.ref.speciesId).setScale(0.75).setDepth(2);
            const anim = new SpriteAnimator(this, spr).idle();
            this.fishSprites.push(spr);
            this.fishAnimators.push(anim);

            // Cooldown indicators (two small bars near each fish)
            const cdGroup = { base: null, special: null, baseTrack: null, specialTrack: null };
            const cdX = pos.x - 18;
            const cdY = pos.y + 22;

            // Base attack cooldown track + fill
            cdGroup.baseTrack = this.add.graphics();
            cdGroup.baseTrack.fillStyle(0x333333, 0.6).fillRect(cdX, cdY, 36, 3);
            cdGroup.base = this.add.graphics();

            // Special cooldown track + fill
            cdGroup.specialTrack = this.add.graphics();
            cdGroup.specialTrack.fillStyle(0x333333, 0.6).fillRect(cdX, cdY + 5, 36, 3);
            cdGroup.special = this.add.graphics();

            cdGroup.x = cdX;
            cdGroup.y = cdY;
            cdGroup.color = f.ref.color;
            this.cooldownGfx.push(cdGroup);
        }

        // --- Combined HP bar ---
        this.add.rectangle(L.hpBarX + L.hpBarW / 2, L.hpBarY + L.hpBarH / 2 + 0.5,
            L.hpBarW + 2, L.hpBarH + 2, 0x222222);
        this.partyHpBar = this.add.graphics();
        const hpLabelPanel = new UIPanel(this, {
            x: L.hpBarX + L.hpBarW * 0.3, y: L.hpBarY + L.hpBarH + 2,
            width: L.hpBarW * 0.4, height: 16, theme: character, padding: 2
        });
        this.partyHpTxt = hpLabelPanel.addText('',
            makeStyle(TEXT_STYLES.BODY_SMALL, { color: accentHex(character), fontSize: '10px' }),
            { align: 'center' }
        );

        // --- Message text ---
        const msgPanel = new UIPanel(this, {
            x: 0, y: H - 30, width: W, height: 30, theme: zone, padding: 0
        });
        this.msgTxt = msgPanel.addText('',
            makeStyle(TEXT_STYLES.BODY, { fontSize: '11px', color: '#cccccc', align: 'center' }),
            { align: 'center', offsetY: 8 }
        );

        // Initial bar draws
        this._drawMonsterHp();
        this._drawPartyHpBar();
        this._drawCooldowns();
    }

    update(time, delta) {
        // Tick combat engine (only while running)
        if (this.combatState.running) {
            const events = CombatSystem.update(this.combatState, delta);
            for (const e of events) this.eventQueue.push(e);
        }

        // Process event queue with staggering
        this.eventTimer -= delta;
        if (this.eventTimer <= 0 && this.eventQueue.length > 0) {
            const e = this.eventQueue.shift();
            this._processEvent(e);
            this.eventTimer = 150;
        }

        // Smooth HP bar interpolation
        const lerpRate = 1 - Math.pow(0.05, delta / 1000);
        this.displayedMonsterHp += (this.monster.hp - this.displayedMonsterHp) * lerpRate;
        for (let i = 0; i < this.combatState.hpBar.chunks.length; i++) {
            this.displayedChunkHps[i] += (this.combatState.hpBar.chunks[i].hp - this.displayedChunkHps[i]) * lerpRate;
        }

        this._drawMonsterHp();
        this._drawPartyHpBar();
        this._drawCooldowns();
    }

    // --- Event Processing ---

    _processEvent(e) {
        switch (e.type) {
            case 'fish_base_attack': this._onFishAttack(e, 'lunge'); break;
            case 'fish_special': this._onFishSpecial(e); break;
            case 'monster_base_attack': this._onMonsterAttack(e, 'lunge'); break;
            case 'monster_special': this._onMonsterSpecial(e); break;
            case 'fish_incapacitated': this._onFishIncapacitated(e); break;
            case 'monster_dead': this._onMonsterDead(); break;
            case 'party_dead': this._onPartyDead(); break;
            case 'poison_tick': this._onPoisonTick(e); break;
            case 'heal': this._onHeal(e); break;
            case 'buff_applied': this._onBuffApplied(e); break;
        }
    }

    _onFishAttack(e, animType) {
        const fishSpr = this.fishSprites[e.fishIndex];
        const fishAnim = this.fishAnimators[e.fishIndex];
        if (!fishSpr || !fishAnim) return;

        if (animType === 'projectile') {
            SpriteAnimator.projectile(this, fishSpr.x, fishSpr.y,
                this.monsterSpr.x, this.monsterSpr.y, 0xffffff);
        } else {
            fishAnim.attack(this.monsterSpr.x, this.monsterSpr.y);
        }
        this.monsterAnim.hit();
        SpriteAnimator.damageNumber(this, this.monsterSpr.x, this.monsterSpr.y - 15, e.damage, '#ffcccc');
    }

    _onFishSpecial(e) {
        const move = MOVES[e.moveId];
        const animType = move ? move.animation : 'lunge';
        this._onFishAttack(e, animType);
    }

    _onMonsterAttack(e, animType) {
        const targetIdx = this._getFrontFishSpriteIndex();
        if (targetIdx === -1) return;
        const targetSpr = this.fishSprites[targetIdx];

        if (animType === 'projectile') {
            SpriteAnimator.projectile(this, this.monsterSpr.x, this.monsterSpr.y,
                targetSpr.x, targetSpr.y, 0xff4444);
        } else {
            this.monsterAnim.attack(targetSpr.x, targetSpr.y);
        }

        const targetAnim = this.fishAnimators[targetIdx];
        if (targetAnim && this.combatState.fish[targetIdx]?.alive) {
            targetAnim.hit();
        }
        SpriteAnimator.damageNumber(this, targetSpr.x, targetSpr.y - 15, e.damage, '#ff8888');
    }

    _onMonsterSpecial(e) {
        const move = MOVES[e.moveId];
        const animType = move ? move.animation : 'lunge';
        this._onMonsterAttack(e, animType);
    }

    _onFishIncapacitated(e) {
        const anim = this.fishAnimators[e.fishIndex];
        if (anim) anim.faint();

        // Hide cooldown indicators
        const cd = this.cooldownGfx[e.fishIndex];
        if (cd) {
            cd.base.setVisible(false);
            cd.special.setVisible(false);
            cd.baseTrack.setVisible(false);
            cd.specialTrack.setVisible(false);
        }
    }

    _onMonsterDead() {
        this.combatState.running = false;
        this.monsterAnim.faint();

        // Award XP to each living fish
        const allMsgs = [];
        for (const f of this.combatState.fish) {
            if (f.alive) {
                const msgs = PartySystem.awardXP(f.ref, this.monster.xpReward);
                allMsgs.push(...msgs);
            }
        }
        this.gameState.gold += this.monster.goldReward;

        const lines = [this.monster.name + ' defeated! +' + this.monster.goldReward + 'g +' + this.monster.xpReward + 'xp'];
        lines.push(...allMsgs);
        this.msgTxt.setText(lines.join(' | '));

        this.time.delayedCall(1500, () => this.advanceFloor());
    }

    _onPartyDead() {
        this.combatState.running = false;
        this.msgTxt.setText('All fish fainted!');

        this.time.delayedCall(1000, () => {
            for (const f of this.gameState.party) PartySystem.fullHeal(f);
            this.gameState.floor = this.gameState.campFloor;
            this.msgTxt.setText('Returning to camp...');

            this.time.delayedCall(1000, () => {
                this.scene.start('FloorScene', { gameState: this.gameState });
            });
        });
    }

    _onPoisonTick(e) {
        if (e.target === 'monster') {
            this.monsterSpr.setTint(0x88ff88);
            this.time.delayedCall(200, () => this.monsterSpr.clearTint());
            SpriteAnimator.damageNumber(this, this.monsterSpr.x, this.monsterSpr.y - 15, e.damage, '#88ff88');
        } else {
            const idx = e.fishIndex;
            const spr = this.fishSprites[idx];
            if (spr) {
                spr.setTint(0x88ff88);
                this.time.delayedCall(200, () => spr.clearTint());
                SpriteAnimator.damageNumber(this, spr.x, spr.y - 15, e.damage, '#88ff88');
            }
        }
    }

    _onHeal(e) {
        const spr = this.fishSprites[e.fishIndex];
        if (spr) {
            SpriteAnimator.damageNumber(this, spr.x, spr.y - 15, '+' + e.amount, '#44ff44');
        }
    }

    _onBuffApplied(e) {
        if (e.target === 'monster') {
            this.monsterSpr.setTint(0xffd700);
            this.time.delayedCall(300, () => this.monsterSpr.clearTint());
        } else {
            const spr = this.fishSprites[e.fishIndex];
            if (spr) {
                spr.setTint(0xffd700);
                this.time.delayedCall(300, () => spr.clearTint());
            }
        }
    }

    // --- Floor Advance ---

    advanceFloor() {
        for (const f of this.gameState.party) PartySystem.clearCombatState(f);
        this.gameState.floor++;
        if (this.gameState.floor > 100) {
            this.scene.start('VictoryScene', { gameState: this.gameState });
        } else {
            this.scene.start('FloorScene', { gameState: this.gameState, fromBattle: true });
        }
    }

    // --- Drawing Helpers ---

    _drawMonsterHp() {
        const L = this.layout;
        this.monsterHpBar.clear();
        const ratio = Math.max(0, this.displayedMonsterHp / this.monster.maxHp);
        const color = ratio > 0.25 ? 0xcc3333 : 0xcc6633;
        this.monsterHpBar.fillStyle(color, 1)
            .fillRect(L.monsterHpX, L.monsterHpY, ratio * L.monsterHpW, 8);
        this.monsterHpTxt.setText(Math.max(0, Math.round(this.displayedMonsterHp)) + '/' + this.monster.maxHp);
    }

    _drawPartyHpBar() {
        const L = this.layout;
        const chunks = this.combatState.hpBar.chunks;
        const totalMax = this.combatState.hpBar.totalMax;
        this.partyHpBar.clear();

        let x = L.hpBarX;
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const segW = (chunk.maxHp / totalMax) * L.hpBarW;

            // Gray background for segment
            this.partyHpBar.fillStyle(0x444444, 1);
            this.partyHpBar.fillRect(x, L.hpBarY, segW, L.hpBarH);

            // Color fill for current HP
            const displayHp = Math.max(0, this.displayedChunkHps[i]);
            if (displayHp > 0) {
                const fillW = (displayHp / chunk.maxHp) * segW;
                this.partyHpBar.fillStyle(chunk.color, 1);
                this.partyHpBar.fillRect(x, L.hpBarY, fillW, L.hpBarH);
            }

            // Divider line between segments
            if (i < chunks.length - 1) {
                this.partyHpBar.fillStyle(0x111111, 1);
                this.partyHpBar.fillRect(x + segW - 1, L.hpBarY, 1, L.hpBarH);
            }

            x += segW;
        }

        const totalCurrent = Math.max(0, Math.round(this.displayedChunkHps.reduce((s, v) => s + v, 0)));
        this.partyHpTxt.setText(totalCurrent + ' / ' + totalMax);
    }

    _drawCooldowns() {
        for (let i = 0; i < this.combatState.fish.length; i++) {
            const f = this.combatState.fish[i];
            const cd = this.cooldownGfx[i];
            if (!cd || !f.alive) continue;

            // Base attack cooldown
            const effSpd = CombatSystem.getEffectiveStat(f, 'spd');
            const baseCd = CombatSystem.getBaseAttackCooldown(effSpd);
            const baseFill = Math.min(1, f.baseTimer / baseCd);
            cd.base.clear();
            cd.base.fillStyle(0xcccccc, 0.8);
            cd.base.fillRect(cd.x, cd.y, baseFill * 36, 3);

            // Special cooldown
            const move = MOVES[f.ref.moves[0]];
            if (move) {
                const specFill = Math.min(1, f.specialTimer / move.cooldown);
                cd.special.clear();
                cd.special.fillStyle(cd.color, 0.8);
                cd.special.fillRect(cd.x, cd.y + 5, specFill * 36, 3);
            }
        }
    }

    // --- Layout Helpers ---

    _getFormationPositions(count, L) {
        const positions = [];
        if (count === 1) {
            positions.push({ x: L.fishBaseX, y: L.fishBaseY });
        } else if (count === 2) {
            positions.push({ x: L.fishBaseX + 20, y: L.fishBaseY });
            positions.push({ x: L.fishBaseX - 20, y: L.fishBaseY - 20 });
        } else if (count >= 3) {
            positions.push({ x: L.fishBaseX + 20, y: L.fishBaseY });
            positions.push({ x: L.fishBaseX - 20, y: L.fishBaseY - 25 });
            positions.push({ x: L.fishBaseX - 20, y: L.fishBaseY + 25 });
        }
        return positions;
    }

    _getFrontFishSpriteIndex() {
        for (let i = 0; i < this.combatState.fish.length; i++) {
            if (this.combatState.fish[i].alive) return i;
        }
        return -1;
    }

    // --- Cleanup ---

    shutdown() {
        this.tweens.killAll();
        for (const a of this.fishAnimators) a.destroy();
        this.monsterAnim.destroy();
        this.eventQueue = [];
        this.combatState.running = false;
    }
}
