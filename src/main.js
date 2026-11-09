import { skillPreview } from './systems/SkillPreview.js';
import { updateHangar, openFleet, openWorkshop } from './ui/Hangar.js';
import { openArchive } from './ui/Archive.js';
import { bindTouchStick } from './ui/TouchStick.js';
import { makeModuleIcon } from './systems/ModuleIcons.js';
import { getXpThresholdForLevel, state, resetGameState, captureXpTelemetrySnapshot, formatXpDiagnosticReport, recordFallbackChipReward } from './GameState.js';
import { WORLD_SIZE, SCREEN_W, SCREEN_H, SKILL_DB, BALANCE, ENEMY_LABELS, ACHIEVEMENTS_DB } from './constants.js';
import { clamp, buildSpatialGrid } from './utils.js';
import { updateUI, updateIndicators, renderStats, renderAbilities, renderProfile, renderAudioSettings, initAudioUI } from './ui.js';
import { generateWorld } from './MapGenerator.js';
import { Player, getSkillSlotCategory, FALLBACK_SKILL_REWARD_CHIPS } from './entities/Player.js';
import { YellowLootBox, minePool, chipPool, gemPool } from './entities/Items.js';
import { particlePool, floatTextPool } from './entities/Particle.js';
import { bulletPool } from './entities/Bullet.js';
import { enemyPool } from './entities/Enemy.js';
import { loadSounds, playSound } from './sounds.js';
import { Meta } from './MetaGame.js';
import * as SpawnSystem from './systems/SpawnSystem.js';
import * as CollisionSystem from './systems/CollisionSystem.js';
import * as RenderSystem from './systems/RenderSystem.js';
import { PilotManager } from './systems/PilotClasses.js';
import { DirectorEvents } from './systems/DirectorEvents.js';
import { DamageTextSystem } from './systems/DamageTextSystem.js';
import { MusicEngine } from './audio/MusicEngine.js';
import { RadarSystem } from './systems/RadarSystem.js';
import { AchievementSystem } from './systems/AchievementSystem.js';
import { NotificationSystem } from './systems/NotificationSystem.js';

let banishMode = false;
let manualPauseActive = false;
let activeChoiceType = null;
let currentChoiceResolved = false;
let pendingSkillBoxes = 0;
let pendingDirectLevelUps = 0;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let animationId = null;
const keys = { w: false, a: false, s: false, d: false };
const mouse = { x: 0, y: 0, active: false };
const clearStick = bindTouchStick(document.getElementById('touch-stick'), keys, () => state.isRunning && !state.isPaused);

export function stopGameLoop() {
    clearStick();
    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}

export function init() {
    stopGameLoop();
    for (const key in keys) keys[key] = false;
    mouse.active = false;
    loadSounds();
    Meta.load();

    banishMode = false;
    manualPauseActive = false;
    activeChoiceType = null;
    currentChoiceResolved = false;
    pendingSkillBoxes = 0;
    pendingDirectLevelUps = 0;

    document.getElementById('levelup-screen')?.classList.add('hidden');
    document.getElementById('pause-menu')?.classList.add('hidden');
    document.getElementById('abilities-overlay')?.classList.add('hidden');

    state.bullets.forEach(b => bulletPool.release(b));
    state.enemyBullets.forEach(b => bulletPool.release(b));
    state.particles.forEach(p => particlePool.release(p));
    state.texts.forEach(t => floatTextPool.release(t));
    state.enemies.forEach(e => enemyPool.release(e));
    state.mines.forEach(m => minePool.release(m));
    state.chips.forEach(c => chipPool.release(c));
    state.gems.forEach(g => gemPool.release(g));

    resetGameState();
    DamageTextSystem.reset();
    AchievementSystem.reset();
    NotificationSystem.reset();

    const worldData = generateWorld();
    state.obstacles = worldData.obstacles;
    state.obstacleGrid = buildSpatialGrid(state.obstacles);
    state.barrels = worldData.barrels;
    state.slowZones = worldData.slowZones;

    state.player = new Player();
    const pilotDef = PilotManager.getPilot(state.player.pilotId);
    if (pilotDef.starterSkill) Meta.recordSkillDiscovered(pilotDef.starterSkill);
    for (const [slotId, icon] of [['dash-symbol', 'ability:dash'], ['skill-emp-icon', 'ability:' + pilotDef.id]]) {
        const slot = document.getElementById(slotId);
        slot.innerHTML = '';
        slot.appendChild(makeModuleIcon(icon, 29));
    }
    const ultButton = document.getElementById('skill-emp');
    ultButton.title = `${pilotDef.ultName} [E] · ${pilotDef.ultDesc}`;
    ultButton.setAttribute?.('aria-label', `${pilotDef.ultName} (E)`);
    if (state.xpTelemetry) {
        state.xpTelemetry.pilotId = pilotDef.id;
        state.xpTelemetry.pilotName = pilotDef.name;
        state.xpTelemetry.starterSkill = pilotDef.starterSkill || 'multi';
        state.xpTelemetry.metaExpBonus = Meta.getUpgradeValue('exp') || 0;
    }
    const diagBox = document.getElementById('xp-diagnostic-box');
    if (diagBox) {
        diagBox.textContent = '';
        diagBox.classList.add('hidden');
    }

    state.camera.x = clamp(state.player.x - SCREEN_W() / 2, 0, WORLD_SIZE - SCREEN_W());
    state.camera.y = clamp(state.player.y - SCREEN_H() / 2, 0, WORLD_SIZE - SCREEN_H());

    SpawnSystem.spawnAirdropZone();
    lastFrameTime = performance.now();
    accumulator = 0;
    updateLevelUpSlotsInfo();
    updateUI();

    MusicEngine.start();
    MusicEngine.setIntensity('calm');
}

const PROGRESSION_CHECKPOINTS = new Set([180, 300, 450, 720, 900]);
const TICK_MS = 1000 / 60;
let lastFrameTime = performance.now();
let accumulator = 0;
let loopActive = false;

export function updatePhysicsTick() {
    state.frameCount++;

    if (state.frameCount % 60 === 0) {
        state.gameTime++;
        SpawnSystem.updateGlobalDifficulty();
        const timerEl = document.getElementById('timer-display');
        if (timerEl) {
            timerEl.innerText = new Date(state.gameTime * 1000).toISOString().substr(14, 5);
        }
    }

    if (state.frameCount >= state.nextCargoFrame && !state.activeLoot && !state.airdropZones.length) {
        SpawnSystem.spawnAirdropZone();
        state.nextCargoFrame = state.frameCount + 60;
    }

    if (state.frameCount >= state.nextTitanFrame && state.frameCount % 60 === 0) {
        if (SpawnSystem.spawnTitan()) state.nextTitanFrame += 300 * 60;
    }

    SpawnSystem.updateDirector();
    DirectorEvents.update();
    AchievementSystem.update(TICK_MS / 1000);

    if (state.frameCount % 30 === 0) {
        const hasTitan = state.enemies.some(e => e.type === 'titan' && !e.isDead);
        if (hasTitan) {
            MusicEngine.setIntensity('boss');
        } else if (state.director.waveState === 'peak' || state.director.waveState === 'build') {
            MusicEngine.setIntensity('battle');
        } else {
            MusicEngine.setIntensity('calm');
        }
    }

    if (state.player) {
        state.player.update(keys, mouse);
    }

    const sw = SCREEN_W();
    const sh = SCREEN_H();
    const targetCamX = clamp(state.player.x - sw / 2, 0, Math.max(0, WORLD_SIZE - sw));
    const targetCamY = clamp(state.player.y - sh / 2, 0, Math.max(0, WORLD_SIZE - sh));

    if (Number.isFinite(targetCamX)) {
        state.camera.x += (targetCamX - (Number.isFinite(state.camera.x) ? state.camera.x : targetCamX)) * 0.1;
    }
    if (Number.isFinite(targetCamY)) {
        state.camera.y += (targetCamY - (Number.isFinite(state.camera.y) ? state.camera.y : targetCamY)) * 0.1;
    }
    if (!Number.isFinite(state.camera.x)) state.camera.x = 0;
    if (!Number.isFinite(state.camera.y)) state.camera.y = 0;

    if (state.airdropZones.length > 0) {
        const zone = state.airdropZones[0];
        zone.update();

        if (zone.isCompleted) {
            playSound('powerUp');
            state.activeLoot = new YellowLootBox(zone.x, zone.y);
            state.airdropZones = [];
            state.texts.push(floatTextPool.acquire(state.player.x, state.player.y - 80, 'ГРУЗ ДОСТАВЛЕН!', '#ffd700', 24));

            for (let i = 0; i < 30; i++) {
                state.particles.push(particlePool.acquire(zone.x, zone.y, '#ffd700', 5 + Math.random() * 5));
            }
        }
    }

    if (state.activeLoot && state.player) {
        if (Math.hypot(state.player.x - state.activeLoot.x, state.player.y - state.activeLoot.y) < state.player.r + 40) {
            openLootBox();
        }
    }

    CollisionSystem.rebuildSpatialGrids();
    CollisionSystem.updateBarrels();
    CollisionSystem.updateMines();
    CollisionSystem.updateBullets();
    if (state.player.hp <= 0) return;
    CollisionSystem.updatePickups();
    if (state.player.hp <= 0) return;

    for (let i = state.enemies.length - 1; i >= 0; i--) {
        const e = state.enemies[i];
        e.update();
        if (state.player.hp <= 0) return;
        if (e.isDead) {
            enemyPool.release(e);
            const last = state.enemies.pop();
            if (i < state.enemies.length) state.enemies[i] = last;
        }
    }

    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.update();
        if (p.life <= 0) {
            particlePool.release(p);
            const last = state.particles.pop();
            if (i < state.particles.length) state.particles[i] = last;
        }
    }

    for (let i = state.texts.length - 1; i >= 0; i--) {
        const t = state.texts[i];
        t.update();
        if (t.life <= 0) {
            floatTextPool.release(t);
            const last = state.texts.pop();
            if (i < state.texts.length) state.texts[i] = last;
        }
    }

    DamageTextSystem.update();
    if (state.frameCount % 60 === 0 && PROGRESSION_CHECKPOINTS.has(state.gameTime)) {
        const snapshot = captureXpTelemetrySnapshot();
        state.xpTelemetry.checkpoints.push(snapshot);
        if (state.gameTime === 300) state.xpTelemetry.snapshot5m = snapshot;
    }
}

function renderFrame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const shake = RenderSystem.beginShakeFrame();

    RenderSystem.drawGrid(ctx);

    for (let i = 0; i < state.slowZones.length; i++) {
        state.slowZones[i].draw(ctx);
    }

    if (state.airdropZones.length > 0) {
        state.airdropZones[0].draw(ctx);
    }

    if (state.activeLoot) {
        state.activeLoot.draw(ctx);
    }

    CollisionSystem.drawBarrels(ctx);

    for (let i = 0; i < state.obstacles.length; i++) {
        state.obstacles[i].draw(ctx);
    }

    CollisionSystem.drawMines(ctx);
    CollisionSystem.drawPlayerBullets(ctx);
    RenderSystem.drawDirectorEvents(ctx);

    for (let i = 0; i < state.enemies.length; i++) {
        state.enemies[i].draw(ctx);
    }

    CollisionSystem.drawPickups(ctx);

    for (let i = 0; i < state.particles.length; i++) {
        state.particles[i].draw(ctx);
    }

    if (state.player) {
        state.player.draw(ctx);
    }

    for (let i = 0; i < state.texts.length; i++) {
        state.texts[i].draw(ctx);
    }

    for (const enemy of state.enemies) enemy.drawTelegraph(ctx);
    CollisionSystem.drawEnemyBullets(ctx);
    DamageTextSystem.draw(ctx);

    RenderSystem.endShakeFrame(shake);

    RadarSystem.draw(ctx);

    updateIndicators();
    updateUI();
}

function isElementVisible(id) {
    const el = document.getElementById(id);
    return !!(el && !el.classList.contains('hidden'));
}

function isAnyPauseReasonActive() {
    if (manualPauseActive) return true;
    if (activeChoiceType !== null) return true;
    if (isElementVisible('pause-menu') || isElementVisible('abilities-overlay')) return true;
    if (isElementVisible('levelup-screen')) return true;
    if (isElementVisible('audio-settings-screen') && audioPrevScreen === 'pause-menu') return true;
    return false;
}

export function syncPauseAndLoop() {
    if (!state.isRunning) {
        stopGameLoop();
        return;
    }

    const shouldPause = isAnyPauseReasonActive();
    state.isPaused = shouldPause;

    if (shouldPause) {
        stopGameLoop();
    } else if (animationId === null && !loopActive) {
        lastFrameTime = performance.now();
        animationId = requestAnimationFrame(gameLoop);
    }
}

export function getLoopDebugState() {
    return {
        animationId,
        loopActive,
        isRunning: state.isRunning,
        isPaused: state.isPaused,
        manualPauseActive,
        activeChoiceType,
        pendingSkillBoxes
    };
}

function gameLoop(now = performance.now()) {
    animationId = null;

    if (!state.isRunning || state.isPaused) return;

    if (loopActive) return;
    loopActive = true;

    try {

        let dt = now - lastFrameTime;
        if (dt > 250) dt = 250;
        lastFrameTime = now;
        accumulator += dt;

        let maxTicks = 5;
        while (accumulator >= TICK_MS && maxTicks > 0) {
            if (!state.isRunning || state.isPaused) break;
            if (state.hitStop > 0) state.hitStop--;
            else updatePhysicsTick();
            accumulator -= TICK_MS;
            maxTicks--;
            if (!state.isRunning || state.isPaused) break;
        }

        if (state.isRunning && !state.isPaused) {
            renderFrame();
        }

        if (state.isRunning && !state.isPaused && animationId === null) {
            animationId = requestAnimationFrame(gameLoop);
        }
    } finally {
        loopActive = false;
    }
}

export function openLootBox() {
    playSound('powerUp');
    state.activeLoot = null;
    state.nextCargoFrame = state.frameCount + BALANCE.cargoCooldownTicks;

    const rand = Math.random();
    if (rand < 0.4) {
        const healAmt = 25 + Math.floor(Math.random() * 15);
        state.player.heal(healAmt);
        state.texts.push(floatTextPool.acquire(state.player.x, state.player.y - 60, `АПТЕЧКА +${healAmt}`, '#0f0', 24));
    } else {
        pauseGameForSkillBox();
    }
}

export function getAvailableSkills() {
    if (!state.player) return [];
    return state.player.getAvailableSkills();
}

export function getEvoCandidates() {
    if (!state.player) return [];
    return state.player.getEvoCandidates();
}

function getCardWeight(key) {
    const cfg = BALANCE.cardWeighting;
    let weight = 1;

    if (state.player.getSkillLvl(key) > 0) {
        weight += cfg.ownedBonus;
    }

    const def = SKILL_DB[key];
    const level = state.player.getSkillLvl(key);
    if (level > 0 && def.evolveTo && state.player.getSkillLvl(def.require) > 0) {
        weight += cfg.recipeProgressBonus * Math.max(0, level - 1);
    }

    if (def.type === 'passive' && level === 0) {
        let bestWeaponLevel = 0;
        for (const [id, ownedLvl] of Object.entries(state.player.skills)) {
            if (SKILL_DB[id]?.require === key) bestWeaponLevel = Math.max(bestWeaponLevel, ownedLvl);
        }
        weight += cfg.evoRequireBonus * bestWeaponLevel;
    }

    return weight;
}

function weightedSample(keys, count) {
    const pool = keys.map(key => ({ key, weight: getCardWeight(key) }));
    const picked = [];
    for (let i = 0; i < count && pool.length > 0; i++) {
        const totalWeight = pool.reduce((sum, p) => sum + p.weight, 0);
        let roll = Math.random() * totalWeight;
        let idx = 0;
        for (; idx < pool.length - 1; idx++) {
            roll -= pool[idx].weight;
            if (roll <= 0) break;
        }
        picked.push(pool[idx].key);
        pool.splice(idx, 1);
    }
    return picked;
}

function updateLevelUpSlotsInfo() {
    const el = document.getElementById('levelup-slots-info');
    if (!el || !state.player) return;
    const slots = state.player.getSlotCounts();
    el.innerText = `Оружие ${slots.weapons}/${slots.maxWeapons} • Пассивки ${slots.passives}/${slots.maxPassives}`;
    const hud = document.getElementById('hud-slots');
    if (hud) hud.textContent = el.innerText;
}

function grantFallbackChipReward(label = 'ЛИМИТ СБОРКИ', source = 'levelup') {
    if (!state.player) return;
    recordFallbackChipReward(source, label);
    Meta.addCurrency(FALLBACK_SKILL_REWARD_CHIPS);
    state.sessionChips += FALLBACK_SKILL_REWARD_CHIPS;
    state.texts.push(
        floatTextPool.acquire(
            state.player.x,
            state.player.y - 70,
            `${label}: +${FALLBACK_SKILL_REWARD_CHIPS} ЧИПОВ`,
            '#ffd700',
            22
        )
    );
    updateUI();
}

export function pauseGameForSkillBox() {
    if (!state.player) return;
    pendingSkillBoxes++;
    if (activeChoiceType === null) {
        processNextPendingChoice();
    }
}

export function handleLevelUp() {
    if (!state.player) return;
    if (state.player.xp < state.player.nextXp) {
        pendingDirectLevelUps++;
    }
    if (activeChoiceType === null) {
        processNextPendingChoice();
    }
}

function processNextPendingChoice() {
    const screen = document.getElementById('levelup-screen');
    const container = document.getElementById('cards-box');
    const controls = document.getElementById('levelup-controls');

    activeChoiceType = null;
    currentChoiceResolved = false;
    banishMode = false;

    if (!state.player) {
        screen?.classList.add('hidden');
        syncPauseAndLoop();
        return;
    }

    while (pendingSkillBoxes > 0) {
        pendingSkillBoxes--;
        const available = getAvailableSkills();
        if (available.length === 0) {
            grantFallbackChipReward('ГРУЗ АКАДЕМИИ', 'skillbox');
            continue;
        }

        activeChoiceType = 'skillbox';
        currentChoiceResolved = false;
        stopGameLoop();
        state.isPaused = true;

        document.getElementById('sys-msg').innerText = 'ГРУЗ АКАДЕМИИ...';
        controls.style.display = 'none';
        updateLevelUpSlotsInfo();
        screen.classList.remove('hidden');
        container.innerHTML = '';

        const key = weightedSample(available, 1)[0];
        createCard(key, container, screen, false);
        syncPauseAndLoop();
        return;
    }

    while (pendingDirectLevelUps > 0 || state.player.xp >= state.player.nextXp) {
        if (state.player.xp >= state.player.nextXp) {
            state.player.xp -= state.player.nextXp;
        } else {
            pendingDirectLevelUps--;
        }
        playSound('levelup');
        state.player.leveling = true;
        state.player.lvl++;
        state.player.nextXp = getXpThresholdForLevel(state.player.lvl);

        if (state.xpTelemetry?.lastPendingTitanEntry) {
            const tp = state.xpTelemetry.lastPendingTitanEntry;
            tp.lvlAfter = state.player.lvl;
            tp.xpAfter = state.player.xp;
            tp.nextXpAfter = state.player.nextXp;
        }

        const evos = getEvoCandidates();
        if (evos.length > 0) {
            activeChoiceType = 'evo';
            currentChoiceResolved = false;
            stopGameLoop();
            state.isPaused = true;

            controls.style.display = 'none';
            updateLevelUpSlotsInfo();
            screen.classList.remove('hidden');
            document.getElementById('sys-msg').innerText = 'ДОСТУПНА СИНЕРГИЯ!';
            container.innerHTML = '';

            evos.forEach(evoKey => createCard(evoKey, container, screen, false));
            syncPauseAndLoop();
            return;
        }

        const available = getAvailableSkills();
        if (available.length === 0) {
            grantFallbackChipReward('ЛИМИТ СБОРКИ', 'levelup');
            continue;
        }

        activeChoiceType = 'levelup';
        currentChoiceResolved = false;
        stopGameLoop();
        state.isPaused = true;
        renderUpgradeChoices();
        syncPauseAndLoop();
        return;
    }

    if (state.xpTelemetry?.lastPendingTitanEntry) {
        const tp = state.xpTelemetry.lastPendingTitanEntry;
        tp.lvlAfter = state.player.lvl;
        tp.xpAfter = state.player.xp;
        tp.nextXpAfter = state.player.nextXp;
        tp.pendingResolution = false;
        state.xpTelemetry.lastPendingTitanEntry = null;
    }

    state.player.leveling = false;
    controls.style.display = 'none';
    screen.classList.add('hidden');
    updateUI();
    syncPauseAndLoop();
}

export function renderUpgradeChoices() {
    const screen = document.getElementById('levelup-screen');
    const container = document.getElementById('cards-box');
    const controls = document.getElementById('levelup-controls');

    banishMode = false;
    updateLevelUpSlotsInfo();

    const available = getAvailableSkills();

    if (available.length === 0) {
        if (!currentChoiceResolved) {
            currentChoiceResolved = true;
            grantFallbackChipReward('ЛИМИТ СБОРКИ', activeChoiceType || 'levelup');
        }
        processNextPendingChoice();
        return;
    }

    screen.classList.remove('hidden');
    document.getElementById('sys-msg').innerText = 'Выберите улучшение';
    container.innerHTML = '';

    const choices = weightedSample(available, BALANCE.cardWeighting.cardsShown);

    choices.forEach(key => createCard(key, container, screen, true));

    controls.style.display = 'flex';
    updateLevelUpControls();
}

function updateLevelUpControls() {
    document.getElementById('reroll-count').innerText = state.player.rerollCharges;
    document.getElementById('reroll-btn').disabled = state.player.rerollCharges <= 0;
    document.getElementById('banish-btn').classList.toggle('active', banishMode);
    document.getElementById('cards-box').classList.toggle('banish-mode', banishMode);
}

function createCard(key, container, screen, allowBanish = false) {
    const skill = SKILL_DB[key];
    const nextLvl = state.player.getSkillLvl(key) + 1;
    const isEvo = skill.type === 'evo';

    const c = document.createElement('button');
    c.type = 'button';
    c.dataset.skill = key;
    c.className = 'upgrade-card ' + (isEvo ? 'card-evo' : (nextLvl === 1 ? 'card-new' : 'card-upgrade'));

    const slots = state.player.getSlotCounts();
    const weapon = getSkillSlotCategory(key) === 'weapon';
    const used = weapon ? slots.weapon : slots.passive;
    const category = weapon ? 'Оружие' : 'Пассивка';
    const slotText = isEvo ? 'Эволюция' : nextLvl === 1 ? category + ' · слот ' + (used + 1) + '/4' : category + ' · улучшение';
    const delta = skillPreview(state.player, key);
    const recipe = skill.require ? SKILL_DB[skill.require] : null;
    const ready = recipe && state.player.getSkillLvl(skill.require) > 0;
    const recipeText = recipe ? `<div class="recipe-note">${SKILL_DB[skill.evolveTo].name} · ${recipe.name}${ready ? ' ✓' : ' ур. 1'}</div>` : '';
    c.innerHTML = `<span class="choice-head"><span class="card-type">${slotText}</span><span class="card-rank">${isEvo ? '◆' : nextLvl + '/' + skill.max}</span></span>
        <strong class="card-title">${skill.name}</strong><span class="card-desc">${skill.desc}</span><span class="card-delta">${delta}</span>${recipeText}`;
    c.querySelector('.choice-head').appendChild(makeModuleIcon(key, 39));

    c.onkeydown = event => {
        if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
    };
    let pressedHere = false;
    c.onpointerdown = () => { pressedHere = true; };
    c.onpointercancel = () => { pressedHere = false; };
    c.onclick = event => {
        if (c.isConnected === false || (event?.detail > 0 && !pressedHere)) return;
        pressedHere = false;
        if (!state.player || !activeChoiceType || currentChoiceResolved) return;

        if (allowBanish && banishMode) {
            state.player.banishedSkills.add(key);
            state.texts.push(floatTextPool.acquire(state.player.x, state.player.y - 60, `ИЗГНАН: ${skill.name}`, '#ff0055', 18));
            playSound('hit');
            renderUpgradeChoices();
            return;
        }

        const choiceOrigin = activeChoiceType || 'levelup';
        const added = state.player.addSkill(key, choiceOrigin);
        if (!added) return;

        currentChoiceResolved = true;
        updateLevelUpSlotsInfo();
        playSound('powerUp');
        processNextPendingChoice();
    };
    container.appendChild(c);
}

function toggleAbilities() {
    if (!state.isRunning || activeChoiceType || manualPauseActive) return;
    const overlay = document.getElementById('abilities-overlay');
    if (overlay.classList.contains('hidden')) {
        renderAbilities();
        overlay.classList.remove('hidden');
        document.getElementById('close-build').focus?.();
    } else {
        overlay.classList.add('hidden');
        canvas.focus?.({preventScroll:true});
    }
    syncPauseAndLoop();
}

export function togglePause() {
    if (!state.isRunning) return;
    if (!document.getElementById('levelup-screen').classList.contains('hidden')) return;

    const abilitiesOverlay = document.getElementById('abilities-overlay');
    abilitiesOverlay.classList.add('hidden');

    const audioScreen = document.getElementById('audio-settings-screen');
    if (audioScreen && !audioScreen.classList.contains('hidden') && audioPrevScreen === 'pause-menu') {
        audioScreen.classList.add('hidden');
        document.getElementById('pause-menu').classList.remove('hidden');
        syncPauseAndLoop();
        return;
    }

    manualPauseActive = !manualPauseActive;
    const menu = document.getElementById('pause-menu');

    if (manualPauseActive) {
        menu.classList.remove('hidden');
        renderStats();
    } else {
        menu.classList.add('hidden');
    }
    syncPauseAndLoop();
}

export function gameOver() {
    if (!state.isRunning) return;
    state.isRunning = false;
    manualPauseActive = false;
    activeChoiceType = null;
    currentChoiceResolved = false;
    pendingSkillBoxes = 0;
    pendingDirectLevelUps = 0;
    stopGameLoop();
    MusicEngine.setIntensity('menu');
    document.getElementById('levelup-screen')?.classList.add('hidden');
    document.getElementById('pause-menu')?.classList.add('hidden');
    openStation('overlay-screen');
    document.getElementById('abilities-overlay').classList.add('hidden');

    const causeLabel = ENEMY_LABELS[state.lastDamageSource] || 'НЕИЗВЕСТНАЯ ПРИЧИНА';

    let newDirective = null;
    if (state.gameTime >= 120 && state.sessionKills === 0) {
        if (AchievementSystem.unlock('pacifist')) {
            newDirective = ACHIEVEMENTS_DB.pacifist.name;
        }
    }

    Meta.recordRunEnd({
        duration: state.gameTime,
        kills: state.sessionKills,
        level: state.player.lvl,
        score: state.score,
        chipsEarned: state.sessionChips,
        cause: causeLabel,
        enemyKills: state.sessionEnemyKills
    });

    const time = new Date(state.gameTime * 1000).toISOString().slice(14,19);
    document.getElementById('death-report').innerText = `Забег окончен · ${time} · Уровень ${state.player.lvl}\nЧипы +${state.sessionChips} · Последний удар — ${causeLabel}${newDirective ? '\\nДиректива — ' + newDirective : ''}`;

    document.getElementById('overlay-screen').classList.add('run-ended');
    document.getElementById('start-btn').innerText = 'Новый забег';
    document.getElementById('open-shop-btn').classList.remove('hidden');
}

const stationPages = {
    'overlay-screen': 'station-home',
    'chassis-screen': 'chassis-btn',
    'shop-screen': 'open-shop-btn',
    'database-screen': 'open-database-btn',
    'profile-screen': 'open-profile-btn'
};
const stationRenderers = {
    'overlay-screen': updateHangar,
    'chassis-screen': openFleet,
    'shop-screen': openWorkshop,
    'database-screen': openArchive,
    'profile-screen': renderProfile
};
let stationPage = 'overlay-screen';

function openStation(id) {
    const screen = document.getElementById(id);
    if (!screen) return;
    stationPage = id;
    for (const [page, nav] of Object.entries(stationPages)) {
        document.getElementById(page).classList.toggle('hidden', page !== id);
        const button = document.getElementById(nav);
        if (page === id) button.setAttribute?.('aria-current','page');
        else button.removeAttribute?.('aria-current');
    }
    stationRenderers[id]();
    screen.scrollTop = 0;
}

for (const [page, nav] of Object.entries(stationPages)) {
    document.getElementById(nav).onclick = () => openStation(page);
}
document.getElementById('hangar-change').onclick = () => {
    openStation('chassis-screen');
    document.getElementById('chassis-container').querySelector('[aria-pressed="true"]')?.focus?.();
};
document.getElementById('close-profile-btn').onclick = () => {
    openStation('overlay-screen');
    document.getElementById('open-profile-btn').focus?.();
};
document.getElementById('close-build').onclick = toggleAbilities;
document.getElementById('hud-build').onclick = toggleAbilities;

let audioPrevScreen = 'overlay-screen';
document.getElementById('open-audio-btn').onclick = () => {
    audioPrevScreen = stationPage;
    document.getElementById(stationPage).classList.add('hidden');
    document.getElementById('audio-settings-screen').classList.remove('hidden');
    renderAudioSettings();
};
document.getElementById('pause-audio-btn').onclick = () => {
    audioPrevScreen = 'pause-menu';
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('audio-settings-screen').classList.remove('hidden');
    renderAudioSettings();
};
document.getElementById('close-audio-btn').onclick = () => {
    document.getElementById('audio-settings-screen').classList.add('hidden');
    document.getElementById(audioPrevScreen).classList.remove('hidden');
    document.getElementById(audioPrevScreen === 'pause-menu' ? 'pause-audio-btn' : 'open-audio-btn').focus?.();
    syncPauseAndLoop();
};

document.getElementById('reroll-btn').onclick = () => {
    if (!state.player || activeChoiceType !== 'levelup' || currentChoiceResolved || state.player.rerollCharges <= 0) return;
    state.player.rerollCharges--;
    playSound('powerUp');
    renderUpgradeChoices();
};

document.getElementById('banish-btn').onclick = () => {
    if (activeChoiceType !== 'levelup' || currentChoiceResolved) return;
    banishMode = !banishMode;
    updateLevelUpControls();
};

document.getElementById('skip-btn').onclick = () => {
    if (!state.player || activeChoiceType !== 'levelup' || currentChoiceResolved) return;
    currentChoiceResolved = true;
    state.player.heal(40);
    processNextPendingChoice();
};

export function getXpDiagnosticReport() {
    return formatXpDiagnosticReport();
}

export function copyXpDiagnosticReport() {
    const report = formatXpDiagnosticReport();
    const diagBox = document.getElementById('xp-diagnostic-box');
    if (diagBox) {
        diagBox.textContent = report;
        diagBox.classList.remove('hidden');
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(report).catch(() => {});
    }
    if (state.player && state.isRunning && !state.isPaused) {
        state.texts.push(floatTextPool.acquire(state.player.x, state.player.y - 75, 'СВОДКА XP ГОТОВА [F9]', '#00ffff', 18));
    }
    return report;
}

if (typeof window !== 'undefined') {
    window.getXpReport5m = getXpDiagnosticReport;
    window.copyXpReport5m = copyXpDiagnosticReport;
}

window.addEventListener('keydown', e => {
    if (e.code === 'F9' && state.player) {
        e.preventDefault();
        copyXpDiagnosticReport();
        return;
    }
    if (!state.isRunning) {
        if (e.code === 'Escape' && !e.repeat) {
            if (!document.getElementById('audio-settings-screen').classList.contains('hidden')) {
                document.getElementById('close-audio-btn').click();
            } else if (stationPage === 'database-screen' && document.getElementById('archive-query').value) {
                const search = document.getElementById('archive-query');
                search.value = '';
                search.oninput();
                search.focus();
            } else if (stationPage !== 'overlay-screen') {
                const nav = stationPages[stationPage];
                openStation('overlay-screen');
                document.getElementById(nav).focus?.();
            }
            e.preventDefault();
        }
        return;
    }
    const build = document.getElementById('abilities-overlay');
    if (e.code === 'Tab' && !build.classList.contains('hidden')) {
        const stops = build.querySelectorAll('button,summary');
        const first = stops[0], last = stops[stops.length-1];
        if (stops.length && ((e.shiftKey && document.activeElement === first) || (!e.shiftKey && document.activeElement === last))) {
            e.preventDefault();
            (e.shiftKey ? last : first).focus();
        }
        return;
    }
    if (e.code === 'Tab' && !activeChoiceType && !manualPauseActive) {
        e.preventDefault();
        if (e.repeat) return;
        toggleAbilities();
        return;
    }

    if (e.code === 'Escape') {
        if (e.repeat) return;
        togglePause();
        return;
    }

    if (state.isPaused) return;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.w = true;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.s = true;
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.a = true;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.d = true;

    if (e.code === 'KeyM') {
        const active = RadarSystem.toggle();
        document.getElementById('btn-radar')?.classList.toggle('active', active);
    }
    if (e.code === 'Space' && e.target?.tagName !== 'BUTTON') { e.preventDefault(); state.player?.useDash(); }
    if (e.code === 'KeyE') state.player?.useEmp();
});

window.addEventListener('keyup', e => {
    if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.w = false;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.s = false;
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.a = false;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.d = false;
});

window.addEventListener('blur', () => {
    clearStick();
    keys.w = false;
    keys.a = false;
    keys.s = false;
    keys.d = false;
    mouse.active = false;
});

function aimAtPointer(event) {
    if (!state.isRunning || state.isPaused) return;
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.active = true;
}
canvas.addEventListener('pointermove', event => {
    if (event.pointerType !== 'touch' || event.buttons) aimAtPointer(event);
});
canvas.addEventListener('pointerdown', aimAtPointer);

document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.isRunning && !state.isPaused) togglePause();
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
    stopGameLoop();
    init();
    state.isRunning = true;
    canvas.focus?.({preventScroll:true});
    syncPauseAndLoop();
};

document.getElementById('btn-pause').onclick = togglePause;
document.getElementById('resume-btn').onclick = togglePause;
const pauseXpReportBtn = document.getElementById('pause-xp-report-btn');
if (pauseXpReportBtn) {
    pauseXpReportBtn.onclick = () => {
        copyXpDiagnosticReport();
    };
}

const radarBtn = document.getElementById('btn-radar');
if (radarBtn) {
    radarBtn.onclick = () => {
        const active = RadarSystem.toggle();
        radarBtn.classList.toggle('active', active);
    };
}

document.getElementById('skill-dash')?.addEventListener('click', () => {
    if (state.isRunning && !state.isPaused) state.player?.useDash();
});
document.getElementById('skill-emp')?.addEventListener('click', () => {
    if (state.isRunning && !state.isPaused) state.player?.useEmp();
});

function syncAutoAimToggles() {
    const val = !!Meta.data.autoAim;
    document.getElementById('autoaim-toggle-start').checked = val;
    document.getElementById('autoaim-toggle-pause').checked = val;
}

document.getElementById('autoaim-toggle-start').onchange = (e) => {
    Meta.setAutoAim(e.target.checked);
    syncAutoAimToggles();
};
document.getElementById('autoaim-toggle-pause').onchange = (e) => {
    Meta.setAutoAim(e.target.checked);
    syncAutoAimToggles();
};

Meta.load();
syncAutoAimToggles();
initAudioUI();
openStation('overlay-screen');
