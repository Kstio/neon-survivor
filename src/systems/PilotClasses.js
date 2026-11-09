import { playSound } from '../sounds.js';
import { floatTextPool } from '../entities/Particle.js';
import { triggerShake, triggerHitStop, state } from '../GameState.js';
import { calcDmg, clamp, checkWall } from '../utils.js';
import { WeaponSystem } from './WeaponSystem.js';
import { WORLD_SIZE } from '../constants.js';

export const PILOTS = {
    vanguard: {
        id: 'vanguard',
        name: 'Штурмовик',
        model: 'VANGUARD-MK1',
        subtitle: 'Тактический флагман',
        desc: 'Сбалансированная боевая машина переднего края. Повышенная огневая мощь, скорострельность и быстрый маневренный рывок.',
        starterSkill: 'multi',
        color: '#00ffff',
        accentColor: '#0088cc',
        unlockCost: 0,
        stats: {
            fireRateBonus: 0.15,
            dashCdBonus: 0.25,
            dmgMultBonus: 0.10,
            speedBonus: 0.05
        },
        ultName: 'Овердрайв',
        ultDesc: 'На 4 с даёт барьер и гарантирует критический урон ×2. Бластер, задняя турель и гравипушка стреляют в 1,5 раза чаще.',
        ultCd: 1200
    },
    mechanist: {
        id: 'mechanist',
        name: 'Инженер',
        model: 'MECH-FORGE-02',
        subtitle: 'Мастер дронов и автономных систем',
        desc: 'Управляет роем защитных турелей и нанитов. Увеличенная зона сбора чипов и усиленный сплэш-урон.',
        starterSkill: 'orbit',
        color: '#ffea00',
        accentColor: '#cc9900',
        unlockCost: 300,
        stats: {
            extraOrbitals: 1,
            magnetBonus: 80,
            splashDmgBonus: 0.25,
            maxHpBonus: 15
        },
        ultName: 'ЭМИ-Импульс',
        ultDesc: 'Корабль и каждый спутник выпускают импульс радиусом 240 px. Их пересечение усиливает один удар по цели.',
        ultCd: 1320
    },
    phantom: {
        id: 'phantom',
        name: 'Фантом',
        model: 'GHOST-RAY-03',
        subtitle: 'Прототип скрытности и аннигиляции',
        desc: 'Сверхскоростное шасси с квантовыми приводами. Высокий шанс критического попадания и маскировка.',
        starterSkill: 'laser',
        color: '#ff00aa',
        accentColor: '#990066',
        unlockCost: 600,
        stats: {
            speedBonus: 0.12,
            critBonus: 0.15,
            pierceBonus: 1,
            dodgeBonus: 0.08
        },
        ultName: 'Фазовый Сдвиг',
        ultDesc: 'Скачок до 260 px по направлению движения поражает врагов на пути. Стена останавливает скачок. Маскировка длится 3 с.',
        ultCd: 1200
    },
    colossus: {
        id: 'colossus',
        name: 'Колосс',
        model: 'TITAN-HULL-04',
        subtitle: 'Тяжелая осадная платформа',
        desc: 'Несокрушимый бастион. Повышенная прочность, поглощение урона и мощное отталкивание кинетическими зарядами.',
        starterSkill: 'fatboy',
        color: '#00ff88',
        accentColor: '#009944',
        unlockCost: 1000,
        stats: {
            maxHpBonus: 40,
            armorBonus: 2,
            resistBonus: 0.10,
            pushBonus: 0.6
        },
        ultName: 'Сейсмо-Удар',
        ultDesc: 'Волна радиусом 380 px наносит урон, отталкивает и замедляет врагов. Сила толчка убывает с расстоянием.',
        ultCd: 1500
    }
};

export class PilotManager {
    static getPilot(id) {
        return PILOTS[id] || PILOTS.vanguard;
    }

    static applyPilotPassive(player, pilotId) {
        const pilot = this.getPilot(pilotId);
        player.pilotId = pilot.id;
        player.color = pilot.color;
        player.empMax = pilot.ultCd;
        player.empCd = 0;

        if (pilot.starterSkill) {
            player.skills[pilot.starterSkill] = (player.skills[pilot.starterSkill] || 0) + 1;
            if (pilot.starterSkill === 'orbit') {
                player.orbitals = (player.orbitals || 0) + 1;
            }
        }

        if (pilot.stats.dashCdBonus) {
            player.dashMax = Math.round(150 * (1 - pilot.stats.dashCdBonus));
        }

        player.recalcStats();
    }

    static triggerUltimate(player) {
        if (!player || player.empCd > 0) return false;

        const pilot = this.getPilot(player.pilotId);
        player.empCd = pilot.ultCd;
        playSound('powerUp');
        triggerShake(10, 20);

        if (pilot.id === 'vanguard') {

            player.overdriveTimer = 240;
            player.overdriveShield = 60 + player.lvl * 8;
            player.invulnTimer = 25;
            state.texts.push(floatTextPool.acquire(player.x, player.y - 70, 'ОВЕРДРАЙВ', pilot.color, 18));
        }
        else if (pilot.id === 'mechanist') {

            state.texts.push(floatTextPool.acquire(player.x, player.y - 70, 'ЭМИ-ИМПУЛЬС', pilot.color, 18));
            const origins = [{ x: player.x, y: player.y }];

            if (player.orbitals > 0) {
                const count = player.orbitals;
                const dist = WeaponSystem.getOrbitalRadius(player);
                for (let i = 0; i < count; i++) {
                    const angle = player.orbitalAngle + (i * (Math.PI * 2 / count));
                    origins.push({ x: player.x + Math.cos(angle) * dist, y: player.y + Math.sin(angle) * dist });
                }
            }

            const range = 240;
            player.pilotVisuals.cast = { kind: 'emp', frame: state.frameCount, origins, radius: range };
            const hitMap = new Map();

            origins.forEach(origin => {
                const candidates = state.enemySpatialGrid ? state.enemySpatialGrid.queryCircle(origin.x, origin.y, range) : state.enemies;
                candidates.forEach(e => {
                    if (e.isDead) return;
                    const d = Math.hypot(e.x - origin.x, e.y - origin.y);
                    if (d < range) {
                        const entry = hitMap.get(e);
                        if (!entry) {
                            hitMap.set(e, { bestDist: d, origin, hits: 1 });
                        } else {
                            entry.hits++;
                            if (d < entry.bestDist) {
                                entry.bestDist = d;
                                entry.origin = origin;
                            }
                        }
                    }
                });
            });

            hitMap.forEach((entry, e) => {
                const baseShock = 85 + player.lvl * 9;
                const overlapBonus = Math.min(0.5, (entry.hits - 1) * 0.15);
                const d = calcDmg(baseShock * (1 + overlapBonus), player.stats);
                e.takeDamage(d.val, d.isCrit);
                e.freezeTimer = Math.max(e.freezeTimer || 0, e.isBoss ? 25 : 65);
                const dist = entry.bestDist || 1;
                const ox = entry.origin.x;
                const oy = entry.origin.y;
                if (dist > 0.001) {
                    e.pushX += ((e.x - ox) / dist) * 10;
                    e.pushY += ((e.y - oy) / dist) * 10;
                }
            });

            playSound('laser');
        }
        else if (pilot.id === 'phantom') {

            state.texts.push(floatTextPool.acquire(player.x, player.y - 70, 'ФАЗОВЫЙ СДВИГ', pilot.color, 18));
            const blinkDist = 260;
            let dirX = player.lastMoveX || 0;
            let dirY = player.lastMoveY ?? -1;
            if (!dirX && !dirY) dirY = -1;
            if (player.vx !== 0 || player.vy !== 0) {
                const len = Math.hypot(player.vx, player.vy);
                if (len > 0.001) {
                    dirX = player.vx / len;
                    dirY = player.vy / len;
                }
            }

            let actualDist = 0;
            const stepSize = 10;
            for (let d = stepSize; d <= blinkDist; d += stepSize) {
                const tx = clamp(player.x + dirX * d, 30, WORLD_SIZE - 30);
                const ty = clamp(player.y + dirY * d, 30, WORLD_SIZE - 30);
                if (checkWall(tx, ty, player.r)) {
                    break;
                }
                actualDist = d;
            }

            const oldX = player.x;
            const oldY = player.y;
            player.x = clamp(player.x + dirX * actualDist, 30, WORLD_SIZE - 30);
            player.y = clamp(player.y + dirY * actualDist, 30, WORLD_SIZE - 30);
            dirX = actualDist ? (player.x - oldX) / actualDist : 0;
            dirY = actualDist ? (player.y - oldY) / actualDist : 0;
            player.invulnTimer = 45;
            player.stealthTimer = 180;

            const steps = Math.max(1, Math.floor(actualDist / 35));
            const hitRadius = 85;
            player.pilotVisuals.cast = {
                kind: 'blink', frame: state.frameCount, x: oldX, y: oldY,
                endX: player.x, endY: player.y, radius: hitRadius, steps
            };
            const hitEnemies = new Set();
            for (let step = 0; step <= steps; step++) {
                const px = oldX + dirX * (actualDist * (step / steps));
                const py = oldY + dirY * (actualDist * (step / steps));
                const near = state.enemySpatialGrid ? state.enemySpatialGrid.queryCircle(px, py, hitRadius) : state.enemies;
                near.forEach(e => {
                    if (!e.isDead && !hitEnemies.has(e.id) && Math.hypot(e.x - px, e.y - py) < hitRadius) {
                        hitEnemies.add(e.id);
                        const d = calcDmg(130 + player.lvl * 14, player.stats);
                        e.takeDamage(d.val, d.isCrit);
                    }
                });
            }
            playSound('laser');
        }
        else if (pilot.id === 'colossus') {

            state.texts.push(floatTextPool.acquire(player.x, player.y - 70, 'СЕЙСМОУДАР', pilot.color, 18));
            triggerShake(16, 25);
            triggerHitStop(8);
            const shockRadius = 380;
            player.pilotVisuals.cast = { kind: 'seismic', frame: state.frameCount, x: player.x, y: player.y, radius: shockRadius };
            const enemies = state.enemySpatialGrid ? state.enemySpatialGrid.queryCircle(player.x, player.y, shockRadius) : state.enemies;

            enemies.forEach(e => {
                if (!e.isDead) {
                    const dist = Math.hypot(e.x - player.x, e.y - player.y);
                    if (dist < shockRadius) {
                        const d = calcDmg(140 + player.lvl * 16, player.stats);
                        e.takeDamage(d.val, d.isCrit);
                        const pushMult = Math.max(6, 20 * (1 - dist / shockRadius)) * (1 + (player.stats.pushBonus || 0));
                        if (dist > 0.001) {
                            e.pushX += ((e.x - player.x) / dist) * pushMult;
                            e.pushY += ((e.y - player.y) / dist) * pushMult;
                        } else {
                            e.pushY -= pushMult;
                        }
                        e.freezeTimer = Math.max(e.freezeTimer || 0, e.isBoss ? 20 : 55);
                    }
                }
            });

            playSound('explosion');
        }

        return true;
    }
}
