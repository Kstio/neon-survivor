import { state } from '../GameState.js';
import { checkWall, calcDmg, raycastWall } from '../utils.js';
import { Bullet } from './Bullet.js';
import { FloatText, Particle } from './Particle.js';
import { SCREEN_W, SCREEN_H } from '../constants.js';
import { playSound } from '../sounds.js';

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
        this.buffTimer = 0;

        this.vx = 0;
        this.vy = 0;

        const difficultyMultiplier = state.globalDifficulty; 
        const speedBoost = 1 + Math.min(0.5, state.gameTime / 600); 

        this.hp = 80 * difficultyMultiplier;
        this.baseSpeed = 3.5 * speedBoost;
        this.size = 16;
        this.color = '#f05';
        this.xp = 15;
        this.dmg = 10 * difficultyMultiplier;
        this.shootTimer = Math.random() * 100;

        this.turnSpeed = 0.15; 
        this.sensorRange = 120; 

        if (type === 'tank') { 
            this.hp = 300 * difficultyMultiplier; 
            this.baseSpeed = 1.8 * speedBoost; 
            this.size = 28; 
            this.color = '#ff8800'; 
            this.xp = 50; 
            this.dmg = 25 * difficultyMultiplier; 
            this.turnSpeed = 0.08; 
        }
        else if (type === 'runner') { 
            this.hp = 40 * difficultyMultiplier; 
            this.baseSpeed = 6.0 * speedBoost; 
            this.size = 12; 
            this.color = '#ff0055'; 
            this.xp = 20; 
            this.dmg = 8 * difficultyMultiplier; 
            this.turnSpeed = 0.25; 
        }
        else if (type === 'shooter') { 
            this.hp = 70 * difficultyMultiplier; 
            this.baseSpeed = 2.5 * speedBoost; 
            this.size = 18; 
            this.color = '#a0f'; 
            this.xp = 30; 
            this.dmg = 15 * difficultyMultiplier; 
        }
        else if (type === 'kamikaze') { 
            this.hp = 30 * difficultyMultiplier; 
            this.baseSpeed = 8.0 * speedBoost; 
            this.size = 14; 
            this.color = '#00ff00'; 
            this.xp = 25; 
            this.dmg = 60 * difficultyMultiplier; 
            this.turnSpeed = 0.2;
        }
        else if (type === 'dasher') { 
            this.hp = 120 * difficultyMultiplier; 
            this.baseSpeed = 4.0 * speedBoost; 
            this.size = 16; 
            this.color = '#00ffff'; 
            this.xp = 35; 
            this.dmg = 15 * difficultyMultiplier; 
        }
        else if (type === 'titan') { 
            this.hp = 8000 * difficultyMultiplier; 
            this.baseSpeed = 1.8 * speedBoost; 
            this.size = 60; 
            this.color = '#700000'; 
            this.xp = 2000; 
            this.dmg = 60 * difficultyMultiplier;
            this.abilityCaptureCd = 300; 
            this.abilityBuffCd = 600;
            this.turnSpeed = 0.05; 
            this.sensorRange = 180;
        }
        else if (type === 'elite') { 
            this.hp = 250 * difficultyMultiplier; 
            this.baseSpeed = 3.0 * speedBoost; 
            this.size = 22; 
            this.color = '#ffff00'; 
            this.xp = 80; 
            this.dmg = 20 * difficultyMultiplier; 
        }

        this.maxHp = this.hp;
        this.dashTimer = 0;
    }

    update() {
        if (this.attackCd > 0) this.attackCd--;
        if (!state.player) return;

        let currentMaxSpeed = this.baseSpeed * this.speedMult;
        
        if (this.buffTimer > 0) {
            this.buffTimer--;
            currentMaxSpeed *= 1.3;
            if (state.frameCount % 15 === 0) state.particles.push(new Particle(this.x, this.y, '#ff0000', 2));
        } else {
            this.speedMult = 1;
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
            if (this.dashTimer > 120) {
                currentMaxSpeed *= 4;
                if (this.dashTimer > 140) this.dashTimer = 0;
            }
        }

        let dx = state.player.x - this.x;
        let dy = state.player.y - this.y;
        let distToPlayer = Math.hypot(dx, dy);
        
        if (distToPlayer > 0) {
            dx /= distToPlayer;
            dy /= distToPlayer;
        }

        if (this.type === 'shooter') {
            this.shootTimer++;
            if (distToPlayer < 200) { dx = -dx; dy = -dy; } 
            else if (distToPlayer < 350) {
                const strafeA = Math.atan2(dy, dx) + Math.PI/2;
                dx = Math.cos(strafeA) * 0.5;
                dy = Math.sin(strafeA) * 0.5;
            }
            if (this.shootTimer > 140) {
                const angleToPlayer = Math.atan2(state.player.y - this.y, state.player.x - this.x);
                state.enemyBullets.push(new Bullet(this.x, this.y, angleToPlayer, this.dmg, 6, false));
                this.shootTimer = 0;
            }
        }

        const baseAngle = Math.atan2(dy, dx);
        const rayLen = this.sensorRange;
        
        let bestDirX = dx;
        let bestDirY = dy;
        let foundPath = false;

        if (!raycastWall(this.x, this.y, this.x + dx * rayLen, this.y + dy * rayLen)) {
            foundPath = true;
        } else {
            const step = 20 * (Math.PI / 180); 
            const maxSteps = 5; 

            for (let i = 1; i <= maxSteps; i++) {
                const offset = step * i;
                
                const a1 = baseAngle + offset;
                const dx1 = Math.cos(a1);
                const dy1 = Math.sin(a1);
                if (!raycastWall(this.x, this.y, this.x + dx1 * rayLen, this.y + dy1 * rayLen)) {
                    bestDirX = dx1;
                    bestDirY = dy1;
                    foundPath = true;
                    break; 
                }

                const a2 = baseAngle - offset;
                const dx2 = Math.cos(a2);
                const dy2 = Math.sin(a2);
                if (!raycastWall(this.x, this.y, this.x + dx2 * rayLen, this.y + dy2 * rayLen)) {
                    bestDirX = dx2;
                    bestDirY = dy2;
                    foundPath = true;
                    break;
                }
            }
        }

        if (foundPath) {
            dx = bestDirX;
            dy = bestDirY;
        }

        let sepX = 0, sepY = 0;
        const checkCount = 3; 
        let count = 0;
        for(let i=0; i<checkCount; i++) {
            const other = state.enemies[Math.floor(Math.random() * state.enemies.length)];
            if(other && other !== this && !other.isDead) {
                const d = Math.hypot(this.x - other.x, this.y - other.y);
                if(d < this.size + other.size && d > 0) {
                    const push = (this.size + other.size - d) / (this.size + other.size);
                    sepX += (this.x - other.x) / d * push;
                    sepY += (this.y - other.y) / d * push;
                    count++;
                }
            }
        }
        if(count > 0) {
            dx += sepX * 2.0;
            dy += sepY * 2.0;
            const l = Math.hypot(dx, dy) || 1;
            dx /= l;
            dy /= l;
        }

        const targetVx = dx * currentMaxSpeed;
        const targetVy = dy * currentMaxSpeed;

        this.vx += (targetVx - this.vx) * this.turnSpeed;
        this.vy += (targetVy - this.vy) * this.turnSpeed;

        this.vx += this.pushX;
        this.vy += this.pushY;
        this.pushX *= 0.8;
        this.pushY *= 0.8;

        const nextX = this.x + this.vx;
        const nextY = this.y + this.vy;

        if (checkWall(nextX, this.y, this.size)) {
            this.vx = 0;
        } else {
            this.x = nextX;
        }

        if (checkWall(this.x, nextY, this.size)) {
            this.vy = 0;
        } else {
            this.y = nextY;
        }

        if (distToPlayer < this.size + state.player.r) {
            if (this.attackCd <= 0) {
                state.player.takeDamage(this.dmg);
                this.attackCd = 60;
                
                if (this.type === 'kamikaze') this.takeDamage(9999, false);
                
                const angle = Math.atan2(state.player.y - this.y, state.player.x - this.x);
                this.pushX = -Math.cos(angle) * 8; 
                this.pushY = -Math.sin(angle) * 8;
            }
        }
    }

    updateTitanLogic() {
        const distPlayer = Math.hypot(state.player.x - this.x, state.player.y - this.y);

        if (this.abilityCaptureCd > 0) this.abilityCaptureCd--;
        else {
            if (distPlayer < 400) { 
                state.player.applyRoot(240); 
                this.abilityCaptureCd = 600 + Math.random() * 300; 
                
                state.texts.push(new FloatText(this.x, this.y - 80, 'ЗАХВАТ!', '#fff', 30));
                for(let k=0; k<15; k++) {
                    const px = this.x + (state.player.x - this.x) * (k/15);
                    const py = this.y + (state.player.y - this.y) * (k/15);
                    state.particles.push(new Particle(px, py, '#ff0055', 5));
                }
            }
        }

        if (this.abilityBuffCd > 0) this.abilityBuffCd--;
        else {
            this.abilityBuffCd = 900 + Math.random() * 300; 
            state.texts.push(new FloatText(this.x, this.y - 100, 'ЯРОСТЬ!', '#ff0000', 36));
            playSound('powerUp'); 
            
            state.enemies.forEach(e => {
                if (!e.isDead && e !== this) {
                    e.buffTimer = 900 + Math.floor(Math.random() * 300); 
                    state.texts.push(new FloatText(e.x, e.y - 20, '^^^', '#f00', 12));
                }
            });
            
            for(let k=0; k<30; k++) {
                const a = (Math.PI * 2 * k) / 30;
                const px = this.x + Math.cos(a) * 80;
                const py = this.y + Math.sin(a) * 80;
                state.particles.push(new Particle(px, py, '#ff0000', 6));
            }
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

        this.pushX += (Math.random() - 0.5) * 5;
        this.pushY += (Math.random() - 0.5) * 5;

        if (this.hp <= 0) {
            this.isDead = true;
            state.score += this.xp;
            playSound('explosion');

            if (state.player && Math.random() < state.player.stats.vampChance) {
                state.player.heal(5);
            }

            for (let i = 0; i < 6; i++) {
                state.particles.push(new Particle(this.x, this.y, this.color, 2 + Math.random() * 2));
            }

            state.gems.push({ x: this.x, y: this.y, val: this.xp, mag: false });

            if (state.player && state.player.getSkillLvl('boom') > 0) {
                const boomLvl = state.player.getSkillLvl('boom');
                const range = boomLvl >= 3 ? 160 : 100; 
                
                for(let i=0; i<10; i++) state.particles.push(new Particle(this.x, this.y, '#ff0000', 3));
                
                const boomBase = (state.player.lvl * 3) + (boomLvl * 15); 
                
                state.enemies.forEach(e => {
                    if (e !== this && !e.isDead) {
                        const dist = Math.hypot(e.x - this.x, e.y - this.y);
                        if (dist < range) {
                            const normDist = dist / range;
                            const damageFactor = Math.max(0.1, Math.pow(1 - normDist, 3));
                            const d = calcDmg(boomBase * damageFactor, state.player.stats);
                            e.takeDamage(d.val, d.isCrit);
                        }
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

        let angle = 0;
        if (Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1) {
            angle = Math.atan2(this.vy, this.vx);
        } else if (state.player) {
            angle = Math.atan2(state.player.y - this.y, state.player.x - this.x);
        }

        ctx.save();
        ctx.translate(sx, sy);

        ctx.fillStyle = this.color;
        
        if (this.type === 'titan') {
            ctx.beginPath();
            ctx.arc(0, 0, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#fff';
            ctx.stroke();

            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.moveTo(0, -20);
            ctx.lineTo(20, 0);
            ctx.lineTo(0, 20);
            ctx.lineTo(-20, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            const hpPct = Math.max(0, this.hp / this.maxHp);
            ctx.fillStyle = '#000';
            ctx.fillRect(-40, -60, 80, 8);
            ctx.fillStyle = '#f00';
            ctx.fillRect(-40, -60, 80 * hpPct, 8);

        } else if (this.type === 'shooter') {
            const aimAngle = state.player ? Math.atan2(state.player.y - this.y, state.player.x - this.x) : 0;
            ctx.rotate(aimAngle);
            ctx.beginPath();
            ctx.moveTo(0, -15);
            ctx.lineTo(15, 15);
            ctx.lineTo(-15, 15);
            ctx.fill();
        } else if (this.type === 'tank') {
            ctx.rotate(angle);
            ctx.fillRect(-20, -20, 40, 40);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.strokeRect(-20, -20, 40, 40);
        } else if (this.type === 'kamikaze') {
            ctx.rotate(angle + Math.PI/2);
            ctx.beginPath();
            ctx.moveTo(0, -15);
            ctx.lineTo(15, 15);
            ctx.lineTo(-15, 15);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.arc(0, 0, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
}