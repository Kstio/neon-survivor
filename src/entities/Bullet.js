import { state } from '../GameState.js';
import { checkWall, raycastWall, findNearestEnemies, findNearestVisibleEnemies, getAccessibleTargetPoint } from '../utils.js';
import { particlePool } from './Particle.js';
import { ObjectPool } from '../Pool.js';
import { drawProjectile } from '../systems/WeaponVisuals.js';

let bhUidCounter = 1;
const BLACKHOLE_PULL_RANGE = 150;
const BLACKHOLE_CORE_SOFT_RADIUS = 36;
const BLACKHOLE_HYSTERESIS_PX = 25;
const BLACKHOLE_MAX_PULL_SPEED = 4.2;

export class Bullet {
    constructor(x, y, a, dmg, spd, isPlayer, isCrit = false, type = 'normal') {
        this.ownHitList = [];
        this.hitList = this.ownHitList;
        this.reset(x, y, a, dmg, spd, isPlayer, isCrit, type);
    }

    reset(x, y, a, dmg, spd, isPlayer, isCrit = false, type = 'normal') {
        this.x = x;
        this.y = y;
        this.prevX = x;
        this.prevY = y;
        this.angle = a;
        this.speed = spd;
        this.vx = Math.cos(a) * spd;
        this.vy = Math.sin(a) * spd;
        this.dmg = dmg;
        this.isPlayer = isPlayer;

        this.life = isPlayer ? (state.player?.bulletLife || 60) : 140;

        this.pierce = isPlayer ? (state.player?.stats.pierce || 0) : 0;
        this.ricochet = isPlayer ? (state.player?.stats.ricochet || 0) : 0;

        if (!this.ownHitList) this.ownHitList = [];
        this.ownHitList.length = 0;
        this.hitList = this.ownHitList;
        this.isCrit = isCrit;
        this.type = type;

        this.size = isCrit ? 7 : (isPlayer ? 4 : 6);
        this.pushForce = 1;
        this.isGatlingRound = false;
        this.isRearRound = false;
        this.isDevourer = false;
        this.isAcidSpit = false;
        this.bhUid = 0;
        this.color = undefined;
        this.returnState = 0;
        this.isThunderBlade = false;
        this.thunderOutTriggered = false;
        this.thunderRetTriggered = false;
        this.turnaroundPendingClear = false;
        this.turnX = x;
        this.turnY = y;
        this.isSplash = false;
        this.splashRadius = 0;
        this.isCryo = false;
        this.isAbsoluteZero = false;
        this.volleyHitStates = null;
        this.isNanite = false;
        this.isDimensionCut = false;
        this.hitWall = false;
        this.hasExploded = false;

        if (type === 'fatboy') {
            this.size = 10;
            this.pushForce = 3;
        } else if (type === 'boomerang') {
            this.life = 120;
            this.size = 8;
            this.returnState = 0;
            this.pierce = 999;
            this.ricochet = 0;
        } else if (type === 'blackhole') {
            this.bhUid = bhUidCounter++;
            this.life = 180;
            this.size = 5;
            this.pushForce = 0;
            this.speed = spd * 0.55;
            this.vx = Math.cos(a) * this.speed;
            this.vy = Math.sin(a) * this.speed;
            this.pierce = 999;
            this.ricochet = 0;
        } else if (type === 'katana') {
            this.life = 15;
            this.size = 40;
            this.pushForce = 14;
            this.pierce = 999;
            this.ricochet = 0;
            this.color = '#fff';
        } else if (type === 'deathray') {
            this.life = 20;
            this.speed = 40;
            this.vx = Math.cos(a) * this.speed;
            this.vy = Math.sin(a) * this.speed;
            this.pierce = 999;
            this.ricochet = 0;
            this.size = 10;
        } else if (type === 'plasma') {
            this.life = 80;
            this.size = 18;
            this.color = '#bf00ff';
            this.isSplash = true;
            this.splashRadius = 120;
            this.pierce = 0;
            this.ricochet = 0;
        } else if (type === 'supernova') {
            this.life = 90;
            this.size = 28;
            this.color = '#ffaa00';
            this.isSplash = true;
            this.splashRadius = 200;
            this.pierce = 0;
            this.ricochet = 0;
        } else if (type === 'cryo') {
            this.life = 45;
            this.size = 8;
            this.color = '#00ffff';
            this.isCryo = true;
            this.ricochet = 0;
        } else if (type === 'nanite') {
            this.life = 100;
            this.size = 5;
            this.color = '#00ffaa';
            this.isNanite = true;
            this.ricochet = 0;
            this.target = null;
        }

        this.active = true;
        return this;
    }

    update() {
        this.prevX = this.x;
        this.prevY = this.y;

        if (this.type === 'blackhole') {
            this.life--;
            if (this.life <= 0) return;

            this.vx *= 0.965;
            this.vy *= 0.965;

            const prevX = this.x;
            const prevY = this.y;
            const nextX = prevX + this.vx;
            const nextY = prevY + this.vy;
            const wallClearance = 4;

            if (checkWall(nextX, nextY, wallClearance) || raycastWall(prevX, prevY, nextX, nextY)) {
                let safeX = prevX;
                let safeY = prevY;
                if (checkWall(prevX, prevY, 2)) {
                    const accessible = getAccessibleTargetPoint(prevX, prevY, wallClearance);
                    safeX = accessible.x;
                    safeY = accessible.y;
                } else {
                    let lowT = 0;
                    let highT = 1;
                    for (let step = 0; step < 8; step++) {
                        const midT = (lowT + highT) * 0.5;
                        const mx = prevX + (nextX - prevX) * midT;
                        const my = prevY + (nextY - prevY) * midT;
                        if (!checkWall(mx, my, 2) && !raycastWall(prevX, prevY, mx, my)) {
                            safeX = mx;
                            safeY = my;
                            lowT = midT;
                        } else {
                            highT = midT;
                        }
                    }
                }
                this.x = safeX;
                this.y = safeY;
                this.vx = 0;
                this.vy = 0;
            } else {
                this.x = nextX;
                this.y = nextY;
            }

            this.size = Math.min(60, this.size + 0.5);

            const pullRange = BLACKHOLE_PULL_RANGE;
            const bhId = this.bhUid || 1;
            for (let i = 0; i < state.enemies.length; i++) {
                const e = state.enemies[i];
                if (e.isDead || e.mass >= 50) continue;
                const dist = Math.hypot(e.x - this.x, e.y - this.y);
                if (dist >= pullRange) continue;
                if (raycastWall(this.x, this.y, e.x, e.y)) continue;

                const isLockedToThis = (e._bhLockId === bhId);
                const effectiveScore = isLockedToThis ? (dist - BLACKHOLE_HYSTERESIS_PX) : dist;
                const prevBest = Number.isFinite(e._bhBestScore) ? e._bhBestScore : Infinity;

                if (effectiveScore < prevBest || e._bhSelectedId === bhId) {
                    e._bhBestScore = effectiveScore;
                    e._bhSelectedId = bhId;
                    e.bhDist = dist;

                    const resist = Math.min(0.95, Math.max(-0.2, e.knockbackResist || 0));
                    const mass = Math.max(0.4, e.mass || 1);

                    const pullFactor = Math.min(1.15, Math.max(0, (1 - resist) / mass));
                    e.bhPullFactor = pullFactor;

                    if (dist > 0.001 && pullFactor > 0) {
                        let radialScale;
                        if (dist < BLACKHOLE_CORE_SOFT_RADIUS) {
                            radialScale = dist / BLACKHOLE_CORE_SOFT_RADIUS;
                        } else {
                            const t = (pullRange - dist) / (pullRange - BLACKHOLE_CORE_SOFT_RADIUS);
                            radialScale = 0.45 + 0.55 * t;
                        }
                        const rawStep = BLACKHOLE_MAX_PULL_SPEED * pullFactor * radialScale;
                        const stepMag = Math.min(rawStep, dist * 0.45);
                        e.bhPullX = ((this.x - e.x) / dist) * stepMag;
                        e.bhPullY = ((this.y - e.y) / dist) * stepMag;
                    } else {
                        e.bhPullX = 0;
                        e.bhPullY = 0;
                    }
                }
            }

            if (state.frameCount % 5 === 0) {
                state.particles.push(particlePool.acquire(this.x, this.y, '#300060', 4));
            }
            return;
        }

        if (this.type === 'boomerang') {
            this.life--;
            if (this.returnState === 0 && (this.speed < 1 || this.life < 60)) {
                this.returnState = 1;
                this.turnaroundPendingClear = true;
                this.turnX = this.x;
                this.turnY = this.y;
            }

            if (this.returnState === 0) {
                this.x += this.vx;
                this.y += this.vy;
                this.speed *= 0.95;
            } else {
                const dx = state.player.x - this.x;
                const dy = state.player.y - this.y;
                const angle = Math.atan2(dy, dx);
                this.speed += 0.5;
                this.vx = Math.cos(angle) * this.speed;
                this.vy = Math.sin(angle) * this.speed;
                this.x += this.vx;
                this.y += this.vy;

                if (Math.hypot(dx, dy) < 20) this.life = 0;
            }
            if(state.frameCount % 3 === 0) this.spawnParticles(this.isThunderBlade ? '#00e5ff' : '#0f0', 1);
            return;
        }

        if (this.type === 'katana') {
            this.x = state.player.x + Math.cos(this.angle) * 40;
            this.y = state.player.y + Math.sin(this.angle) * 40;
            this.prevX = this.x;
            this.prevY = this.y;
            this.life--;
            return;
        }

        if (this.type === 'nanite') {
            const near = findNearestVisibleEnemies(this.x, this.y, 1, 750)[0];
            if (near) {
                const targetAngle = Math.atan2(near.y - this.y, near.x - this.x);
                this.vx += Math.cos(targetAngle) * 0.8;
                this.vy += Math.sin(targetAngle) * 0.8;
                const spd = Math.hypot(this.vx, this.vy) || 1;
                if (spd > 9) {
                    this.vx = (this.vx / spd) * 9;
                    this.vy = (this.vy / spd) * 9;
                }
            }
            if (state.frameCount % 4 === 0) this.spawnParticles('#00ffaa', 1);
        }

        if (this.type === 'supernova' && state.frameCount % 3 === 0) {
            this.spawnParticles('#ffaa00', 1);
        }

        const prevX = this.x;
        const prevY = this.y;
        const nextX = prevX + this.vx;
        const nextY = prevY + this.vy;
        this.x = nextX;
        this.y = nextY;
        this.life--;

        const wallR = 4;
        if (checkWall(nextX, nextY, wallR) || raycastWall(prevX, prevY, nextX, nextY)) {
            let lowT = 0;
            let highT = 1;
            let safeX = prevX;
            let safeY = prevY;
            let hitX = nextX;
            let hitY = nextY;

            if (!checkWall(prevX, prevY, 2)) {
                for (let step = 0; step < 10; step++) {
                    const midT = (lowT + highT) * 0.5;
                    const mx = prevX + (nextX - prevX) * midT;
                    const my = prevY + (nextY - prevY) * midT;
                    if (!checkWall(mx, my, wallR) && !raycastWall(prevX, prevY, mx, my)) {
                        safeX = mx;
                        safeY = my;
                        lowT = midT;
                    } else {
                        hitX = mx;
                        hitY = my;
                        highT = midT;
                    }
                }
            }

            if (this.ricochet > 0 && !this.isSplash) {
                this.ricochet--;
                const stepDx = hitX - safeX;
                const stepDy = hitY - safeY;
                const probeX = Math.abs(stepDx) > 0.001 ? hitX : (safeX + Math.sign(this.vx) * 2.0);
                const probeY = Math.abs(stepDy) > 0.001 ? hitY : (safeY + Math.sign(this.vy) * 2.0);

                const blockedX = Math.abs(this.vx) > 0.0001 && (
                    checkWall(probeX, safeY, wallR) ||
                    checkWall(safeX + Math.sign(this.vx) * 2.0, safeY, wallR) ||
                    raycastWall(safeX, safeY, probeX, safeY)
                );
                const blockedY = Math.abs(this.vy) > 0.0001 && (
                    checkWall(safeX, probeY, wallR) ||
                    checkWall(safeX, safeY + Math.sign(this.vy) * 2.0, wallR) ||
                    raycastWall(safeX, safeY, safeX, probeY)
                );

                if (blockedX && !blockedY) {
                    this.vx = -this.vx;
                } else if (blockedY && !blockedX) {
                    this.vy = -this.vy;
                } else {
                    this.vx = -this.vx;
                    this.vy = -this.vy;
                }
                this.angle = Math.atan2(this.vy, this.vx);

                const remT = Math.max(0.05, 1 - lowT);
                const reflX = safeX + this.vx * remT;
                const reflY = safeY + this.vy * remT;
                if (!checkWall(reflX, reflY, wallR) && !raycastWall(safeX, safeY, reflX, reflY)) {
                    this.prevX = safeX;
                    this.prevY = safeY;
                    this.x = reflX;
                    this.y = reflY;
                } else {
                    this.x = safeX;
                    this.y = safeY;
                }
            } else {
                this.x = safeX;
                this.y = safeY;
                this.hitWall = true;
            }
            this.spawnParticles('#fff', 2);
        }
    }

    draw(ctx) {
        drawProjectile(ctx, this, BLACKHOLE_PULL_RANGE);
    }

    spawnParticles(color, count) {
        for (let i = 0; i < count; i++) {
            state.particles.push(particlePool.acquire(this.x, this.y, color, 2 + Math.random() * 2));
        }
    }
}

export const bulletPool = new ObjectPool(
    (x, y, a, dmg, spd, isPlayer, isCrit, type) => new Bullet(x, y, a, dmg, spd, isPlayer, isCrit, type)
);
