import { state, triggerShake, triggerHitStop } from '../GameState.js';
import { WEAPON_INTERVALS, SKILL_DB, BALANCE } from '../constants.js';
import { calcDmg, checkWall, findNearestEnemies, findNearestVisibleEnemies, raycastWall } from '../utils.js';
import { bulletPool } from '../entities/Bullet.js';
import { minePool, addMineWithLimit } from '../entities/Items.js';
import { particlePool, floatTextPool } from '../entities/Particle.js';
import { playSound } from '../sounds.js';
import { Meta } from '../MetaGame.js';
import { drawWeaponFields } from './WeaponVisuals.js';

const BLACKHOLE_ACTIVE_TICKS = 179;
const BLACKHOLE_DAMPING = 0.965;
const BLACKHOLE_INIT_SPEED_FACTOR = 0.55;
const BLACKHOLE_CENTER_TRAVEL_FACTOR = BLACKHOLE_INIT_SPEED_FACTOR * (
    BLACKHOLE_DAMPING * (1 - Math.pow(BLACKHOLE_DAMPING, BLACKHOLE_ACTIVE_TICKS)) / (1 - BLACKHOLE_DAMPING)
);
const BLACKHOLE_MAX_CORE_RADIUS = 60;
const MAX_SHOTS_PER_TICK = 4;

export class WeaponSystem {
    static getOrbitalRadius(player) {
        if (player.getSkillLvl('neural')) return 90 + SKILL_DB.orbit.max * 10 + 18;
        return 90 + player.getSkillLvl('orbit') * 10;
    }

    static getAutoCooldownMult(player) {
        if (Number.isFinite(player?.stats?.autoCooldownMult)) {
            return player.stats.autoCooldownMult;
        }
        const spdLvl = player ? player.getSkillLvl('spd') : 0;
        return Math.max(0.70, 1.0 - spdLvl * 0.03);
    }

    static stepAutoTimer(player, timerKey, baseInterval, tryFire) {
        const mult = WeaponSystem.getAutoCooldownMult(player);
        const effInterval = Math.max(1, (Number.isFinite(baseInterval) ? baseInterval : 30) * mult);
        const cur = Number.isFinite(player[timerKey]) ? player[timerKey] : 0;
        const next = cur >= effInterval ? effInterval : (cur + 1);

        if (next >= effInterval - 1e-9) {
            const fired = tryFire();
            if (fired) {
                const rem = next - effInterval;
                player[timerKey] = Math.min(0.999999, Math.max(0, rem));
                return true;
            }
            player[timerKey] = effInterval;
            return false;
        }

        player[timerKey] = next;
        return false;
    }

    static getAuraParams(player) {
        const auraLvl = player.getSkillLvl('aura');
        const bloodLvl = player.getSkillLvl('blood_circle');
        const hasAura = auraLvl > 0 || bloodLvl > 0;
        if (!hasAura) {
            return { hasAura: false, auraLvl: 0, bloodLvl: 0, totalAuraLvl: 0, tickRate: 0, effTickRate: 0, range: 0 };
        }
        const effAuraLvl = bloodLvl > 0 ? SKILL_DB.aura.max : auraLvl;
        const totalAuraLvl = effAuraLvl + bloodLvl;
        const tickRate = WEAPON_INTERVALS.aura(totalAuraLvl);
        const effTickRate = tickRate * WeaponSystem.getAutoCooldownMult(player);
        const range = bloodLvl > 0 ? 245 : (175 + (totalAuraLvl * 12));
        return { hasAura: true, auraLvl, bloodLvl, totalAuraLvl, tickRate, effTickRate, range };
    }

    static update(player, keys, mouse) {
        if (player.bloodCircleHealCd > 0) {
            player.bloodCircleHealCd--;
        }
        if (player.devourerHealCd > 0) {
            player.devourerHealCd--;
        }

        const { hasAura, bloodLvl, totalAuraLvl, tickRate, range } = WeaponSystem.getAuraParams(player);

        if (hasAura) {

            const grid = state.enemySpatialGrid;
            const candidates = grid ? grid.queryCircle(player.x, player.y, range) : state.enemies;
            for (let i = 0; i < candidates.length; i++) {
                const e = candidates[i];
                if (!e.isDead && Math.hypot(e.x - player.x, e.y - player.y) < range) {
                    if (raycastWall(player.x, player.y, e.x, e.y)) continue;

                    e.freezeTimer = Math.max(e.freezeTimer || 0, 15);
                }
            }

            WeaponSystem.stepAutoTimer(player, 'auraTimer', tickRate, () => {
                for (let i = 0; i < candidates.length; i++) {
                    const e = candidates[i];
                    if (!e.isDead && Math.hypot(e.x - player.x, e.y - player.y) < range) {
                        if (raycastWall(player.x, player.y, e.x, e.y)) continue;

                        const flatDmg = 16 + (totalAuraLvl * 7);
                        const pctDmg = Math.min(e.maxHp * (0.015 * totalAuraLvl), 30 + (15 * totalAuraLvl));
                        const rawAuraDmg = flatDmg + pctDmg;
                        const d = calcDmg(rawAuraDmg, player.stats);
                        const killed = e.takeDamage(d.val, d.isCrit);

                        const dist = Math.hypot(e.x - player.x, e.y - player.y) || 1;
                        e.pushX += ((e.x - player.x) / dist) * 3;
                        e.pushY += ((e.y - player.y) / dist) * 3;

                        if (killed && bloodLvl > 0 && player.bloodCircleHealCd <= 0 && Math.random() < 0.25) {
                            player.heal(3, 'blood_circle');
                            player.bloodCircleHealCd = 12;
                        }

                        player.spawnParticles(bloodLvl > 0 ? '#ed91a7' : '#9ce4d8', 1, e.x, e.y);
                    }
                }
                return true;
            });
        }

        const minesLvl = player.getSkillLvl('mines');
        const vacLvl = player.getSkillLvl('vacuum');
        const effMinesLvl = vacLvl > 0 ? SKILL_DB.mines.max : minesLvl;
        const totalMine = effMinesLvl + vacLvl;

        if (totalMine > 0) {
            const mineCooldown = WEAPON_INTERVALS.mines(totalMine);
            WeaponSystem.stepAutoTimer(player, 'mineTimer', mineCooldown, () => {
                const spawnCount = Math.min(6, 1 + totalMine);
                for (let i = 0; i < spawnCount; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const dist = 30 + Math.random() * 50;
                    let mx = player.x + Math.cos(angle) * dist;
                    let my = player.y + Math.sin(angle) * dist;
                    if (checkWall(mx, my, 6) || raycastWall(player.x, player.y, mx, my)) {
                        mx = player.x;
                        my = player.y;
                    }
                    addMineWithLimit(minePool.acquire(mx, my, totalMine, player.lvl, vacLvl > 0));
                }
                return true;
            });
        }

        const laserLvl = player.getSkillLvl('laser');
        const rayLvl = player.getSkillLvl('deathray');
        const effLaserLvl = rayLvl > 0 ? SKILL_DB.laser.max : laserLvl;
        const totalLaser = effLaserLvl + rayLvl;

        if (totalLaser > 0) {
            const cd = rayLvl > 0 ? 14 : WEAPON_INTERVALS.laser(effLaserLvl);
            WeaponSystem.stepAutoTimer(player, 'laserTimer', cd, () => {
                const targetCount = rayLvl > 0 ? 2 : Math.min(5, 1 + effLaserLvl);

                const maxLaserRange = 760;
                const targets = findNearestVisibleEnemies(player.x, player.y, targetCount, maxLaserRange);
                if (targets.length === 0) return false;

                const dmgBase = 70 + (player.lvl * 8) + (totalLaser * 15);
                targets.forEach(target => {
                    const d = calcDmg(dmgBase, player.stats);

                    if (rayLvl > 0) {
                        const angle = Math.atan2(target.y - player.y, target.x - player.x);
                        state.bullets.push(bulletPool.acquire(player.x, player.y, angle, d.val, 40, true, d.isCrit, 'deathray'));
                    } else {
                        target.takeDamage(d.val, d.isCrit);
                        player.spawnParticles('#ff00ff', 8, target.x, target.y);
                        player.laserBeams.push({ kind: 'laser', fromX: player.x, fromY: player.y, x: target.x, y: target.y, life: 12, alpha: 1 });
                    }
                });
                return true;
            });
        }

        const teslaLvl = player.getSkillLvl('tesla');
        if (teslaLvl > 0) {
            const teslaCd = WEAPON_INTERVALS.tesla(teslaLvl);
            WeaponSystem.stepAutoTimer(player, 'teslaTimer', teslaCd, () => {
                const targets = findNearestVisibleEnemies(player.x, player.y, 2 + teslaLvl, 440);
                if (targets.length === 0) return false;

                targets.forEach(t => {
                    const d = calcDmg(50 + teslaLvl * 22, player.stats);
                    t.takeDamage(d.val, d.isCrit);
                    t.pushX += (Math.random() - 0.5) * 6;
                    t.pushY += (Math.random() - 0.5) * 6;
                    player.laserBeams.push({ kind: 'tesla', fromX: player.x, fromY: player.y, x: t.x, y: t.y, life: 10, alpha: 1 });
                });
                playSound('laser');
                return true;
            });
        }

        const rawKatanaLvl = player.getSkillLvl('katana');
        const dimLvl = player.getSkillLvl('dimension_cut');
        const isDimensionCut = dimLvl > 0;
        const effKatanaLvl = isDimensionCut ? SKILL_DB.katana.max : rawKatanaLvl;
        const katanaLvl = effKatanaLvl + dimLvl;
        if (katanaLvl > 0) {
            const katanaCooldown = isDimensionCut ? 22 : WEAPON_INTERVALS.katana(effKatanaLvl);
            WeaponSystem.stepAutoTimer(player, 'katanaTimer', katanaCooldown, () => {

                let aimAngle = null;
                const nearest = (isDimensionCut
                    ? findNearestEnemies(player.x, player.y, 1)
                    : findNearestVisibleEnemies(player.x, player.y, 1))[0];
                if (nearest) {
                    aimAngle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
                } else if (mouse && mouse.active && !Meta.data?.autoAim) {
                    aimAngle = Math.atan2(mouse.y + state.camera.y - player.y, mouse.x + state.camera.x - player.x);
                } else if (isDimensionCut) {
                    aimAngle = 0;
                }

                if (aimAngle === null) return false;

                const dmg = isDimensionCut ? 340 : (125 + (effKatanaLvl * 32));
                const d = calcDmg(dmg, player.stats);
                const slashCount = isDimensionCut ? 3 : (effKatanaLvl >= 3 ? 2 : 1);
                const swingHitList = [];

                for (let s = 0; s < slashCount; s++) {
                    const offsetAngle = (s - (slashCount - 1) / 2) * 0.45;
                    const b = bulletPool.acquire(player.x, player.y, aimAngle + offsetAngle, d.val, 0, true, d.isCrit, 'katana');
                    b.size = isDimensionCut ? 80 : 52 + (effKatanaLvl * 4);
                    b.isDimensionCut = isDimensionCut;
                    b.pushForce = 14;
                    b.hitList = swingHitList;
                    state.bullets.push(b);
                }

                playSound('hit');
                return true;
            });
        }

        const rawBoomLvl = player.getSkillLvl('boomerang');
        const thunderLvl = player.getSkillLvl('thunder_blade');
        const effBoomLvl = thunderLvl > 0 ? SKILL_DB.boomerang.max : rawBoomLvl;
        const boomLvl = effBoomLvl + thunderLvl;
        if (boomLvl > 0) {
            const boomCd = WEAPON_INTERVALS.boomerang(boomLvl);
            WeaponSystem.stepAutoTimer(player, 'boomerangTimer', boomCd, () => {
                const near = findNearestEnemies(player.x, player.y, 1)[0];
                const angle = near ? Math.atan2(near.y - player.y, near.x - player.x) : Math.random() * Math.PI * 2;
                const dmgBase = thunderLvl > 0 ? 175 : (65 + effBoomLvl * 18);
                const d = calcDmg(dmgBase, player.stats);
                const b = bulletPool.acquire(player.x, player.y, angle, d.val, 14, true, d.isCrit, 'boomerang');
                b.isThunderBlade = thunderLvl > 0;
                state.bullets.push(b);
                playSound('laser');
                return true;
            });
        }

        const plasmaLvl = player.getSkillLvl('plasma_shot');
        const novaLvl = player.getSkillLvl('supernova');
        if (plasmaLvl > 0 || novaLvl > 0) {
            const effPlasmaLvl = novaLvl > 0 ? SKILL_DB.plasma_shot.max : plasmaLvl;
            const cd = novaLvl > 0 ? 44 : WEAPON_INTERVALS.plasma_shot(effPlasmaLvl);
            WeaponSystem.stepAutoTimer(player, 'plasmaTimer', cd, () => {
                const near = findNearestVisibleEnemies(player.x, player.y, 1)[0];
                let aimAngle = null;
                if (near) aimAngle = Math.atan2(near.y - player.y, near.x - player.x);
                else if (mouse && mouse.active && !Meta.data?.autoAim) aimAngle = Math.atan2(mouse.y + state.camera.y - player.y, mouse.x + state.camera.x - player.x);

                if (aimAngle === null) return false;

                const dmgBase = novaLvl > 0 ? 370 : (125 + effPlasmaLvl * 32);
                const d = calcDmg(dmgBase, player.stats);
                const bType = novaLvl > 0 ? 'supernova' : 'plasma';
                state.bullets.push(bulletPool.acquire(player.x, player.y, aimAngle, d.val, 8, true, d.isCrit, bType));
                playSound('laser');
                return true;
            });
        }

        const cryoLvl = player.getSkillLvl('cryo_beam');
        const absLvl = player.getSkillLvl('absolute_zero');
        if (cryoLvl > 0 || absLvl > 0) {
            const effCryoLvl = absLvl > 0 ? SKILL_DB.cryo_beam.max : cryoLvl;
            const cd = absLvl > 0 ? 24 : WEAPON_INTERVALS.cryo_beam(effCryoLvl);
            WeaponSystem.stepAutoTimer(player, 'cryoTimer', cd, () => {
                const near = findNearestVisibleEnemies(player.x, player.y, 1)[0];
                let aimAngle = null;
                if (near) aimAngle = Math.atan2(near.y - player.y, near.x - player.x);
                else if (mouse && mouse.active && !Meta.data?.autoAim) aimAngle = Math.atan2(mouse.y + state.camera.y - player.y, mouse.x + state.camera.x - player.x);

                if (aimAngle === null) return false;

                const shardCount = absLvl > 0 ? 5 : Math.min(4, 2 + effCryoLvl);
                const spreadArc = 0.72;
                const dmgBase = absLvl > 0 ? 115 : (38 + effCryoLvl * 11);
                const volleyHitStates = new Map();
                for (let i = 0; i < shardCount; i++) {
                    const offset = (i - (shardCount - 1) / 2) * (spreadArc / shardCount);
                    const d = calcDmg(dmgBase, player.stats);
                    const b = bulletPool.acquire(player.x, player.y, aimAngle + offset, d.val, 11, true, d.isCrit, 'cryo');
                    b.isAbsoluteZero = absLvl > 0;
                    b.volleyHitStates = volleyHitStates;
                    state.bullets.push(b);
                }
                return true;
            });
        }

        const naniteLvl = player.getSkillLvl('nanite_swarm');
        const devourLvl = player.getSkillLvl('devourer');
        if (naniteLvl > 0 || devourLvl > 0) {
            const effNaniteLvl = devourLvl > 0 ? SKILL_DB.nanite_swarm.max : naniteLvl;
            const totalNaniteLvl = effNaniteLvl + devourLvl;
            const cd = WEAPON_INTERVALS.nanite_swarm(totalNaniteLvl);
            WeaponSystem.stepAutoTimer(player, 'naniteTimer', cd, () => {
                const count = Math.min(5, 2 + effNaniteLvl);
                for (let i = 0; i < count; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const d = calcDmg(35 + effNaniteLvl * 12 + devourLvl * 25, player.stats);
                    const b = bulletPool.acquire(player.x, player.y, a, d.val, 6, true, d.isCrit, 'nanite');
                    b.isDevourer = devourLvl > 0;
                    state.bullets.push(b);
                }
                return true;
            });
        }

        const orbitLvl = player.getSkillLvl('orbit');
        const neuralLvl = player.getSkillLvl('neural');
        const effOrbitLvl = neuralLvl > 0 ? SKILL_DB.orbit.max : orbitLvl;
        const spinSpeed = 0.05 + (effOrbitLvl * 0.01) + (neuralLvl * 0.05);
        player.orbitalAngle += spinSpeed;

        if (orbitLvl > 0 || neuralLvl > 0) {
            if (!player.orbitalHitCooldowns) {
                player.orbitalHitCooldowns = new Map();
            }
            player.orbitalTick = (player.orbitalTick || 0) + 1;
            const hitCooldown = neuralLvl > 0 ? 10 : 12;
            if (player.orbitalTick % 60 === 0 && player.orbitalHitCooldowns.size > 0) {
                for (const [k, expTick] of player.orbitalHitCooldowns) {
                    if (expTick <= player.orbitalTick) {
                        player.orbitalHitCooldowns.delete(k);
                    }
                }
            }

            const count = player.orbitals;
            const dist = WeaponSystem.getOrbitalRadius(player);
            const orbDmg = neuralLvl > 0 ? 125 : (45 + (effOrbitLvl * 14));
            const grid = state.enemySpatialGrid;
            for (let i = 0; i < count; i++) {
                const orbAngle = player.orbitalAngle + (i * (Math.PI * 2 / Math.max(1, count)));
                const ox = player.x + Math.cos(orbAngle) * dist;
                const oy = player.y + Math.sin(orbAngle) * dist;

                if (checkWall(ox, oy, 2) || raycastWall(player.x, player.y, ox, oy)) {
                    continue;
                }

                const candidates = grid ? grid.queryCircle(ox, oy, 24) : state.enemies;
                for (let j = 0; j < candidates.length; j++) {
                    const e = candidates[j];
                    if (!e.isDead && Math.hypot(e.x - ox, e.y - oy) < e.size + 12) {
                        if (raycastWall(ox, oy, e.x, e.y)) {
                            continue;
                        }
                        const hitKey = `${i}:${e.id}`;
                        const nextAllowedTick = player.orbitalHitCooldowns.get(hitKey) || 0;
                        if (player.orbitalTick < nextAllowedTick) {
                            continue;
                        }
                        player.orbitalHitCooldowns.set(hitKey, player.orbitalTick + hitCooldown);

                        const d = calcDmg(orbDmg, player.stats);
                        e.takeDamage(d.val, d.isCrit);
                        e.pushX += Math.cos(orbAngle) * 3;
                        e.pushY += Math.sin(orbAngle) * 3;
                    }
                }
            }
        }

        if (state.isPaused) return;

        const overdriveMult = player.overdriveTimer > 0 ? 1 / 1.5 : 1;
        const rateMult = (player.stats.fireRateMult || 1) * overdriveMult;

        let frontalTargetAngle = null;
        if (mouse && mouse.active && !Meta.data?.autoAim) {
            const mx = mouse.x + state.camera.x;
            const my = mouse.y + state.camera.y;
            frontalTargetAngle = Math.atan2(my - player.y, mx - player.x);
        } else {
            const near = findNearestVisibleEnemies(player.x, player.y, 1)[0];
            if (near) {
                frontalTargetAngle = Math.atan2(near.y - player.y, near.x - player.x);
            }
        }

        const isGatling = player.getSkillLvl('gatling') > 0;
        const frontalBaseRate = isGatling ? 4.5 : 28;
        const frontalInterval = frontalBaseRate * rateMult;
        WeaponSystem.stepTimer(
            player,
            'fireTimer',
            frontalInterval,
            frontalTargetAngle !== null,
            () => WeaponSystem.shootFrontal(player, frontalTargetAngle)
        );

        if (player.getSkillLvl('blackhole') > 0) {
            let bhTargetAngle = null;
            if (mouse && mouse.active && !Meta.data?.autoAim) {
                const mx = mouse.x + state.camera.x;
                const my = mouse.y + state.camera.y;
                bhTargetAngle = Math.atan2(my - player.y, mx - player.x);
            } else {
                const bhTarget = WeaponSystem.findBlackholeTarget(player);
                if (bhTarget) {
                    bhTargetAngle = Math.atan2(bhTarget.y - player.y, bhTarget.x - player.x);
                }
            }

            const bhInterval = 50 * rateMult;
            WeaponSystem.stepTimer(
                player,
                'blackholeTimer',
                bhInterval,
                bhTargetAngle !== null,
                () => WeaponSystem.shootBlackhole(player, bhTargetAngle)
            );
        } else {
            player.blackholeTimer = 0;
        }

        const rearLvl = player.getSkillLvl('rear');
        const fortLvl = player.getSkillLvl('fortress');
        if (rearLvl > 0 || fortLvl > 0) {
            const rearInterval = 26 * rateMult;
            WeaponSystem.stepTimer(
                player,
                'rearTimer',
                rearInterval,
                true,
                () => {
                    const rearAngle = WeaponSystem.resolveRearAngle(player, keys, frontalTargetAngle);
                    WeaponSystem.shootRear(player, rearAngle);
                }
            );
        } else {
            player.rearTimer = 0;
        }

        for (let i = player.laserBeams.length - 1; i >= 0; i--) {
            const b = player.laserBeams[i];
            b.life--;
            b.alpha -= 0.08;
            if (b.life <= 0) {
                const last = player.laserBeams.pop();
                if (i < player.laserBeams.length) player.laserBeams[i] = last;
            }
        }
    }

    static stepTimer(player, timerKey, interval, hasTarget, onFire) {
        const safeInterval = Math.max(0.25, Number.isFinite(interval) ? interval : 28);
        let timer = Number.isFinite(player[timerKey]) ? player[timerKey] : 0;

        if (timer > safeInterval) {
            timer = safeInterval;
        }

        if (!hasTarget) {
            player[timerKey] = timer > 0 ? Math.max(0, timer - 1) : 0;
            return 0;
        }

        if (timer > 0) {
            timer -= 1;
        }

        let shots = 0;
        while (timer <= 0 && shots < MAX_SHOTS_PER_TICK) {
            onFire();
            timer += safeInterval;
            shots++;
        }

        if (timer < 0) {
            timer = 0;
        }

        player[timerKey] = timer;
        return shots;
    }

    static getBlackholeCenterTravel(player) {
        const spd = player.bulletSpeed * (player.stats.bulletSpdMult || 1);
        return spd * BLACKHOLE_CENTER_TRAVEL_FACTOR;
    }

    static getBlackholeMaxCoreReach(player, enemySize = 16) {
        return WeaponSystem.getBlackholeCenterTravel(player) + BLACKHOLE_MAX_CORE_RADIUS + enemySize - 0.5;
    }

    static findBlackholeTarget(player) {
        const centerTravel = WeaponSystem.getBlackholeCenterTravel(player);
        const enemies = state.enemies;
        let bestEnemy = null;
        let minDist = Infinity;

        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (e.isDead) continue;
            const d = Math.hypot(e.x - player.x, e.y - player.y);
            const maxReach = centerTravel + BLACKHOLE_MAX_CORE_RADIUS + (e.size || 16) - 0.5;
            if (d > maxReach) continue;
            if (raycastWall(player.x, player.y, e.x, e.y)) continue;
            if (d < minDist) {
                minDist = d;
                bestEnemy = e;
            }
        }
        return bestEnemy;
    }

    static resolveRearAngle(player, keys = {}, frontalTargetAngle = null) {
        let moveX = 0;
        let moveY = 0;
        if (player.rootTimer <= 0 && keys) {
            if (keys.w || keys.ArrowUp || keys.up) moveY -= 1;
            if (keys.s || keys.ArrowDown || keys.down) moveY += 1;
            if (keys.a || keys.ArrowLeft || keys.left) moveX -= 1;
            if (keys.d || keys.ArrowRight || keys.right) moveX += 1;
        }

        if (moveX === 0 && moveY === 0 && Math.hypot(player.vx || 0, player.vy || 0) > 0.001) {
            moveX = player.vx;
            moveY = player.vy;
        }

        if (moveX !== 0 || moveY !== 0) {
            const len = Math.hypot(moveX, moveY) || 1;
            player.lastMoveX = moveX / len;
            player.lastMoveY = moveY / len;
            return Math.atan2(player.lastMoveY, player.lastMoveX) + Math.PI;
        }

        if (frontalTargetAngle !== null && Number.isFinite(frontalTargetAngle)) {
            return frontalTargetAngle + Math.PI;
        }

        const hasLastMove = Number.isFinite(player.lastMoveX) && Number.isFinite(player.lastMoveY) &&
            (player.lastMoveX !== 0 || player.lastMoveY !== 0);
        const lmx = hasLastMove ? player.lastMoveX : 0;
        const lmy = hasLastMove ? player.lastMoveY : -1;
        return Math.atan2(lmy, lmx) + Math.PI;
    }

    static shootFrontal(player, angle) {
        const cnt = player.stats.bulletCount;
        const spread = player.stats.spread;

        const isGatling = player.getSkillLvl('gatling') > 0;
        const actualCnt = isGatling ? 1 : cnt;
        const startA = angle - (actualCnt - 1) * spread / 2;

        const multiPenalty = isGatling ? 0.5 : Math.max(0.45, 1.0 - (player.getSkillLvl('multi') * 0.12));
        const hasBlackhole = player.getSkillLvl('blackhole') > 0;
        const fatBoyLvl = hasBlackhole ? 0 : (player.stats.fatBoy || player.getSkillLvl('fatboy') || 0);
        const fatBoyMult = fatBoyLvl > 0 ? (1.0 + 0.15 * fatBoyLvl) : 1.0;

        const dmgBase = player.dmg * multiPenalty * fatBoyMult;
        let spd = player.bulletSpeed * player.stats.bulletSpdMult;

        if (isGatling) {
            spd *= 1.5;
        }

        playSound('laser');

        const type = fatBoyLvl > 0 ? 'fatboy' : 'normal';
        const pushBonusMult = 1 + (player.stats.pushBonus || 0);

        for (let i = 0; i < actualCnt; i++) {
            const d = calcDmg(dmgBase, player.stats);
            const b = bulletPool.acquire(player.x, player.y, startA + i * spread, d.val, spd, true, d.isCrit, type);
            b.isGatlingRound = isGatling;
            if (type === 'fatboy') {
                b.size = 8 + 2 * fatBoyLvl;
                b.pushForce = (3.0 + 0.7 * fatBoyLvl) * pushBonusMult;
            } else {
                b.pushForce = 1 * pushBonusMult;
            }

            b.pierce = player.stats.pierce || 0;

            state.bullets.push(b);
        }
    }

    static shootBlackhole(player, angle) {
        const spd = player.bulletSpeed * player.stats.bulletSpdMult;
        const dmgBase = player.dmg * 4.0;
        const d = calcDmg(dmgBase, player.stats);
        const b = bulletPool.acquire(player.x, player.y, angle, d.val, spd, true, d.isCrit, 'blackhole');
        b.pushForce = 0;
        state.bullets.push(b);
    }

    static shootRear(player, rearBaseAngle) {
        const rearLvl = player.getSkillLvl('rear');
        const fortLvl = player.getSkillLvl('fortress');
        if (rearLvl <= 0 && fortLvl <= 0) return;

        const isGatling = player.getSkillLvl('gatling') > 0;
        let spd = player.bulletSpeed * player.stats.bulletSpdMult;
        if (isGatling) {
            spd *= 1.5;
        }

        const rearSpread = 0.18;
        const count = fortLvl > 0 ? 5 : rearLvl;
        const rearStartA = rearBaseAngle - (count - 1) * rearSpread / 2;
        const rearDmgBase = player.dmg * 1.6;
        const pushBonusMult = 1 + (player.stats.pushBonus || 0);

        for (let i = 0; i < count; i++) {
            const d = calcDmg(rearDmgBase, player.stats);
            const type = fortLvl > 0 ? 'fatboy' : 'normal';
            const b = bulletPool.acquire(player.x, player.y, rearStartA + i * rearSpread, d.val, spd, true, d.isCrit, type);
            b.isRearRound = true;
            if (fortLvl > 0) {
                b.size = 10;
                b.pushForce = 9 * pushBonusMult;
            } else {
                b.pushForce = 5 * pushBonusMult;
            }
            b.pierce = player.stats.pierce || 0;
            state.bullets.push(b);
        }
    }

    static shoot(player, angle, keys = {}) {
        WeaponSystem.shootFrontal(player, angle);
        if (player.getSkillLvl('blackhole') > 0) {
            WeaponSystem.shootBlackhole(player, angle);
        }
        if (player.getSkillLvl('rear') > 0 || player.getSkillLvl('fortress') > 0) {
            const rearAngle = WeaponSystem.resolveRearAngle(player, keys, angle);
            WeaponSystem.shootRear(player, rearAngle);
        }
    }

    static draw(ctx, player) {
        drawWeaponFields(ctx, player, WeaponSystem.getAuraParams(player), WeaponSystem.getOrbitalRadius(player));
    }
}
