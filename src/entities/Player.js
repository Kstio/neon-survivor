import { drawHull } from '../systems/HullRenderer.js';
import { getXpThresholdForLevel, state, triggerShake, triggerHitStop } from '../GameState.js';
import { WORLD_SIZE, SKILL_DB, BALANCE, ACHIEVEMENTS_DB } from '../constants.js';
import { clamp, checkWall, resolveWallOverlap, moveEntityWithWalls, calcDmg } from '../utils.js';
import { particlePool, floatTextPool } from './Particle.js';
import { playSound } from '../sounds.js';
import { Meta } from '../MetaGame.js';
import { WeaponSystem } from '../systems/WeaponSystem.js';
import { PilotManager } from '../systems/PilotClasses.js';
import { PilotVisuals } from '../systems/PilotVisuals.js';
import { AchievementSystem } from '../systems/AchievementSystem.js';

export const MAX_WEAPON_SLOTS = 4;
export const MAX_PASSIVE_SLOTS = 4;
export const FALLBACK_SKILL_REWARD_CHIPS = 25;

export function getSkillSlotCategory(id) {
    const def = SKILL_DB[id];
    if (!def) return null;
    if (def.type === 'weapon' || def.type === 'active' || def.type === 'evo') return 'weapon';
    if (def.type === 'passive') return 'passive';
    return null;
}

export function getBaseSkillForEvo(evoId) {
    for (const key in SKILL_DB) {
        if (SKILL_DB[key].evolveTo === evoId) return key;
    }
    return null;
}

export class Player {
    constructor() {
        this.x = WORLD_SIZE / 2;
        this.y = WORLD_SIZE / 2;
        this.r = 15;
        this.color = '#00ffff';

        this.pushX = 0;
        this.pushY = 0;
        this.pilotVisuals = new PilotVisuals();

        const extraHp = Meta.getUpgradeValue('startHp') || 0;
        const dmgMultBonus = Meta.getUpgradeValue('startDmg') || 1;
        const speedBonus = Meta.getUpgradeValue('speed') || 0;
        const shieldBonus = Meta.getUpgradeValue('shield') || 0;
        const magnetBonus = Meta.getUpgradeValue('magnet') || 0;
        const critBonus = Meta.getUpgradeValue('crit') || 0;
        const regenBonus = Meta.getUpgradeValue('regen') || 0;

        this.maxHp = 100 + extraHp;
        this.hp = this.maxHp;

        this.baseSpeed = 5 * (1 + speedBonus);
        this.speed = this.baseSpeed;

        this.dmg = 40;
        this.bulletSpeed = 14;
        this.fireTimer = 0;
        this.blackholeTimer = 0;
        this.rearTimer = 0;
        this.bulletLife = 60;
        this.orbitals = 0;
        this.laserBeams = [];

        this.skills = {};
        this.evolvedSkills = new Set();
        this.rerollCharges = 3;
        this.banishedSkills = new Set();

        this.stats = {
            dmgMult: 1 * dmgMultBonus,
            fireRateMult: 1,
            bulletCount: 1,
            spread: 0.12,
            bulletSpdMult: 1,
            critChance: critBonus,
            dodge: 0,
            thorns: 0,
            regen: regenBonus,
            regenPct: 0,
            regenTotal: regenBonus,
            magnet: 150 + magnetBonus,
            expMult: 1,
            vampChance: 0,
            vampHeal: 0,
            shieldMax: 0,
            shieldTimer: 0,
            pierce: 0,
            ricochet: 0,
            armor: 0,
            resist: 0,
            fatBoy: 0,
            splashDmgBonus: 0,
            autoCooldownMult: 1
        };

        this.starterShieldMax = shieldBonus;
        this.starterShieldCharges = shieldBonus;
        this.shieldCharges = 0;

        this.overdriveTimer = 0;
        this.overdriveShield = 0;
        this.stealthTimer = 0;
        this.vx = 0;
        this.vy = 0;
        this.lastMoveX = 0;
        this.lastMoveY = -1;

        this.auraTimer = 0;
        this.bloodCircleHealCd = 0;
        this.devourerHealCd = 0;
        this.orbitalAngle = 0;
        this.orbitalTick = 0;
        this.orbitalHitCooldowns = new Map();
        this.mineTimer = 0;
        this.laserTimer = 0;

        this.teslaTimer = 0;
        this.katanaTimer = 0;
        this.boomerangTimer = 0;
        this.plasmaTimer = 0;
        this.cryoTimer = 0;
        this.naniteTimer = 0;

        this.dashCd = 0;
        this.dashMax = 150;
        this.dashActive = 0;
        this.invulnTimer = 0;
        this.vampCooldown = 0;

        this.empCd = 0;
        this.empMax = 1200;

        this.xp = 0;
        this.lvl = 1;
        this.nextXp = getXpThresholdForLevel(this.lvl);
        this.leveling = false;

        this.rootTimer = 0;
        PilotManager.applyPilotPassive(this, Meta.data?.selectedPilot || 'vanguard');
    }

    get shieldReady() {
        return (this.shieldCharges || 0) > 0;
    }

    getShieldMaxCharges(lvl = this.getSkillLvl('shield')) {
        if (lvl <= 0) return 0;
        return lvl >= 5 ? 2 : 1;
    }

    getShieldCooldownTicks(lvl = this.getSkillLvl('shield')) {
        if (lvl <= 0) return 0;
        return Math.max(60, 450 - (lvl * 40));
    }

    getEarlyDodgeBonus() {
        const mercy = BALANCE.earlyMercy;
        return state.gameTime < mercy.durationSec
            ? BALANCE.earlyPlayerBuff.dodgeBonus * (1 - state.gameTime / mercy.durationSec)
            : 0;
    }

    getEffectiveDodge() {
        return Math.min(0.50, (this.stats?.dodge || 0) + this.getEarlyDodgeBonus());
    }

    getSkillLvl(id) { return this.skills[id] || 0; }

    getBuildLevels() {
        let total = 0;
        for (const [id, level] of Object.entries(this.skills)) {
            if (level <= 0) continue;
            const base = SKILL_DB[id]?.type === 'evo' ? getBaseSkillForEvo(id) : null;
            total += level + (base ? SKILL_DB[base].max : 0);
        }
        return total;
    }

    getSlotCounts() {
        let weapon = 0;
        let passive = 0;
        for (const key in this.skills) {
            const lvl = this.skills[key] || 0;
            if (lvl <= 0) continue;
            const cat = getSkillSlotCategory(key);
            if (cat === 'weapon') weapon++;
            else if (cat === 'passive') passive++;
        }
        return {
            weapon,
            passive,
            maxWeapon: MAX_WEAPON_SLOTS,
            maxPassive: MAX_PASSIVE_SLOTS,
            weapons: weapon,
            passives: passive,
            maxWeapons: MAX_WEAPON_SLOTS,
            maxPassives: MAX_PASSIVE_SLOTS
        };
    }

    canAcquireSkill(id, { allowEvo = true, ignoreBanish = false } = {}) {
        const def = SKILL_DB[id];
        if (!def) return false;

        const currentLvl = this.getSkillLvl(id);
        if (currentLvl >= def.max) return false;

        if (!ignoreBanish && this.banishedSkills && this.banishedSkills.has(id)) {
            return false;
        }

        if (def.type === 'evo') {
            if (!allowEvo) return false;
            if (currentLvl > 0 || (this.evolvedSkills && this.evolvedSkills.has(id))) {
                return false;
            }
            const baseKey = getBaseSkillForEvo(id);
            if (!baseKey) return false;
            const baseDef = SKILL_DB[baseKey];
            if (!baseDef) return false;
            if (this.getSkillLvl(baseKey) < baseDef.max) return false;
            if (!baseDef.require || this.getSkillLvl(baseDef.require) <= 0) return false;
            return true;
        }

        if (def.evolveTo && (this.getSkillLvl(def.evolveTo) > 0 || (this.evolvedSkills && this.evolvedSkills.has(def.evolveTo)))) {
            return false;
        }

        if (currentLvl > 0) {
            return true;
        }

        const cat = getSkillSlotCategory(id);
        const counts = this.getSlotCounts();
        if (cat === 'weapon' && counts.weapon >= counts.maxWeapon) return false;
        if (cat === 'passive' && counts.passive >= counts.maxPassive) return false;

        return true;
    }

    getAvailableSkills() {
        return Object.keys(SKILL_DB).filter(k => this.canAcquireSkill(k, { allowEvo: false, ignoreBanish: false }));
    }

    getEvoCandidates() {
        return Object.keys(SKILL_DB).filter(k => SKILL_DB[k].type === 'evo' && this.canAcquireSkill(k, { allowEvo: true, ignoreBanish: false }));
    }

    applyRoot(duration) {
        if (this.invulnTimer > 0 || this.dashActive > 0) return;

        if (this.rootTimer > 0) return;
        this.rootTimer = duration;
        state.texts.push(floatTextPool.acquire(this.x, this.y - 60, 'ЗАХВАТ!', '#ff0055', 24));
        playSound('hit');
    }

    getRegenPerSec() {
        const regenLvl = this.getSkillLvl('regen');
        const flatRegen = Number.isFinite(this.stats?.regen)
            ? this.stats.regen
            : ((Meta.getUpgradeValue('regen') || 0) + regenLvl * 2);
        return flatRegen + (this.maxHp * 0.0025 * regenLvl);
    }

    getVampHealAmount() {
        const vampLvl = this.getSkillLvl('vamp');
        if (vampLvl <= 0) return 0;
        return 2 + vampLvl * (0.4 + 0.003 * this.maxHp);
    }

    tryVampireHeal() {
        const vampLvl = this.getSkillLvl('vamp');
        if (vampLvl <= 0) return;
        if (this.vampCooldown <= 0) {
            this.heal(this.getVampHealAmount(), 'vamp');
            this.vampCooldown = 24;
        }
    }

    update(keys, mouse) {
        if (this.invulnTimer > 0) this.invulnTimer--;
        if (this.vampCooldown > 0) this.vampCooldown--;

        if (!Number.isFinite(this.pushX)) this.pushX = 0;
        if (!Number.isFinite(this.pushY)) this.pushY = 0;
        if (!Number.isFinite(this.x)) this.x = WORLD_SIZE / 2;
        if (!Number.isFinite(this.y)) this.y = WORLD_SIZE / 2;

        if (Math.abs(this.pushX) > 0.01 || Math.abs(this.pushY) > 0.01) {
            const kbMove = moveEntityWithWalls(this.x, this.y, this.pushX, this.pushY, this.r);
            this.x = kbMove.x;
            this.y = kbMove.y;
            if (kbMove.blockedX) this.pushX = 0;
            else this.pushX *= 0.8;
            if (kbMove.blockedY) this.pushY = 0;
            else this.pushY *= 0.8;
        } else {
            this.pushX = 0;
            this.pushY = 0;
            if (checkWall(this.x, this.y, this.r)) {
                const fixed = resolveWallOverlap(this.x, this.y, this.r);
                this.x = fixed.x;
                this.y = fixed.y;
            }
        }

        if (this.rootTimer > 0) {
            this.rootTimer--;
            if (this.rootTimer <= 0) {
                state.texts.push(floatTextPool.acquire(this.x, this.y - 40, 'СВОБОДЕН!', '#0f0', 18));
            }
        }

        const regenPerSec = this.getRegenPerSec();
        if (regenPerSec > 0 && this.hp < this.maxHp && state.frameCount % 60 === 0) {
            this.heal(regenPerSec, 'regen');
        }

        const shieldLvl = this.getSkillLvl('shield');
        const shieldMax = this.getShieldMaxCharges(shieldLvl);
        this.stats.shieldMax = shieldMax;
        if (shieldLvl > 0 && shieldMax > 0) {
            if (this.shieldCharges < shieldMax) {
                this.stats.shieldTimer++;
                const cd = this.getShieldCooldownTicks(shieldLvl);
                if (this.stats.shieldTimer >= cd) {
                    this.shieldCharges = Math.min(shieldMax, this.shieldCharges + 1);
                    this.stats.shieldTimer = 0;
                    state.texts.push(floatTextPool.acquire(this.x, this.y - 40, 'ЩИТ ГОТОВ', '#00ffff'));
                    this.pilotVisuals.showGuard('ready', state.frameCount);
                }
            } else {
                this.stats.shieldTimer = 0;
            }
        } else {
            this.shieldCharges = 0;
            this.stats.shieldTimer = 0;
        }

        let dx = 0, dy = 0;

        if (this.rootTimer <= 0 && keys) {
            if (keys.w || keys.ArrowUp || keys.up) dy -= 1;
            if (keys.s || keys.ArrowDown || keys.down) dy += 1;
            if (keys.a || keys.ArrowLeft || keys.left) dx -= 1;
            if (keys.d || keys.ArrowRight || keys.right) dx += 1;
        }

        if (dx !== 0 || dy !== 0) {
            const len = Math.hypot(dx, dy) || 1;
            this.lastMoveX = dx / len;
            this.lastMoveY = dy / len;
        }

        WeaponSystem.update(this, keys, mouse);

        if (this.dashCd > 0) this.dashCd--;
        if (this.empCd > 0) this.empCd--;

        if (this.overdriveTimer > 0) {
            this.overdriveTimer--;
            if (this.overdriveTimer <= 0) {
                this.overdriveShield = 0;
            }
        } else if (this.overdriveShield > 0) {
            this.overdriveShield = 0;
        }

        if (this.stealthTimer > 0) {
            this.stealthTimer--;
        }

        let inSlowZone = false;
        for (const zone of state.slowZones) {
            if (this.x > zone.x && this.x < zone.x + zone.w &&
                this.y > zone.y && this.y < zone.y + zone.h) {
                inSlowZone = true;
                break;
            }
        }

        let inAcidPuddle = false;
        if (state.acidPuddles) {
            for (const puddle of state.acidPuddles) {
                if (Math.hypot(this.x - puddle.x, this.y - puddle.y) < puddle.r + this.r) {
                    inAcidPuddle = true;
                    break;
                }
            }
        }

        let currSpeed = this.speed;
        if (inSlowZone && this.dashActive <= 0) {
            currSpeed *= 0.5;
        }
        if (inAcidPuddle && this.dashActive <= 0) {
            currSpeed *= 0.7;
        }

        if (this.dashActive > 0) {
            this.dashActive--;
            currSpeed *= 2.4;
        }

        if (dx !== 0 || dy !== 0) {
            const len = Math.hypot(dx, dy) || 1;
            this.lastMoveX = dx / len;
            this.lastMoveY = dy / len;
            const s = currSpeed / len;
            this.vx = dx * s;
            this.vy = dy * s;
            const moved = moveEntityWithWalls(this.x, this.y, this.vx, this.vy, this.r);
            this.x = moved.x;
            this.y = moved.y;
        } else {
            this.vx = 0;
            this.vy = 0;
        }
        this.x = clamp(this.x, 20 + this.r, WORLD_SIZE - 20 - this.r);
        this.y = clamp(this.y, 20 + this.r, WORLD_SIZE - 20 - this.r);
        if (checkWall(this.x, this.y, this.r)) {
            const finalFix = resolveWallOverlap(this.x, this.y, this.r);
            this.x = finalFix.x;
            this.y = finalFix.y;
        }
    }

    takeDamage(amt, source = 'unknown') {
        if (this.invulnTimer > 0 || this.dashActive > 0) return;

        if (this.overdriveShield > 0) {
            if (this.overdriveShield >= amt) {
                this.overdriveShield -= amt;
                state.texts.push(floatTextPool.acquire(this.x, this.y - 40, `БЛОК -${Math.floor(amt)}`, '#00ffff', 18));
                this.pilotVisuals.showGuard('barrier', state.frameCount);
                this.invulnTimer = 15;
                return;
            } else {
                amt -= this.overdriveShield;
                this.overdriveShield = 0;
                this.pilotVisuals.showGuard('barrier', state.frameCount);
                state.texts.push(floatTextPool.acquire(this.x, this.y - 40, 'БАРЬЕР СНЯТ', '#ffaa00', 18));
            }
        }

        const slvl = this.getSkillLvl('shield');
        if (slvl > 0 && this.shieldCharges > 0) {
            const shieldMax = this.getShieldMaxCharges(slvl);
            if (this.shieldCharges >= shieldMax) {
                this.stats.shieldTimer = 0;
            }
            this.shieldCharges = Math.max(0, this.shieldCharges - 1);
            const blastDmg = 80 + (slvl * 30);
            const blastRange = 160 + (slvl * 20);
            state.enemies.forEach(e => {
                if (!e.isDead) {
                    const dist = Math.hypot(e.x - this.x, e.y - this.y);
                    if (dist < blastRange) {
                        const normDist = dist / blastRange;
                        const damageFactor = Math.max(0.1, Math.pow(1 - normDist, 3));
                        e.takeDamage(blastDmg * damageFactor, false);
                        e.pushX = (e.x - this.x) * 0.2;
                        e.pushY = (e.y - this.y) * 0.2;
                    }
                }
            });
            state.texts.push(floatTextPool.acquire(this.x, this.y - 50, 'ИМПУЛЬС ЩИТА', '#85edff', 16));
            this.pilotVisuals.blast = { frame: state.frameCount, x: this.x, y: this.y, radius: blastRange };
            triggerShake(9, 14);
            playSound('hit');
            return;
        }

        if (this.starterShieldCharges > 0) {
            this.starterShieldCharges--;
            state.texts.push(floatTextPool.acquire(this.x, this.y - 45, 'СТАРТОВЫЙ ЩИТ!', '#ffd700', 18));
            this.pilotVisuals.showGuard('starter', state.frameCount);
            playSound('hit');
            return;
        }

        if (Math.random() < this.getEffectiveDodge()) {
            this.pilotVisuals.showGuard('dodge', state.frameCount);
            state.texts.push(floatTextPool.acquire(this.x, this.y - 40, 'УКЛОНЕНИЕ', '#e7dfff'));
            return;
        }

        const reducedByArmor = Math.max(0, amt - this.stats.armor);
        const effectiveResist = Math.min(0.60, Math.max(0, this.stats.resist || 0));
        const finalDmg = Math.max(1, reducedByArmor * (1 - effectiveResist));

        if (finalDmg < amt) this.pilotVisuals.showGuard('armor', state.frameCount);
        this.hp -= finalDmg;
        state.texts.push(floatTextPool.acquire(this.x, this.y - 30, `-${Math.floor(finalDmg)}`, '#f00'));

        state.sessionDamageTaken = (state.sessionDamageTaken || 0) + finalDmg;
        state.lastDamageSource = source;

        this.invulnTimer = Math.max(this.invulnTimer, BALANCE.hitIframeFrames);

        if (this.stats.thorns > 0) {
            const thornBase = this.stats.thorns + (this.stats.armor * 2);
            const range = 150;
            state.enemies.forEach(e => {
                if (!e.isDead && Math.hypot(e.x - this.x, e.y - this.y) < range) {
                    const d = calcDmg(thornBase, this.stats);
                    e.takeDamage(d.val, d.isCrit);
                    e.vx *= -1;
                    e.vy *= -1;
                }
            });
        }

        if (this.hp <= 0) {
            const event = new CustomEvent('game-over');
            window.dispatchEvent(event);
            state.isRunning = false;
        } else {
            AchievementSystem.onPlayerDamage();
        }
    }

    heal(amt, source = 'repair') {
        if (!Number.isFinite(amt) || amt <= 0) return;
        const prevHp = this.hp;
        this.hp = Math.min(this.maxHp, this.hp + amt);
        const restored = this.hp - prevHp;
        if (restored <= 0) return;
        this.pilotVisuals.showRepair(source, restored, state.frameCount);
        const displayVal = restored >= 1 ? Math.floor(restored) : Number(restored.toFixed(1));
        if (displayVal > 0) {
            state.texts.push(floatTextPool.acquire(this.x, this.y - 20, '+' + displayVal, '#0f0'));
        }
    }

    gainXp(a, source = 'other', sourceBreakdown = null) {
        if (!Number.isFinite(a) || a <= 0) return;
        const mult = this.stats.expMult || 1;
        const awarded = a * mult;
        const lvlBefore = this.lvl;
        const xpBefore = this.xp;
        const nextXpBefore = this.nextXp;

        this.xp += awarded;

        if (state.xpTelemetry) {
            const tel = state.xpTelemetry;
            tel.totalBaseXp += a;
            tel.totalAwardedXp += awarded;
            tel.pickupCount++;

            if (sourceBreakdown && typeof sourceBreakdown === 'object') {
                for (const [srcKey, baseVal] of Object.entries(sourceBreakdown)) {
                    if (!Number.isFinite(baseVal) || baseVal <= 0) continue;
                    const key = tel.sources[srcKey] ? srcKey : 'other';
                    tel.sources[key].base += baseVal;
                    tel.sources[key].awarded += baseVal * mult;
                    tel.sources[key].pickups += 1;
                }
            } else {
                const key = tel.sources[source] ? source : 'other';
                tel.sources[key].base += a;
                tel.sources[key].awarded += awarded;
                tel.sources[key].pickups += 1;
            }

            const titanBase = (sourceBreakdown && sourceBreakdown.titan)
                ? sourceBreakdown.titan
                : (source === 'titan' ? a : 0);
            if (titanBase > 0) {
                let projLvl = this.lvl;
                let projXp = this.xp;
                let projNextXp = this.nextXp;
                while (projXp >= projNextXp) {
                    projXp -= projNextXp;
                    projLvl++;
                    projNextXp = getXpThresholdForLevel(projLvl);
                }
                const entry = {
                    timeSec: state.gameTime,
                    frameCount: state.frameCount,
                    baseXp: titanBase,
                    awardedXp: titanBase * mult,
                    expMultAtPickup: mult,
                    after5m: state.gameTime > 300,
                    lvlBefore,
                    xpBefore,
                    nextXpBefore,
                    lvlAfter: projLvl,
                    xpAfter: projXp,
                    nextXpAfter: projNextXp,
                    pendingResolution: this.xp >= this.nextXp
                };
                tel.titanPickups.push(entry);
                tel.lastPendingTitanEntry = entry;
            }
        }

        if (this.xp >= this.nextXp && !this.leveling) {
            this.leveling = true;
            const event = new CustomEvent('level-up');
            window.dispatchEvent(event);
        }
    }

    recalcStats(){
        const extraHp = Meta.getUpgradeValue('startHp') || 0;
        const dmgMultBonus = Meta.getUpgradeValue('startDmg') || 1;
        const speedBonus = Meta.getUpgradeValue('speed') || 0;
        const magnetBonus = Meta.getUpgradeValue('magnet') || 0;
        const critBonus = Meta.getUpgradeValue('crit') || 0;
        const regenBonus = Meta.getUpgradeValue('regen') || 0;

        const pilot = PilotManager.getPilot(this.pilotId);
        const pStats = pilot.stats || {};

        const baseHp = 100 + extraHp + (pStats.maxHpBonus || 0);
        const hpLvl = this.getSkillLvl('hp');
        const newMaxHp = Math.floor(baseHp * (1 + hpLvl * 0.2));
        if (this.maxHp && newMaxHp !== this.maxHp) {
            const diff = newMaxHp - this.maxHp;
            this.maxHp = newMaxHp;
            if (diff > 0) {
                this.hp = Math.min(this.maxHp, this.hp + diff);
            }
        } else {
            this.maxHp = newMaxHp;
        }
        if (this.hp > this.maxHp) {
            this.hp = this.maxHp;
        }

        const spdLvl = this.getSkillLvl('spd');
        const spdReduc = Math.min(0.6, spdLvl * 0.1);
        const pilotFireBonus = pStats.fireRateBonus || 0;
        this.stats.fireRateMult = Math.max(0.25, (1.0 - spdReduc) * (1.0 - pilotFireBonus));
        this.stats.autoCooldownMult = Math.max(0.70, 1.0 - spdLvl * 0.03);

        this.stats.bulletCount = 1 + this.getSkillLvl('multi');
        const snipLvl = this.getSkillLvl('sniper');
        this.stats.bulletSpdMult = 1 + (snipLvl * 0.18);

        const sniperPierce = snipLvl >= 5 ? 3 : (snipLvl >= 3 ? 2 : (snipLvl >= 1 ? 1 : 0));
        this.stats.pilotPierceBonus = (pStats.pierceBonus || 0);
        this.stats.sniperPierce = sniperPierce;
        this.stats.pierce = this.stats.pilotPierceBonus + sniperPierce;
        this.stats.ricochet = snipLvl >= 4 ? 2 : (snipLvl >= 2 ? 1 : 0);

        this.stats.critChance = critBonus + (pStats.critBonus || 0) + (this.getSkillLvl('crit') * 0.1);
        this.stats.dodge = Math.min(0.50, (pStats.dodgeBonus || 0) + (this.getSkillLvl('dodge') * 0.08));

        this.stats.thorns = this.getSkillLvl('thorns') * 10;
        const regenLvl = this.getSkillLvl('regen');
        this.stats.regen = regenBonus + (regenLvl * 2);
        this.stats.regenPct = regenLvl * 0.0025;
        this.stats.regenTotal = this.getRegenPerSec();
        this.stats.magnet = 150 + magnetBonus + (pStats.magnetBonus || 0) + (this.getSkillLvl('mag') * 50);
        this.stats.expMult = 1 + (this.getSkillLvl('exp') * 0.2);
        const vampLvl = this.getSkillLvl('vamp');
        this.stats.vampChance = vampLvl * 0.12;
        this.stats.vampHeal = this.getVampHealAmount();

        const pilotSpeedMult = 1 + (pStats.speedBonus || 0);
        this.baseSpeed = 5 * (1 + speedBonus) * pilotSpeedMult;
        this.speed = this.baseSpeed * (1 + (this.getSkillLvl('speed') * 0.1));

        this.stats.armor = (pStats.armorBonus || 0) + (this.getSkillLvl('armor') * 3);
        this.stats.resist = Math.min(0.60, (pStats.resistBonus || 0) + (this.getSkillLvl('armor') * 0.03));
        this.stats.pushBonus = (pStats.pushBonus || 0);
        this.stats.splashDmgBonus = (pStats.splashDmgBonus || 0);

        if (pStats.dashCdBonus) {
            this.dashMax = Math.round(150 * (1 - pStats.dashCdBonus));
        }

        const shieldLvl = this.getSkillLvl('shield');
        this.stats.shieldMax = this.getShieldMaxCharges(shieldLvl);
        if (this.stats.shieldMax <= 0) {
            this.shieldCharges = 0;
            this.stats.shieldTimer = 0;
        } else {
            this.shieldCharges = Math.min(this.stats.shieldMax, Math.max(0, this.shieldCharges || 0));
            if (this.shieldCharges >= this.stats.shieldMax) {
                this.stats.shieldTimer = 0;
            }
        }

        const orbitLvl = this.getSkillLvl('orbit');
        const neuralLvl = this.getSkillLvl('neural');
        this.orbitals = (pStats.extraOrbitals || 0) + orbitLvl + (neuralLvl * 5);

        this.stats.fatBoy = this.getSkillLvl('fatboy');

        const pilotDmgBonus = pStats.dmgMultBonus || 0;
        this.stats.dmgMult = (1 + (this.getSkillLvl('dmg') * 0.25)) * dmgMultBonus * (1 + pilotDmgBonus);
    }

    addSkill(id, choiceSource = 'levelup') {
        if (!this.canAcquireSkill(id, { allowEvo: true, ignoreBanish: false })) {
            return false;
        }

        const prevShieldLvl = this.getSkillLvl('shield');
        if (!this.skills[id]) this.skills[id] = 0;

        const evoDef = SKILL_DB[id];
        if (evoDef.type === 'evo') {
            for (const key in SKILL_DB) {
                if (SKILL_DB[key].evolveTo === id) {
                    this.skills[key] = 0;
                }
            }
            this.skills[id] = 1;
            if (this.evolvedSkills) this.evolvedSkills.add(id);
            AchievementSystem.onEvolution(id);
        } else {
            this.skills[id]++;
        }

        if (id === 'shield') {
            const newShieldLvl = this.getSkillLvl('shield');
            if (prevShieldLvl === 0 && newShieldLvl === 1) {
                this.shieldCharges = 1;
                this.stats.shieldTimer = 0;
            } else if (prevShieldLvl === 4 && newShieldLvl === 5) {
                this.shieldCharges = Math.min(2, (this.shieldCharges || 0) + 1);
                if (this.shieldCharges >= 2) {
                    this.stats.shieldTimer = 0;
                }
            }
        }

        if (Meta.data) {
            Meta.recordSkillDiscovered(id);
            if (this.skills[id] >= evoDef.max) {
                Meta.recordSkillMaxed(id);
            }
        }

        const prevHp = this.hp;
        this.recalcStats();
        if (evoDef.type === 'passive') this.pilotVisuals.showPassive(id, state.frameCount);
        if (state.xpTelemetry) {
            const tel = state.xpTelemetry;
            if (choiceSource === 'skillbox') {
                tel.skillBoxSkillsCount++;
            }
            if (id === 'exp') {
                tel.expSkillTimeline.push({
                    lvl: this.getSkillLvl('exp'),
                    expMult: this.stats.expMult,
                    timeSec: state.gameTime,
                    frameCount: state.frameCount,
                    source: choiceSource
                });
            }
            const slots = this.getSlotCounts();
            if (slots.weapon >= slots.maxWeapon && tel.weaponSlotsFilledTimeSec === null) {
                tel.weaponSlotsFilledTimeSec = state.gameTime;
                tel.weaponSlotsFilledFrame = state.frameCount;
                tel.weaponSlotsFilledSource = choiceSource;
            }
            if (slots.passive >= slots.maxPassive && tel.passiveSlotsFilledTimeSec === null) {
                tel.passiveSlotsFilledTimeSec = state.gameTime;
                tel.passiveSlotsFilledFrame = state.frameCount;
                tel.passiveSlotsFilledSource = choiceSource;
            }
            if (evoDef.type === 'evo') {
                tel.evolutionsTimeline.push({
                    id,
                    name: evoDef.name || id,
                    timeSec: state.gameTime,
                    frameCount: state.frameCount,
                    source: choiceSource,
                    playerLvl: this.lvl
                });
            }
        }
        if (id === 'hp' && this.hp > prevHp) {
            this.pilotVisuals.showRepair('hp', this.hp - prevHp, state.frameCount);
            state.texts.push(floatTextPool.acquire(this.x, this.y - 20, '+' + Math.floor(this.hp - prevHp), '#0f0'));
        }
        return true;
    }

    useDash(){
        if(this.dashCd > 0) return;
        if(this.rootTimer > 0) {
            state.texts.push(floatTextPool.acquire(this.x, this.y - 40, 'РЫВОК ЗАБЛОКИРОВАН', '#ff8f9b'));
            return;
        }
        this.dashCd = this.dashMax;
        this.dashActive = 20;
        this.invulnTimer = 36;
        triggerHitStop(3);
        state.texts.push(floatTextPool.acquire(this.x,this.y-40,'РЫВОК!','#0ff'));
    }

    useEmp(){
        if(this.empCd > 0) return;

        if (this.rootTimer > 0) {
            this.rootTimer = 0;
            state.texts.push(floatTextPool.acquire(this.x, this.y - 80, 'СВОБОДА!', '#0f0', 24));
        }

        PilotManager.triggerUltimate(this);
    }

    draw(ctx) {
        const px = this.x - state.camera.x;
        const py = this.y - state.camera.y;

        const heading = Math.atan2(this.lastMoveY, this.lastMoveX);
        ctx.save();
        this.pilotVisuals.drawWorld(ctx, state.camera, state.frameCount);
        WeaponSystem.draw(ctx, this);

        if (this.rootTimer > 0) {
            ctx.strokeStyle = '#ff0055';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(px - 20, py - 20); ctx.lineTo(px + 20, py + 20);
            ctx.moveTo(px + 20, py - 20); ctx.lineTo(px - 20, py + 20);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(px, py, this.r + 10, 0, Math.PI * 2);
            ctx.stroke();
        }

        this.pilotVisuals.drawLocal(ctx, this, px, py, heading, state.frameCount);

        ctx.save();
        if (this.stealthTimer > 0) {
            ctx.globalAlpha *= 0.57 + Math.sin(state.frameCount * 0.15) * 0.08;
        } else if (this.invulnTimer > 0) {
            ctx.globalAlpha *= 0.74 + Math.sin(state.frameCount * 0.37) * 0.16;
        }
        const motion = Math.hypot(this.vx, this.vy);
        const thrust = motion > 0 ? Math.min(1.6, motion / 8) + 0.12 * Math.sin(state.frameCount * 0.35) : 0;
        drawHull(ctx, this.pilotId, this.color, px, py, this.r + 2, heading, thrust);
        ctx.restore();

        const hpPct = clamp(this.hp / this.maxHp, 0, 1);
        ctx.fillStyle = '#132531';
        ctx.fillRect(px - 21, py + 26, 42, 5);
        ctx.fillStyle = hpPct > 0.3 ? '#93e7b0' : '#ff8b95';
        ctx.fillRect(px - 20, py + 27, 40 * hpPct, 3);
        ctx.restore();
    }

    spawnParticles(color, count, x = this.x, y = this.y) {
        for (let i = 0; i < count; i++) {
            state.particles.push(particlePool.acquire(x, y, color, 2 + Math.random() * 2));
        }
    }
}
