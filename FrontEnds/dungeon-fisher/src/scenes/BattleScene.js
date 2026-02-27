import CombatSystem from '../systems/CombatSystem.js';
import PartySystem from '../systems/PartySystem.js';
import ConfigLoader from '../systems/ConfigLoader.js';
import EncounterSystem from '../systems/EncounterSystem.js';
import EquipmentSystem from '../systems/EquipmentSystem.js';
import EquipmentRenderer from '../systems/EquipmentRenderer.js';
import EconomySystem from '../systems/EconomySystem.js';
import { getBackgroundKey, coverBackground } from '../utils/zones.js';
import { addEffects } from '../effects/BackgroundEffects.js';
import SpriteAnimator from '../effects/SpriteAnimator.js';
import WaterEffect from '../effects/WaterEffect.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { UIPanel, UIButton } from '../ui/index.js';
import { getZoneByFloor, getCharacterTheme, accentHex } from '../data/themes.js';
import CursorManager from '../ui/CursorManager.js';

export default class BattleScene extends Phaser.Scene {
    constructor() {
        super('BattleScene');
    }

    init(data) {
        this.gameState = data.gameState;
        this.monsters = data.monsters;
        this.isPvp = data.isPvp || false;

        // Equipment stat injection — apply bonuses before combat state is created
        if (this.gameState.equipment && this.gameState.equipment.grid.length > 0) {
            const result = EquipmentSystem.applyBonuses(this.gameState.party, this.gameState.equipment.grid);
            this.gameState.equipmentDelta = result.delta;
            this.gameState.equipmentSnapshot = result.snapshot;
        }

        this.combatState = CombatSystem.createCombatState(this.gameState.party, this.monsters, this.gameState.floor);
        this.combatPaused = false;
        this.eventQueue = [];
        this.eventTimer = 0;

        // Fish rendering
        this.fishSprites = [];
        this.fishAnimators = [];
        this.cooldownGfx = [];

        // Monster pack rendering
        this.monsterSprites = [];
        this.monsterAnimators = [];
        this.monsterWaterEffects = [];

        // Effect icon images (rebuilt on effect changes)
        this.fishEffectIcons = [];
        this.monsterEffectIcons = [];
        this._effectsDirty = true;

        // Smooth HP interpolation
        this.displayedChunkHps = this.combatState.hpBar.chunks.map(c => c.hp);
        this.displayedMonsterChunkHps = this.combatState.monsterHpBar.chunks.map(c => c.hp);
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;
        const isPortrait = this.registry.get('isPortrait');

        this.layout = isPortrait ? {
            monsterX: W * 0.72, monsterY: H * 0.28,
            fishBaseX: W * 0.22, fishBaseY: H * 0.30,
            hpBarX: W * 0.1, hpBarY: H * 0.55, hpBarW: W * 0.8, hpBarH: 14,
            monsterHpX: W * 0.45, monsterHpY: 22, monsterHpW: W * 0.45, monsterHpH: 8
        } : {
            monsterX: W * 0.72, monsterY: H * 0.32,
            fishBaseX: W * 0.22, fishBaseY: H * 0.38,
            hpBarX: W * 0.1, hpBarY: H * 0.68, hpBarW: W * 0.8, hpBarH: 14,
            monsterHpX: W * 0.45, monsterHpY: 22, monsterHpW: W * 0.45, monsterHpH: 8
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

        // --- Monster name panel ---
        const displayName = this.isPvp
            ? 'Ghost Party'
            : this.monsters.length > 1
                ? this.monsters[0].name + ' x' + this.monsters.length
                : this.monsters[0].name;
        const namePanel = new UIPanel(this, {
            x: 2, y: 2, width: W * 0.5, height: 22, theme: zone, padding: 6
        });
        namePanel.addText(displayName, TEXT_STYLES.MONSTER_NAME,
            { offsetX: 2, offsetY: -2 }
        );

        // --- Monster HP bar (chunked) ---
        this.add.graphics().fillStyle(0x333333, 1).fillRect(L.monsterHpX, L.monsterHpY, L.monsterHpW, L.monsterHpH);
        this.monsterHpGfx = this.add.graphics();
        this.monsterHpTxt = this.add.text(L.monsterHpX + L.monsterHpW + 5, L.monsterHpY - 1, '',
            makeStyle(TEXT_STYLES.BODY_SMALL, { color: '#aaaaaa' })
        );

        // --- Monster sprites (pack formation) ---
        const monsterPositions = this._getMonsterFormationPositions(this.monsters.length, L);
        for (let i = 0; i < this.monsters.length; i++) {
            const m = this.monsters[i];
            const pos = monsterPositions[i];

            const we = new WaterEffect(this, pos.x, pos.y);
            this.monsterWaterEffects.push(we);

            const texKey = this.isPvp ? 'fish_' + m.speciesId : 'monster_' + m.id;
            const spr = this.add.image(pos.x, pos.y, texKey).setScale(0.5).setDepth(2);
            if (this.isPvp) spr.setFlipX(true);

            const anim = new SpriteAnimator(this, spr).idle();
            this.monsterSprites.push(spr);
            this.monsterAnimators.push(anim);
        }

        // --- Fish (triangle formation) ---
        const fishPositions = this._getFormationPositions(this.combatState.fish.length, L);
        for (let i = 0; i < this.combatState.fish.length; i++) {
            const f = this.combatState.fish[i];
            const pos = fishPositions[i];
            new WaterEffect(this, pos.x, pos.y);
            const spr = this.add.image(pos.x, pos.y, 'fish_' + f.ref.speciesId).setScale(0.75).setDepth(2);
            const anim = new SpriteAnimator(this, spr).idle();
            this.fishSprites.push(spr);
            this.fishAnimators.push(anim);

            const cdGroup = { base: null, special: null, baseTrack: null, specialTrack: null };
            const cdX = pos.x - 18;
            const cdY = pos.y + 22;

            cdGroup.baseTrack = this.add.graphics();
            cdGroup.baseTrack.fillStyle(0x333333, 0.6).fillRect(cdX, cdY, 36, 3);
            cdGroup.base = this.add.graphics();

            cdGroup.specialTrack = this.add.graphics();
            cdGroup.specialTrack.fillStyle(0x333333, 0.6).fillRect(cdX, cdY + 5, 36, 3);
            cdGroup.special = this.add.graphics();

            cdGroup.x = cdX;
            cdGroup.y = cdY;
            cdGroup.color = f.ref.color;
            this.cooldownGfx.push(cdGroup);
        }

        // --- Combined HP bar (fish party) ---
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
        this._drawMonsterPackHpBar();
        this._drawPartyHpBar();
        this._drawCooldowns();

        CursorManager.attach(this, this.gameState.fisherId);
    }

    update(time, delta) {
        if (this.combatPaused) return;

        if (this.combatState.running) {
            const events = CombatSystem.update(this.combatState, delta);
            for (const e of events) this.eventQueue.push(e);
        }

        this.eventTimer -= delta;
        if (this.eventTimer <= 0 && this.eventQueue.length > 0) {
            const e = this.eventQueue.shift();
            this._processEvent(e);
            this.eventTimer = 150;
        }

        // Smooth HP bar interpolation
        const lerpRate = 1 - Math.pow(0.05, delta / 1000);
        for (let i = 0; i < this.combatState.hpBar.chunks.length; i++) {
            this.displayedChunkHps[i] += (this.combatState.hpBar.chunks[i].hp - this.displayedChunkHps[i]) * lerpRate;
        }
        for (let i = 0; i < this.combatState.monsterHpBar.chunks.length; i++) {
            this.displayedMonsterChunkHps[i] += (this.combatState.monsterHpBar.chunks[i].hp - this.displayedMonsterChunkHps[i]) * lerpRate;
        }

        // Refresh effect icons and tints when effects change
        if (this._effectsDirty) {
            this._refreshEffectIcons();
            this._updateSpriteTints();
            this._effectsDirty = false;
        }

        this._drawMonsterPackHpBar();
        this._drawPartyHpBar();
        this._drawCooldowns();
    }

    pauseCombat() {
        this.combatPaused = true;
        this.tweens.pauseAll();
        this.time.paused = true;
    }

    resumeCombat() {
        this.combatPaused = false;
        this.tweens.resumeAll();
        this.time.paused = false;
    }

    _revertEquipmentBonuses() {
        if (this.gameState.equipmentDelta) {
            EquipmentSystem.revertBonuses(this.gameState.party, this.gameState.equipmentDelta);
            this.gameState.equipmentDelta = null;
            this.gameState.equipmentSnapshot = null;
        }
    }

    // --- Event Processing ---

    _processEvent(e) {
        switch (e.type) {
            case 'fish_base_attack': this._onFishAttack(e, 'lunge'); break;
            case 'fish_special': this._onFishSpecial(e); break;
            case 'monster_base_attack': this._onMonsterAttack(e, 'lunge'); break;
            case 'monster_special': this._onMonsterSpecial(e); break;
            case 'fish_incapacitated': this._onFishIncapacitated(e); break;
            case 'monster_incapacitated': this._onMonsterIncapacitated(e); break;
            case 'monsters_dead': this._onMonstersDead(); break;
            case 'party_dead': this._onPartyDead(); break;
            case 'poison_tick': this._onPoisonTick(e); break;
            case 'heal': this._onHeal(e); break;
            case 'buff_applied': this._onBuffApplied(e); break;
            case 'buff_expired': this._onBuffExpired(e); break;
            case 'burn_tick': this._onBurnTick(e); break;
            case 'burn_applied': this._onBurnApplied(e); break;
            case 'curse_applied': this._onCurseApplied(e); break;
            case 'hot_tick': this._onHotTick(e); break;
            case 'shield_hit': this._onShieldHit(e); break;
            case 'regen_tick': this._onRegenTick(e); break;
            case 'heal_pulse': this._onHealPulse(e); break;
        }

        // Mark effects dirty for any effect-related event
        const effectEvents = [
            'poison_tick', 'poison_applied', 'burn_tick', 'burn_applied', 'burn_expired',
            'curse_applied', 'curse_expired', 'hot_tick', 'hot_applied',
            'buff_applied', 'buff_expired', 'shield_hit', 'shield_grant',
            'heal', 'heal_pulse', 'regen_tick'
        ];
        if (effectEvents.includes(e.type)) this._effectsDirty = true;
    }

    // --- Fish Attack Events ---

    _onFishAttack(e, animType) {
        const fishSpr = this.fishSprites[e.fishIndex];
        const fishAnim = this.fishAnimators[e.fishIndex];
        if (!fishSpr || !fishAnim) return;

        const mi = this._getFrontMonsterSpriteIndex();
        if (mi === -1) return;
        const targetSpr = this.monsterSprites[mi];
        const targetAnim = this.monsterAnimators[mi];

        if (animType === 'projectile') {
            SpriteAnimator.projectile(this, fishSpr.x, fishSpr.y,
                targetSpr.x, targetSpr.y, 0xffffff);
        } else {
            fishAnim.attack(targetSpr.x, targetSpr.y);
        }
        if (targetAnim) targetAnim.hit();
        SpriteAnimator.damageNumber(this, targetSpr.x, targetSpr.y - 15, e.damage, '#ffcccc');
    }

    _onFishSpecial(e) {
        const move = ConfigLoader.getMove(e.moveId);
        const animType = move ? move.animation : 'lunge';
        this._onFishAttack(e, animType);
    }

    // --- Monster Attack Events ---

    _onMonsterAttack(e, animType) {
        const mi = e.monsterIndex ?? 0;
        const monsterSpr = this.monsterSprites[mi];
        const monsterAnim = this.monsterAnimators[mi];
        if (!monsterSpr || !monsterAnim) return;

        const targetIdx = e.targetFishIndex ?? this._getFrontFishSpriteIndex();
        if (targetIdx === -1) return;
        const targetSpr = this.fishSprites[targetIdx];

        if (animType === 'projectile') {
            SpriteAnimator.projectile(this, monsterSpr.x, monsterSpr.y,
                targetSpr.x, targetSpr.y, 0xff4444);
        } else {
            monsterAnim.attack(targetSpr.x, targetSpr.y);
        }

        const targetAnim = this.fishAnimators[targetIdx];
        if (targetAnim && this.combatState.fish[targetIdx]?.alive) {
            targetAnim.hit();
        }
        SpriteAnimator.damageNumber(this, targetSpr.x, targetSpr.y - 15, e.damage, '#ff8888');
    }

    _onMonsterSpecial(e) {
        const move = ConfigLoader.getMove(e.moveId);
        const animType = move ? move.animation : 'lunge';
        this._onMonsterAttack(e, animType);
    }

    // --- Incapacitation Events ---

    _onFishIncapacitated(e) {
        const anim = this.fishAnimators[e.fishIndex];
        if (anim) anim.faint();

        const cd = this.cooldownGfx[e.fishIndex];
        if (cd) {
            cd.base.setVisible(false);
            cd.special.setVisible(false);
            cd.baseTrack.setVisible(false);
            cd.specialTrack.setVisible(false);
        }
        this._effectsDirty = true;
    }

    _onMonsterIncapacitated(e) {
        const mi = e.monsterIndex ?? 0;
        const anim = this.monsterAnimators[mi];
        if (anim) anim.faint();

        const spr = this.monsterSprites[mi];
        if (spr) {
            spr.setTint(0xff0000);
            this.time.delayedCall(300, () => spr.clearTint());
        }
        this._effectsDirty = true;
    }

    // --- Battle End Events ---

    _onMonstersDead() {
        this.combatState.running = false;
        this._revertEquipmentBonuses();
        for (const anim of this.monsterAnimators) anim.faint();

        const encounterType = EncounterSystem.getEncounterType(this.gameState.floor);
        const rewards = EncounterSystem.calculateRewards(this.gameState.floor, encounterType, this.monsters.length);

        // FR-8d: Only award XP to living fish (hp > 0)
        const allMsgs = [];
        for (const f of this.combatState.fish) {
            if (f.alive && f.ref.hp > 0) {
                const msgs = PartySystem.awardXP(f.ref, rewards.xp);
                allMsgs.push(...msgs);
            }
        }
        // Award XP to companion if alive
        if (this.gameState.companion && this.gameState.companion.hp > 0) {
            const msgs = PartySystem.awardXP(this.gameState.companion, rewards.xp);
            allMsgs.push(...msgs);
        }
        this.gameState.gold += rewards.gold;

        const name = this.isPvp ? 'Ghost Party'
            : this.monsters.length > 1 ? this.monsters[0].name + ' pack'
            : this.monsters[0].name;
        const lines = [name + ' defeated! +' + rewards.gold + 'g +' + rewards.xp + 'xp'];
        lines.push(...allMsgs);
        this.msgTxt.setText(lines.join(' | '));

        const isBoss = encounterType === 'boss';
        if (isBoss && this.gameState.equipment) {
            const zoneId = getZoneByFloor(this.gameState.floor).id;
            const drop = EquipmentSystem.rollBossDrop(zoneId);
            if (drop) {
                this.time.delayedCall(1500, () => this._showBossDropPopup(drop));
                return;
            }
        }

        this.time.delayedCall(1500, () => this.advanceFloor());
    }

    _onPartyDead() {
        this.combatState.running = false;
        this._revertEquipmentBonuses();
        this.msgTxt.setText('All fish fainted!');

        this.time.delayedCall(1500, () => {
            for (const f of this.gameState.party) PartySystem.clearCombatState(f);
            this.scene.start('FloorScene', { gameState: this.gameState, result: 'party_dead', isPvp: this.isPvp });
        });
    }

    // --- Effect Events ---

    _onPoisonTick(e) {
        if (e.target === 'monster') {
            const mi = e.monsterIndex ?? 0;
            const spr = this.monsterSprites[mi];
            if (spr) {
                spr.setTint(0x88ff88);
                this.time.delayedCall(200, () => this._restoreMonsterTint(mi));
                SpriteAnimator.damageNumber(this, spr.x, spr.y - 15, e.damage, '#88ff88');
            }
        } else {
            const idx = e.fishIndex;
            const spr = this.fishSprites[idx];
            if (spr) {
                spr.setTint(0x88ff88);
                this.time.delayedCall(200, () => this._restoreFishTint(idx));
                SpriteAnimator.damageNumber(this, spr.x, spr.y - 15, e.damage, '#88ff88');
            }
        }
    }

    _onBurnTick(e) {
        if (e.target === 'monster') {
            const mi = e.monsterIndex ?? 0;
            const spr = this.monsterSprites[mi];
            if (spr) {
                spr.setTint(0xff6600);
                this.time.delayedCall(200, () => this._restoreMonsterTint(mi));
                SpriteAnimator.damageNumber(this, spr.x, spr.y - 15, e.damage, '#ff6600');
            }
        } else {
            const idx = e.index ?? e.fishIndex;
            const spr = this.fishSprites[idx];
            if (spr) {
                spr.setTint(0xff6600);
                this.time.delayedCall(200, () => this._restoreFishTint(idx));
                SpriteAnimator.damageNumber(this, spr.x, spr.y - 15, e.damage, '#ff6600');
            }
        }
    }

    _onBurnApplied(e) {
        if (e.target === 'monster') {
            const mi = e.monsterIndex ?? 0;
            const spr = this.monsterSprites[mi];
            if (spr) {
                spr.setTint(0xff6600);
                this.time.delayedCall(400, () => this._restoreMonsterTint(mi));
            }
        } else {
            const idx = e.index ?? e.fishIndex;
            const spr = this.fishSprites[idx];
            if (spr) {
                spr.setTint(0xff6600);
                this.time.delayedCall(400, () => this._restoreFishTint(idx));
            }
        }
    }

    _onCurseApplied(e) {
        if (e.target === 'monster') {
            const mi = e.monsterIndex ?? 0;
            const spr = this.monsterSprites[mi];
            if (spr) {
                spr.setTint(0x9900cc);
                this.time.delayedCall(400, () => this._restoreMonsterTint(mi));
            }
        } else {
            const idx = e.index ?? e.fishIndex;
            const spr = this.fishSprites[idx];
            if (spr) {
                spr.setTint(0x9900cc);
                this.time.delayedCall(400, () => this._restoreFishTint(idx));
            }
        }
    }

    _onHotTick(e) {
        const spr = this.fishSprites[e.fishIndex];
        if (spr) {
            SpriteAnimator.damageNumber(this, spr.x, spr.y - 15, '+' + e.amount, '#00ff88');
        }
    }

    _onShieldHit(e) {
        if (e.target === 'monster') {
            const mi = this._getFrontMonsterSpriteIndex();
            const spr = mi >= 0 ? this.monsterSprites[mi] : null;
            if (spr) {
                spr.setTint(0x4488ff);
                this.time.delayedCall(200, () => this._restoreMonsterTint(mi));
                SpriteAnimator.damageNumber(this, spr.x, spr.y - 15, e.absorbed, '#4488ff');
            }
        } else {
            const idx = this._getFrontFishSpriteIndex();
            const spr = idx >= 0 ? this.fishSprites[idx] : null;
            if (spr) {
                spr.setTint(0x4488ff);
                this.time.delayedCall(200, () => this._restoreFishTint(idx));
                SpriteAnimator.damageNumber(this, spr.x, spr.y - 15, e.absorbed, '#4488ff');
            }
        }
    }

    _onHeal(e) {
        const spr = this.fishSprites[e.fishIndex];
        if (spr) {
            SpriteAnimator.damageNumber(this, spr.x, spr.y - 15, '+' + e.amount, '#44ff44');
        }
    }

    _onHealPulse(e) {
        if (e.target === 'monster') {
            const mi = e.monsterIndex ?? 0;
            const spr = this.monsterSprites[mi];
            if (spr) {
                SpriteAnimator.damageNumber(this, spr.x, spr.y - 15, '+' + e.amount, '#44ff44');
            }
        } else {
            const spr = this.fishSprites[e.fishIndex];
            if (spr) {
                SpriteAnimator.damageNumber(this, spr.x, spr.y - 15, '+' + e.amount, '#44ff44');
            }
        }
    }

    _onRegenTick(e) {
        const mi = e.monsterIndex ?? 0;
        const spr = this.monsterSprites[mi];
        if (spr) {
            SpriteAnimator.damageNumber(this, spr.x, spr.y - 15, '+' + e.amount, '#44ff44');
        }
    }

    _onBuffApplied(e) {
        if (e.target === 'monster') {
            const mi = e.monsterIndex ?? 0;
            const spr = this.monsterSprites[mi];
            if (spr) {
                spr.setTint(0xffd700);
                this.time.delayedCall(300, () => this._restoreMonsterTint(mi));
            }
        } else {
            const spr = this.fishSprites[e.fishIndex];
            if (spr) {
                spr.setTint(0xffd700);
                this.time.delayedCall(300, () => this._restoreFishTint(e.fishIndex));
            }
        }
    }

    _onBuffExpired(e) {
        if (e.target === 'monster') {
            const mi = e.monsterIndex ?? 0;
            const spr = this.monsterSprites[mi];
            if (spr) {
                spr.setTint(0x999999);
                this.time.delayedCall(300, () => this._restoreMonsterTint(mi));
            }
        } else {
            const spr = this.fishSprites[e.fishIndex];
            if (spr) {
                spr.setTint(0x999999);
                this.time.delayedCall(300, () => this._restoreFishTint(e.fishIndex));
            }
        }
    }

    // --- Boss Drop Popup ---

    _showBossDropPopup(item) {
        const W = this.scale.width;
        const H = this.scale.height;
        const gs = this.gameState;
        this._dropPopupEls = [];

        // Overlay
        const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7)
            .setDepth(50).setScrollFactor(0);
        this._dropPopupEls.push(overlay);

        // Popup panel
        const panelW = W - 40;
        const panelH = 240;
        const panelX = 20;
        const panelY = Math.floor(H / 2 - panelH / 2);
        const zone = getZoneByFloor(gs.floor);
        const panel = new UIPanel(this, {
            x: panelX, y: panelY, width: panelW, height: panelH,
            theme: zone, depth: 51, padding: 0
        });
        this._dropPopupEls.push(panel);

        // Title
        const titleTxt = this.add.text(W / 2, panelY + 16, 'BOSS DROP!',
            makeStyle(TEXT_STYLES.TITLE_MEDIUM, { fontSize: '14px', color: '#ffd700' })
        ).setOrigin(0.5).setDepth(52);
        this._dropPopupEls.push(titleTxt);

        // Item name with rarity color
        const RARITY_HEX = { standard: '#888888', magic: '#44aa44', rare: '#9944cc', unique: '#ffd700' };
        const rarityColor = RARITY_HEX[item.rarity] || '#888888';
        const nameTxt = this.add.text(W / 2, panelY + 38, item.name,
            makeStyle(TEXT_STYLES.BODY, { fontSize: '13px', color: rarityColor })
        ).setOrigin(0.5).setDepth(52);
        this._dropPopupEls.push(nameTxt);

        // Rarity label
        const rarityTxt = this.add.text(W / 2, panelY + 56, '[' + item.rarity + ']',
            makeStyle(TEXT_STYLES.BODY_SMALL, { color: rarityColor })
        ).setOrigin(0.5).setDepth(52);
        this._dropPopupEls.push(rarityTxt);

        // Mini shape preview
        const shapeEls = EquipmentRenderer.renderItemSprite(this, item, W / 2, panelY + 90, 40, 52);
        this._dropPopupEls.push(...shapeEls);

        // Buff summary
        const buffParts = (item.buffs || []).map(b => '+' + b.baseValue + ' ' + b.type.toUpperCase());
        if (buffParts.length > 0) {
            const buffTxt = this.add.text(W / 2, panelY + 120, buffParts.join(', '),
                makeStyle(TEXT_STYLES.BODY_SMALL, { color: '#ccccee' })
            ).setOrigin(0.5).setDepth(52);
            this._dropPopupEls.push(buffTxt);
        }

        // Check stash capacity
        const balance = ConfigLoader.getEquipmentBalance();
        const stashCapacity = balance.stashCellCapacity || 15;
        const canFit = EquipmentSystem.canFitInStash(gs.equipment.stash, item, stashCapacity);

        // "Add to Stash" button
        const addLabel = canFit ? '[ ADD TO STASH ]' : '[ STASH FULL — MAKE ROOM ]';
        const addBtn = UIButton.create(this, {
            x: W / 2, y: panelY + 160,
            label: addLabel,
            style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '12px' }),
            depth: 52,
            color: canFit ? '#88cc88' : '#ccaa44',
            hoverColor: '#ffffff',
            onClick: () => {
                if (canFit) {
                    gs.equipment.stash.push({ id: item.id });
                    this._closeBossDropPopup();
                    this.advanceFloor();
                } else {
                    this._showStashOverflow(item);
                }
            }
        });
        this._dropPopupEls.push(addBtn);

        // "Forfeit Drop" button
        const forfeitBtn = UIButton.create(this, {
            x: W / 2, y: panelY + 190,
            label: '[ FORFEIT DROP ]',
            style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '11px' }),
            depth: 52,
            color: '#888888',
            hoverColor: '#ffffff',
            onClick: () => {
                this._closeBossDropPopup();
                this.advanceFloor();
            }
        });
        this._dropPopupEls.push(forfeitBtn);
    }

    _showStashOverflow(newItem) {
        // Clear existing popup elements
        this._closeBossDropPopup();

        const W = this.scale.width;
        const H = this.scale.height;
        const gs = this.gameState;
        this._dropPopupEls = [];

        const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7)
            .setDepth(50).setScrollFactor(0);
        this._dropPopupEls.push(overlay);

        const zone = getZoneByFloor(gs.floor);
        const balance = ConfigLoader.getEquipmentBalance();
        const stashCapacity = balance.stashCellCapacity || 15;

        const panelW = W - 20;
        const panelH = Math.min(H - 40, 320);
        const panelX = 10;
        const panelY = Math.floor(H / 2 - panelH / 2);
        const panel = new UIPanel(this, {
            x: panelX, y: panelY, width: panelW, height: panelH,
            theme: zone, depth: 51, padding: 0
        });
        this._dropPopupEls.push(panel);

        const titleTxt = this.add.text(W / 2, panelY + 14, 'MAKE ROOM IN STASH',
            makeStyle(TEXT_STYLES.TITLE_MEDIUM, { fontSize: '12px', color: '#ccaa44' })
        ).setOrigin(0.5).setDepth(52);
        this._dropPopupEls.push(titleTxt);

        // List stash items with sell/discard
        let listY = panelY + 34;
        for (let i = 0; i < gs.equipment.stash.length; i++) {
            const stashItem = gs.equipment.stash[i];
            const cfg = ConfigLoader.getEquipmentItem(stashItem.id || stashItem.itemId);
            if (!cfg) continue;

            const RARITY_HEX = { standard: '#888888', magic: '#44aa44', rare: '#9944cc', unique: '#ffd700' };
            const color = RARITY_HEX[cfg.rarity] || '#888888';
            const sellPrice = EconomySystem.getEquipmentSellPrice(cfg.id);

            const nameTxt = this.add.text(panelX + 8, listY, cfg.name,
                makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '10px', color })
            ).setDepth(52);
            this._dropPopupEls.push(nameTxt);

            if (sellPrice > 0) {
                const sellBtn = UIButton.create(this, {
                    x: W - 60, y: listY + 2,
                    label: 'SELL ' + sellPrice + 'g',
                    style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '9px' }),
                    depth: 52, color: '#cccc44', hoverColor: '#ffffff',
                    onClick: () => {
                        EconomySystem.sellEquipment(gs, stashItem.id || stashItem.itemId);
                        this._showStashOverflow(newItem);
                    }
                });
                this._dropPopupEls.push(sellBtn);
            }

            const discardBtn = UIButton.create(this, {
                x: W - 20, y: listY + 2,
                label: 'X',
                style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '9px' }),
                depth: 52, color: '#cc4444', hoverColor: '#ffffff',
                onClick: () => {
                    const idx = gs.equipment.stash.findIndex(e => (e.id || e.itemId) === (stashItem.id || stashItem.itemId));
                    if (idx >= 0) gs.equipment.stash.splice(idx, 1);
                    this._showStashOverflow(newItem);
                }
            });
            this._dropPopupEls.push(discardBtn);

            listY += 22;
        }

        // Check if room was made
        const canFit = EquipmentSystem.canFitInStash(gs.equipment.stash, newItem, stashCapacity);

        if (canFit) {
            const addBtn = UIButton.create(this, {
                x: W / 2, y: panelY + panelH - 50,
                label: '[ ADD TO STASH ]',
                style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '12px' }),
                depth: 52, color: '#88cc88', hoverColor: '#ffffff',
                onClick: () => {
                    gs.equipment.stash.push({ id: newItem.id });
                    this._closeBossDropPopup();
                    this.advanceFloor();
                }
            });
            this._dropPopupEls.push(addBtn);
        }

        const forfeitBtn = UIButton.create(this, {
            x: W / 2, y: panelY + panelH - 24,
            label: '[ FORFEIT DROP ]',
            style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '11px' }),
            depth: 52, color: '#888888', hoverColor: '#ffffff',
            onClick: () => {
                this._closeBossDropPopup();
                this.advanceFloor();
            }
        });
        this._dropPopupEls.push(forfeitBtn);
    }

    _closeBossDropPopup() {
        if (this._dropPopupEls) {
            for (const el of this._dropPopupEls) {
                if (el && el.destroy) el.destroy();
            }
            this._dropPopupEls = [];
        }
    }

    // --- Floor Advance ---

    advanceFloor() {
        for (const f of this.gameState.party) PartySystem.clearCombatState(f);
        this.scene.start('FloorScene', { gameState: this.gameState, result: 'victory' });
    }

    // --- Drawing Helpers ---

    _drawMonsterPackHpBar() {
        const L = this.layout;
        const chunks = this.combatState.monsterHpBar.chunks;
        const totalMax = this.combatState.monsterHpBar.totalMax;
        this.monsterHpGfx.clear();

        let x = L.monsterHpX;
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const segW = (chunk.maxHp / totalMax) * L.monsterHpW;

            // Background
            this.monsterHpGfx.fillStyle(0x444444, 1);
            this.monsterHpGfx.fillRect(x, L.monsterHpY, segW, L.monsterHpH);

            // HP fill
            const displayHp = Math.max(0, this.displayedMonsterChunkHps[i]);
            if (displayHp > 0) {
                const fillW = (displayHp / chunk.maxHp) * segW;
                this.monsterHpGfx.fillStyle(chunk.color, 1);
                this.monsterHpGfx.fillRect(x, L.monsterHpY, fillW, L.monsterHpH);
            }

            // Shield overlay
            if (chunk.maxShield > 0 && chunk.shield > 0) {
                const shieldRatio = Math.min(1, chunk.shield / chunk.maxShield);
                const shieldW = shieldRatio * segW;
                this.monsterHpGfx.fillStyle(0x4488ff, 0.4);
                this.monsterHpGfx.fillRect(x, L.monsterHpY, shieldW, L.monsterHpH);
            }

            // Chunk separator
            if (i < chunks.length - 1) {
                this.monsterHpGfx.fillStyle(0x111111, 1);
                this.monsterHpGfx.fillRect(x + segW - 1, L.monsterHpY, 1, L.monsterHpH);
            }

            x += segW;
        }

        const totalCurrent = Math.max(0, Math.round(this.displayedMonsterChunkHps.reduce((s, v) => s + v, 0)));
        this.monsterHpTxt.setText(totalCurrent + '/' + totalMax);
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

            // Background
            this.partyHpBar.fillStyle(0x444444, 1);
            this.partyHpBar.fillRect(x, L.hpBarY, segW, L.hpBarH);

            // HP fill
            const displayHp = Math.max(0, this.displayedChunkHps[i]);
            if (displayHp > 0) {
                const fillW = (displayHp / chunk.maxHp) * segW;
                this.partyHpBar.fillStyle(chunk.color, 1);
                this.partyHpBar.fillRect(x, L.hpBarY, fillW, L.hpBarH);
            }

            // Shield overlay
            if (chunk.maxShield > 0 && chunk.shield > 0) {
                const shieldRatio = Math.min(1, chunk.shield / chunk.maxShield);
                const shieldW = shieldRatio * segW;
                this.partyHpBar.fillStyle(0x4488ff, 0.4);
                this.partyHpBar.fillRect(x, L.hpBarY, shieldW, L.hpBarH);
            }

            // Chunk separator
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

            const effSpd = CombatSystem.getEffectiveStat(f, 'spd');
            const baseCd = CombatSystem.getBaseAttackCooldown(effSpd);
            const baseFill = Math.min(1, f.baseTimer / baseCd);
            cd.base.clear();
            cd.base.fillStyle(0xcccccc, 0.8);
            cd.base.fillRect(cd.x, cd.y, baseFill * 36, 3);

            const moveIdx = f.specialMoveIndex % f.ref.moves.length;
            const move = ConfigLoader.getMove(f.ref.moves[moveIdx]);
            if (move) {
                const specFill = Math.min(1, f.specialTimer / move.cooldown);
                cd.special.clear();
                cd.special.fillStyle(cd.color, 0.8);
                cd.special.fillRect(cd.x, cd.y + 5, specFill * 36, 3);
            }
        }
    }

    // --- Effect Visuals ---

    _refreshEffectIcons() {
        // Destroy old icons
        for (const img of this.fishEffectIcons) img.destroy();
        for (const img of this.monsterEffectIcons) img.destroy();
        this.fishEffectIcons = [];
        this.monsterEffectIcons = [];

        // Fish effect icons (below sprites)
        for (let i = 0; i < this.combatState.fish.length; i++) {
            if (!this.combatState.fish[i].alive) continue;
            const spr = this.fishSprites[i];
            if (!spr) continue;
            const keys = this._getActiveEffectKeys(this.combatState.fish[i]);
            const startX = spr.x - (keys.length * 12) / 2;
            for (let k = 0; k < keys.length; k++) {
                const icon = this.add.image(startX + k * 12, spr.y + 18, keys[k]).setScale(1).setDepth(5);
                this.fishEffectIcons.push(icon);
            }
        }

        // Monster effect icons (above sprites)
        for (let i = 0; i < this.combatState.monsters.length; i++) {
            if (!this.combatState.monsters[i].alive) continue;
            const spr = this.monsterSprites[i];
            if (!spr) continue;
            const keys = this._getActiveEffectKeys(this.combatState.monsters[i]);
            const startX = spr.x - (keys.length * 12) / 2;
            for (let k = 0; k < keys.length; k++) {
                const icon = this.add.image(startX + k * 12, spr.y - 22, keys[k]).setScale(1).setDepth(5);
                this.monsterEffectIcons.push(icon);
            }
        }
    }

    _getActiveEffectKeys(combatant) {
        const keys = [];
        if (combatant.poisons && combatant.poisons.length > 0) keys.push('icon_poison');
        if (combatant.burn) keys.push('icon_burn');
        if (combatant.curses && combatant.curses.length > 0) keys.push('icon_curse');
        if (combatant.shield > 0) keys.push('icon_shield');
        if (combatant.hots && combatant.hots.length > 0) keys.push('icon_hot');
        if (combatant.buffs && combatant.buffs.length > 0) {
            const stats = new Set(combatant.buffs.map(b => b.stat));
            if (stats.has('atk')) keys.push('icon_buff_atk');
            if (stats.has('def')) keys.push('icon_buff_def');
            if (stats.has('spd')) keys.push('icon_buff_spd');
        }
        return keys;
    }

    _updateSpriteTints() {
        for (let i = 0; i < this.combatState.fish.length; i++) {
            if (!this.combatState.fish[i].alive) continue;
            const spr = this.fishSprites[i];
            if (!spr) continue;
            const tint = this._getEffectTint(this.combatState.fish[i]);
            if (tint) spr.setTint(tint); else spr.clearTint();
        }
        for (let i = 0; i < this.combatState.monsters.length; i++) {
            if (!this.combatState.monsters[i].alive) continue;
            const spr = this.monsterSprites[i];
            if (!spr) continue;
            const tint = this._getEffectTint(this.combatState.monsters[i]);
            if (tint) spr.setTint(tint); else spr.clearTint();
        }
    }

    _getEffectTint(combatant) {
        // Priority: burn > curse > poison > shield > HoT
        if (combatant.burn) return 0xff6600;
        if (combatant.curses && combatant.curses.length > 0) return 0x9900cc;
        if (combatant.poisons && combatant.poisons.length > 0) return 0x00cc00;
        if (combatant.shield > 0) return 0x4488ff;
        if (combatant.hots && combatant.hots.length > 0) return 0x00ff88;
        return null;
    }

    _restoreFishTint(idx) {
        const c = this.combatState.fish[idx];
        const spr = this.fishSprites[idx];
        if (!c || !spr) return;
        const tint = this._getEffectTint(c);
        if (tint) spr.setTint(tint); else spr.clearTint();
    }

    _restoreMonsterTint(mi) {
        const c = this.combatState.monsters[mi];
        const spr = this.monsterSprites[mi];
        if (!c || !spr) return;
        const tint = this._getEffectTint(c);
        if (tint) spr.setTint(tint); else spr.clearTint();
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

    _getMonsterFormationPositions(count, L) {
        const positions = [];
        if (count === 1) {
            positions.push({ x: L.monsterX, y: L.monsterY });
        } else if (count === 2) {
            positions.push({ x: L.monsterX - 20, y: L.monsterY });
            positions.push({ x: L.monsterX + 20, y: L.monsterY - 20 });
        } else if (count >= 3) {
            positions.push({ x: L.monsterX - 20, y: L.monsterY });
            positions.push({ x: L.monsterX + 20, y: L.monsterY - 25 });
            positions.push({ x: L.monsterX + 20, y: L.monsterY + 25 });
        }
        return positions;
    }

    _getFrontFishSpriteIndex() {
        for (let i = 0; i < this.combatState.fish.length; i++) {
            if (this.combatState.fish[i].alive) return i;
        }
        return -1;
    }

    _getFrontMonsterSpriteIndex() {
        for (let i = 0; i < this.combatState.monsters.length; i++) {
            if (this.combatState.monsters[i].alive) return i;
        }
        return -1;
    }

    // --- Cleanup ---

    shutdown() {
        this._closeBossDropPopup();
        this.tweens.killAll();
        for (const a of this.fishAnimators) a.destroy();
        for (const a of this.monsterAnimators) a.destroy();
        for (const img of this.fishEffectIcons) img.destroy();
        for (const img of this.monsterEffectIcons) img.destroy();
        this.eventQueue = [];
        this.combatState.running = false;
    }
}
