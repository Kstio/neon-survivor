import { state, resetGameState } from './GameState.js';
import { WORLD_SIZE, SCREEN_W, SCREEN_H, SKILL_DB } from './constants.js';
import { clamp, checkWall } from './utils.js';
import { updateUI, updateIndicators, renderStats, renderAbilities } from './ui.js';
import { generateWorld } from './MapGenerator.js';
import { Player } from './entities/Player.js';
import { Enemy } from './entities/Enemy.js';
import { Obstacle, Mine, AirdropZone, YellowLootBox } from './entities/Items.js'; 
import { FloatText, Particle } from './entities/Particle.js';
import { loadSounds, playSound } from './sounds.js';
import { Meta, UPGRADES } from './MetaGame.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let animationId = null;
const keys = { w: false, a: false, s: false, d: false };
const mouse = { x: 0, y: 0, active: false };

const ENEMY_DATA = {
    'basic':    { cost: 1,  minTime: 0,   packSize: [1, 3] },
    'runner':   { cost: 2,  minTime: 30,  packSize: [2, 5] },
    'shooter':  { cost: 4,  minTime: 60,  packSize: [1, 2] },
    'kamikaze': { cost: 5,  minTime: 90,  packSize: [3, 6] },
    'tank':     { cost: 15, minTime: 120, packSize: [1, 1] },
    'dasher':   { cost: 10, minTime: 150, packSize: [1, 2] },
    'elite':    { cost: 25, minTime: 180, packSize: [1, 1] }
};

const WAVE_CYCLE = [
    { state: 'calm',  duration: 10, budgetMult: 0.5, limitMult: 0.8 },
    { state: 'build', duration: 30, budgetMult: 1.0, limitMult: 1.0 },
    { state: 'peak',  duration: 20, budgetMult: 2.5, limitMult: 1.5 }
];

function init() {
    loadSounds();
    Meta.load();

    resetGameState();
    
    const worldData = generateWorld();
    state.obstacles = worldData.obstacles;
    state.barrels = worldData.barrels;
    state.slowZones = worldData.slowZones;

    state.player = new Player();
    
    spawnAirdropZone();
    updateUI();
}

function gameLoop() {
    if (!state.isRunning || state.isPaused) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    state.frameCount++;
    
    if (state.frameCount % 60 === 0) {
        state.gameTime++;
        state.globalDifficulty += 0.01; 
        document.getElementById('timer-display').innerText = new Date(state.gameTime * 1000).toISOString().substr(14, 5);
    }

    if (state.frameCount % 300 === 0) { 
        if (!state.activeLoot && state.airdropZones.length === 0) {
            spawnAirdropZone();
        }
    }

    if (state.gameTime > 0 && state.gameTime % 300 === 0 && state.frameCount % 60 === 0) {
        spawnTitan();
    }

    updateDirector();

    state.player.update(keys, mouse);
    
    state.camera.x = clamp(state.player.x - SCREEN_W() / 2, 0, WORLD_SIZE - SCREEN_W());
    state.camera.y = clamp(state.player.y - SCREEN_H() / 2, 0, WORLD_SIZE - SCREEN_H());

    drawGrid();

    state.slowZones.forEach(z => z.draw(ctx));

    if (state.airdropZones.length > 0) {
        const zone = state.airdropZones[0];
        zone.update();
        zone.draw(ctx);

        if (zone.isCompleted) {
            playSound('powerUp');
            state.activeLoot = new YellowLootBox(zone.x, zone.y);
            state.airdropZones = []; 
            state.texts.push(new FloatText(state.player.x, state.player.y - 80, 'ГРУЗ ДОСТАВЛЕН!', '#ffd700', 24));
            
            for(let i=0; i<30; i++) {
                 state.particles.push(new Particle(zone.x, zone.y, '#ffd700', 5 + Math.random() * 5));
            }
        }
    }

    if (state.activeLoot) {
        state.activeLoot.draw(ctx);
        if (Math.hypot(state.player.x - state.activeLoot.x, state.player.y - state.activeLoot.y) < state.player.r + 40) {
            openLootBox();
        }
    }

    state.barrels = state.barrels.filter(b => {
        b.draw(ctx);
        if (b.hp <= 0) {
            playSound('explosion');
            state.particles.push(new Particle(b.x, b.y, '#ff3300', 20));
            for(let k=0; k<15; k++) state.particles.push(new Particle(b.x, b.y, '#ffaa00', 6));
            
            const explosionRange = 180;
            const explosionDmg = 150;

            state.enemies.forEach(e => {
                if (!e.isDead && Math.hypot(e.x - b.x, e.y - b.y) < explosionRange) {
                    if(e.takeDamage(explosionDmg, true)) checkZoneKill(e);
                    e.pushX = (e.x - b.x) * 0.2;
                    e.pushY = (e.y - b.y) * 0.2;
                }
            });

            if (Math.hypot(state.player.x - b.x, state.player.y - b.y) < explosionRange) {
                state.player.takeDamage(30);
                state.texts.push(new FloatText(state.player.x, state.player.y - 40, 'ВЗРЫВ!', '#ff0000', 20));
            }
            return false;
        }
        return true;
    });

    state.obstacles = state.obstacles.filter(o => {
        if (o instanceof Mine) {
            o.draw(ctx);
            let triggered = false;
            state.enemies.forEach(e => {
                if (!e.isDead && Math.hypot(e.x - o.x, e.y - o.y) < o.range) {
                    const dmg = 30 + (o.lvl || 1) * 15;
                    if(e.takeDamage(dmg, false)) checkZoneKill(e);
                    triggered = true;
                }
            });
            if (triggered) {
                playSound('explosion');
                for(let k=0; k<10; k++) state.particles.push(new Particle(o.x, o.y, '#f00', 3));
                return false;
            }
            return true;
        } else {
            o.draw(ctx);
            return true;
        }
    });

    for (let i = state.bullets.length - 1; i >= 0; i--) {
        let b = state.bullets[i];
        b.update();
        b.draw(ctx);
        if (b.life <= 0) {
            state.bullets.splice(i, 1);
            continue;
        }
        
        if (b.isPlayer) {
            for (let k = 0; k < state.barrels.length; k++) {
                let barrel = state.barrels[k];
                if (Math.hypot(barrel.x - b.x, barrel.y - b.y) < barrel.radius + b.size) {
                    barrel.hp -= b.dmg;
                    b.life = 0;
                    b.spawnParticles('#ff5500', 3);
                    break;
                }
            }
            if (b.life <= 0) {
                state.bullets.splice(i, 1);
                continue;
            }
        }

        for (let j = state.enemies.length - 1; j >= 0; j--) {
            let e = state.enemies[j];
            if (e.isDead) continue;
            if (Math.hypot(e.x - b.x, e.y - b.y) < e.size + (b.size || 5)) {
                if (!b.hitList.includes(j)) {
                    const killed = e.takeDamage(b.dmg, b.isCrit);
                    if (killed) checkZoneKill(e);

                    if (b.pierce > 0) {
                        b.pierce--;
                        b.hitList.push(j);
                    } else {
                        b.life = 0;
                        break;
                    }
                }
            }
        }
    }

    for (let i = state.enemyBullets.length - 1; i >= 0; i--) {
        let b = state.enemyBullets[i];
        b.update();
        b.draw(ctx);
        if (b.life <= 0) {
            state.enemyBullets.splice(i, 1);
            continue;
        }
        if (Math.hypot(state.player.x - b.x, state.player.y - b.y) < state.player.r + 5) {
            state.player.takeDamage(10);
            playSound('hit');
            state.enemyBullets.splice(i, 1);
        }
    }

    state.enemies = state.enemies.filter(e => {
        e.update();
        e.draw(ctx);
        return !e.isDead;
    });

    if (state.chips) {
        for (let i = state.chips.length - 1; i >= 0; i--) {
            let c = state.chips[i];
            const d = Math.hypot(state.player.x - c.x, state.player.y - c.y);
            
            if (d < state.player.stats.magnet) c.mag = true;
            if (c.mag) {
                c.x += (state.player.x - c.x) * 0.15;
                c.y += (state.player.y - c.y) * 0.15;
            }

            if (d < state.player.r) {
                Meta.addCurrency(c.val);
                state.texts.push(new FloatText(state.player.x, state.player.y - 20, `+$${c.val}`, '#ffd700'));
                playSound('powerUp');
                state.chips.splice(i, 1);
            } else {
                c.draw(ctx);
            }
        }
    }

    if (state.gems.length > 300) state.gems.splice(0, 50);
    for (let i = state.gems.length - 1; i >= 0; i--) {
        let g = state.gems[i];
        const d = Math.hypot(state.player.x - g.x, state.player.y - g.y);
        if (d < state.player.stats.magnet) g.mag = true;
        if (g.mag) {
            g.x += (state.player.x - g.x) * 0.12;
            g.y += (state.player.y - g.y) * 0.12;
        }
        if (d < state.player.r) {
            state.player.gainXp(g.val);
            state.gems.splice(i, 1);
        } else {
            const sx = g.x - state.camera.x;
            const sy = g.y - state.camera.y;
            if (sx > -10 && sx < SCREEN_W() && sy > -10 && sy < SCREEN_H()) {
                ctx.fillStyle = '#0f0';
                ctx.fillRect(sx - 3, sy - 3, 6, 6);
            }
        }
    }

    state.particles = state.particles.filter(p => { p.update(); p.draw(ctx); return p.life > 0; });
    state.texts = state.texts.filter(t => { t.update(); t.draw(ctx); return t.life > 0; });

    state.player.draw(ctx);
    updateIndicators();
    updateUI();

    if (state.isRunning && !state.isPaused) {
        animationId = requestAnimationFrame(gameLoop);
    }
}

function getPowerScore() {
    const totalSkillLevels = Object.values(state.player.skills).reduce((a, b) => a + b, 0);
    return (state.player.lvl * 10) + (totalSkillLevels * 5) + (state.gameTime * 0.5);
}

function updateDirector() {
    const dir = state.director;
    dir.stateTimer++;
    
    let currentPhaseConfig = WAVE_CYCLE[0];
    let timeAccum = 0;
    
    const totalCycleTime = WAVE_CYCLE.reduce((acc, phase) => acc + phase.duration, 0) * 60;
    const currentCycleFrame = state.frameCount % totalCycleTime;
    
    for (let phase of WAVE_CYCLE) {
        const phaseDurationFrames = phase.duration * 60;
        if (currentCycleFrame < timeAccum + phaseDurationFrames) {
            currentPhaseConfig = phase;
            break;
        }
        timeAccum += phaseDurationFrames;
    }
    dir.waveState = currentPhaseConfig.state;

    if (state.frameCount < dir.nextSpawn) return;
    dir.nextSpawn = state.frameCount + dir.spawnRate;

    const powerScore = getPowerScore();
    const baseMaxEnemies = 20 + (powerScore / 50); 
    const maxEnemies = Math.min(250, baseMaxEnemies * currentPhaseConfig.limitMult);

    if (state.enemies.length >= maxEnemies) return;

    const budgetBase = 2 + (powerScore / 30);
    dir.credits += budgetBase * currentPhaseConfig.budgetMult * state.globalDifficulty;

    dir.credits = Math.min(dir.credits, 100 + powerScore / 5);

    spawnWave();
}

function spawnWave() {
    const dir = state.director;
    
    const availableTypes = Object.keys(ENEMY_DATA).filter(type => state.gameTime >= ENEMY_DATA[type].minTime);
    
    if (availableTypes.length === 0) availableTypes.push('basic');

    let packsSpawnedThisFrame = 0;
    const MAX_PACKS_PER_FRAME = 3;
    const spawnedTypes = new Set();

    let attempts = 10;
    
    while (dir.credits > 0 && attempts > 0 && packsSpawnedThisFrame < MAX_PACKS_PER_FRAME) {
        
        let candidates = availableTypes.filter(t => !spawnedTypes.has(t));
        if (candidates.length === 0) candidates = availableTypes;

        const type = candidates[Math.floor(Math.random() * candidates.length)];
        const data = ENEMY_DATA[type];

        if (dir.credits >= data.cost) {
            const packSize = Math.floor(Math.random() * (data.packSize[1] - data.packSize[0] + 1)) + data.packSize[0];
            
            spawnEnemyPack(type, packSize);
            
            dir.credits -= data.cost * packSize;
            packsSpawnedThisFrame++;
            spawnedTypes.add(type);
        } else {
            attempts--;
        }
        
        if (dir.credits < 1) break;
    }
}

function spawnEnemyPack(type, count) {
    let centerX, centerY, safe = false;
    
    for (let k = 0; k < 5; k++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = (Math.max(SCREEN_W(), SCREEN_H()) / 2) + 100 + Math.random() * 200;
        
        centerX = state.player.x + Math.cos(angle) * dist;
        centerY = state.player.y + Math.sin(angle) * dist;
        
        centerX = clamp(centerX, 50, WORLD_SIZE - 50);
        centerY = clamp(centerY, 50, WORLD_SIZE - 50);
        
        if (!checkWall(centerX, centerY, 40)) {
            safe = true;
            break;
        }
    }

    if (!safe) return;

    for (let i = 0; i < count; i++) {
        const offsetX = (Math.random() - 0.5) * 60;
        const offsetY = (Math.random() - 0.5) * 60;
        
        const x = clamp(centerX + offsetX, 50, WORLD_SIZE - 50);
        const y = clamp(centerY + offsetY, 50, WORLD_SIZE - 50);

        if (!checkWall(x, y, 20)) {
            state.enemies.push(new Enemy(type, x, y));
        }
    }
}

function drawGrid() {
    const half = WORLD_SIZE / 2;
    const px = state.player.x;
    const py = state.player.y;
    
    let gridColor = '#111';
    if (px < half && py < half) gridColor = '#001133';
    else if (px >= half && py < half) gridColor = '#1a1a00';
    else if (px < half && py >= half) gridColor = '#1a0d05';
    else gridColor = '#1a0000';

    ctx.fillStyle = gridColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    const ox = state.camera.x % 100;
    const oy = state.camera.y % 100;
    ctx.beginPath();
    for (let x = -ox; x < SCREEN_W(); x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, SCREEN_H()); }
    for (let y = -oy; y < SCREEN_H(); y += 100) { ctx.moveTo(0, y); ctx.lineTo(SCREEN_W(), y); }
    ctx.stroke();
}

function spawnTitan() {
    let x, y, safe = false;
    for (let k = 0; k < 10; k++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 500; 
        x = state.player.x + Math.cos(angle) * dist;
        y = state.player.y + Math.sin(angle) * dist;
        x = clamp(x, 50, WORLD_SIZE - 50);
        y = clamp(y, 50, WORLD_SIZE - 50);
        if (!checkWall(x, y, 60)) {
            safe = true;
            break;
        }
    }
    if (safe) {
        state.enemies.push(new Enemy('titan', x, y));
        state.texts.push(new FloatText(state.player.x, state.player.y - 150, 'ОПАСНОСТЬ: ТИТАН!', '#f00', 36));
        playSound('explosion'); 
    }
}

function spawnAirdropZone() {
    let x, y, safe = false;
    for (let k = 0; k < 10; k++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 300 + Math.random() * 400;
        x = state.player.x + Math.cos(angle) * dist;
        y = state.player.y + Math.sin(angle) * dist;
        
        x = clamp(x, 200, WORLD_SIZE - 200);
        y = clamp(y, 200, WORLD_SIZE - 200);
        
        if (!checkWall(x, y, 150)) { safe = true; break; }
    }
    
    if (safe) {
        state.airdropZones.push(new AirdropZone(x, y));
        state.texts.push(new FloatText(state.player.x, state.player.y - 100, 'ЗОНА СБРОСА!', '#00ffff', 24));
    }
}

function checkZoneKill(enemy) {
    if (state.airdropZones.length > 0) {
        const zone = state.airdropZones[0];
        if (zone.isActivated && !zone.isCompleted && zone.taskType === 'kills') {
            const distPlayer = Math.hypot(state.player.x - zone.x, state.player.y - zone.y);
            if (distPlayer < zone.radius) {
                zone.current++;
                state.texts.push(new FloatText(enemy.x, enemy.y, '+1 KILL', '#ffff00', 16));
            }
        }
    }
}

function openLootBox() {
    playSound('powerUp');
    state.activeLoot = null; 
    
    const rand = Math.random();
    if (rand < 0.4) {
        const healAmt = 25 + Math.floor(Math.random() * 15); 
        state.player.heal(healAmt);
        state.texts.push(new FloatText(state.player.x, state.player.y - 60, `АПТЕЧКА +${healAmt}`, '#0f0', 24));
    } else {
        pauseGameForSkillBox();
    }
}

function pauseGameForSkillBox() {
    if (animationId) cancelAnimationFrame(animationId);
    state.isPaused = true;
    
    const screen = document.getElementById('levelup-screen');
    document.getElementById('sys-msg').innerText = 'РАСШИФРОВКА ДАННЫХ...';
    screen.classList.remove('hidden');
    
    const available = Object.keys(SKILL_DB).filter(k => state.player.getSkillLvl(k) < SKILL_DB[k].max);
    const container = document.getElementById('cards-box');
    container.innerHTML = '';
    
    if (available.length === 0) {
        screen.classList.add('hidden');
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + 100);
        state.player.gainXp(500);
        state.texts.push(new FloatText(state.player.x, state.player.y - 60, 'MAX POWER: AUTO HEAL!', '#ffd700', 20));
        state.isPaused = false;
        gameLoop();
        return;
    }
    
    const key = available[Math.floor(Math.random() * available.length)];
    createCard(key, container, screen);
}

function handleLevelUp() {
    playSound('levelup');
    if (animationId) cancelAnimationFrame(animationId);
    state.isPaused = true;
    
    state.player.xp -= state.player.nextXp;
    state.player.lvl++;
    state.player.nextXp = Math.floor(50 + state.player.lvl * 25 + Math.pow(state.player.lvl, 1.2) * 5);
    
    const available = Object.keys(SKILL_DB).filter(k => state.player.getSkillLvl(k) < SKILL_DB[k].max);
    
    if (available.length === 0) {
        state.player.hp = state.player.maxHp;
        state.texts.push(new FloatText(state.player.x, state.player.y - 80, 'LIMIT BREAK: HP RESTORED', '#ffd700', 24));
        state.isPaused = false;
        gameLoop();
        return;
    }
    
    document.getElementById('levelup-screen').classList.remove('hidden');
    document.getElementById('sys-msg').innerText = 'Выберите улучшение';
    const container = document.getElementById('cards-box');
    container.innerHTML = '';
    
    let pool = available;
    pool.sort(() => Math.random() - 0.5);
    const choices = pool.slice(0, 3);
    
    choices.forEach(key => createCard(key, container, document.getElementById('levelup-screen')));
}

function createCard(key, container, screen) {
    const skill = SKILL_DB[key];
    const nextLvl = state.player.getSkillLvl(key) + 1;
    const isEvo = skill.evolveAt && nextLvl === skill.evolveAt;
    
    const c = document.createElement('div');
    c.className = 'upgrade-card ' + (isEvo ? 'card-evo' : (nextLvl === 1 ? 'card-new' : 'card-upgrade'));
    c.innerHTML = `<div class="card-type">${skill.type}</div>
                   <div class="card-title">${skill.name} <span style="color:#ffd700">Lvl ${nextLvl}</span></div>
                   <div class="card-desc">${skill.desc}</div>
                   ${isEvo ? `<div style="color:#ff0055;font-size:11px;margin-top:6px;font-weight:bold">⚡ ЭВО: ${skill.evoDesc}</div>` : ''}`;
    
    c.onclick = () => {
        state.player.addSkill(key);
        state.isPaused = false;
        screen.classList.add('hidden');
        gameLoop();
    };
    container.appendChild(c);
}

function toggleAbilities() {
    if (!state.isRunning) return;
    const overlay = document.getElementById('abilities-overlay');
    if (overlay.classList.contains('hidden')) {
        renderAbilities();
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

function togglePause() {
    if (!state.isRunning) return;
    if (!document.getElementById('levelup-screen').classList.contains('hidden')) return;
    
    const abilitiesOverlay = document.getElementById('abilities-overlay');
    if (!abilitiesOverlay.classList.contains('hidden')) {
        abilitiesOverlay.classList.add('hidden');
        return;
    }
    
    state.isPaused = !state.isPaused;
    const menu = document.getElementById('pause-menu');
    
    if (state.isPaused) {
        menu.classList.remove('hidden');
        if (animationId) cancelAnimationFrame(animationId);
        renderStats();
    } else {
        menu.classList.add('hidden');
        if (animationId) cancelAnimationFrame(animationId);
        gameLoop();
    }
}

function gameOver() {
    state.isRunning = false;
    if (animationId) cancelAnimationFrame(animationId);
    document.getElementById('overlay-screen').classList.remove('hidden');
    document.getElementById('abilities-overlay').classList.add('hidden');
    
    const phrases = ['СИГНАЛ ПОТЕРЯН', 'КРИТИЧЕСКИЙ СБОЙ', 'СИСТЕМА ОФФЛАЙН'];
    document.getElementById('death-report').innerText = `${phrases[Math.floor(Math.random() * phrases.length)]}
    Выживание: ${new Date(state.gameTime * 1000).toISOString().substr(14, 5)}
    Уровень: ${state.player.lvl}
    Заработано чипов: ${Math.floor(state.score / 10) }`;
    
    document.querySelector('#overlay-screen h1').innerText = 'ИГРА ОКОНЧЕНА';
    document.getElementById('start-btn').innerText = 'ПЕРЕЗАГРУЗКА';
    document.getElementById('open-shop-btn').classList.remove('hidden');
}

function openShop() {
    const shopScreen = document.getElementById('shop-screen');
    const container = document.getElementById('shop-container');
    
    shopScreen.classList.remove('hidden');
    document.getElementById('overlay-screen').classList.add('hidden');
    Meta.updateUI();

    container.innerHTML = '';
    Object.values(UPGRADES).forEach(upg => {
        const lvl = Meta.data.upgrades[upg.id];
        const cost = Meta.getUpgradeCost(upg.id);
        
        const div = document.createElement('div');
        div.className = 'shop-card';
        div.innerHTML = `
            <h3>${upg.name} (Lvl ${lvl})</h3>
            <div class="desc">${upg.desc}</div>
            <div class="cost" style="color:${cost === 'MAX' ? '#f00' : '#ffd700'}">
                Цена: ${cost === 'MAX' ? 'MAX' : cost + ' $'}
            </div>
            ${cost !== 'MAX' ? `<button class="shop-btn" data-id="${upg.id}">КУПИТЬ</button>` : ''}
        `;
        container.appendChild(div);
    });

    container.querySelectorAll('.shop-btn').forEach(btn => {
        btn.onclick = () => {
            const id = btn.getAttribute('data-id');
            if (Meta.buyUpgrade(id)) {
                openShop();
                playSound('powerUp');
            } else {
            }
        };
    });
}

document.getElementById('open-shop-btn').onclick = openShop;
document.getElementById('close-shop-btn').onclick = () => {
    document.getElementById('shop-screen').classList.add('hidden');
    document.getElementById('overlay-screen').classList.remove('hidden');
};

window.addEventListener('keydown', e => {
    if (e.code === 'Tab') {
        e.preventDefault();
        toggleAbilities();
        return;
    }
    
    if (e.code === 'Escape') {
        const overlay = document.getElementById('abilities-overlay');
        if (!overlay.classList.contains('hidden')) {
            toggleAbilities();
        } else {
            togglePause();
        }
        return;
    }

    if (e.code === 'KeyW') keys.w = true;
    if (e.code === 'KeyS') keys.s = true;
    if (e.code === 'KeyA') keys.a = true;
    if (e.code === 'KeyD') keys.d = true;

    if (state.isPaused || !state.isRunning) return;

    if (e.code === 'Space') state.player?.useDash();
    if (e.code === 'KeyE') state.player?.useEmp();
});

window.addEventListener('keyup', e => {
    if (e.code === 'KeyW') keys.w = false;
    if (e.code === 'KeyS') keys.s = false;
    if (e.code === 'KeyA') keys.a = false;
    if (e.code === 'KeyD') keys.d = false;
});

window.addEventListener('blur', () => {
    keys.w = false;
    keys.a = false;
    keys.s = false;
    keys.d = false;
    mouse.active = false;
});

window.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
});

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

window.addEventListener('level-up', handleLevelUp);
window.addEventListener('game-over', gameOver);

document.getElementById('start-btn').onclick = () => {
    document.getElementById('overlay-screen').classList.add('hidden');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (animationId) cancelAnimationFrame(animationId);
    init();
    state.isRunning = true;
    gameLoop();
};

document.getElementById('btn-pause').onclick = togglePause;
document.getElementById('resume-btn').onclick = togglePause;

Meta.load();