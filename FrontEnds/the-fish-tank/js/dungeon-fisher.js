window.DungeonFisherApp = (() => {
    const dungeon = document.getElementById('dungeon');
    let initialized = false;
    let running = false;
    let animFrameId = 0;
    let lastTime = 0;

    let gameState = 'FISHING';
    let floor = 1;
    let gold = 0;
    let fish = null;
    let monsters = [];
    let combatTimer = 0;
    let castState = 'idle';

    const COMBAT_TICK = 0.8;
    const UPGRADE_HP_AMOUNT = 12;
    const UPGRADE_DMG_AMOUNT = 3;

    const FISH_TYPES = [
        { name: 'Common Minnow', type: 'common', hpMin: 20, hpMax: 30, dmgMin: 5, dmgMax: 8, palette: ['#888888', '#aaaaaa', '#666666'] },
        { name: 'Tropical Guppy', type: 'tropical', hpMin: 25, hpMax: 35, dmgMin: 6, dmgMax: 9, palette: ['#e87040', '#f4a870', '#c85530'] },
        { name: 'Electric Eel', type: 'electric', hpMin: 18, hpMax: 25, dmgMin: 8, dmgMax: 12, palette: ['#e0d040', '#60a0e0', '#f0e860'] },
        { name: 'Deep Sea Angler', type: 'deepsea', hpMin: 30, hpMax: 40, dmgMin: 4, dmgMax: 7, palette: ['#1a3060', '#40c8c0', '#0d1830'] },
        { name: 'Golden Koi', type: 'golden', hpMin: 28, hpMax: 38, dmgMin: 7, dmgMax: 11, palette: ['#d4a020', '#f0d060', '#b08018'] }
    ];

    const FLOOR_DATA = [
        { monsters: [{ type: 'crab', hp: 15, damage: 3, gold: 8 }, { type: 'crab', hp: 15, damage: 3, gold: 8 }] },
        { monsters: [{ type: 'crab', hp: 20, damage: 4, gold: 10 }, { type: 'crab', hp: 20, damage: 4, gold: 10 }, { type: 'crab', hp: 20, damage: 4, gold: 10 }] },
        { monsters: [{ type: 'eel', hp: 30, damage: 5, gold: 14 }, { type: 'eel', hp: 30, damage: 5, gold: 14 }] },
        { monsters: [{ type: 'eel', hp: 35, damage: 6, gold: 16 }, { type: 'eel', hp: 35, damage: 6, gold: 16 }, { type: 'eel', hp: 35, damage: 6, gold: 16 }] },
        { monsters: [{ type: 'angler', hp: 45, damage: 7, gold: 20 }, { type: 'angler', hp: 45, damage: 7, gold: 20 }] },
        { monsters: [{ type: 'angler', hp: 50, damage: 8, gold: 22 }, { type: 'angler', hp: 50, damage: 8, gold: 22 }, { type: 'crab', hp: 25, damage: 5, gold: 12 }] },
        { monsters: [{ type: 'kraken', hp: 60, damage: 9, gold: 26 }, { type: 'kraken', hp: 60, damage: 9, gold: 26 }] },
        { monsters: [{ type: 'kraken', hp: 65, damage: 10, gold: 28 }, { type: 'kraken', hp: 65, damage: 10, gold: 28 }, { type: 'eel', hp: 40, damage: 7, gold: 18 }] },
        { monsters: [{ type: 'kraken', hp: 75, damage: 11, gold: 32 }, { type: 'kraken', hp: 75, damage: 11, gold: 32 }, { type: 'kraken', hp: 75, damage: 11, gold: 32 }] },
        { monsters: [{ type: 'elder', hp: 120, damage: 14, gold: 50 }, { type: 'kraken', hp: 80, damage: 11, gold: 34 }, { type: 'kraken', hp: 80, damage: 11, gold: 34 }] }
    ];

    let floorLabel, goldLabel, scene, panel;
    let actionBtn, fishStatsEl, upgradeHpBtn, upgradeDmgBtn, fightBtn;
    let fishingWater, bobberEl;
    let victoryOverlay;
    let fishEntityEl, fishHpBarFill;

    function rand(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function createFishSVG(palette) {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 60 30');
        svg.setAttribute('width', '60');
        svg.setAttribute('height', '30');
        svg.innerHTML =
            '<ellipse cx="32" cy="15" rx="18" ry="10" fill="' + palette[0] + '"/>' +
            '<ellipse cx="32" cy="17" rx="14" ry="6" fill="' + palette[1] + '" opacity="0.5"/>' +
            '<polygon points="12,15 2,6 2,24" fill="' + palette[2] + '"/>' +
            '<circle cx="42" cy="12" r="2.5" fill="#fff"/>' +
            '<circle cx="42" cy="12" r="1.2" fill="#111"/>' +
            '<polygon points="32,6 26,2 26,10" fill="' + palette[0] + '" opacity="0.7"/>';
        return svg;
    }

    function createMonsterSVG(type) {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        if (type === 'crab') {
            svg.setAttribute('viewBox', '0 0 50 35');
            svg.setAttribute('width', '50');
            svg.setAttribute('height', '35');
            svg.innerHTML =
                '<ellipse cx="25" cy="22" rx="16" ry="10" fill="#a04030"/>' +
                '<ellipse cx="25" cy="24" rx="12" ry="6" fill="#c06050" opacity="0.5"/>' +
                '<path d="M10,18 Q4,10 8,6" stroke="#a04030" stroke-width="3" fill="none" stroke-linecap="round"/>' +
                '<path d="M40,18 Q46,10 42,6" stroke="#a04030" stroke-width="3" fill="none" stroke-linecap="round"/>' +
                '<circle cx="6" cy="5" r="3" fill="#c06050"/>' +
                '<circle cx="44" cy="5" r="3" fill="#c06050"/>' +
                '<circle cx="20" cy="19" r="2" fill="#200"/>' +
                '<circle cx="30" cy="19" r="2" fill="#200"/>';
        } else if (type === 'eel') {
            svg.setAttribute('viewBox', '0 0 70 25');
            svg.setAttribute('width', '70');
            svg.setAttribute('height', '25');
            svg.innerHTML =
                '<path d="M5,12 Q15,4 25,12 Q35,20 45,12 Q55,4 65,12" stroke="#302050" stroke-width="6" fill="none" stroke-linecap="round"/>' +
                '<path d="M5,12 Q15,4 25,12 Q35,20 45,12 Q55,4 65,12" stroke="#503080" stroke-width="3" fill="none" stroke-linecap="round"/>' +
                '<circle cx="8" cy="10" r="2" fill="#a060c0"/>' +
                '<circle cx="8" cy="10" r="1" fill="#fff"/>';
        } else if (type === 'angler') {
            svg.setAttribute('viewBox', '0 0 60 40');
            svg.setAttribute('width', '60');
            svg.setAttribute('height', '40');
            svg.innerHTML =
                '<ellipse cx="32" cy="25" rx="20" ry="13" fill="#2a3020"/>' +
                '<ellipse cx="32" cy="28" rx="16" ry="8" fill="#3a4030" opacity="0.5"/>' +
                '<path d="M18,14 Q14,4 20,2" stroke="#4a5040" stroke-width="2" fill="none"/>' +
                '<circle cx="20" cy="2" r="3" fill="#80f0a0" opacity="0.8"/>' +
                '<circle cx="20" cy="2" r="5" fill="#80f0a0" opacity="0.2"/>' +
                '<path d="M16,28 L12,34 M22,30 L20,36 M42,28 L46,34 M36,30 L38,36" stroke="#2a3020" stroke-width="2" stroke-linecap="round"/>' +
                '<circle cx="24" cy="22" r="3" fill="#060"/>' +
                '<circle cx="24" cy="22" r="1.5" fill="#0f0" opacity="0.6"/>';
        } else if (type === 'kraken') {
            svg.setAttribute('viewBox', '0 0 55 45');
            svg.setAttribute('width', '55');
            svg.setAttribute('height', '45');
            svg.innerHTML =
                '<ellipse cx="28" cy="18" rx="16" ry="12" fill="#301828"/>' +
                '<ellipse cx="28" cy="20" rx="12" ry="7" fill="#482838" opacity="0.5"/>' +
                '<path d="M14,28 Q10,38 6,42" stroke="#402030" stroke-width="3" fill="none" stroke-linecap="round"/>' +
                '<path d="M20,30 Q18,38 14,44" stroke="#402030" stroke-width="3" fill="none" stroke-linecap="round"/>' +
                '<path d="M28,30 Q28,40 28,44" stroke="#402030" stroke-width="3" fill="none" stroke-linecap="round"/>' +
                '<path d="M36,30 Q38,38 42,44" stroke="#402030" stroke-width="3" fill="none" stroke-linecap="round"/>' +
                '<path d="M42,28 Q46,38 50,42" stroke="#402030" stroke-width="3" fill="none" stroke-linecap="round"/>' +
                '<circle cx="22" cy="15" r="3" fill="#600040"/>' +
                '<circle cx="34" cy="15" r="3" fill="#600040"/>' +
                '<circle cx="22" cy="15" r="1.5" fill="#f040a0"/>' +
                '<circle cx="34" cy="15" r="1.5" fill="#f040a0"/>';
        } else if (type === 'elder') {
            svg.setAttribute('viewBox', '0 0 80 60');
            svg.setAttribute('width', '80');
            svg.setAttribute('height', '60');
            svg.innerHTML =
                '<ellipse cx="40" cy="24" rx="24" ry="18" fill="#401830"/>' +
                '<ellipse cx="40" cy="28" rx="18" ry="10" fill="#582840" opacity="0.5"/>' +
                '<path d="M18,38 Q10,50 4,56" stroke="#502038" stroke-width="4" fill="none" stroke-linecap="round"/>' +
                '<path d="M26,40 Q22,52 16,58" stroke="#502038" stroke-width="4" fill="none" stroke-linecap="round"/>' +
                '<path d="M34,42 Q32,54 30,60" stroke="#502038" stroke-width="4" fill="none" stroke-linecap="round"/>' +
                '<path d="M46,42 Q48,54 50,60" stroke="#502038" stroke-width="4" fill="none" stroke-linecap="round"/>' +
                '<path d="M54,40 Q58,52 64,58" stroke="#502038" stroke-width="4" fill="none" stroke-linecap="round"/>' +
                '<path d="M62,38 Q70,50 76,56" stroke="#502038" stroke-width="4" fill="none" stroke-linecap="round"/>' +
                '<circle cx="30" cy="20" r="4" fill="#800050"/>' +
                '<circle cx="50" cy="20" r="4" fill="#800050"/>' +
                '<circle cx="30" cy="20" r="2" fill="#f040a0"/>' +
                '<circle cx="50" cy="20" r="2" fill="#f040a0"/>' +
                '<path d="M34,32 Q40,36 46,32" stroke="#f040a0" stroke-width="1.5" fill="none" opacity="0.5"/>';
        }
        return svg;
    }

    function buildUI() {
        dungeon.innerHTML = '';

        var hud = document.createElement('div');
        hud.className = 'dungeon-hud';
        floorLabel = document.createElement('span');
        floorLabel.className = 'dungeon-floor';
        goldLabel = document.createElement('span');
        goldLabel.className = 'dungeon-gold';
        hud.appendChild(floorLabel);
        hud.appendChild(goldLabel);
        dungeon.appendChild(hud);

        scene = document.createElement('div');
        scene.className = 'dungeon-scene';
        dungeon.appendChild(scene);

        panel = document.createElement('div');
        panel.className = 'dungeon-panel';

        actionBtn = document.createElement('button');
        actionBtn.className = 'dungeon-btn';

        fishStatsEl = document.createElement('div');
        fishStatsEl.className = 'fish-stats';

        upgradeHpBtn = document.createElement('button');
        upgradeHpBtn.className = 'dungeon-btn';

        upgradeDmgBtn = document.createElement('button');
        upgradeDmgBtn.className = 'dungeon-btn';

        fightBtn = document.createElement('button');
        fightBtn.className = 'dungeon-btn';
        fightBtn.textContent = 'Fight!';

        panel.appendChild(actionBtn);
        panel.appendChild(fishStatsEl);
        panel.appendChild(upgradeHpBtn);
        panel.appendChild(upgradeDmgBtn);
        panel.appendChild(fightBtn);
        dungeon.appendChild(panel);

        victoryOverlay = document.createElement('div');
        victoryOverlay.className = 'dungeon-victory';
        victoryOverlay.style.display = 'none';
        dungeon.appendChild(victoryOverlay);

        actionBtn.addEventListener('click', onActionClick);
        upgradeHpBtn.addEventListener('click', function() { upgradeHP(); });
        upgradeDmgBtn.addEventListener('click', function() { upgradeDMG(); });
        fightBtn.addEventListener('click', function() { startCombat(); });

        floor = 1;
        gold = 0;
        fish = null;
        castState = 'idle';
        enterState('FISHING');
    }

    function onActionClick() {
        if (gameState === 'FISHING') {
            if (castState === 'idle') {
                castLine();
            } else if (castState === 'bobbing') {
                reelIn();
            }
        } else if (gameState === 'FLOOR_CLEAR') {
            descendFloor();
        }
    }

    function updateHUD() {
        floorLabel.textContent = 'Floor ' + floor + '/10';
        goldLabel.textContent = 'Gold: ' + gold;
    }

    function hidePanel() {
        actionBtn.style.display = 'none';
        fishStatsEl.style.display = 'none';
        upgradeHpBtn.style.display = 'none';
        upgradeDmgBtn.style.display = 'none';
        fightBtn.style.display = 'none';
        victoryOverlay.style.display = 'none';
    }

    function enterState(newState) {
        gameState = newState;
        updateHUD();
        hidePanel();
        scene.innerHTML = '';

        if (newState === 'FISHING') {
            castState = 'idle';
            fishingWater = document.createElement('div');
            fishingWater.className = 'fishing-water';
            bobberEl = document.createElement('div');
            bobberEl.className = 'bobber';
            bobberEl.style.display = 'none';
            bobberEl.style.top = '-10px';
            fishingWater.appendChild(bobberEl);
            scene.appendChild(fishingWater);
            actionBtn.style.display = '';
            actionBtn.textContent = 'Cast Line';
            actionBtn.disabled = false;
        } else if (newState === 'UPGRADING') {
            showUpgradeUI();
        } else if (newState === 'COMBAT') {
            combatTimer = 0;
            showCombatUI();
        } else if (newState === 'FLOOR_CLEAR') {
            if (floor >= 10) {
                enterState('VICTORY');
                return;
            }
            var msg = document.createElement('div');
            msg.style.cssText = 'text-align:center;font-size:1.2rem;color:#f0c040;padding-top:3rem;';
            msg.textContent = 'Floor ' + floor + ' Cleared!';
            scene.appendChild(msg);
            actionBtn.style.display = '';
            actionBtn.textContent = 'Descend to Floor ' + (floor + 1);
            actionBtn.disabled = false;
        } else if (newState === 'VICTORY') {
            victoryOverlay.style.display = '';
            victoryOverlay.innerHTML = '';
            var title = document.createElement('div');
            title.className = 'victory-title';
            title.textContent = 'DUNGEON CLEARED';
            var stats = document.createElement('div');
            stats.className = 'victory-stats';
            stats.innerHTML = 'All 10 floors conquered!<br>Gold earned: ' + gold;
            var btn = document.createElement('button');
            btn.className = 'dungeon-btn';
            btn.textContent = 'Play Again';
            btn.addEventListener('click', function() { resetGame(); });
            victoryOverlay.appendChild(title);
            victoryOverlay.appendChild(stats);
            victoryOverlay.appendChild(btn);
        }
    }

    function castLine() {
        castState = 'cast';
        bobberEl.style.display = '';
        bobberEl.classList.remove('bobbing');
        actionBtn.textContent = 'Casting...';
        actionBtn.disabled = true;
        setTimeout(function() {
            if (castState === 'cast') {
                castState = 'bobbing';
                bobberEl.classList.add('bobbing');
                actionBtn.textContent = 'Reel In!';
                actionBtn.disabled = false;
            }
        }, 600);
    }

    function reelIn() {
        castState = 'idle';
        bobberEl.classList.remove('bobbing');
        bobberEl.style.display = 'none';

        var roll = Math.random();
        var typeIndex;
        if (roll < 0.1) {
            typeIndex = 4;
        } else {
            typeIndex = Math.floor(Math.random() * 4);
        }
        var ft = FISH_TYPES[typeIndex];
        var hp = rand(ft.hpMin, ft.hpMax);
        fish = {
            name: ft.name,
            type: ft.type,
            hp: hp,
            maxHp: hp,
            damage: rand(ft.dmgMin, ft.dmgMax),
            upgrades: 0,
            palette: ft.palette
        };
        enterState('UPGRADING');
    }

    function showUpgradeUI() {
        var entity = document.createElement('div');
        entity.className = 'dungeon-entity fish-entity';
        entity.appendChild(createFishSVG(fish.palette));
        scene.appendChild(entity);

        fishStatsEl.style.display = '';
        upgradeHpBtn.style.display = '';
        upgradeDmgBtn.style.display = '';
        fightBtn.style.display = '';
        updateFishStats();
        updateUpgradeButtons();
    }

    function updateFishStats() {
        fishStatsEl.innerHTML = '<strong>' + fish.name + '</strong><br>HP: ' + fish.hp + '/' + fish.maxHp + ' | DMG: ' + fish.damage;
    }

    function updateUpgradeButtons() {
        var cost = 10 + fish.upgrades * 8;
        upgradeHpBtn.textContent = '+' + UPGRADE_HP_AMOUNT + ' HP (' + cost + 'g)';
        upgradeDmgBtn.textContent = '+' + UPGRADE_DMG_AMOUNT + ' DMG (' + cost + 'g)';
        upgradeHpBtn.disabled = gold < cost;
        upgradeDmgBtn.disabled = gold < cost;
    }

    function upgradeHP() {
        var cost = 10 + fish.upgrades * 8;
        if (gold < cost) return;
        gold -= cost;
        fish.hp += UPGRADE_HP_AMOUNT;
        fish.maxHp += UPGRADE_HP_AMOUNT;
        fish.upgrades++;
        updateHUD();
        updateFishStats();
        updateUpgradeButtons();
    }

    function upgradeDMG() {
        var cost = 10 + fish.upgrades * 8;
        if (gold < cost) return;
        gold -= cost;
        fish.damage += UPGRADE_DMG_AMOUNT;
        fish.upgrades++;
        updateHUD();
        updateFishStats();
        updateUpgradeButtons();
    }

    function startCombat() {
        var floorInfo = FLOOR_DATA[floor - 1];
        monsters = floorInfo.monsters.map(function(m) {
            return {
                type: m.type,
                hp: m.hp,
                maxHp: m.hp,
                damage: m.damage,
                gold: m.gold,
                alive: true,
                el: null,
                hpBarFill: null
            };
        });
        enterState('COMBAT');
    }

    function showCombatUI() {
        fishEntityEl = document.createElement('div');
        fishEntityEl.className = 'dungeon-entity fish-entity';
        fishEntityEl.appendChild(createFishSVG(fish.palette));
        var fishBar = document.createElement('div');
        fishBar.className = 'hp-bar';
        fishHpBarFill = document.createElement('div');
        fishHpBarFill.className = 'hp-bar-fill fish-hp';
        fishHpBarFill.style.width = (fish.hp / fish.maxHp * 100) + '%';
        fishBar.appendChild(fishHpBarFill);
        fishEntityEl.appendChild(fishBar);
        scene.appendChild(fishEntityEl);

        for (var i = 0; i < monsters.length; i++) {
            var m = monsters[i];
            var el = document.createElement('div');
            el.className = 'dungeon-entity monster-entity';
            el.appendChild(createMonsterSVG(m.type));
            var bar = document.createElement('div');
            bar.className = 'hp-bar';
            var fill = document.createElement('div');
            fill.className = 'hp-bar-fill monster-hp';
            fill.style.width = '100%';
            bar.appendChild(fill);
            el.appendChild(bar);
            m.el = el;
            m.hpBarFill = fill;
            scene.appendChild(el);
        }
    }

    function flashEntity(el) {
        el.classList.add('entity-damage-flash');
        setTimeout(function() { el.classList.remove('entity-damage-flash'); }, 150);
    }

    function combatTick(dt) {
        combatTimer += dt;
        if (combatTimer < COMBAT_TICK) return;
        combatTimer -= COMBAT_TICK;

        var target = null;
        for (var i = 0; i < monsters.length; i++) {
            if (monsters[i].alive) { target = monsters[i]; break; }
        }
        if (target) {
            target.hp -= fish.damage;
            if (target.hp <= 0) {
                target.hp = 0;
                target.alive = false;
                gold += target.gold;
                updateHUD();
                if (target.el) {
                    target.el.style.transition = 'opacity 0.3s';
                    target.el.style.opacity = '0';
                }
            }
            if (target.hpBarFill) {
                target.hpBarFill.style.width = (Math.max(0, target.hp) / target.maxHp * 100) + '%';
            }
            if (target.el) flashEntity(target.el);
        }

        var allDead = true;
        for (var j = 0; j < monsters.length; j++) {
            if (monsters[j].alive) { allDead = false; break; }
        }
        if (allDead) {
            setTimeout(function() {
                if (gameState === 'COMBAT') enterState('FLOOR_CLEAR');
            }, 400);
            return;
        }

        var fishHit = false;
        for (var k = 0; k < monsters.length; k++) {
            if (monsters[k].alive) {
                fish.hp -= monsters[k].damage;
                fishHit = true;
            }
        }
        if (fish.hp <= 0) fish.hp = 0;
        if (fishHpBarFill) {
            fishHpBarFill.style.width = (Math.max(0, fish.hp) / fish.maxHp * 100) + '%';
        }
        if (fishHit && fishEntityEl) flashEntity(fishEntityEl);

        if (fish.hp <= 0) {
            fish = null;
            setTimeout(function() {
                if (gameState === 'COMBAT') enterState('FISHING');
            }, 400);
        }
    }

    function descendFloor() {
        floor++;
        enterState('FISHING');
    }

    function resetGame() {
        floor = 1;
        gold = 0;
        fish = null;
        enterState('FISHING');
    }

    function update(dt) {
        if (gameState === 'COMBAT') combatTick(dt);
    }

    function loop(timestamp) {
        if (!running) return;
        var dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.1) : 0.016;
        lastTime = timestamp;
        update(dt);
        animFrameId = requestAnimationFrame(loop);
    }

    function init() {
        buildUI();
    }

    function start() {
        if (!initialized) {
            initialized = true;
            init();
        }
        running = true;
        lastTime = 0;
        animFrameId = requestAnimationFrame(loop);
    }

    function stop() {
        running = false;
        cancelAnimationFrame(animFrameId);
    }

    return { start, stop };
})();
