import { state, resetGameState } from './GameState.js';
import { WORLD_SIZE, SCREEN_W, SCREEN_H, SKILL_DB } from './constants.js';
import { clamp, checkWall } from './utils.js';
import { updateUI, updateIndicators, renderStats } from './ui.js';
import { generateWorld } from './MapGenerator.js';
import { Player } from './entities/Player.js';
import { Enemy } from './entities/Enemy.js';
import { Obstacle, LootCrate, SkillCrate, Mine } from './entities/Items.js';
import { FloatText, Particle } from './entities/Particle.js';
import { loadSounds, playSound } from './sounds.js';
import { Meta, UPGRADES } from './MetaGame.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let animationId = null;
const keys = { w: false, a: false, s: false, d: false };
const mouse = { x: 0, y: 0, active: false };

function init() {
    loadSounds();
    Meta.load();

    resetGameState();
    
    state.obstacles = generateWorld();

    state.player = new Player();
    
    spawnCrate();
    spawnCrate();
    spawnRandomSkillCrateOnMap();
    
    updateUI();
}

function gameLoop() {
    if (!state.isRunning || state.isPaused) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    state.frameCount++;
    if (state.frameCount % 60 === 0) {
        state.gameTime++;
        state.globalDifficulty += 0.02;
        document.getElementById('timer-display').innerText = new Date(state.gameTime * 1000).toISOString().substr(14, 5);
        if (state.gameTime % 20 === 0) spawnCrate();
        if (state.gameTime % 60 === 0) spawnRandomSkillCrateOnMap();
    }

    state.player.update(keys, mouse);
    
    state.camera.x = clamp(state.player.x - SCREEN_W() / 2, 0, WORLD_SIZE - SCREEN_W());
    state.camera.y = clamp(state.player.y - SCREEN_H() / 2, 0, WORLD_SIZE - SCREEN_H());

    drawGrid();

    spawnEnemies();

    for (let i = state.crates.length - 1; i >= 0; i--) {
        let c = state.crates[i];
        c.draw(ctx);
        if (Math.hypot(state.player.x - c.x, state.player.y - c.y) < state.player.r + 30) {
            state.player.hp = Math.min(state.player.maxHp, state.player.hp + 50);
            state.player.gainXp(150);
            playSound('powerUp');
            state.texts.push(new FloatText(state.player.x, state.player.y, 'ЛЕЧЕНИЕ!', '#0f0'));
            state.particles.push(new Particle(c.x, c.y, '#0f0', 14));
            state.crates.splice(i, 1);
        }
    }

    for (let i = state.skillCrates.length - 1; i >= 0; i--) {
        let s = state.skillCrates[i];
        s.draw(ctx);
        if (Math.hypot(state.player.x - s.x, state.player.y - s.y) < state.player.r + 30) {
            state.skillCrates.splice(i, 1);
            playSound('powerUp');
            pauseGameForSkillBox();
            return; 
        }
    }

    state.obstacles = state.obstacles.filter(o => {
        if (o instanceof Mine) {
            o.draw(ctx);
            let triggered = false;
            state.enemies.forEach(e => {
                if (!e.isDead && Math.hypot(e.x - o.x, e.y - o.y) < o.range) {
                    const dmg = 30 + (o.lvl || 1) * 15;
                    e.takeDamage(dmg, false);
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
        for (let j = state.enemies.length - 1; j >= 0; j--) {
            let e = state.enemies[j];
            if (e.isDead) continue;
            if (Math.hypot(e.x - b.x, e.y - b.y) < e.size + (b.size || 5)) {
                if (!b.hitList.includes(j)) {
                    e.takeDamage(b.dmg, b.isCrit);
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

function spawnEnemies() {
    const limit = 20 + Math.floor(state.gameTime / 4);
    if (state.enemies.length >= limit) return;
    if (Math.random() < 0.04) {
        let x, y, safe = false;
        for (let k = 0; k < 10; k++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.max(SCREEN_W(), SCREEN_H()) / 2 + 120 + Math.random() * 300;
            x = state.player.x + Math.cos(angle) * dist;
            y = state.player.y + Math.sin(angle) * dist;
            x = clamp(x, 50, WORLD_SIZE - 50);
            y = clamp(y, 50, WORLD_SIZE - 50);
            if (Math.hypot(x - state.player.x, y - state.player.y) > 400 && !checkWall(x, y, 30)) {
                safe = true;
                break;
            }
        }
        if (safe) {
            const r = Math.random();
            let type = 'basic';
            if (state.gameTime > 20 && r > 0.85) type = 'runner';
            if (state.gameTime > 40 && r > 0.85) type = 'shooter';
            if (state.gameTime > 60 && r > 0.9) type = 'kamikaze';
            if (state.gameTime > 90 && r > 0.9) type = 'tank';
            if (state.gameTime > 120 && r > 0.92) type = 'dasher';
            if (state.gameTime > 150 && r > 0.95) type = 'elite';
            if (state.gameTime > 200 && r > 0.98 && state.enemies.filter(e => e.type === 'titan').length === 0) type = 'titan';
            
            state.enemies.push(new Enemy(type, x, y));
        }
    }
}

function spawnCrate() {
    let x, y, safe = false;
    for (let k = 0; k < 10; k++) {
        x = Math.max(80, Math.random() * (WORLD_SIZE - 160));
        y = Math.max(80, Math.random() * (WORLD_SIZE - 160));
        if (!checkWall(x, y, 20)) { safe = true; break; }
    }
    if (safe) {
        state.crates.push(new LootCrate(x, y));
        state.texts.push(new FloatText(state.player.x, state.player.y - 50, 'ПРИПАСЫ!', '#0f0'));
    }
}

function spawnRandomSkillCrateOnMap() {
    let x, y, safe = false;
    for (let k = 0; k < 10; k++) {
        x = Math.max(100, Math.random() * (WORLD_SIZE - 200));
        y = Math.max(100, Math.random() * (WORLD_SIZE - 200));
        if (!checkWall(x, y, 20)) { safe = true; break; }
    }
    if (safe) state.skillCrates.push(new SkillCrate(x, y));
}

function spawnSkillCrate(x, y) {
    state.skillCrates.push(new SkillCrate(x, y));
    state.texts.push(new FloatText(x, y - 50, 'МОДУЛЬ!', '#00ffff'));
}

function pauseGameForSkillBox() {
    if (animationId) cancelAnimationFrame(animationId);
    state.isPaused = true;
    
    const screen = document.getElementById('levelup-screen');
    document.getElementById('sys-msg').innerText = 'Случайная разблокировка...';
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

function togglePause() {
    if (!state.isRunning) return;
    if (!document.getElementById('levelup-screen').classList.contains('hidden')) return;
    
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
    if (e.code === 'KeyW') keys.w = true;
    if (e.code === 'KeyS') keys.s = true;
    if (e.code === 'KeyA') keys.a = true;
    if (e.code === 'KeyD') keys.d = true;
    if (e.code === 'Space') state.player?.useDash();
    if (e.code === 'KeyE') state.player?.useEmp();
    if (e.code === 'Escape') togglePause();
});

window.addEventListener('keyup', e => {
    if (e.code === 'KeyW') keys.w = false;
    if (e.code === 'KeyS') keys.s = false;
    if (e.code === 'KeyA') keys.a = false;
    if (e.code === 'KeyD') keys.d = false;
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