import { state, triggerShake, triggerHitStop } from '../GameState.js';
import { SCREEN_W, SCREEN_H, WORLD_SIZE } from '../constants.js';
import { clamp, calcDmg } from '../utils.js';
import { enemyPool } from '../entities/Enemy.js';
import { chipPool, gemPool } from '../entities/Items.js';
import { particlePool, floatTextPool } from '../entities/Particle.js';
import { playSound } from '../sounds.js';

export class DirectorEvents {
    static nextEventTime = 60;
    static activeEvent = null;

    static update() {

        if (state.eventAlert && state.eventAlert.timer > 0) {
            state.eventAlert.timer--;
        }

        if (state.gameTime >= this.nextEventTime && !this.activeEvent) {
            this.triggerRandomEvent();
            this.nextEventTime = state.gameTime + 80 + Math.floor(Math.random() * 40);
        }

        if (this.activeEvent) {
            this.activeEvent.update();
            if (this.activeEvent.isFinished) {
                this.activeEvent = null;
            }
        }

        for (let i = state.directorEvents.length - 1; i >= 0; i--) {
            const ev = state.directorEvents[i];
            ev.update();
            if (ev.isDead) {
                const last = state.directorEvents.pop();
                if (i < state.directorEvents.length) state.directorEvents[i] = last;
            }
        }

        for (let i = state.convoyDrones.length - 1; i >= 0; i--) {
            const drone = state.convoyDrones[i];
            drone.update();
            if (drone.isDead) {
                const last = state.convoyDrones.pop();
                if (i < state.convoyDrones.length) state.convoyDrones[i] = last;
            }
        }
    }

    static triggerRandomEvent() {
        const events = ['orbital_strike', 'energy_storm', 'supply_convoy', 'containment_breach'];
        const chosen = events[Math.floor(Math.random() * events.length)];

        if (chosen === 'orbital_strike') {
            this.startOrbitalStrike();
        } else if (chosen === 'energy_storm') {
            this.startEnergyStorm();
        } else if (chosen === 'supply_convoy') {
            this.startSupplyConvoy();
        } else if (chosen === 'containment_breach') {
            this.startContainmentBreach();
        }
    }

    static showAlert(title, desc, durationFrames = 240) {
        state.eventAlert = {
            title,
            desc,
            timer: durationFrames
        };
        playSound('powerUp');
    }

    static startOrbitalStrike() {
        this.showAlert('ОРБИТАЛЬНЫЙ УДАР', 'СПУТНИКОВАЯ БОМБАРДИРОВКА ЧЕРЕЗ 4 СЕК! ПОКИНЬТЕ ЗОНУ!');
        if (!state.player) return;

        const strikeCount = 6;
        for (let i = 0; i < strikeCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 60 + Math.random() * 320;
            const tx = clamp(state.player.x + Math.cos(angle) * dist, 100, WORLD_SIZE - 100);
            const ty = clamp(state.player.y + Math.sin(angle) * dist, 100, WORLD_SIZE - 100);

            state.directorEvents.push(new OrbitalStrikeZone(tx, ty, 210 + i * 15, 120));
        }
    }

    static startEnergyStorm() {
        this.showAlert('ЭНЕРГЕТИЧЕСКИЙ ШТОРМ', 'АТМОСФЕРНЫЙ РАЗРЯД! КУЛДАУНЫ УСКОРЕНЫ, ОПАСНОСТЬ МОЛНИЙ!');
        this.activeEvent = new EnergyStormEvent(1200);
    }

    static startSupplyConvoy() {
        this.showAlert('ПЕРЕХВАТ КОНВОЯ', 'ТАКТИЧЕСКИЙ ГРУЗОВОЙ ДРОН НА АРЕНЕ! УНИЧТОЖЬТЕ ДО ЭВАКУАЦИИ!');
        if (!state.player) return;

        const side = Math.floor(Math.random() * 4);
        let startX = state.player.x;
        let startY = state.player.y;
        let targetX = state.player.x;
        let targetY = state.player.y;

        const offset = 600;
        if (side === 0) { startX -= offset; targetX += offset; }
        else if (side === 1) { startX += offset; targetX -= offset; }
        else if (side === 2) { startY -= offset; targetY += offset; }
        else { startY += offset; targetY -= offset; }

        state.convoyDrones.push(new ConvoyDrone(startX, startY, targetX, targetY));
    }

    static startContainmentBreach() {
        this.showAlert('ПРОРЫВ СДЕРЖИВАНИЯ', 'ТРЕВОГА 4-ГО УРОВНЯ! ВЫСАДКА ЭЛИТНОГО ШТУРМОВОГО ОТРЯДА!');
        if (!state.player) return;

        const angle = Math.random() * Math.PI * 2;
        const ex = state.player.x + Math.cos(angle) * 450;
        const ey = state.player.y + Math.sin(angle) * 450;

        state.enemies.push(enemyPool.acquire('elite', ex, ey));
        state.enemies.push(enemyPool.acquire('shield_bearer', ex + 40, ey));
        state.enemies.push(enemyPool.acquire('shield_bearer', ex - 40, ey));
        for (let i = 0; i < 5; i++) {
            state.enemies.push(enemyPool.acquire('swarmer', ex + (Math.random() - 0.5) * 80, ey + (Math.random() - 0.5) * 80));
        }
        triggerShake(10, 20);
    }
}

class OrbitalStrikeZone {
    constructor(x, y, windupFrames, radius) {
        this.x = x;
        this.y = y;
        this.maxWindup = windupFrames;
        this.timer = windupFrames;
        this.radius = radius;
        this.isDead = false;
    }

    update() {
        this.timer--;
        if (this.timer <= 0) {
            this.detonate();
            this.isDead = true;
        }
    }

    detonate() {
        playSound('explosion');
        triggerShake(14, 25);
        triggerHitStop(4);

        for (let i = 0; i < 50; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * this.radius;
            state.particles.push(particlePool.acquire(this.x + Math.cos(angle) * dist, this.y + Math.sin(angle) * dist, '#ff0055', 4 + Math.random() * 6));
        }

        const candidates = state.enemySpatialGrid ? state.enemySpatialGrid.queryCircle(this.x, this.y, this.radius) : state.enemies;
        candidates.forEach(e => {
            if (!e.isDead && Math.hypot(e.x - this.x, e.y - this.y) < this.radius) {
                e.takeDamage(450, true);
                e.pushX += (e.x - this.x) * 0.15;
                e.pushY += (e.y - this.y) * 0.15;
            }
        });

        if (state.player) {
            const dist = Math.hypot(state.player.x - this.x, state.player.y - this.y);
            if (dist < this.radius) {
                state.player.takeDamage(35, 'orbital_strike');
            }
        }
    }

    draw(ctx) {
        const sx = this.x - state.camera.x;
        const sy = this.y - state.camera.y;
        const progress = 1 - (this.timer / this.maxWindup);

        ctx.save();
        ctx.translate(sx, sy);

        ctx.strokeStyle = '#ff0055';
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.3 + progress * 0.5;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 0, 85, 0.15)';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * (1 - progress), 0, Math.PI * 2);
        ctx.fill();

        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-15, 0); ctx.lineTo(15, 0);
        ctx.moveTo(0, -15); ctx.lineTo(0, 15);
        ctx.stroke();

        ctx.restore();
    }
}

class EnergyStormEvent {
    constructor(duration) {
        this.duration = duration;
        this.timer = duration;
        this.isFinished = false;
    }

    update() {
        this.timer--;
        if (state.player) {

            if (state.player.dashCd > 0) state.player.dashCd -= 1;
            if (state.player.empCd > 0) state.player.empCd -= 1;
        }

        if (this.timer % 35 === 0 && state.player) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 80 + Math.random() * 300;
            const lx = state.player.x + Math.cos(angle) * dist;
            const ly = state.player.y + Math.sin(angle) * dist;

            for (let i = 0; i < 15; i++) {
                state.particles.push(particlePool.acquire(lx, ly, '#00ffff', 3 + Math.random() * 4));
            }
            playSound('laser');

            const enemies = state.enemySpatialGrid ? state.enemySpatialGrid.queryCircle(lx, ly, 90) : state.enemies;
            enemies.forEach(e => {
                if (!e.isDead && Math.hypot(e.x - lx, e.y - ly) < 90) {
                    e.takeDamage(120, true);
                    e.freezeTimer = 45;
                }
            });
        }

        if (this.timer <= 0) {
            this.isFinished = true;
        }
    }
}

export class ConvoyDrone {
    constructor(x, y, targetX, targetY) {
        this.x = x;
        this.y = y;
        this.targetX = targetX;
        this.targetY = targetY;
        this.hp = 350;
        this.maxHp = 350;
        this.speed = 1.6;
        this.size = 28;
        this.isDead = false;
        this.color = '#ffd700';
    }

    update() {
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 10) {

            this.isDead = true;
            state.texts.push(floatTextPool.acquire(this.x, this.y - 40, 'ДРОН ЭВАКУИРОВАН', '#aaa', 18));
            return;
        }

        this.x += (dx / dist) * this.speed;
        this.y += (dy / dist) * this.speed;

        if (state.frameCount % 20 === 0) {
            state.particles.push(particlePool.acquire(this.x, this.y, '#ffd700', 2));
        }
    }

    takeDamage(amt, isCrit) {
        if (this.isDead) return false;
        this.hp -= amt;
        if (isCrit) {
            state.texts.push(floatTextPool.acquire(this.x, this.y - 25, Math.floor(amt) + '!', '#ffd700', 20));
        }
        if (this.hp <= 0) {
            this.isDead = true;
            playSound('explosion');
            triggerShake(12, 20);
            state.texts.push(floatTextPool.acquire(this.x, this.y - 50, 'ГРУЗ ПЕРЕХВАЧЕН!', '#ffd700', 24));

            for (let i = 0; i < 20; i++) {
                state.chips.push(chipPool.acquire(this.x + (Math.random() - 0.5) * 60, this.y + (Math.random() - 0.5) * 60, 5));
            }
            for (let i = 0; i < 10; i++) {
                state.gems.push(gemPool.acquire(this.x + (Math.random() - 0.5) * 60, this.y + (Math.random() - 0.5) * 60, 40, 'convoy'));
            }
            for (let i = 0; i < 30; i++) {
                state.particles.push(particlePool.acquire(this.x, this.y, '#ffd700', 4 + Math.random() * 5));
            }
            return true;
        }
        return false;
    }

    draw(ctx) {
        const sx = this.x - state.camera.x;
        const sy = this.y - state.camera.y;

        ctx.save();
        ctx.translate(sx, sy);

        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.moveTo(0, -this.size);
        ctx.lineTo(this.size, 0);
        ctx.lineTo(0, this.size);
        ctx.lineTo(-this.size, 0);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();

        const hpPct = Math.max(0, this.hp / this.maxHp);
        ctx.fillStyle = '#222';
        ctx.fillRect(-25, -this.size - 14, 50, 6);
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(-25, -this.size - 14, 50 * hpPct, 6);

        ctx.restore();
    }
}
