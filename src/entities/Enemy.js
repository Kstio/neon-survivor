import { drawHostile } from '../systems/HullRenderer.js';
import { state, triggerShake, triggerHitStop, AttackCoordinator } from '../GameState.js';
import { checkWall, calcDmg, raycastWall, canPassClearance, isPointOnScreen, resolveWallOverlap, getAccessibleTargetPoint, moveEntityWithWalls } from '../utils.js';
import { NavigationSystem } from '../systems/NavigationSystem.js';
import { bulletPool } from './Bullet.js';
import { particlePool, floatTextPool } from './Particle.js';
import { DamageTextSystem } from '../systems/DamageTextSystem.js';
import { SCREEN_W, SCREEN_H, SKILL_DB, BALANCE, ACHIEVEMENTS_DB } from '../constants.js';
import { playSound } from '../sounds.js';
import { chipPool, gemPool } from './Items.js';
import { Meta } from '../MetaGame.js';
import { ObjectPool } from '../Pool.js';
import { AchievementSystem } from '../systems/AchievementSystem.js';

let idCounter = 0;

const BASIC_WINDUP_TICKS = 14;
const BASIC_RECOVERY_TICKS = 46;

const SHOOT_FIRE_INTERVAL = 140;
const SHOOT_WINDUP_FRAMES = 25;

const TITAN_CAPTURE_RANGE = 400;
const TITAN_CAPTURE_WINDUP_FRAMES = 45;
const TITAN_BUFF_WINDUP_FRAMES = 35;

const KAMIKAZE_ARM_FRAMES = 30;
const KAMIKAZE_EXPLOSION_RADIUS = 90;

const DASHER_CYCLE_FRAMES = 150;
const DASHER_WINDUP_FRAMES = 25;
const DASHER_BURST_FRAMES = 20;
const DASHER_BURST_MULT = 2.5;

export const ENEMY_RADII = Object.freeze({
    basic: 16,
    tank: 28,
    runner: 12,
    shooter: 18,
    kamikaze: 14,
    dasher: 16,
    titan: 60,
    elite: 22,
    spitter: 19,
    stalker: 15,
    shield_bearer: 24,
    swarmer: 9
});

export class Enemy {
    constructor(type, x, y) {
        this.id = undefined;
        this.reset(type, x, y);
    }

    reset(type, x, y) {
        if (this.id !== undefined) {
            AttackCoordinator.releaseAll(this.id);
            NavigationSystem.releaseEnemy(this.id);
            const cooldownMap = state.player?.orbitalHitCooldowns;
            if (cooldownMap && cooldownMap.size > 0) {
                const suffix = `:${this.id}`;
                for (const key of cooldownMap.keys()) {
                    if (key.endsWith(suffix)) {
                        cooldownMap.delete(key);
                    }
                }
            }
        }
        this.id = idCounter++;

        this.x = x;
        this.y = y;
        this.type = type;
        this.pushX = 0;
        this.pushY = 0;
        this.slashPushX = 0;
        this.slashPushY = 0;
        this._bhLockId = -1;
        this._bhSelectedId = -1;
        this._bhBestScore = Infinity;
        this.bhPullX = 0;
        this.bhPullY = 0;
        this.bhDist = Infinity;
        this.bhPullFactor = 0;
        this.attackCd = 0;
        this.isDead = false;
        this.buffTimer = 0;
        this.freezeTimer = 0;

        this.flashTimer = 0;

        this.spawnTimer = BALANCE.spawnTelegraphFrames;

        this.vx = 0;
        this.vy = 0;

        this.kamikazeArmed = false;
        this.kamikazeArmTimer = 0;
        this.hasKamikazeSlot = false;
        this.captureWindup = 0;
        this.buffWindup = 0;
        this.attackWindup = 0;
        this.hasLos = false;
        this.hasRangedSlot = false;
        this.isAimingRanged = false;

        this.lastSeenPlayerX = state.player ? state.player.x : x;
        this.lastSeenPlayerY = state.player ? state.player.y : y;
        this.hasPlayerLos = true;
        this.isSearching = false;
        this.searchTimer = 0;
        this.searchWpX = null;
        this.searchWpY = null;
        this.searchWpId = -1;
        this.offscreenLostTimer = 0;

        const hpMultiplier = Math.min(6, state.globalDifficulty);
        const dmgMultiplier = Math.min(3.5, state.globalDifficulty);

        const mercy = BALANCE.earlyMercy;
        const mercyProgress = Math.min(1, state.gameTime / mercy.durationSec);
        const earlyDmgMult = mercy.minMultiplier + (1 - mercy.minMultiplier) * mercyProgress;

        const speedBoost = 1 + Math.min(0.25, state.gameTime / 600);

        const baseChipVal = 1 + Math.floor(state.gameTime / 300);

        this.hp = 65 * hpMultiplier;
        this.baseSpeed = 3.2 * speedBoost;
        this.size = ENEMY_RADII[type] ?? ENEMY_RADII.basic;
        this.color = '#f05';
        this.xp = 15;
        this.dmg = 8 * dmgMultiplier;
        this.chipValue = baseChipVal;
        this.dropChance = 0.15;
        this.shootTimer = Math.floor(Math.random() * 100);

        this.turnSpeed = 0.15;
        this.sensorRange = 120;

        this.mass = 1;
        this.knockbackResist = 0;

        if (type === 'tank') {
            this.hp = 300 * hpMultiplier;
            this.baseSpeed = 1.8 * speedBoost;
            this.color = '#ff8800';
            this.xp = 50;
            this.dmg = 25 * dmgMultiplier;
            this.turnSpeed = 0.08;
            this.chipValue = baseChipVal * 5;
            this.dropChance = 1.0;
            this.mass = 8;
            this.knockbackResist = 0.6;
        }
        else if (type === 'runner') {
            this.hp = 35 * hpMultiplier;
            this.baseSpeed = 4.0 * speedBoost;
            this.color = '#ff0055';
            this.xp = 20;
            this.dmg = 7 * dmgMultiplier;
            this.turnSpeed = 0.25;
            this.chipValue = baseChipVal * 2;
            this.dropChance = 0.25;
            this.mass = 0.8;
        }
        else if (type === 'shooter') {
            this.hp = 70 * hpMultiplier;
            this.baseSpeed = 2.5 * speedBoost;
            this.color = '#a0f';
            this.xp = 30;
            this.dmg = 15 * dmgMultiplier;
            this.chipValue = baseChipVal * 2;
            this.dropChance = 0.25;
            this.mass = 1.2;
        }
        else if (type === 'kamikaze') {
            this.hp = 30 * hpMultiplier;
            this.baseSpeed = 4.5 * speedBoost;
            this.color = '#00ff00';
            this.xp = 25;

            this.dmg = 30 * Math.min(2.0, dmgMultiplier);
            this.turnSpeed = 0.2;
            this.mass = 0.5;
            this.kamikazeArmed = false;
            this.kamikazeArmTimer = 0;
        }
        else if (type === 'dasher') {
            this.hp = 120 * hpMultiplier;
            this.baseSpeed = 4.3 * speedBoost;
            this.color = '#00ffff';
            this.xp = 35;
            this.dmg = 15 * dmgMultiplier;
            this.chipValue = baseChipVal * 3;
            this.dropChance = 0.3;
            this.mass = 2;
        }
        else if (type === 'titan') {
            this.hp = 8000 * hpMultiplier;
            this.baseSpeed = 1.8 * speedBoost;
            this.color = '#700000';
            this.xp = 2000;

            this.dmg = 45 * Math.min(2.2, dmgMultiplier);
            this.abilityCaptureCd = 300;
            this.abilityBuffCd = 600;
            this.captureWindup = 0;
            this.buffWindup = 0;
            this.turnSpeed = 0.05;
            this.sensorRange = 180;
            this.chipValue = baseChipVal * 50;
            this.dropChance = 1.0;
            this.mass = 100;
            this.knockbackResist = 0.95;
        }
        else if (type === 'elite') {
            this.hp = 250 * hpMultiplier;
            this.baseSpeed = 3.0 * speedBoost;
            this.color = '#ffff00';
            this.xp = 80;
            this.dmg = 20 * dmgMultiplier;
            this.chipValue = baseChipVal * 10;
            this.dropChance = 1.0;
            this.mass = 5;
            this.knockbackResist = 0.5;
        }
        else if (type === 'spitter') {
            this.hp = 95 * hpMultiplier;
            this.baseSpeed = 2.4 * speedBoost;
            this.color = '#39ff14';
            this.xp = 35;
            this.dmg = 12 * dmgMultiplier;
            this.chipValue = baseChipVal * 2;
            this.dropChance = 0.3;
            this.mass = 1.4;
            this.spitTimer = Math.floor(Math.random() * 50);
            this.spitInterval = 150;
            this.spitWindup = 30;
        }
        else if (type === 'stalker') {
            this.hp = 85 * hpMultiplier;
            this.baseSpeed = 3.8 * speedBoost;
            this.color = '#bf00ff';
            this.xp = 40;
            this.dmg = 24 * dmgMultiplier;
            this.chipValue = baseChipVal * 3;
            this.dropChance = 0.35;
            this.mass = 1.0;
            this.cloakAlpha = 0.2;
            this.isPouncing = false;
            this.pounceTimer = 0;
            this.flankAngle = (Math.random() < 0.5 ? 1 : -1) * (Math.PI * 0.55);
        }
        else if (type === 'shield_bearer') {
            this.hp = 240 * hpMultiplier;
            this.baseSpeed = 2.0 * speedBoost;
            this.color = '#ffaa00';
            this.xp = 65;
            this.dmg = 18 * dmgMultiplier;
            this.chipValue = baseChipVal * 4;
            this.dropChance = 0.45;
            this.mass = 6;
            this.knockbackResist = 0.65;
            this.shieldAngle = 0;
            this.shieldArc = Math.PI * 0.65;
        }
        else if (type === 'swarmer') {
            this.hp = 18 * hpMultiplier;
            this.baseSpeed = 5.0 * speedBoost;
            this.color = '#ff0055';
            this.xp = 10;
            this.dmg = 5 * dmgMultiplier;
            this.chipValue = baseChipVal;
            this.dropChance = 0.1;
            this.mass = 0.4;
            this.knockbackResist = -0.2;
        }

        this.dmg *= earlyDmgMult;

        this.maxHp = this.hp;
        this.dashTimer = 0;

        this.pathRecalcTimer = 0;

        this.pathRecalcInterval = 3 + (this.id % 4);
        this.cachedDirX = 0;
        this.cachedDirY = 0;

        NavigationSystem.releaseEnemy(this.id);
        this.navPath = null;
        this.navIndex = 0;
        this.navTargetX = 0;
        this.navTargetY = 0;
        this.navRecalcTimer = 0;
        this.navPendingRetry = false;
        this.navStatus = 'direct';
        this.strafeDir = (this.id % 2 === 0) ? 1 : -1;
        this.progressTimer = 0;
        this.progressAnchorX = x;
        this.progressAnchorY = y;
        this.stuckCount = 0;

        this.active = true;
        return this;
    }

    update() {
        if (this.attackCd > 0) this.attackCd--;
        if (this.spawnTimer > 0) this.spawnTimer--;
        if (this.flashTimer > 0) this.flashTimer--;
        if (!state.player) return;

        if (this.type === 'kamikaze' && this.kamikazeArmed) {
            this.kamikazeArmTimer--;
            this.vx *= 0.85;
            this.vy *= 0.85;
            if (this.kamikazeArmTimer <= 0) {
                const distNow = Math.hypot(state.player.x - this.x, state.player.y - this.y);
                if (distNow < KAMIKAZE_EXPLOSION_RADIUS) {
                    state.player.takeDamage(this.dmg, this.type);
                    const kdx = state.player.x - this.x;
                    const kdy = state.player.y - this.y;
                    const klen = Math.hypot(kdx, kdy);
                    const nx = klen > 0.001 ? kdx / klen : 1;
                    const ny = klen > 0.001 ? kdy / klen : 0;
                    state.player.pushX = nx * 10;
                    state.player.pushY = ny * 10;
                }
                triggerShake(5, 10);
                for (let k = 0; k < 10; k++) {
                    state.particles.push(particlePool.acquire(this.x, this.y, '#ff6600', 4));
                }
                AttackCoordinator.releaseKamikaze(this.id);
                this.hasKamikazeSlot = false;
                this.takeDamage(9999, false);
            }
            return;
        }

        let currentMaxSpeed = this.baseSpeed;

        if (this.buffTimer > 0) {
            this.buffTimer--;
            currentMaxSpeed *= 1.3;
            if (state.frameCount % 15 === 0) state.particles.push(particlePool.acquire(this.x, this.y, '#ff0000', 2));
        }

        if (this.freezeTimer > 0) {
            this.freezeTimer--;
            const slowFactor = 0.5 + (this.knockbackResist * 0.4);
            currentMaxSpeed *= slowFactor;

            if (state.frameCount % 30 === 0) {
                this.takeDamage(2, false);
            }
        }

        let inSlowZone = false;
        for (const zone of state.slowZones) {
            if (this.x > zone.x && this.x < zone.x + zone.w &&
                this.y > zone.y && this.y < zone.y + zone.h) {
                inSlowZone = true;
                break;
            }
        }
        if (inSlowZone) currentMaxSpeed *= 0.5;

        if (this.type === 'titan') this.updateTitanLogic();
        if (this.type === 'dasher') {
            this.dashTimer++;
            const windupStart = DASHER_CYCLE_FRAMES - DASHER_BURST_FRAMES - DASHER_WINDUP_FRAMES;
            const burstStart = DASHER_CYCLE_FRAMES - DASHER_BURST_FRAMES;

            if (this.dashTimer === windupStart) {
                const distCheck = Math.hypot(state.player.x - this.x, state.player.y - this.y);
                const canLunge = this.hasPlayerLos && distCheck < 420 && AttackCoordinator.requestLunge(this.id, state.frameCount);
                if (!canLunge) {
                    this.dashTimer = windupStart - 1;
                }
            }

            if (this.dashTimer >= windupStart && this.dashTimer < burstStart) {
                currentMaxSpeed *= 0.4;
            } else if (this.dashTimer >= burstStart && this.dashTimer < DASHER_CYCLE_FRAMES) {
                currentMaxSpeed *= DASHER_BURST_MULT;
            } else if (this.dashTimer >= DASHER_CYCLE_FRAMES) {
                AttackCoordinator.releaseLunge(this.id);
                this.dashTimer = 0;
            }
        }

        let isStealthed = state.player.stealthTimer > 0;
        let distToPlayer = Math.hypot(state.player.x - this.x, state.player.y - this.y);

        if ((this.id + state.frameCount) % 15 === 0) {
            if (isStealthed || distToPlayer > 2200) {
                this.hasPlayerLos = false;
            } else {
                this.hasPlayerLos = !raycastWall(this.x, this.y, state.player.x, state.player.y);
            }

            if (this.hasPlayerLos) {
                this.lastSeenPlayerX = state.player.x;
                this.lastSeenPlayerY = state.player.y;
                this.isSearching = false;
                this.searchTimer = 0;
                this.searchWpX = null;
                this.searchWpY = null;
                this.offscreenLostTimer = 0;
            }
        }

        const minRecycleDist = Math.max(1650, Math.hypot(SCREEN_W() / 2, SCREEN_H() / 2) + 450);
        if (distToPlayer > minRecycleDist && !this.hasPlayerLos && this.isSearching && !isPointOnScreen(this.x, this.y, 120)) {
            this.offscreenLostTimer++;
            if (this.offscreenLostTimer > 900) {
                this.isDead = true;
                AttackCoordinator.releaseAll(this.id);
                NavigationSystem.releaseEnemy(this.id);
                return;
            }
        } else {
            this.offscreenLostTimer = 0;
        }

        let targetX = state.player.x;
        let targetY = state.player.y;

        if (isStealthed) {
            const wanderA = (this.id * 1.5 + state.frameCount * 0.03);
            targetX = this.x + Math.cos(wanderA) * 200;
            targetY = this.y + Math.sin(wanderA) * 200;
        } else if (!this.hasPlayerLos && this.lastSeenPlayerX !== null) {
            targetX = this.lastSeenPlayerX;
            targetY = this.lastSeenPlayerY;
            const cleanLast = getAccessibleTargetPoint(targetX, targetY, this.size + 1);
            const distToLast = Math.hypot(cleanLast.x - this.x, cleanLast.y - this.y);
            const canReachLast = !raycastWall(this.x, this.y, targetX, targetY) &&
                canPassClearance(this.x, this.y, cleanLast.x, cleanLast.y, Math.max(12, this.size - 2));
            if (distToLast < Math.max(38, this.size + 18) && canReachLast) {
                this.isSearching = true;
            }
        }

        if (this.isSearching && !this.hasPlayerLos) {
            this.searchTimer++;
            currentMaxSpeed *= 0.8;
            const reachedSearchWp = this.searchWpX !== null &&
                Math.hypot(this.searchWpX - this.x, this.searchWpY - this.y) < Math.max(36, this.size + 14);
            if (this.searchWpX === null || reachedSearchWp || this.searchTimer % 120 === 1) {
                const swp = NavigationSystem.getSearchWaypoint(
                    this.x,
                    this.y,
                    this.size,
                    this.searchWpId,
                    this.id + Math.floor(this.searchTimer / 120)
                );
                if (swp) {
                    this.searchWpX = swp.x;
                    this.searchWpY = swp.y;
                    this.searchWpId = swp.id;
                }
            }
            if (this.searchWpX !== null) {
                targetX = this.searchWpX;
                targetY = this.searchWpY;
            } else {
                const patrolA = (this.id * 1.3 + Math.floor(this.searchTimer / 60) * 1.1);
                targetX = this.x + Math.cos(patrolA) * 140;
                targetY = this.y + Math.sin(patrolA) * 140;
            }
        }

        let dx = targetX - this.x;
        let dy = targetY - this.y;
        let targetDist = Math.hypot(dx, dy);
        if (targetDist > 0) {
            dx /= targetDist;
            dy /= targetDist;
        }

        let intentMode = 'pursue';

        if (this.type === 'kamikaze') {
            if (!this.kamikazeArmed) {
                if (!this.hasKamikazeSlot && distToPlayer <= 240 && this.spawnTimer <= 0 && !isStealthed && this.hasPlayerLos) {
                    if (AttackCoordinator.requestKamikaze(this.id, state.frameCount)) {
                        this.hasKamikazeSlot = true;
                    }
                }

                if (!this.hasKamikazeSlot) {

                    if (!isStealthed && this.hasPlayerLos) {
                        const angleFromPlayer = Math.atan2(this.y - state.player.y, this.x - state.player.x);
                        if (distToPlayer < 95) {
                            intentMode = 'retreat';
                            dx = Math.cos(angleFromPlayer + 0.35 * this.strafeDir);
                            dy = Math.sin(angleFromPlayer + 0.35 * this.strafeDir);
                        } else if (distToPlayer < 120) {
                            intentMode = 'strafe';
                            dx = Math.cos(angleFromPlayer + 1.25 * this.strafeDir);
                            dy = Math.sin(angleFromPlayer + 1.25 * this.strafeDir);
                        }
                    }
                } else {
                    if (isStealthed) {

                        AttackCoordinator.releaseKamikaze(this.id);
                        this.hasKamikazeSlot = false;
                    } else if (distToPlayer < this.size + state.player.r + 8 && this.spawnTimer <= 0) {

                        this.kamikazeArmed = true;
                        this.kamikazeArmTimer = KAMIKAZE_ARM_FRAMES;
                    }
                }
            }
        }

        if (this.type === 'basic') {
            if (this.attackWindup > 0) {
                this.attackWindup--;
                currentMaxSpeed *= 0.5;

                if (this.attackWindup === 0) {
                    const hitDist = Math.hypot(state.player.x - this.x, state.player.y - this.y);
                    const reach = this.size + state.player.r;
                    if (hitDist <= reach && !raycastWall(this.x, this.y, state.player.x, state.player.y)) {
                        state.player.takeDamage(this.dmg, this.type);
                        const kdx = state.player.x - this.x;
                        const kdy = state.player.y - this.y;
                        const klen = Math.hypot(kdx, kdy);
                        const nx = klen > 0.001 ? kdx / klen : 1;
                        const ny = klen > 0.001 ? kdy / klen : 0;
                        state.player.pushX = nx * 8;
                        state.player.pushY = ny * 8;
                    }
                    this.attackCd = BASIC_RECOVERY_TICKS;
                }
            } else if (this.attackCd <= 0 && this.spawnTimer <= 0 && !isStealthed) {
                const triggerDist = this.size + state.player.r + 4;
                if (distToPlayer <= triggerDist && !raycastWall(this.x, this.y, state.player.x, state.player.y)) {
                    this.attackWindup = BASIC_WINDUP_TICKS;
                }
            }
        }

        if (this.type === 'shooter') {
            if (!isStealthed && this.hasPlayerLos) {
                const angleToPlayer = Math.atan2(state.player.y - this.y, state.player.x - this.x);
                if (distToPlayer < 200) {
                    intentMode = 'retreat';
                    dx = -Math.cos(angleToPlayer);
                    dy = -Math.sin(angleToPlayer);
                } else if (distToPlayer < 350) {
                    intentMode = 'strafe';
                    const strafeA = angleToPlayer + (Math.PI / 2) * this.strafeDir;
                    dx = Math.cos(strafeA);
                    dy = Math.sin(strafeA);
                    currentMaxSpeed *= 0.65;
                }
            }

            const windupStart = SHOOT_FIRE_INTERVAL - SHOOT_WINDUP_FRAMES;

            if (!this.isAimingRanged) {
                this.shootTimer++;
                if (this.shootTimer >= windupStart) {
                    const canShoot = this.spawnTimer <= 0 && !isStealthed && this.hasPlayerLos && distToPlayer <= 380 && AttackCoordinator.requestRanged(this.id, state.frameCount);
                    if (canShoot) {
                        this.hasRangedSlot = true;
                        this.isAimingRanged = true;
                        this.hasLos = true;
                        this.shootTimer = windupStart;
                    } else {
                        this.shootTimer = windupStart - 1;
                        this.hasLos = false;
                    }
                }
            } else {

                if (isStealthed || !this.hasPlayerLos || distToPlayer > 420) {
                    this.isAimingRanged = false;
                    this.hasLos = false;
                    if (this.hasRangedSlot) {
                        AttackCoordinator.releaseRanged(this.id);
                        this.hasRangedSlot = false;
                    }
                    this.shootTimer = windupStart - 20;
                } else {
                    this.shootTimer++;
                    if (this.shootTimer >= SHOOT_FIRE_INTERVAL && this.spawnTimer <= 0) {
                        const angleToPlayer = Math.atan2(state.player.y - this.y, state.player.x - this.x);
                        state.enemyBullets.push(bulletPool.acquire(this.x, this.y, angleToPlayer, this.dmg, 6, false));
                        this.shootTimer = 0;
                        this.isAimingRanged = false;
                        this.hasLos = false;
                        if (this.hasRangedSlot) {
                            AttackCoordinator.releaseRanged(this.id);
                            this.hasRangedSlot = false;
                        }
                    }
                }
            }
        }

        if (this.type === 'spitter') {
            if (!isStealthed && this.hasPlayerLos) {
                const angleToPlayer = Math.atan2(state.player.y - this.y, state.player.x - this.x);
                if (distToPlayer < 240) {
                    intentMode = 'retreat';
                    dx = -Math.cos(angleToPlayer);
                    dy = -Math.sin(angleToPlayer);
                } else if (distToPlayer < 420) {
                    intentMode = 'strafe';
                    const strafeA = angleToPlayer + (Math.PI / 2) * this.strafeDir;
                    dx = Math.cos(strafeA);
                    dy = Math.sin(strafeA);
                    currentMaxSpeed *= 0.65;
                }
            }

            const spitWindupStart = this.spitInterval - this.spitWindup;

            if (!this.isAimingRanged) {
                this.spitTimer++;
                if (this.spitTimer >= spitWindupStart) {
                    const canSpit = this.spawnTimer <= 0 && !isStealthed && this.hasPlayerLos && distToPlayer <= 450 && AttackCoordinator.requestRanged(this.id, state.frameCount);
                    if (canSpit) {
                        this.hasRangedSlot = true;
                        this.isAimingRanged = true;
                        this.spitTimer = spitWindupStart;
                    } else {
                        this.spitTimer = spitWindupStart - 1;
                    }
                }
            } else {

                if (isStealthed || !this.hasPlayerLos || distToPlayer > 500) {
                    this.isAimingRanged = false;
                    if (this.hasRangedSlot) {
                        AttackCoordinator.releaseRanged(this.id);
                        this.hasRangedSlot = false;
                    }
                    this.spitTimer = spitWindupStart - 20;
                } else {
                    this.spitTimer++;
                    if (this.spitTimer >= this.spitInterval && this.spawnTimer <= 0) {
                        const angleToPlayer = Math.atan2(state.player.y - this.y, state.player.x - this.x);
                        const spit = bulletPool.acquire(this.x, this.y, angleToPlayer, this.dmg, 5.5, false);
                        spit.isAcidSpit = true;
                        spit.color = '#39ff14';
                        state.enemyBullets.push(spit);
                        this.spitTimer = 0;
                        this.isAimingRanged = false;
                        if (this.hasRangedSlot) {
                            AttackCoordinator.releaseRanged(this.id);
                            this.hasRangedSlot = false;
                        }
                    }
                }
            }
        }

        if (this.type === 'stalker') {
            if (this.isPouncing) {
                this.pounceTimer--;
                this.cloakAlpha = Math.min(0.9, this.cloakAlpha + 0.08);
                currentMaxSpeed *= 1.7;
                if (this.pounceTimer <= 0) {
                    this.isPouncing = false;
                    this.flankAngle = -this.flankAngle;
                }
            } else {
                this.cloakAlpha = Math.max(0.18, this.cloakAlpha - 0.03);
                if (distToPlayer < 180 && this.spawnTimer <= 0 && !isStealthed && this.hasPlayerLos) {
                    this.isPouncing = true;
                    this.pounceTimer = 45;
                } else if (!isStealthed && this.hasPlayerLos) {
                    const flankX = state.player.x + Math.cos(this.flankAngle) * 140;
                    const flankY = state.player.y + Math.sin(this.flankAngle) * 140;
                    if (Math.hypot(flankX - this.x, flankY - this.y) < 42) {
                        this.flankAngle = -this.flankAngle;
                    }
                    targetX = state.player.x + Math.cos(this.flankAngle) * 140;
                    targetY = state.player.y + Math.sin(this.flankAngle) * 140;
                    const tdx = targetX - this.x;
                    const tdy = targetY - this.y;
                    const tlen = Math.hypot(tdx, tdy) || 1;
                    dx = tdx / tlen;
                    dy = tdy / tlen;
                }
            }
        }

        if (this.type === 'shield_bearer') {
            this.shieldAngle = Math.atan2(state.player.y - this.y, state.player.x - this.x);
        }

        if (this.navRecalcTimer > 0) this.navRecalcTimer--;
        const cleanTarget = getAccessibleTargetPoint(targetX, targetY, this.size + 1);
        let directClear = false;

        if (intentMode === 'retreat' || intentMode === 'strafe') {

            directClear = true;
            this.navPath = null;
            this.navIndex = 0;
            this.navPendingRetry = false;
            this.navStatus = 'direct';
            this.stuckCount = 0;
            NavigationSystem.releaseEnemy(this.id);

            const rayLen = Math.min(this.sensorRange, Math.max(42, this.size * 2.2));
            let bestDirX = dx;
            let bestDirY = dy;

            if (!canPassClearance(this.x, this.y, this.x + dx * rayLen, this.y + dy * rayLen, this.size)) {
                const awayX = this.x - state.player.x;
                const awayY = this.y - state.player.y;
                const awayLen = Math.hypot(awayX, awayY) || 1;
                const nAwayX = awayX / awayLen;
                const nAwayY = awayY / awayLen;

                let foundTacticalDir = false;
                if (intentMode === 'strafe') {
                    this.strafeDir = -this.strafeDir;
                    const flipX = -dx;
                    const flipY = -dy;
                    if (canPassClearance(this.x, this.y, this.x + flipX * rayLen, this.y + flipY * rayLen, this.size)) {
                        bestDirX = flipX;
                        bestDirY = flipY;
                        foundTacticalDir = true;
                    }
                }

                if (!foundTacticalDir) {
                    const baseAngle = Math.atan2(dy, dx);
                    const step = 18 * (Math.PI / 180);
                    const hasPrevDir = (this.cachedDirX !== 0 || this.cachedDirY !== 0);
                    const prevDirX = hasPrevDir ? this.cachedDirX : (-nAwayY * this.strafeDir);
                    const prevDirY = hasPrevDir ? this.cachedDirY : (nAwayX * this.strafeDir);
                    let bestScore = -Infinity;
                    for (let i = 1; i <= 8; i++) {
                        for (const sign of [1, -1]) {
                            const candA = baseAngle + sign * step * i;
                            const cx = Math.cos(candA);
                            const cy = Math.sin(candA);
                            if (canPassClearance(this.x, this.y, this.x + cx * rayLen, this.y + cy * rayLen, this.size)) {
                                const alignIntent = cx * dx + cy * dy;
                                const alignAway = cx * nAwayX + cy * nAwayY;
                                const alignCont = cx * prevDirX + cy * prevDirY;
                                const score = alignIntent * 0.65 + alignAway * 0.85 + alignCont * 0.45;
                                if (score > bestScore) {
                                    bestScore = score;
                                    bestDirX = cx;
                                    bestDirY = cy;
                                    foundTacticalDir = true;
                                }
                            }
                        }
                        if (foundTacticalDir && bestScore > 0.6) break;
                    }
                }
            }

            this.cachedDirX = bestDirX;
            this.cachedDirY = bestDirY;
        } else {
            directClear = canPassClearance(this.x, this.y, cleanTarget.x, cleanTarget.y, this.size) &&
                !raycastWall(this.x, this.y, targetX, targetY);

            if (directClear) {

                this.navPath = null;
                this.navIndex = 0;
                this.navPendingRetry = false;
                this.navStatus = 'direct';
                this.stuckCount = 0;
                NavigationSystem.releaseEnemy(this.id);
                const cdx = cleanTarget.x - this.x;
                const cdy = cleanTarget.y - this.y;
                const clen = Math.hypot(cdx, cdy) || 1;
                this.cachedDirX = cdx / clen;
                this.cachedDirY = cdy / clen;
            } else {

                const targetMoved = this.navPath !== null &&
                    !this.navPendingRetry &&
                    Math.hypot(this.navTargetX - targetX, this.navTargetY - targetY) > 120;
                if (this.navRecalcTimer <= 0 || targetMoved) {
                    const navResult = NavigationSystem.findPath(this.x, this.y, targetX, targetY, this.size, this.id);
                    if (navResult && navResult.status === 'found') {
                        this.navPath = navResult.path;
                        this.navIndex = 0;
                        this.navTargetX = targetX;
                        this.navTargetY = targetY;
                        this.navPendingRetry = false;
                        this.navStatus = 'found';
                        this.navRecalcTimer = 28 + (this.id % 16);
                    } else if (navResult && navResult.status === 'postponed') {

                        this.navPendingRetry = true;
                        this.navStatus = 'postponed';
                        this.navRecalcTimer = 3 + (this.id % 2);
                    } else {
                        const esc = NavigationSystem.findEscapeWaypoint(this.x, this.y, targetX, targetY, this.size);
                        if (esc) {
                            this.navPath = [esc, { x: cleanTarget.x, y: cleanTarget.y }];
                            this.navIndex = 0;
                            this.navTargetX = targetX;
                            this.navTargetY = targetY;
                            this.navStatus = 'escape';
                        } else {
                            this.navPath = null;
                            this.navIndex = 0;
                            this.navStatus = 'unreachable';
                        }
                        this.navPendingRetry = false;
                        this.navRecalcTimer = 18 + (this.id % 12);
                    }
                }

                if (this.navPath && this.navIndex < this.navPath.length) {
                    let wp = this.navPath[this.navIndex];
                    const distToWp = Math.hypot(wp.x - this.x, wp.y - this.y);
                    const hasNext = this.navIndex + 1 < this.navPath.length;
                    const canAdvanceToNext = hasNext &&
                        distToWp < Math.max(55, this.size + 24) &&
                        canPassClearance(this.x, this.y, this.navPath[this.navIndex + 1].x, this.navPath[this.navIndex + 1].y, this.size);

                    if (distToWp <= 14 || canAdvanceToNext) {
                        this.navIndex++;
                        if (this.navIndex < this.navPath.length) {
                            wp = this.navPath[this.navIndex];
                        }
                    }
                    const wdx = wp.x - this.x;
                    const wdy = wp.y - this.y;
                    const wlen = Math.hypot(wdx, wdy) || 1;
                    dx = wdx / wlen;
                    dy = wdy / wlen;
                }

                this.pathRecalcTimer--;
                if (this.pathRecalcTimer <= 0) {
                    this.pathRecalcTimer = this.pathRecalcInterval;

                    const baseAngle = Math.atan2(dy, dx);
                    const rayLen = Math.min(this.sensorRange, Math.max(45, this.size * 2.2));

                    let bestDirX = dx;
                    let bestDirY = dy;
                    let foundPath = false;

                    if (canPassClearance(this.x, this.y, this.x + dx * rayLen, this.y + dy * rayLen, this.size)) {
                        foundPath = true;
                    } else {
                        const step = 18 * (Math.PI / 180);
                        const maxSteps = 7;

                        for (let i = 1; i <= maxSteps; i++) {
                            const offset = step * i;

                            const a1 = baseAngle + offset;
                            const dx1 = Math.cos(a1);
                            const dy1 = Math.sin(a1);
                            if (canPassClearance(this.x, this.y, this.x + dx1 * rayLen, this.y + dy1 * rayLen, this.size)) {
                                bestDirX = dx1;
                                bestDirY = dy1;
                                foundPath = true;
                                break;
                            }

                            const a2 = baseAngle - offset;
                            const dx2 = Math.cos(a2);
                            const dy2 = Math.sin(a2);
                            if (canPassClearance(this.x, this.y, this.x + dx2 * rayLen, this.y + dy2 * rayLen, this.size)) {
                                bestDirX = dx2;
                                bestDirY = dy2;
                                foundPath = true;
                                break;
                            }
                        }
                    }

                    this.cachedDirX = foundPath ? bestDirX : dx;
                    this.cachedDirY = foundPath ? bestDirY : dy;
                }
            }
        }

        dx = this.cachedDirX;
        dy = this.cachedDirY;

        if (this.type === 'swarmer') {
            const wiggle = Math.sin(state.frameCount * 0.25 + this.id) * 0.4;
            const cosW = Math.cos(wiggle);
            const sinW = Math.sin(wiggle);
            const wx = dx * cosW - dy * sinW;
            const wy = dx * sinW + dy * cosW;
            if (canPassClearance(this.x, this.y, this.x + wx * 28, this.y + wy * 28, this.size)) {
                dx = wx;
                dy = wy;
            }
        }

        let sepX = 0, sepY = 0;
        let count = 0;
        const enemies = state.enemies;
        const totalEnemies = enemies.length;
        const maxChecks = Math.min(10, totalEnemies);
        const startIndex = (this.id * 5) % Math.max(1, totalEnemies);
        for (let i = 0; i < maxChecks; i++) {
            const other = enemies[(startIndex + i) % totalEnemies];
            if (other && other !== this && !other.isDead) {
                const dxNear = this.x - other.x;
                const dyNear = this.y - other.y;
                const minDist = this.size + other.size;
                if (Math.abs(dxNear) < minDist && Math.abs(dyNear) < minDist) {
                    const d = Math.hypot(dxNear, dyNear);
                    if (d < minDist && d > 0) {
                        const push = (minDist - d) / minDist;
                        sepX += (dxNear / d) * push;
                        sepY += (dyNear / d) * push;
                        count++;
                    }
                }
            }
        }
        if (count > 0) {
            const sepWeight = directClear ? 1.35 : 0.75;
            let sx = sepX * sepWeight;
            let sy = sepY * sepWeight;
            if (!directClear) {

                const dot = sx * dx + sy * dy;
                if (dot < 0) {
                    sx -= dx * dot;
                    sy -= dy * dot;
                }
            } else if (intentMode === 'retreat') {

                const toPlayerX = (state.player.x - this.x) / (distToPlayer || 1);
                const toPlayerY = (state.player.y - this.y) / (distToPlayer || 1);
                const dotToward = sx * toPlayerX + sy * toPlayerY;
                if (dotToward > 0) {
                    sx -= toPlayerX * dotToward;
                    sy -= toPlayerY * dotToward;
                }
            }
            dx += sx;
            dy += sy;
            const l = Math.hypot(dx, dy) || 1;
            dx /= l;
            dy /= l;
        }

        const targetVx = dx * currentMaxSpeed;
        const targetVy = dy * currentMaxSpeed;

        this.vx += (targetVx - this.vx) * this.turnSpeed;
        this.vy += (targetVy - this.vy) * this.turnSpeed;

        if (!Number.isFinite(this.pushX)) this.pushX = 0;
        if (!Number.isFinite(this.pushY)) this.pushY = 0;

        const pushFactor = (1 - this.knockbackResist) / this.mass;
        this.vx += this.pushX * pushFactor;
        this.vy += this.pushY * pushFactor;

        this.pushX *= 0.8;
        this.pushY *= 0.8;

        if (!Number.isFinite(this.vx)) this.vx = 0;
        if (!Number.isFinite(this.vy)) this.vy = 0;

        let stepVx = this.vx;
        let stepVy = this.vy;

        if (this._bhSelectedId > 0 && this.bhPullFactor > 0) {
            this._bhLockId = this._bhSelectedId;
            if (this.bhDist < 40) {
                const coreDamp = 1 - (0.65 * Math.min(1, this.bhPullFactor)) * (1 - this.bhDist / 40);
                this.vx *= coreDamp;
                this.vy *= coreDamp;
                stepVx = this.vx;
                stepVy = this.vy;
            }
            if (Number.isFinite(this.bhPullX) && Number.isFinite(this.bhPullY)) {
                stepVx += this.bhPullX;
                stepVy += this.bhPullY;
            }
        } else {
            this._bhLockId = -1;
        }

        this._bhSelectedId = -1;
        this._bhBestScore = Infinity;
        this.bhPullX = 0;
        this.bhPullY = 0;
        this.bhDist = Infinity;
        this.bhPullFactor = 0;

        stepVx += this.slashPushX * pushFactor;
        stepVy += this.slashPushY * pushFactor;
        this.slashPushX *= 0.8;
        this.slashPushY *= 0.8;
        const moved = moveEntityWithWalls(this.x, this.y, stepVx, stepVy, this.size);
        if (moved.blockedX) this.slashPushX = 0;
        if (moved.blockedY) this.slashPushY = 0;
        this.x = moved.x;
        this.y = moved.y;

        if (moved.blockedX) {
            this.vx = 0;
            if (!moved.blockedY && dy !== 0) {
                const slideVy = Math.sign(dy) * currentMaxSpeed * 0.85;
                const slide = moveEntityWithWalls(this.x, this.y, 0, slideVy - this.vy, this.size);
                this.x = slide.x;
                this.y = slide.y;
                this.vy = slideVy;
            }
        }

        if (moved.blockedY) {
            this.vy = 0;
            if (!moved.blockedX && dx !== 0) {
                const slideVx = Math.sign(dx) * currentMaxSpeed * 0.85;
                const slide = moveEntityWithWalls(this.x, this.y, slideVx - this.vx, 0, this.size);
                this.x = slide.x;
                this.y = slide.y;
                this.vx = slideVx;
            }
        }

        this.progressTimer++;
        if (this.progressTimer >= 36) {
            const movedDist = Math.hypot(this.x - this.progressAnchorX, this.y - this.progressAnchorY);
            const wantsToAdvance = intentMode === 'pursue' &&
                distToPlayer > this.size + state.player.r + 14 &&
                this.attackWindup <= 0 &&
                !this.isAimingRanged &&
                currentMaxSpeed > 0.5;
            if (wantsToAdvance && movedDist < 16) {
                this.stuckCount++;
                this.navRecalcTimer = 0;
                this.pathRecalcTimer = 0;
                const esc = NavigationSystem.findEscapeWaypoint(this.x, this.y, targetX, targetY, this.size);
                if (esc) {
                    this.navPath = [esc, { x: cleanTarget.x, y: cleanTarget.y }];
                    this.navIndex = 0;
                    this.navStatus = 'escape';
                }
            } else if (movedDist >= 24) {
                this.stuckCount = 0;
            }
            this.progressAnchorX = this.x;
            this.progressAnchorY = this.y;
            this.progressTimer = 0;
        }

        if (distToPlayer < this.size + state.player.r) {
            if (this.type === 'kamikaze') {
                if (this.spawnTimer <= 0 && !this.kamikazeArmed) {
                    if (this.hasKamikazeSlot || AttackCoordinator.requestKamikaze(this.id, state.frameCount)) {
                        this.hasKamikazeSlot = true;
                        this.kamikazeArmed = true;
                        this.kamikazeArmTimer = KAMIKAZE_ARM_FRAMES;
                    }
                }
            } else if (this.type === 'basic') {

            } else if (this.attackCd <= 0 && this.spawnTimer <= 0) {
                state.player.takeDamage(this.dmg, this.type);
                this.attackCd = 60;

                const kdx = state.player.x - this.x;
                const kdy = state.player.y - this.y;
                const klen = Math.hypot(kdx, kdy);
                const nx = klen > 0.001 ? kdx / klen : 1;
                const ny = klen > 0.001 ? kdy / klen : 0;
                state.player.pushX = nx * 10;
                state.player.pushY = ny * 10;
            }
        }
    }

    updateTitanLogic() {
        const distPlayer = Math.hypot(state.player.x - this.x, state.player.y - this.y);

        if (this.captureWindup > 0) {
            this.captureWindup--;
            if (this.captureWindup <= 0) {
                if (distPlayer < TITAN_CAPTURE_RANGE + 60) {
                    state.player.applyRoot(240);
                    state.texts.push(floatTextPool.acquire(this.x, this.y - 80, 'ЗАХВАТ!', '#fff', 30));
                    triggerShake(6, 10);
                    for(let k=0; k<15; k++) {
                        const px = this.x + (state.player.x - this.x) * (k/15);
                        const py = this.y + (state.player.y - this.y) * (k/15);
                        state.particles.push(particlePool.acquire(px, py, '#ff0055', 5));
                    }
                }
                this.abilityCaptureCd = 600 + Math.random() * 300;
            }
        } else if (this.abilityCaptureCd > 0) {
            this.abilityCaptureCd--;
        } else if (distPlayer < TITAN_CAPTURE_RANGE) {
            this.captureWindup = TITAN_CAPTURE_WINDUP_FRAMES;
        }

        if (this.buffWindup > 0) {
            this.buffWindup--;
            if (this.buffWindup <= 0) {
                state.texts.push(floatTextPool.acquire(this.x, this.y - 100, 'ЯРОСТЬ!', '#ff0000', 36));
                triggerShake(12, 20);
                playSound('powerUp');

                state.enemies.forEach(e => {
                    if (!e.isDead && e !== this) {
                        e.buffTimer = 900 + Math.floor(Math.random() * 300);
                        state.texts.push(floatTextPool.acquire(e.x, e.y - 20, '^^^', '#f00', 12));
                    }
                });

                for(let k=0; k<30; k++) {
                    const a = (Math.PI * 2 * k) / 30;
                    const px = this.x + Math.cos(a) * 80;
                    const py = this.y + Math.sin(a) * 80;
                    state.particles.push(particlePool.acquire(px, py, '#ff0000', 6));
                }
                this.abilityBuffCd = 900 + Math.random() * 300;
            }
        } else if (this.abilityBuffCd > 0) {
            this.abilityBuffCd--;
        } else {
            this.buffWindup = TITAN_BUFF_WINDUP_FRAMES;
        }
    }

    takeDamage(amt, isCrit, bulletAngle = null, isPiercing = false, suppressHitJitter = false) {
        if (this.isDead) return false;

        if (this.type === 'shield_bearer' && bulletAngle !== null && !isPiercing) {
            const incomingAngle = (bulletAngle + Math.PI) % (Math.PI * 2);
            let diff = Math.abs(incomingAngle - this.shieldAngle);
            if (diff > Math.PI) diff = Math.PI * 2 - diff;
            if (diff < this.shieldArc / 2) {
                amt *= 0.15;
                state.texts.push(floatTextPool.acquire(this.x, this.y - 30, 'БЛОК', '#ffaa00', 16));
                for (let k = 0; k < 4; k++) {
                    state.particles.push(particlePool.acquire(this.x + Math.cos(this.shieldAngle) * 20, this.y + Math.sin(this.shieldAngle) * 20, '#ffaa00', 3));
                }
            }
        }

        amt *= Meta.getBestiaryDamageBonus(this.type);

        this.hp -= amt;
        this.flashTimer = 6;

        DamageTextSystem.add(this.x, this.y, amt, isCrit);
        if (isCrit) {
            triggerHitStop(2, true);
        }

        if (!suppressHitJitter) {
            this.pushX += (Math.random() - 0.5) * 5;
            this.pushY += (Math.random() - 0.5) * 5;
        } else if (Math.hypot(this.pushX, this.pushY) < 1.5) {
            this.pushX += (Math.random() - 0.5) * 1.2;
            this.pushY += (Math.random() - 0.5) * 1.2;
        }

        if (this.hp <= 0) {
            this.isDead = true;
            state.airdropZones[0]?.recordKill(state.player);
            AttackCoordinator.releaseAll(this.id);
            NavigationSystem.releaseEnemy(this.id);
            this.hasRangedSlot = false;
            this.isAimingRanged = false;
            this.hasKamikazeSlot = false;
            state.score += this.xp;
            state.sessionKills = (state.sessionKills || 0) + 1;
            state.sessionEnemyKills[this.type] = (state.sessionEnemyKills[this.type] || 0) + 1;
            playSound('explosion');

            AchievementSystem.onKill(this);

            if (this.type === 'titan') {
                triggerShake(20, 40);
                if (state.xpTelemetry) {
                    state.xpTelemetry.titanKillsTimeline.push({
                        timeSec: state.gameTime,
                        frameCount: state.frameCount,
                        xp: this.xp,
                        after5m: state.gameTime > 300
                    });
                }
            }

            if ((this.type === 'tank' || this.type === 'elite') && Math.random() < 0.6) {
                const count = 2 + Math.floor(Math.random() * 2);
                for (let s = 0; s < count; s++) {
                    const sx = this.x + (Math.random() - 0.5) * 30;
                    const sy = this.y + (Math.random() - 0.5) * 30;
                    state.enemies.push(enemyPool.acquire('swarmer', sx, sy));
                }
            }

            if (state.player && state.player.stats.vampChance > 0) {
                if (Math.random() < state.player.stats.vampChance) {
                    state.player.tryVampireHeal();
                }
            }

            const greedBonus = Meta.getUpgradeValue('startGreed') || 0;
            if (Math.random() < (this.dropChance + greedBonus)) {
                state.chips.push(chipPool.acquire(this.x, this.y, this.chipValue));
            }

            for (let i = 0; i < 6; i++) {
                state.particles.push(particlePool.acquire(this.x, this.y, this.color, 2 + Math.random() * 2));
            }

            const gemSource = this.type === 'titan' ? 'titan' : 'enemy';
            state.gems.push(gemPool.acquire(this.x, this.y, this.xp, gemSource));

            return true;
        }
        return false;
    }

    draw(ctx) {
        const sx = this.x - state.camera.x;
        const sy = this.y - state.camera.y;
        if (sx < -50 || sx > SCREEN_W() + 50 || sy < -50 || sy > SCREEN_H() + 50) return;

        let angle = 0;
        if (Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1) {
            angle = Math.atan2(this.vy, this.vx);
        } else if (state.player) {
            angle = Math.atan2(state.player.y - this.y, state.player.x - this.x);
        }

        ctx.save();
        ctx.translate(sx, sy);

        if (this.spawnTimer > 0) {
            const progress = 1 - (this.spawnTimer / BALANCE.spawnTelegraphFrames);
            ctx.globalAlpha = 0.25 + progress * 0.75;

            ctx.strokeStyle = this.color;
            ctx.globalAlpha *= 0.5;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, this.size + (1 - progress) * 20, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 0.25 + progress * 0.75;
        }

        const flashPct = this.flashTimer > 0 ? this.flashTimer / 6 : 0;
        let bodyColor = this.color;
        if (this.freezeTimer > 0) {
            bodyColor = '#55ccff';
        } else if (this.type === 'basic' && this.attackWindup > 0) {
            const windupFlash = Math.floor(this.attackWindup / 3) % 2 === 0;
            bodyColor = windupFlash ? '#ffffff' : '#ff0055';
        }
        ctx.fillStyle = flashPct > 0 ? `rgba(255,255,255,${(0.5 + flashPct * 0.5).toFixed(2)})` : bodyColor;

        if (this.type === 'stalker') ctx.globalAlpha *= this.cloakAlpha || 0.2;
        const aimsAtPlayer = this.type === 'shooter' || this.type === 'spitter';
        const heading = aimsAtPlayer && state.player ? Math.atan2(state.player.y-this.y,state.player.x-this.x) : angle;
        const outline = this.kamikazeArmed && this.kamikazeArmTimer % 6 < 3 ? '#fff3df' : ctx.fillStyle;
        drawHostile(ctx,this,heading,outline);
        if (this.type === 'shield_bearer') {
            ctx.beginPath();
            ctx.strokeStyle = '#7de3fb';
            ctx.lineWidth = 4;
            ctx.arc(0,0,this.size+7,this.shieldAngle-this.shieldArc/2,this.shieldAngle+this.shieldArc/2);
            ctx.stroke();
        }
        if (this.type === 'titan') {
            ctx.fillStyle = '#17232b'; ctx.fillRect(-40,-67,80,5);
            ctx.fillStyle = '#ff866d'; ctx.fillRect(-40,-67,80*Math.max(0,this.hp/this.maxHp),5);
        }
        ctx.restore();
    }

    drawTelegraph(ctx) {
        if (!(this.isAimingRanged || this.attackWindup || (this.type === 'dasher' && this.dashTimer >= DASHER_CYCLE_FRAMES - DASHER_WINDUP_FRAMES - DASHER_BURST_FRAMES) ||
            this.kamikazeArmed || this.captureWindup || this.buffWindup)) return;
        const sx=this.x-state.camera.x, sy=this.y-state.camera.y;
        if (sx < -400 || sy < -400 || sx > SCREEN_W()+400 || sy > SCREEN_H()+400) return;
        ctx.save();
        ctx.translate(sx,sy);

        if (this.type === 'shooter' && state.player && this.spawnTimer <= 0 &&
            this.isAimingRanged && this.shootTimer >= SHOOT_FIRE_INTERVAL - SHOOT_WINDUP_FRAMES) {
            const windupProgress = (this.shootTimer - (SHOOT_FIRE_INTERVAL - SHOOT_WINDUP_FRAMES)) / SHOOT_WINDUP_FRAMES;
            ctx.save();
            ctx.globalAlpha = 0.25 + windupProgress * 0.55;
            ctx.strokeStyle = '#ff2255';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(state.player.x - this.x, state.player.y - this.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }

        if (this.type === 'spitter' && state.player && this.spawnTimer <= 0 &&
            this.isAimingRanged && this.spitTimer >= this.spitInterval - this.spitWindup) {
            const spitWindupStart = this.spitInterval - this.spitWindup;
            const windupProgress = (this.spitTimer - spitWindupStart) / this.spitWindup;
            ctx.save();
            ctx.globalAlpha = 0.25 + windupProgress * 0.55;
            ctx.strokeStyle = '#39ff14';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(state.player.x - this.x, state.player.y - this.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }

        if (this.type === 'basic' && this.attackWindup > 0 && state.player && this.spawnTimer <= 0) {
            const windupProgress = 1 - (this.attackWindup / BASIC_WINDUP_TICKS);
            ctx.save();
            ctx.strokeStyle = '#ff2255';
            ctx.lineWidth = 2 + windupProgress * 2;
            ctx.beginPath();
            ctx.arc(0, 0, this.size + 4 + (1 - windupProgress) * 6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = `rgba(255, 34, 85, ${(0.15 + windupProgress * 0.35).toFixed(2)})`;
            ctx.beginPath();
            ctx.arc(0, 0, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        if (this.type === 'dasher' && this.spawnTimer <= 0) {
            const windupStart = DASHER_CYCLE_FRAMES - DASHER_BURST_FRAMES - DASHER_WINDUP_FRAMES;
            const burstStart = DASHER_CYCLE_FRAMES - DASHER_BURST_FRAMES;
            if (this.dashTimer >= windupStart && this.dashTimer < burstStart) {
                const progress = (this.dashTimer - windupStart) / DASHER_WINDUP_FRAMES;
                ctx.save();
                ctx.globalAlpha = 0.2 + progress * 0.6;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2 + progress * 3;
                ctx.beginPath();
                ctx.arc(0, 0, this.size + 6 + progress * 12, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
        }

        if (this.type === 'titan') {
            if (this.captureWindup > 0) {
                const progress = 1 - (this.captureWindup / TITAN_CAPTURE_WINDUP_FRAMES);
                ctx.save();
                ctx.globalAlpha = 0.15 + progress * 0.35;
                ctx.strokeStyle = '#ff0055';
                ctx.lineWidth = 3;
                ctx.setLineDash([14, 10]);
                ctx.beginPath();
                ctx.arc(0, 0, TITAN_CAPTURE_RANGE, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            }
            if (this.buffWindup > 0) {
                const progress = 1 - (this.buffWindup / TITAN_BUFF_WINDUP_FRAMES);
                ctx.save();
                ctx.globalAlpha = 0.2 + progress * 0.5;
                ctx.strokeStyle = '#ffaa00';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(0, 0, 80 + progress * 40, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
        }

        if (this.kamikazeArmed) {
            ctx.strokeStyle='#ff856e';
            ctx.lineWidth=2;
            ctx.setLineDash([6,4]);
            ctx.beginPath();
            ctx.arc(0,0,KAMIKAZE_EXPLOSION_RADIUS,0,Math.PI*2);
            ctx.stroke();
        }
        ctx.restore();
    }
}

export const enemyPool = new ObjectPool((type, x, y) => new Enemy(type, x, y));
