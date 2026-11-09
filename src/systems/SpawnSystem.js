import { state, triggerShake } from '../GameState.js';
import { NavigationSystem } from './NavigationSystem.js';
import { WORLD_SIZE, SCREEN_W, SCREEN_H, BALANCE } from '../constants.js';
import { clamp, checkWall, canPassClearance } from '../utils.js';
import { enemyPool, ENEMY_RADII } from '../entities/Enemy.js';
import { AirdropZone } from '../entities/Items.js';
import { floatTextPool } from '../entities/Particle.js';
import { playSound } from '../sounds.js';
import { AchievementSystem } from './AchievementSystem.js';

const ENEMY_DATA = {
    'basic':         { cost: 1,  minTime: 0,   packSize: [1, 2] },
    'swarmer':       { cost: 1,  minTime: 20,  packSize: [3, 6] },
    'runner':        { cost: 2,  minTime: 40,  packSize: [1, 3] },
    'shooter':       { cost: 4,  minTime: 70,  packSize: [1, 2] },
    'spitter':       { cost: 5,  minTime: 85,  packSize: [1, 2] },
    'stalker':       { cost: 6,  minTime: 110, packSize: [1, 2] },
    'tank':          { cost: 14, minTime: 125, packSize: [1, 1] },
    'kamikaze':      { cost: 5,  minTime: 140, packSize: [1, 3] },
    'shield_bearer': { cost: 12, minTime: 155, packSize: [1, 2] },
    'dasher':        { cost: 10, minTime: 170, packSize: [1, 2] },
    'elite':         { cost: 25, minTime: 195, packSize: [1, 1] }
};

const WAVE_CYCLE = [
    { state: 'calm',  duration: 16, budgetMult: 0,   limitMult: 0.6 },
    { state: 'build', duration: 32, budgetMult: 1.0, limitMult: 1.0 },
    { state: 'peak',  duration: 22, budgetMult: 2.2, limitMult: 1.4 }
];

export function getDirectionName(angle) {
    let a = angle % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    const octant = Math.round(a / (Math.PI / 4)) % 8;
    const names = [
        'ВОСТОК',
        'ЮГО-ВОСТОК',
        'ЮГ',
        'ЮГО-ЗАПАД',
        'ЗАПАД',
        'СЕВЕРО-ЗАПАД',
        'СЕВЕР',
        'СЕВЕРО-ВОСТОК'
    ];
    return names[octant];
}

export function calculateLocalPressure(player) {
    if (!player) return 0;
    const combatRadius = 650;
    let pressure = 0;

    const enemies = state.enemies;
    const len = enemies.length;
    for (let i = 0; i < len; i++) {
        const e = enemies[i];
        if (e.isDead) continue;
        const dist = Math.hypot(e.x - player.x, e.y - player.y);
        if (dist < combatRadius) {
            let weight = 1.0;
            if (e.type === 'swarmer') weight = 0.5;
            else if (e.type === 'runner') weight = 1.4;
            else if (e.type === 'shooter') weight = 2.5;
            else if (e.type === 'spitter') weight = 2.5;
            else if (e.type === 'dasher') weight = 3.0;
            else if (e.type === 'kamikaze') weight = 2.2;
            else if (e.type === 'shield_bearer') weight = 3.2;
            else if (e.type === 'tank') weight = 4.0;
            else if (e.type === 'elite') weight = 5.0;
            else if (e.type === 'titan') weight = 10.0;

            if (dist < 220 && e.hasPlayerLos !== false) weight *= 1.35;

            if (e.isSearching) {
                weight *= 0.15;
            } else if (e.hasPlayerLos === false) {
                if (e.navStatus === 'unreachable' || e.stuckCount >= 2) {
                    weight *= 0.05;
                } else if (e.stuckCount === 1) {
                    weight *= 0.25;
                } else {

                    weight *= (dist < 260 ? 0.85 : 0.6);
                }
            }

            pressure += weight;
        }
    }

    const enemyBullets = state.enemyBullets;
    const bLen = enemyBullets.length;
    for (let i = 0; i < bLen; i++) {
        const b = enemyBullets[i];
        if (b.life > 0 && Math.hypot(b.x - player.x, b.y - player.y) < 350) {
            pressure += 0.5;
        }
    }

    return pressure;
}

export function getPowerScore() {
    return getPlayerPowerScore() + state.gameTime * 0.5;
}

export function getPlayerPowerScore() {
    if (!state.player) return 0;
    const totalSkillLevels = state.player.getBuildLevels();
    return (state.player.lvl * 10) + (totalSkillLevels * 5);
}

export function updateGlobalDifficulty() {
    const ramp = BALANCE.difficultyRamp;

    const t = Math.max(0, state.gameTime - BALANCE.startGraceSeconds);
    const timeCurve = 1 + (ramp.maxDifficulty - 1) * (1 - Math.exp(-t / ramp.easeSeconds));

    const powerCurve = 1 + (getPlayerPowerScore() / ramp.powerPerDifficultyPoint);

    state.globalDifficulty = Math.min(timeCurve, powerCurve, ramp.maxDifficulty);
}

function getMaxAliveEnemies(powerScore, phaseLimitMult) {
    const cap = BALANCE.earlyAliveCap;
    const t = Math.max(0, state.gameTime - BALANCE.startGraceSeconds);
    const rampProgress = Math.min(1, t / cap.rampSeconds);

    const lateGameCap = Math.min(260, (200 + powerScore / 50) * phaseLimitMult);
    return Math.round(cap.startCap + (lateGameCap - cap.startCap) * rampProgress);
}

const HIGH_PRESSURE_THRESHOLD = 22;
const RESUME_PRESSURE_THRESHOLD = 12;

export function updateDirector() {
    const dir = state.director;
    dir.stateTimer++;
    dir.phaseTimer++;

    if (!state.player) return;

    const currentPressure = calculateLocalPressure(state.player);
    dir.localPressure = currentPressure;

    if (!dir.isHighPressurePaused && currentPressure >= HIGH_PRESSURE_THRESHOLD) {
        dir.isHighPressurePaused = true;

        dir.credits = Math.min(dir.credits, 12);
    } else if (dir.isHighPressurePaused && currentPressure <= RESUME_PRESSURE_THRESHOLD) {
        dir.isHighPressurePaused = false;
    }

    if (dir.waveState === 'build') {
        if (dir.phaseTimer >= 1920) {
            dir.waveState = 'peak';
            dir.phaseTimer = 0;
            const shouldSurround = state.gameTime > 130 && Math.random() < 0.4;
            if (shouldSurround) {
                dir.isSurroundEvent = true;
                state.eventAlert = {
                    title: 'ОПАСНОСТЬ: ОКРУЖЕНИЕ!',
                    desc: 'Враги берут в клещи! Оставлен коридор отхода!',
                    timer: 180
                };
                playSound('explosion');
            } else {
                dir.isSurroundEvent = false;
                dir.assaultAngle = (dir.assaultAngle + Math.PI * 0.8) % (Math.PI * 2);
                dir.assaultName = getDirectionName(dir.assaultAngle);
                state.eventAlert = {
                    title: 'ПИК ШТУРМА: ' + dir.assaultName,
                    desc: 'Плотное наступление с направления ' + dir.assaultName,
                    timer: 160
                };
            }
        }
    } else if (dir.waveState === 'peak') {
        if (dir.phaseTimer >= 1320) {
            dir.waveState = 'calm';
            dir.calmStage = 'dissipating';
            dir.calmTimer = 0;
            dir.quietTimer = 0;
            dir.phaseTimer = 0;
            dir.credits = 0;
            dir.isSurroundEvent = false;
            state.eventAlert = {
                title: 'СНИЖЕНИЕ НАТИСКА',
                desc: 'Подкрепления остановлены. Подавите оставшихся врагов.',
                timer: 160
            };
        }
    } else if (dir.waveState === 'calm') {

        if (dir.calmStage === 'dissipating') {
            dir.calmTimer++;

            if (currentPressure <= 6) {
                dir.calmStage = 'quiet';
                dir.quietTimer = 0;
                state.texts.push(floatTextPool.acquire(state.player.x, state.player.y - 70, 'ПЕРЕДЫШКА: СБОР РЕСУРСОВ', '#00ff88', 22));
                state.eventAlert = {
                    title: 'ПЕРЕДЫШКА: СБОР РЕСУРСОВ',
                    desc: 'Сектор зачищен. Безопасное окно сбора ресурсов.',
                    timer: 200
                };
            } else if (dir.calmTimer > 720) {

                if (state.frameCount % 240 === 0) {
                    state.eventAlert = {
                        title: 'ОЧИСТКА СЕКТОРА',
                        desc: 'Бой продолжается. Подкрепления задержаны до подавления угрозы.',
                        timer: 160
                    };
                }
            }
        } else if (dir.calmStage === 'quiet') {
            dir.quietTimer++;

            if (currentPressure > 8 && state.frameCount % 180 === 0) {
                state.eventAlert = {
                    title: 'ТРЕВОГА В СЕКТОРЕ',
                    desc: 'Оставшиеся противники сближаются! Будьте начеку.',
                    timer: 140
                };
            }

            if (dir.quietTimer >= 480) {

                if (currentPressure <= 10) {
                    dir.waveState = 'build';
                    dir.phaseTimer = 0;
                    dir.assaultAngle = (dir.assaultAngle + Math.PI * 0.45 + Math.random() * Math.PI * 0.6) % (Math.PI * 2);
                    dir.assaultName = getDirectionName(dir.assaultAngle);
                    dir.isSurroundEvent = false;

                    state.texts.push(floatTextPool.acquire(state.player.x, state.player.y - 70, 'НАСТУПЛЕНИЕ: ' + dir.assaultName, '#00ffff', 20));
                    state.eventAlert = {
                        title: 'НАСТУПЛЕНИЕ: ' + dir.assaultName,
                        desc: 'Противники наступают с сектора ' + dir.assaultName,
                        timer: 160
                    };
                } else if (state.frameCount % 180 === 0) {
                    state.eventAlert = {
                        title: 'ОЧИСТКА СЕКТОРА',
                        desc: 'Подавите оставшихся врагов для начала нового наступления.',
                        timer: 140
                    };
                }
            }
        }
        return;
    }

    if (state.gameTime < BALANCE.startGraceSeconds) return;

    if (dir.isHighPressurePaused) return;

    dir.spawnRate = dir.waveState === 'peak' ? 40 : 65;

    if (state.frameCount < dir.nextSpawn) return;
    dir.nextSpawn = state.frameCount + dir.spawnRate;

    const powerScore = getPowerScore();
    const limitMult = dir.waveState === 'peak' ? 1.3 : 1.0;
    const maxEnemies = getMaxAliveEnemies(powerScore, limitMult);

    if (state.enemies.length >= maxEnemies) return;

    const budgetBase = 2 + (powerScore / 30);
    const budgetMult = dir.waveState === 'peak' ? 1.5 : 1.0;
    dir.credits += budgetBase * budgetMult * state.globalDifficulty;

    dir.credits = Math.min(dir.credits, 24 + powerScore / 10);

    spawnWave(maxEnemies);
}

function spawnWave(maxEnemies) {
    const dir = state.director;
    if (dir.waveState === 'calm' || dir.isHighPressurePaused) return;

    const availableTypes = Object.keys(ENEMY_DATA).filter(type => state.gameTime >= ENEMY_DATA[type].minTime);

    if (availableTypes.length === 0) availableTypes.push('basic');

    let packsSpawnedThisFrame = 0;
    const packBurstCfg = BALANCE.maxPacksPerFrameEarly;
    const MAX_PACKS_PER_FRAME = state.gameTime < packBurstCfg.durationSec ? packBurstCfg.cap : 3;
    const spawnedTypes = new Set();

    let attempts = 10;

    while (dir.credits > 0 && attempts > 0 && packsSpawnedThisFrame < MAX_PACKS_PER_FRAME) {
        let candidates = availableTypes.filter(t => !spawnedTypes.has(t));
        if (candidates.length === 0) candidates = availableTypes;

        const type = candidates[Math.floor(Math.random() * candidates.length)];
        const data = ENEMY_DATA[type];

        if (dir.credits >= data.cost) {
            let packSize = Math.floor(Math.random() * (data.packSize[1] - data.packSize[0] + 1)) + data.packSize[0];

            if (state.gameTime < BALANCE.earlyPackCap.durationSec) {
                packSize = Math.min(packSize, BALANCE.earlyPackCap.maxPackSize);
            }

            packSize = Math.min(packSize, Math.floor(dir.credits / data.cost), Math.floor(maxEnemies - state.enemies.length));
            if (packSize < 1) break;
            const spawned = spawnPackMembers(type, packSize);

            if (spawned) {
                dir.credits -= data.cost * spawned;
                packsSpawnedThisFrame++;
                spawnedTypes.add(type);
            } else {
                attempts--;
            }
        } else {
            attempts--;
        }

        if (dir.credits < 1) break;
    }
}

export function isPointOnScreen(x, y, margin = 40) {
    const sw = SCREEN_W();
    const sh = SCREEN_H();
    const camX = state.camera ? (state.camera.x || 0) : 0;
    const camY = state.camera ? (state.camera.y || 0) : 0;
    const sx = x - camX;
    const sy = y - camY;
    return (sx >= -margin && sx <= sw + margin && sy >= -margin && sy <= sh + margin);
}

export function spawnEnemyPack(type, count) {
    return spawnPackMembers(type, count) > 0;
}

function spawnPackMembers(type, count) {
    const dir = state.director;
    let centerX, centerY, safe = false;
    const screenHalfW = SCREEN_W() / 2;
    const screenHalfH = SCREEN_H() / 2;
    const minOffscreenDist = Math.hypot(screenHalfW, screenHalfH) + 160;
    const enemyRadius = ENEMY_RADII[type] ?? ENEMY_RADII.basic;

    const baseAngle = dir.assaultAngle;
    const deviations = dir.isSurroundEvent
        ? [-1.8, -1.3, -0.9, -0.45, 0, 0.45, 0.9, 1.3, 1.8]
        : [0, 0.12, -0.12, 0.25, -0.25, 0.4, -0.4, 0.55, -0.55, 0.7, -0.7];

    const distBands = [
        () => minOffscreenDist + 70 + Math.random() * 100,
        () => minOffscreenDist + 190 + Math.random() * 130
    ];

    for (let b = 0; b < distBands.length && !safe; b++) {
        for (let k = 0; k < deviations.length; k++) {
            const angle = (baseAngle + deviations[k] + (Math.random() - 0.5) * 0.08) % (Math.PI * 2);
            const dist = distBands[b]();

            const rawX = state.player.x + Math.cos(angle) * dist;
            const rawY = state.player.y + Math.sin(angle) * dist;
            const cx = clamp(rawX, enemyRadius + 80, WORLD_SIZE - enemyRadius - 80);
            const cy = clamp(rawY, enemyRadius + 80, WORLD_SIZE - enemyRadius - 80);

            if (isPointOnScreen(cx, cy, enemyRadius + 60)) {
                continue;
            }

            if (checkWall(cx, cy, enemyRadius + 15)) {
                continue;
            }

            if (!NavigationSystem.isPointConnectedToMain(cx, cy, enemyRadius)) {
                continue;
            }

            const toPlayerDist = Math.hypot(state.player.x - cx, state.player.y - cy) || 1;
            const stepDirX = (state.player.x - cx) / toPlayerDist;
            const stepDirY = (state.player.y - cy) / toPlayerDist;
            const directStepOk = canPassClearance(cx, cy, cx + stepDirX * 70, cy + stepDirY * 70, enemyRadius);
            const routeOk = directStepOk || NavigationSystem.findPath(cx, cy, state.player.x, state.player.y, enemyRadius).status !== 'unreachable';
            if (routeOk) {
                centerX = cx;
                centerY = cy;
                safe = true;
                break;
            }
        }
    }

    if (!safe) return false;

    let spawnedCount = 0;
    for (let i = 0; i < count; i++) {
        const offsetX = (Math.random() - 0.5) * 60;
        const offsetY = (Math.random() - 0.5) * 60;
        const x = clamp(centerX + offsetX, enemyRadius + 50, WORLD_SIZE - enemyRadius - 50);
        const y = clamp(centerY + offsetY, enemyRadius + 50, WORLD_SIZE - enemyRadius - 50);

        if (isPointOnScreen(x, y, enemyRadius)) {
            continue;
        }

        if (checkWall(x, y, enemyRadius)) {
            continue;
        }

        if (!NavigationSystem.isPointConnectedToMain(x, y, enemyRadius)) {
            continue;
        }

        if (!canPassClearance(centerX, centerY, x, y, enemyRadius)) {
            continue;
        }

        state.enemies.push(enemyPool.acquire(type, x, y));
        spawnedCount++;
    }
    return spawnedCount;
}

export function spawnTitan() {
    let x, y, safe = false;
    for (let k = 0; k < 10; k++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 500;
        x = state.player.x + Math.cos(angle) * dist;
        y = state.player.y + Math.sin(angle) * dist;
        x = clamp(x, 50, WORLD_SIZE - 50);
        y = clamp(y, 50, WORLD_SIZE - 50);
        if (!checkWall(x, y, ENEMY_RADII.titan) && NavigationSystem.isPointConnectedToMain(x, y, ENEMY_RADII.titan)) {
            safe = true;
            break;
        }
    }
    if (safe) {
        state.enemies.push(enemyPool.acquire('titan', x, y));
        AchievementSystem.onTitanSpawn();
        state.texts.push(floatTextPool.acquire(state.player.x, state.player.y - 150, 'ОПАСНОСТЬ: ТИТАН!', '#f00', 36));
        triggerShake(15, 25);
        playSound('explosion');
    }
    return safe;
}

export function spawnAirdropZone() {
    let x, y, safe = false;
    for (let k = 0; k < 10; k++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 300 + Math.random() * 400;
        x = state.player.x + Math.cos(angle) * dist;
        y = state.player.y + Math.sin(angle) * dist;

        x = clamp(x, 200, WORLD_SIZE - 200);
        y = clamp(y, 200, WORLD_SIZE - 200);

        if (!checkWall(x, y, 90) && NavigationSystem.isPointConnectedToMain(x, y, state.player.r)) { safe = true; break; }
    }

    if (safe) {
        state.airdropZones.push(new AirdropZone(x, y));
        state.texts.push(floatTextPool.acquire(state.player.x, state.player.y - 100, 'ЗОНА СБРОСА!', '#00ffff', 24));
    }
}
