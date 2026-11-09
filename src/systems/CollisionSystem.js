import { state, triggerShake } from '../GameState.js';
import { SCREEN_W, SCREEN_H } from '../constants.js';
import { particlePool, floatTextPool } from '../entities/Particle.js';
import { bulletPool } from '../entities/Bullet.js';
import { minePool, chipPool, gemPool, AcidPuddle } from '../entities/Items.js';
import { playSound } from '../sounds.js';
import { Meta } from '../MetaGame.js';
import { SpatialGrid } from './SpatialGrid.js';
import { AchievementSystem } from './AchievementSystem.js';
import { calcDmg, raycastWall } from '../utils.js';
import { emitWeaponImpact } from './WeaponVisuals.js';

if (!state.enemySpatialGrid) {
    state.enemySpatialGrid = new SpatialGrid(128);
}
if (!state.barrelSpatialGrid) {
    state.barrelSpatialGrid = new SpatialGrid(128);
}

export function rebuildSpatialGrids() {
    if (!state.enemySpatialGrid) state.enemySpatialGrid = new SpatialGrid(128);
    if (!state.barrelSpatialGrid) state.barrelSpatialGrid = new SpatialGrid(128);

    const enemyGrid = state.enemySpatialGrid;
    const barrelGrid = state.barrelSpatialGrid;

    enemyGrid.clear();
    const enemies = state.enemies;
    const eLen = enemies.length;
    for (let i = 0; i < eLen; i++) {
        const e = enemies[i];
        if (!e.isDead) {
            enemyGrid.insert(e);
        }
    }

    barrelGrid.clear();
    const barrels = state.barrels;
    const bLen = barrels.length;
    for (let i = 0; i < bLen; i++) {
        const b = barrels[i];
        if (b.hp > 0) {
            barrelGrid.insert(b);
        }
    }
}

export function updateBarrels() {
    for (let i = state.barrels.length - 1; i >= 0; i--) {
        const b = state.barrels[i];
        if (b.hp <= 0) {
            playSound('explosion');
            triggerShake(8, 15);
            state.particles.push(particlePool.acquire(b.x, b.y, '#ff3300', 20));
            for (let k = 0; k < 15; k++) state.particles.push(particlePool.acquire(b.x, b.y, '#ffaa00', 6));

            const explosionRange = 180;
            const explosionDmg = 150;

            const candidates = state.enemySpatialGrid ? state.enemySpatialGrid.queryCircle(b.x, b.y, explosionRange) : state.enemies;
            for (let j = 0; j < candidates.length; j++) {
                const e = candidates[j];
                if (!e.isDead && Math.hypot(e.x - b.x, e.y - b.y) < explosionRange) {
                    e.takeDamage(explosionDmg, false);
                    e.pushX = (e.x - b.x) * 0.2;
                    e.pushY = (e.y - b.y) * 0.2;
                }
            }

            if (state.player && Math.hypot(state.player.x - b.x, state.player.y - b.y) < explosionRange) {
                state.player.takeDamage(30, 'barrel');
                state.texts.push(floatTextPool.acquire(state.player.x, state.player.y - 40, 'ВЗРЫВ!', '#ff0000', 20));
            }

            state.barrels.splice(i, 1);
        }
    }
}

export function drawBarrels(ctx) {
    for (let i = 0; i < state.barrels.length; i++) {
        state.barrels[i].draw(ctx);
    }
}

export function resolveBarrels(ctx) {
    updateBarrels();
    if (ctx) drawBarrels(ctx);
}

export function updateMines() {
    const detonatedMines = [];
    const splashMult = 1 + (state.player?.stats?.splashDmgBonus || 0);
    const playerStats = state.player?.stats || { dmgMult: 1, critChance: 0 };

    for (let i = state.mines.length - 1; i >= 0; i--) {
        const o = state.mines[i];
        if (!o || !o.active) {
            state.mines.splice(i, 1);
            continue;
        }
        if (o.update) o.update();

        const candidates = state.enemySpatialGrid ? state.enemySpatialGrid.queryCircle(o.x, o.y, o.range) : state.enemies;
        const visibleTargets = [];
        for (let j = 0; j < candidates.length; j++) {
            const e = candidates[j];
            if (!e.isDead && Math.hypot(e.x - o.x, e.y - o.y) < o.range) {
                if (raycastWall(o.x, o.y, e.x, e.y)) continue;
                visibleTargets.push(e);
            }
        }

        if (visibleTargets.length > 0) {
            state.mines.splice(i, 1);
            const d = calcDmg(o.dmg, playerStats);
            const explosionDmg = d.val * splashMult;

            const isMainVacuum = Boolean(o.isVacuum && !o.isMini);
            for (let j = 0; j < visibleTargets.length; j++) {
                const e = visibleTargets[j];
                if (e.isDead) continue;

                if (isMainVacuum) {
                    const pullDx = o.x - e.x;
                    const pullDy = o.y - e.y;
                    const pullDist = Math.hypot(pullDx, pullDy);
                    if (pullDist > 0.001) {
                        e.pushX += (pullDx / pullDist) * 8;
                        e.pushY += (pullDy / pullDist) * 8;
                    }
                }

                e.takeDamage(explosionDmg, d.isCrit, null, false, isMainVacuum);

                if (isMainVacuum && e.isDead) {
                    e.pushX = 0;
                    e.pushY = 0;
                }
            }

            detonatedMines.push(o);
        }
    }

    for (let i = 0; i < detonatedMines.length; i++) {
        const o = detonatedMines[i];
        emitWeaponImpact(o.isVacuum ? 'vacuum' : 'mine', o.x, o.y, o.range);
        o.explode();
        playSound('explosion');
        triggerShake(4, 8);
        const sparkColor = o.isVacuum ? '#87e3d9' : '#ecad72';
        for (let k = 0; k < 10; k++) state.particles.push(particlePool.acquire(o.x, o.y, sparkColor, 3));
        if (o.active) {
            o.active = false;
            minePool.release(o);
        }
    }
}

export function drawMines(ctx) {
    let closest = null;
    let closestDist = Infinity;
    if (state.player) {
        for (const mine of state.mines) {
            if (!mine.active || mine.isMini) continue;
            const dx = mine.x - state.player.x;
            const dy = mine.y - state.player.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < closestDist) {
                closest = mine;
                closestDist = d2;
            }
        }
    }
    for (const mine of state.mines) mine.draw(ctx, mine === closest);
}

export function resolveMines(ctx) {
    updateMines();
    if (ctx) drawMines(ctx);
}

function triggerSplashExplosion(b, directHitEnemy = null) {
    if (!b.isSplash || b.hasExploded) return;
    b.hasExploded = true;

    const radius = b.splashRadius || 120;
    const isNova = b.type === 'supernova';
    emitWeaponImpact(b.type, b.x, b.y, radius);
    triggerShake(isNova ? 8 : 4, 10);
    playSound('explosion');
    for (let p = 0; p < (isNova ? 25 : 15); p++) {
        state.particles.push(particlePool.acquire(b.x, b.y, isNova ? '#ffaa00' : '#bf00ff', 3 + Math.random() * 4));
    }

    const splashTargets = state.enemySpatialGrid ? state.enemySpatialGrid.queryCircle(b.x, b.y, radius) : state.enemies;
    const seenIds = new Set();
    if (directHitEnemy) seenIds.add(directHitEnemy.id);

    const splashMult = 1 + (state.player?.stats?.splashDmgBonus || 0);

    for (let i = 0; i < splashTargets.length; i++) {
        const se = splashTargets[i];
        if (se.isDead || seenIds.has(se.id)) continue;
        seenIds.add(se.id);

        if (Math.hypot(se.x - b.x, se.y - b.y) < radius) {
            if (raycastWall(b.x, b.y, se.x, se.y)) continue;

            se.takeDamage(b.dmg * 0.7 * splashMult, b.isCrit, b.angle, true);
            if (isNova) {

                const dist = Math.hypot(b.x - se.x, b.y - se.y) || 1;
                se.pushX += ((b.x - se.x) / dist) * 12;
                se.pushY += ((b.y - se.y) / dist) * 12;
            }
        }
    }
}

export function updateBullets() {

    for (let i = state.bullets.length - 1; i >= 0; i--) {
        const b = state.bullets[i];
        b.update();
        if (b.life <= 0 && !b.hitWall) {
            bulletPool.release(b);
            state.bullets.splice(i, 1);
            continue;
        }

        if (b.isPlayer) {
            let hitBarrel = false;
            const bSize = b.size || 5;
            const barrelCandidates = state.barrelSpatialGrid ? state.barrelSpatialGrid.queryCircle(b.x, b.y, bSize + 50) : state.barrels;
            for (let k = 0; k < barrelCandidates.length; k++) {
                const barrel = barrelCandidates[k];
                if (barrel.hp > 0 && Math.hypot(barrel.x - b.x, barrel.y - b.y) < barrel.radius + bSize) {
                    barrel.hp -= b.dmg;
                    if (b.isSplash) triggerSplashExplosion(b, null);
                    b.life = 0;
                    b.spawnParticles('#ff5500', 3);
                    hitBarrel = true;
                    break;
                }
            }
            if (hitBarrel || (b.life <= 0 && !b.hitWall)) {
                bulletPool.release(b);
                state.bullets.splice(i, 1);
                continue;
            }
        }

        const bulletSize = b.size || 5;

        if (b.type === 'boomerang' && b.turnaroundPendingClear) {
            b.turnaroundPendingClear = false;
            if (b.hitList.length > 0) {
                const turnX = Number.isFinite(b.turnX) ? b.turnX : b.prevX;
                const turnY = Number.isFinite(b.turnY) ? b.turnY : b.prevY;
                const retainedIds = [];
                for (let k = 0; k < state.enemies.length; k++) {
                    const en = state.enemies[k];
                    if (!en.isDead && b.hitList.includes(en.id)) {
                        const distAtTurn = Math.hypot(en.x - turnX, en.y - turnY);
                        const distNow = Math.hypot(en.x - b.x, en.y - b.y);
                        const hitRadius = en.size + bulletSize;
                        if (distAtTurn < hitRadius || distNow < hitRadius) {
                            retainedIds.push(en.id);
                        }
                    }
                }
                b.hitList.length = 0;
                for (let r = 0; r < retainedIds.length; r++) {
                    b.hitList.push(retainedIds[r]);
                }
            }
        }

        if (b.isPlayer && state.convoyDrones.length > 0) {
            for (let c = 0; c < state.convoyDrones.length; c++) {
                const drone = state.convoyDrones[c];
                if (!drone.isDead && Math.hypot(drone.x - b.x, drone.y - b.y) < drone.size + bulletSize) {
                    drone.takeDamage(b.dmg, b.isCrit);
                    if (b.isSplash) triggerSplashExplosion(b, null);
                    b.life = 0;
                    b.spawnParticles('#ffd700', 3);
                    break;
                }
            }
            if (b.life <= 0 && !b.hitWall) {
                bulletPool.release(b);
                state.bullets.splice(i, 1);
                continue;
            }
        }

        const prevX = Number.isFinite(b.prevX) ? b.prevX : b.x;
        const prevY = Number.isFinite(b.prevY) ? b.prevY : b.y;
        const segDx = b.x - prevX;
        const segDy = b.y - prevY;
        const segLenSq = segDx * segDx + segDy * segDy;
        const segLen = Math.sqrt(segLenSq);
        const queryX = (b.x + prevX) * 0.5;
        const queryY = (b.y + prevY) * 0.5;
        const queryR = bulletSize + 60 + segLen * 0.5;
        const isSweptRay = segLenSq > 0.0001 && b.type !== 'blackhole' && b.type !== 'katana';

        const enemyCandidates = state.enemySpatialGrid ? state.enemySpatialGrid.queryCircle(queryX, queryY, queryR) : state.enemies;
        const hitEntries = [];

        for (let j = 0; j < enemyCandidates.length; j++) {
            const e = enemyCandidates[j];
            if (e.isDead || b.hitList.includes(e.id)) continue;

            let closestX = b.x;
            let closestY = b.y;
            if (isSweptRay) {
                const t = Math.max(0, Math.min(1, ((e.x - prevX) * segDx + (e.y - prevY) * segDy) / segLenSq));
                closestX = prevX + segDx * t;
                closestY = prevY + segDy * t;
            }

            const hitR = e.size + bulletSize;
            if (Math.hypot(e.x - closestX, e.y - closestY) < hitR) {

                if (b.type === 'katana' && !b.isDimensionCut) {
                    if (raycastWall(state.player.x, state.player.y, e.x, e.y)) {
                        continue;
                    }
                }

                if (!b.isDimensionCut && b.type !== 'katana') {
                    if (raycastWall(closestX, closestY, e.x, e.y)) {
                        continue;
                    }
                    if (isSweptRay && raycastWall(prevX, prevY, closestX, closestY)) {
                        continue;
                    }
                }

                let entryDist = 0;
                if (isSweptRay) {
                    const dx0 = e.x - prevX;
                    const dy0 = e.y - prevY;
                    const proj = (dx0 * segDx + dy0 * segDy) / segLen;
                    const perpSq = Math.max(0, dx0 * dx0 + dy0 * dy0 - proj * proj);
                    entryDist = proj - Math.sqrt(Math.max(0, hitR * hitR - perpSq));
                }

                hitEntries.push({ e, entryDist });
            }
        }

        if (hitEntries.length > 1 && isSweptRay) {
            hitEntries.sort((a, bEntry) => a.entryDist - bEntry.entryDist);
        }

        const suppressHitJitter = Boolean(b.isGatlingRound || b.type === 'fatboy' || b.type === 'blackhole');

        for (let h = 0; h < hitEntries.length; h++) {
            const e = hitEntries[h].e;
            if (e.isDead || b.hitList.includes(e.id)) continue;

            const killed = e.takeDamage(b.dmg, b.isCrit, b.angle, b.pierce > 0, suppressHitJitter);

            if (b.type === 'boomerang' && b.isThunderBlade) {
                const canTriggerChain = (b.returnState === 0 && !b.thunderOutTriggered) ||
                    (b.returnState === 1 && !b.thunderRetTriggered);
                if (canTriggerChain) {
                    const chainRadius = 130;
                    const chainPool = state.enemySpatialGrid
                        ? state.enemySpatialGrid.queryCircle(e.x, e.y, chainRadius)
                        : state.enemies;
                    const validNeighbors = [];
                    const seenNeighborIds = new Set([e.id]);
                    for (let c = 0; c < chainPool.length; c++) {
                        const cand = chainPool[c];
                        if (!cand || cand.isDead || seenNeighborIds.has(cand.id)) continue;
                        const d = Math.hypot(cand.x - e.x, cand.y - e.y);
                        if (d <= chainRadius) {
                            seenNeighborIds.add(cand.id);
                            validNeighbors.push({ enemy: cand, dist: d });
                        }
                    }
                    validNeighbors.sort((a, bItem) => a.dist - bItem.dist);

                    let chainHits = 0;
                    let segOriginX = e.x;
                    let segOriginY = e.y;
                    const chainDmg = b.dmg * 0.45;
                    for (let c = 0; c < validNeighbors.length && chainHits < 2; c++) {
                        const target = validNeighbors[c].enemy;
                        if (target.isDead) continue;
                        if (raycastWall(e.x, e.y, target.x, target.y)) continue;
                        if (raycastWall(segOriginX, segOriginY, target.x, target.y)) continue;

                        target.takeDamage(chainDmg, b.isCrit, null, true, true);
                        if (state.player && state.player.laserBeams) {
                            state.player.laserBeams.push({
                                kind: 'thunder',
                                fromX: segOriginX,
                                fromY: segOriginY,
                                x: target.x,
                                y: target.y,
                                life: 8,
                                alpha: 1
                            });
                        }
                        segOriginX = target.x;
                        segOriginY = target.y;
                        chainHits++;
                    }
                    if (chainHits > 0) {
                        if (b.returnState === 0) b.thunderOutTriggered = true;
                        else b.thunderRetTriggered = true;
                    }
                }
            }

            if (b.isSplash) {
                triggerSplashExplosion(b, e);
            }

            if (b.isCryo) {
                let volleyEntry = null;
                if (b.volleyHitStates) {
                    volleyEntry = b.volleyHitStates.get(e.id);
                    if (!volleyEntry) {
                        volleyEntry = {
                            wasFrozenBeforeVolley: (e.freezeTimer || 0) > 0,
                            shattered: false
                        };
                        b.volleyHitStates.set(e.id, volleyEntry);
                    }
                } else {
                    volleyEntry = {
                        wasFrozenBeforeVolley: (e.freezeTimer || 0) > 0,
                        shattered: false
                    };
                }

                e.freezeTimer = Math.max(e.freezeTimer || 0, 80);

                const isAbsZero = Boolean(b.isAbsoluteZero || (state.player && state.player.getSkillLvl('absolute_zero') > 0));
                if (isAbsZero && !e.isDead && volleyEntry.wasFrozenBeforeVolley && !volleyEntry.shattered) {
                    volleyEntry.shattered = true;
                    emitWeaponImpact('shatter', e.x, e.y, e.size + 12);
                    e.takeDamage(b.dmg * 0.6, b.isCrit);
                    for (let c = 0; c < 5; c++) {
                        state.particles.push(particlePool.acquire(e.x, e.y, '#00ffff', 2 + Math.random() * 3));
                    }
                }
            }

            if (b.isNanite) {
                e.knockbackResist = Math.max(-0.4, (e.knockbackResist || 0) - 0.08);
                if (killed && state.player && state.player.getSkillLvl('devourer') > 0 && (state.player.devourerHealCd || 0) <= 0) {
                    state.player.heal(2, 'devourer');
                    state.player.devourerHealCd = 12;
                }
            }

            if (b.pushForce) {
                if (b.type === 'katana') {
                    let dx = e.x - state.player.x;
                    let dy = e.y - state.player.y;
                    let dist = Math.hypot(dx, dy);
                    if (dist < 0.001 || !Number.isFinite(dist)) {
                        dx = Math.cos(b.angle);
                        dy = Math.sin(b.angle);
                    } else {
                        dx /= dist;
                        dy /= dist;
                    }
                    e.slashPushX += dx * b.pushForce;
                    e.slashPushY += dy * b.pushForce;
                } else {

                    const bSpd = Math.hypot(b.vx, b.vy);
                    const dirX = bSpd > 0.001 ? (b.vx / bSpd) : Math.cos(b.angle || 0);
                    const dirY = bSpd > 0.001 ? (b.vy / bSpd) : Math.sin(b.angle || 0);

                    if (b.isGatlingRound || b.type === 'fatboy') {

                        const distFromPlayer = state.player
                            ? Math.hypot(e.x - state.player.x, e.y - state.player.y)
                            : 0;
                        const distScale = distFromPlayer <= 260
                            ? 1.0
                            : Math.max(0, 1 - (distFromPlayer - 260) / 200);

                        if (distScale > 0) {
                            const resist = Math.min(0.95, Math.max(-0.2, e.knockbackResist || 0));
                            const mass = Math.max(0.4, e.mass || 1);
                            const rawPushFactor = Math.max(0.0005, (1 - resist) / mass);

                            const cadenceScale = b.isGatlingRound ? 0.52 : 0.80;
                            const baseImpulse = b.pushForce * cadenceScale * distScale;

                            const currentOutwardVel = (e.vx || 0) * dirX + (e.vy || 0) * dirY;
                            const currentPushProj = (e.pushX || 0) * dirX + (e.pushY || 0) * dirY;

                            const maxOutwardVel = (1.8 + 0.45 * b.pushForce) * distScale;
                            const maxSingleTickDv = (0.75 + 0.24 * b.pushForce) * distScale;
                            const maxRawPushBuffer = 1.9 * b.pushForce * distScale;
                            const maxPendingPush = Math.min(maxRawPushBuffer, maxSingleTickDv / rawPushFactor);

                            if (currentOutwardVel < maxOutwardVel && currentPushProj < maxPendingPush) {
                                const velHeadroom = currentOutwardVel > 0
                                    ? Math.max(0, 1 - currentOutwardVel / maxOutwardVel)
                                    : 1.0;
                                const allowedPush = Math.max(0, maxPendingPush - Math.max(0, currentPushProj));
                                const appliedImpulse = Math.min(baseImpulse * velHeadroom, allowedPush);
                                e.pushX += dirX * appliedImpulse;
                                e.pushY += dirY * appliedImpulse;
                            }
                        }
                    } else {

                        e.pushX += dirX * 2.8 * b.pushForce;
                        e.pushY += dirY * 2.8 * b.pushForce;
                    }
                }
            }

            if (b.pierce > 0) {
                b.pierce--;
                b.hitList.push(e.id);
            } else {
                b.life = 0;
                break;
            }
        }

        if (b.hitWall) {
            if (b.isSplash && !b.hasExploded) {
                triggerSplashExplosion(b, null);
            }
            b.life = 0;
        }

        if (b.life <= 0) {
            bulletPool.release(b);
            state.bullets.splice(i, 1);
        }
    }

    for (let i = state.enemyBullets.length - 1; i >= 0; i--) {
        const b = state.enemyBullets[i];
        b.update();
        if (b.life <= 0) {
            if (b.isAcidSpit) {
                state.acidPuddles.push(new AcidPuddle(b.x, b.y, 45, 360, 8));
            }
            bulletPool.release(b);
            state.enemyBullets.splice(i, 1);
            continue;
        }
        if (state.player && Math.hypot(state.player.x - b.x, state.player.y - b.y) < state.player.r + 5) {
            state.player.takeDamage(b.dmg, b.isAcidSpit ? 'spitter' : 'shooter');
            playSound('hit');
            if (b.isAcidSpit) {
                state.acidPuddles.push(new AcidPuddle(b.x, b.y, 45, 360, 8));
            }
            bulletPool.release(b);
            state.enemyBullets.splice(i, 1);
        }
    }

    for (let i = state.acidPuddles.length - 1; i >= 0; i--) {
        const puddle = state.acidPuddles[i];
        const expired = puddle.update();
        if (expired) {
            state.acidPuddles.splice(i, 1);
        }
    }
}

export function drawPlayerBullets(ctx) {
    for (let i = 0; i < state.acidPuddles.length; i++) {
        state.acidPuddles[i].draw(ctx);
    }
    for (let i = 0; i < state.bullets.length; i++) {
        state.bullets[i].draw(ctx);
    }
}

export function drawEnemyBullets(ctx) {
    for (let i = 0; i < state.enemyBullets.length; i++) {
        state.enemyBullets[i].draw(ctx);
    }
}

export function resolveBullets(ctx) {
    updateBullets();
    if (ctx) { drawPlayerBullets(ctx); drawEnemyBullets(ctx); }
}

export function updatePickups() {
    if (!state.player) return;

    if (state.chips) {
        for (let i = state.chips.length - 1; i >= 0; i--) {
            const c = state.chips[i];
            const d = Math.hypot(state.player.x - c.x, state.player.y - c.y);

            if (d < state.player.stats.magnet) c.mag = true;
            if (c.mag) {
                c.x += (state.player.x - c.x) * 0.15;
                c.y += (state.player.y - c.y) * 0.15;
            }

            if (d < state.player.r) {
                Meta.addCurrency(c.val);
                state.sessionChips += c.val;

                state.texts.push(floatTextPool.acquire(state.player.x, state.player.y - 20, `+$${c.val}`, '#ffd700'));
                playSound('powerUp');
                AchievementSystem.onPickup();
                chipPool.release(c);
                state.chips.splice(i, 1);
            }
        }
    }

    if (state.gems.length > 250) {

        let excess = state.gems.length - 200;
        let clusterTarget = null;

        for (let i = 0; i < state.gems.length && excess > 0; i++) {
            const g = state.gems[i];
            const dist = Math.hypot(g.x - state.player.x, g.y - state.player.y);

            if (dist > 800) {
                if (!clusterTarget) {
                    clusterTarget = g;
                    if (!clusterTarget.sourceBreakdown) {
                        const initSrc = clusterTarget.source || 'enemy';
                        clusterTarget.sourceBreakdown = { [initSrc]: clusterTarget.val };
                    }
                } else {
                    const gSrc = g.source || 'enemy';
                    if (g.sourceBreakdown) {
                        for (const [k, v] of Object.entries(g.sourceBreakdown)) {
                            clusterTarget.sourceBreakdown[k] = (clusterTarget.sourceBreakdown[k] || 0) + v;
                        }
                    } else {
                        clusterTarget.sourceBreakdown[gSrc] = (clusterTarget.sourceBreakdown[gSrc] || 0) + g.val;
                    }
                    clusterTarget.val += g.val;
                    gemPool.release(g);
                    state.gems.splice(i, 1);
                    i--;
                    excess--;
                }
            }
        }
    }

    for (let i = state.gems.length - 1; i >= 0; i--) {
        const g = state.gems[i];
        const d = Math.hypot(state.player.x - g.x, state.player.y - g.y);
        if (d < state.player.stats.magnet) g.mag = true;
        if (g.mag) {
            g.x += (state.player.x - g.x) * 0.12;
            g.y += (state.player.y - g.y) * 0.12;
        }
        if (d < state.player.r) {
            state.player.gainXp(g.val, g.source || 'enemy', g.sourceBreakdown);
            playSound('gem');
            AchievementSystem.onPickup();
            gemPool.release(g);
            state.gems.splice(i, 1);
        }
    }
}

export function drawPickups(ctx) {
    if (state.chips) {
        for (let i = 0; i < state.chips.length; i++) {
            state.chips[i].draw(ctx);
        }
    }

    const camX = state.camera.x;
    const camY = state.camera.y;
    const screenW = SCREEN_W();
    const screenH = SCREEN_H();

    for (let i = 0; i < state.gems.length; i++) {
        const g = state.gems[i];
        const sx = g.x - camX;
        const sy = g.y - camY;
        if (sx > -20 && sx < screenW + 20 && sy > -20 && sy < screenH + 20) {

            if (g.val >= 50) {
                ctx.fillStyle = '#ff00ff';
                ctx.fillRect(sx - 5, sy - 5, 10, 10);
            } else if (g.val >= 10) {
                ctx.fillStyle = '#00ffff';
                ctx.fillRect(sx - 4, sy - 4, 8, 8);
            } else {
                ctx.fillStyle = '#0f0';
                ctx.fillRect(sx - 3, sy - 3, 6, 6);
            }
        }
    }
}

export function resolvePickups(ctx) {
    updatePickups();
    if (ctx) drawPickups(ctx);
}
