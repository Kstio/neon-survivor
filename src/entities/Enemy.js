import { state } from '../GameState.js';
import { checkWall, calcDmg } from '../utils.js';
import { Bullet } from './Bullet.js';
import { FloatText, Particle } from './Particle.js';
import { SkillCrate } from './Items.js';
import { SCREEN_W, SCREEN_H } from '../constants.js';

export class Enemy {
    constructor(type, x, y) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.pushX = 0;
        this.pushY = 0;
        this.attackCd = 0;
        this.isDead = false;
        this.speedMult = 1;

        this.hp = 80 * state.globalDifficulty;
        this.baseSpeed = 3.5;
        this.size = 16;
        this.color = '#f05';
        this.xp = 15;
        this.dmg = 10;
        this.shootTimer = Math.random() * 100;

        if (type === 'tank') { this.hp = 300 * state.globalDifficulty; this.baseSpeed = 1.8; this.size = 28; this.color = '#ff8800'; this.xp = 50; this.dmg = 25; }
        else if (type === 'runner') { this.hp = 40 * state.globalDifficulty; this.baseSpeed = 6.0; this.size = 12; this.color = '#ff0055'; this.xp = 20; this.dmg = 8; }
        else if (type === 'shooter') { this.hp = 70 * state.globalDifficulty; this.baseSpeed = 2.5; this.size = 18; this.color = '#a0f'; this.xp = 30; this.dmg = 15; }
        else if (type === 'kamikaze') { this.hp = 30 * state.globalDifficulty; this.baseSpeed = 8.0; this.size = 14; this.color = '#00ff00'; this.xp = 25; this.dmg = 60; }
        else if (type === 'dasher') { this.hp = 120 * state.globalDifficulty; this.baseSpeed = 4.0; this.size = 16; this.color = '#00ffff'; this.xp = 35; this.dmg = 15; }
        else if (type === 'titan') { this.hp = 800 * state.globalDifficulty; this.baseSpeed = 1.2; this.size = 40; this.color = '#ff0000'; this.xp = 300; this.dmg = 40; }
        else if (type === 'elite') { this.hp = 250 * state.globalDifficulty; this.baseSpeed = 3.0; this.size = 22; this.color = '#ffff00'; this.xp = 80; this.dmg = 20; }

        this.maxHp = this.hp;
        this.speed = this.baseSpeed;
        this.dashTimer = 0;
    }

    update() {
        if (this.attackCd > 0) this.attackCd--;

        if (!state.player) return;

        const dx = state.player.x - this.x;
        const dy = state.player.y - this.y;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);

        this.x += this.pushX;
        this.y += this.pushY;
        this.pushX *= 0.8;
        this.pushY *= 0.8;

        if (this.type === 'dasher') {
            this.dashTimer++;
            if (this.dashTimer > 120) {
                this.speed = this.baseSpeed * 4;
                if (this.dashTimer > 140) this.dashTimer = 0;
            } else {
                this.speed = this.baseSpeed;
            }
        } else {
            this.speed = this.baseSpeed * this.speedMult;
        }
        this.speedMult = 1;

        if (this.type === 'shooter') {
            if (dist > 350) {
                this.x += Math.cos(angle) * this.speed;
                this.y += Math.sin(angle) * this.speed;
            } else if (dist < 200) {
                this.x -= Math.cos(angle) * (this.speed * 0.5);
                this.y -= Math.sin(angle) * (this.speed * 0.5);
            }
            this.shootTimer++;
            if (this.shootTimer > 140) {
                state.enemyBullets.push(new Bullet(this.x, this.y, angle, this.dmg, 6, false));
                this.shootTimer = 0;
            }
        } else {
            this.x += Math.cos(angle) * this.speed;
            this.y += Math.sin(angle) * this.speed;

            if (dist < this.size + state.player.r) {
                if (this.attackCd <= 0) {
                    state.player.takeDamage(this.dmg);
                    this.attackCd = 60;
                    if (this.type === 'kamikaze') this.takeDamage(9999, false);
                    this.pushX = -Math.cos(angle) * 10;
                    this.pushY = -Math.sin(angle) * 10;
                }
            }
        }

        if (checkWall(this.x, this.y, this.size)) {
            this.x -= Math.cos(angle) * this.speed * 1.5;
            this.y -= Math.sin(angle) * this.speed * 1.5;
        }
    }

    takeDamage(amt, isCrit) {
        if (this.isDead) return false;
        this.hp -= amt;

        if (isCrit) {
            state.texts.push(new FloatText(this.x, this.y - 35, Math.floor(amt) + '!', '#ffcc00', 24));
        } else {
            state.texts.push(new FloatText(this.x, this.y - 20, Math.floor(amt), '#fff', 14));
        }

        this.pushX = (Math.random() - 0.5) * 5;
        this.pushY = (Math.random() - 0.5) * 5;

        if (this.hp <= 0) {
            this.isDead = true;
            state.score += this.xp;

            if (state.player && Math.random() < state.player.stats.vampChance) {
                state.player.heal(5);
            }
            for (let i = 0; i < 6; i++) {
                state.particles.push(new Particle(this.x, this.y, this.color, 2 + Math.random() * 2));
            }

            state.gems.push({ x: this.x, y: this.y, val: this.xp, mag: false });

            if (Math.random() < 0.005) {
                state.skillCrates.push(new SkillCrate(this.x, this.y));
                state.texts.push(new FloatText(this.x, this.y - 50, 'МОДУЛЬ!', '#00ffff'));
            }

            if (state.player && state.player.getSkillLvl('boom') > 0) {
                const boomLvl = state.player.getSkillLvl('boom');
                const range = boomLvl >= 3 ? 200 : 120;
                
                for(let i=0; i<10; i++) state.particles.push(new Particle(this.x, this.y, '#ff0000', 3));

                const boomBase = (state.player.lvl * 5) + (boomLvl * 20);
                state.enemies.forEach(e => {
                    if (e !== this && !e.isDead && Math.hypot(e.x - this.x, e.y - this.y) < range) {
                        const d = calcDmg(boomBase, state.player.stats);
                        e.takeDamage(d.val, d.isCrit);
                    }
                });
            }
            return true;
        }
        return false;
    }

    draw(ctx) {
        const sx = this.x - state.camera.x;
        const sy = this.y - state.camera.y;
        if (sx < -50 || sx > SCREEN_W() + 50 || sy < -50 || sy > SCREEN_H() + 50) return;

        ctx.fillStyle = this.color;
        if (this.type === 'shooter') {
            ctx.beginPath();
            ctx.moveTo(sx, sy - 15);
            ctx.lineTo(sx + 15, sy + 15);
            ctx.lineTo(sx - 15, sy + 15);
            ctx.fill();
        } else if (this.type === 'tank') {
            ctx.fillRect(sx - 20, sy - 20, 40, 40);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.strokeRect(sx - 20, sy - 20, 40, 40);
        } else if (this.type === 'titan') {
            ctx.beginPath();
            ctx.arc(sx, sy, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#fff';
            ctx.stroke();
        } else if (this.type === 'kamikaze') {
            ctx.beginPath();
            ctx.moveTo(sx, sy - 15);
            ctx.lineTo(sx + 15, sy + 15);
            ctx.lineTo(sx - 15, sy + 15);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.arc(sx, sy, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}