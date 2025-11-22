import { state } from '../GameState.js';
import { WORLD_SIZE } from '../constants.js';
import { clamp, checkWall, calcDmg, findNearestEnemies } from '../utils.js';
import { Bullet } from './Bullet.js';
import { FloatText, Particle } from './Particle.js';
import { Mine } from './Items.js';
import { playSound } from '../sounds.js';
import { Meta } from '../MetaGame.js';

export class Player {
    constructor() {
        this.x = WORLD_SIZE / 2;
        this.y = WORLD_SIZE / 2;
        this.r = 15;
        this.color = '#00ffff';

        const extraHp = Meta.getUpgradeValue('startHp') || 0;
        const dmgMultBonus = Meta.getUpgradeValue('startDmg') || 1;

        this.maxHp = 100 + extraHp;
        this.hp = this.maxHp;

        this.baseSpeed = 5;
        this.speed = 5;
        
        this.dmg = 40;
        this.bulletSpeed = 14;
        this.fireTimer = 0;
        this.bulletLife = 60;
        this.orbitals = 0;
        this.laserBeams = [];
        
        this.skills = {};
        this.stats = {
            dmgMult: 1 * dmgMultBonus, 
            fireRateMult: 1, bulletCount: 1, spread: 0.12, bulletSpdMult: 1,
            critChance: 0, dodge: 0, thorns: 0, regen: 0, magnet: 120, expMult: 1,
            vampChance: 0, shieldMax: 0, shieldTimer: 0, pierce: 0, ricochet: 0
        };
        
        this.shieldReady = false;
        this.auraTimer = 0;
        this.orbitalAngle = 0;
        this.mineTimer = 0;
        this.laserTimer = 0;
        
        this.dashCd = 0;
        this.dashMax = 150;
        this.dashActive = 0;
        this.invulnTimer = 0; 

        this.empCd = 0;
        this.empMax = 1200;
        
        this.xp = 0;
        this.lvl = 1;
        this.nextXp = 50;

        this.rootTimer = 0;
    }

    getSkillLvl(id) { return this.skills[id] || 0; }

    applyRoot(duration) {
        if (this.invulnTimer > 0 || this.dashActive > 0) return; 
        
        if (this.rootTimer > 0) return; 
        this.rootTimer = duration;
        state.texts.push(new FloatText(this.x, this.y - 60, 'ЗАХВАТ!', '#ff0055', 24));
        playSound('hit');
    }

    update(keys, mouse) {
        if (this.invulnTimer > 0) this.invulnTimer--;
        if (this.rootTimer > 0) {
            this.rootTimer--;
            if (this.rootTimer <= 0) {
                state.texts.push(new FloatText(this.x, this.y - 40, 'СВОБОДЕН!', '#0f0', 18));
            }
        }

        if (this.stats.regen > 0 && this.hp < this.maxHp && state.frameCount % 60 === 0) {
            this.heal(this.stats.regen);
        }

        if (this.stats.shieldMax > 0 && !this.shieldReady) {
            this.stats.shieldTimer++;
            const cd = Math.max(60, 360 - (this.getSkillLvl('shield') * 50));
            if (this.stats.shieldTimer > cd) {
                this.shieldReady = true;
                state.texts.push(new FloatText(this.x, this.y - 40, 'ЩИТ ГОТОВ', '#00ffff'));
                this.spawnParticles('#00ffff', 8);
            }
        }

        const auraLvl = this.getSkillLvl('aura');
        if (auraLvl > 0) {
            this.auraTimer++;
            const tickRate = Math.max(10, 60 - (auraLvl * 8));
            if (this.auraTimer > tickRate) {
                const dmgBase = 5 + (this.lvl * 0.5);
                const range = auraLvl >= 3 ? 250 : 150;
                state.enemies.forEach(e => {
                    if (!e.isDead && Math.hypot(e.x - this.x, e.y - this.y) < range) {
                        const d = calcDmg(dmgBase, this.stats);
                        e.takeDamage(d.val, d.isCrit);
                        this.spawnParticles('#00ffff', 1, e.x, e.y);
                    }
                });
                this.auraTimer = 0;
            }
        }

        const minesLvl = this.getSkillLvl('mines');
        if (minesLvl > 0) {
            this.mineTimer++;
            if (this.mineTimer > 120) {
                for (let i = 0; i < minesLvl; i++) {
                    const offX = (Math.random() - 0.5) * 60;
                    const offY = (Math.random() - 0.5) * 60;
                    state.obstacles.push(new Mine(this.x + offX, this.y + offY, minesLvl, this.lvl));
                }
                this.mineTimer = 0;
            }
        }

        const laserLvl = this.getSkillLvl('laser');
        if (laserLvl > 0) {
            this.laserTimer++;
            const cd = Math.max(40, 180 - (laserLvl * 5));
            if (this.laserTimer > cd) {
                const targets = findNearestEnemies(this.x, this.y, laserLvl);
                if (targets.length > 0) {
                    const dmgBase = 60 + (this.lvl * 5);
                    targets.forEach(target => {
                        const d = calcDmg(dmgBase, this.stats);
                        target.takeDamage(d.val, d.isCrit);
                        this.spawnParticles('#ff00ff', 12, target.x, target.y);
                        this.laserBeams.push({ x: target.x, y: target.y, life: 15, alpha: 1 });
                    });
                    this.laserTimer = 0;
                }
            }
        }

        if (this.getSkillLvl('freeze') > 0) {
            const range = 200 + (this.getSkillLvl('freeze') * 20);
            state.enemies.forEach(e => {
                if (!e.isDead && Math.hypot(e.x - this.x, e.y - this.y) < range) e.speedMult = 0.5;
            });
        }

        this.orbitalAngle += 0.04;
        if (this.dashCd > 0) this.dashCd--;
        if (this.empCd > 0) this.empCd--;

        let dx = 0, dy = 0;
        
        if (this.rootTimer <= 0) {
            if (keys.w) dy = -1;
            if (keys.s) dy = 1;
            if (keys.a) dx = -1;
            if (keys.d) dx = 1;
        } else {
            this.x += (Math.random() - 0.5) * 2;
            this.y += (Math.random() - 0.5) * 2;
        }

        let inSlowZone = false;
        for (const zone of state.slowZones) {
            if (this.x > zone.x && this.x < zone.x + zone.w &&
                this.y > zone.y && this.y < zone.y + zone.h) {
                inSlowZone = true;
                break;
            }
        }

        let currSpeed = this.speed;
        if (inSlowZone && this.dashActive <= 0) {
            currSpeed *= 0.5;
        }

        if (this.dashActive > 0) {
            this.dashActive--;
            currSpeed *= 2.4; 
            if (state.frameCount % 3 === 0) state.particles.push(new Particle(this.x, this.y, '#00ffff', 3));
        }

        if (dx !== 0 || dy !== 0) {
            const len = Math.hypot(dx, dy) || 1;
            const s = currSpeed / len;
            let nx = this.x + dx * s, ny = this.y + dy * s;
            if (!checkWall(nx, this.y, this.r)) this.x = nx;
            if (!checkWall(this.x, ny, this.r)) this.y = ny;
        }
        this.x = clamp(this.x, 20, WORLD_SIZE - 20);
        this.y = clamp(this.y, 20, WORLD_SIZE - 20);

        if (this.fireTimer > 0) this.fireTimer--; else {
            let targetAngle = null;
            if (mouse.active) {
                const mx = mouse.x + state.camera.x;
                const my = mouse.y + state.camera.y;
                targetAngle = Math.atan2(my - this.y, mx - this.x);
            } else {
                const near = findNearestEnemies(this.x, this.y, 1)[0];
                if (near) targetAngle = Math.atan2(near.y - this.y, near.x - this.x);
            }

            if (targetAngle !== null) {
                this.shoot(targetAngle);
                const baseRate = 30;
                this.fireTimer = Math.max(4, Math.floor(baseRate * this.stats.fireRateMult));
            }
        }

        this.laserBeams.forEach(b => { b.life--; b.alpha -= 0.06; });
        this.laserBeams = this.laserBeams.filter(b => b.life > 0);
    }

    shoot(angle) {
        const cnt = this.stats.bulletCount;
        const spread = this.stats.spread;
        const startA = angle - (cnt - 1) * spread / 2;
        const dmgBase = this.dmg;
        const spd = this.bulletSpeed * this.stats.bulletSpdMult;

        playSound('laser');

        for (let i = 0; i < cnt; i++) {
            const d = calcDmg(dmgBase, this.stats);
            state.bullets.push(new Bullet(this.x, this.y, startA + i * spread, d.val, spd, true, d.isCrit));
        }

        const rearLvl = this.getSkillLvl('rear');
        if (rearLvl > 0) {
            const rearBaseAngle = angle + Math.PI;
            const rearSpread = 0.15;
            const rearStartA = rearBaseAngle - (rearLvl - 1) * rearSpread / 2;
            for (let i = 0; i < rearLvl; i++) {
                const d = calcDmg(dmgBase, this.stats);
                state.bullets.push(new Bullet(this.x, this.y, rearStartA + i * rearSpread, d.val, spd, true, d.isCrit));
            }
        }
    }

    takeDamage(amt) {
        if (this.invulnTimer > 0 || this.dashActive > 0) return;

        if (this.shieldReady) {
            this.shieldReady = false;
            this.stats.shieldTimer = 0;

            const slvl = this.getSkillLvl('shield');
            const blastDmg = 80 + (slvl * 30); 
            const blastRange = 160 + (slvl * 20); 

            state.enemies.forEach(e => {
                if (!e.isDead) {
                    const dist = Math.hypot(e.x - this.x, e.y - this.y);
                    if (dist < blastRange) {
                        const normDist = dist / blastRange;
                        const damageFactor = Math.max(0.1, Math.pow(1 - normDist, 3));
                        
                        e.takeDamage(blastDmg * damageFactor, true);
                        e.pushX = (e.x - this.x) * 0.2;
                        e.pushY = (e.y - this.y) * 0.2;
                    }
                }
            });

            state.texts.push(new FloatText(this.x, this.y - 50, 'SHIELD BLAST!', '#00ffff', 18));
            this.spawnParticles('#00ffff', 20);
            
            playSound('hit');
            return;
        }

        if (Math.random() < this.stats.dodge) {
            state.texts.push(new FloatText(this.x, this.y - 40, 'УКЛОН!', '#fff'));
            return;
        }

        const finalDmg = Math.max(1, amt - (this.armor || 0));
        this.hp -= finalDmg;
        state.texts.push(new FloatText(this.x, this.y - 30, `-${Math.floor(finalDmg)}`, '#f00'));

        if (this.stats.thorns > 0) {
            const thornBase = this.stats.thorns + (this.lvl * 2);
            const range = this.getSkillLvl('thorns') >= 3 ? 250 : 150;
            state.enemies.forEach(e => {
                if (!e.isDead && Math.hypot(e.x - this.x, e.y - this.y) < range) {
                    const d = calcDmg(thornBase, this.stats);
                    e.takeDamage(d.val, d.isCrit);
                }
            });
        }

        if (this.hp <= 0) {
            state.isRunning = false;
            const event = new CustomEvent('game-over');
            window.dispatchEvent(event);
        }
    }

    heal(amt) {
        this.hp = Math.min(this.maxHp, this.hp + amt);
        state.texts.push(new FloatText(this.x, this.y - 20, '+' + amt, '#0f0'));
    }

    gainXp(a) {
        this.xp += a * this.stats.expMult;
        if (this.xp >= this.nextXp) {
            const event = new CustomEvent('level-up');
            window.dispatchEvent(event);
            playSound('powerUp')
        }
        playSound('levelup')
    }
    
    recalcStats(){ 
        const baseDmgBonus = Meta.getUpgradeValue('startDmg') || 1;
        this.stats.dmgMult = baseDmgBonus + (this.getSkillLvl('dmg')*0.2); 

        this.stats.fireRateMult = Math.pow(0.85,this.getSkillLvl('spd')); 
        this.stats.bulletCount = 1 + this.getSkillLvl('multi'); 
        this.stats.bulletSpdMult = 1 + (this.getSkillLvl('sniper')*0.25); 
        this.stats.critChance = this.getSkillLvl('crit')*0.1; 
        this.stats.dodge = this.getSkillLvl('dodge')*0.1; 
        this.stats.thorns = this.getSkillLvl('thorns')*8; 
        this.stats.regen = this.getSkillLvl('regen')*2; 
        this.stats.magnet = 120 + (this.getSkillLvl('mag')*40); 
        this.stats.expMult = 1 + (this.getSkillLvl('exp')*0.2); 
        this.stats.vampChance = this.getSkillLvl('vamp')*0.05; 
        this.speed = this.baseSpeed * (1 + (this.getSkillLvl('speed')*0.1)); 
        this.armor = this.getSkillLvl('armor')*2; 
        this.stats.shieldMax = this.getSkillLvl('shield'); 
        this.orbitals = this.getSkillLvl('orbit');
    }
    
    addSkill(id){ 
        if(!this.skills[id]) this.skills[id]=0; 
        this.skills[id]++; 
        if(id==='hp'){ this.maxHp+=20; this.heal(20); } 
        this.recalcStats();
    }
    
    useDash(){ 
        if(this.dashCd > 0) return; 
        if(this.rootTimer > 0) {
            state.texts.push(new FloatText(this.x, this.y - 40, 'НЕЛЬЗЯ!', '#f00'));
            return;
        }
        this.dashCd = this.dashMax; 
        this.dashActive = 20;
        this.invulnTimer = 36;
        state.texts.push(new FloatText(this.x,this.y-40,'РЫВОК!','#0ff'));
    }
    
    useEmp(){ 
        if(this.empCd > 0) return; 
        this.empCd = this.empMax; 
        
        if (this.rootTimer > 0) {
            this.rootTimer = 0;
            state.texts.push(new FloatText(this.x, this.y - 80, 'СВОБОДА!', '#0f0', 24));
        }

        this.spawnParticles('#00ffff', 24);
        
        const empBase = 60 + (this.lvl * 20); 
        
        state.enemies.forEach(e=>{ 
            const dist = Math.hypot(e.x - this.x, e.y - this.y);
            if(!e.isDead && dist < 320) {
                const d = calcDmg(empBase, this.stats);
                e.takeDamage(d.val, d.isCrit);
            }
        }); 
        state.texts.push(new FloatText(this.x,this.y-60,'ЭМИ УДАР!','#0ff'));
        playSound('explosion');
    }

    draw(ctx) {
        const px = this.x - state.camera.x;
        const py = this.y - state.camera.y;

        if (this.invulnTimer > 0) {
            ctx.globalAlpha = 0.6 + Math.sin(state.frameCount * 0.5) * 0.4;
        }

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

        const auraLvl = this.getSkillLvl('aura');
        if (auraLvl > 0) {
            const range = auraLvl >= 3 ? 250 : 150;
            ctx.beginPath();
            ctx.arc(px, py, range, 0, Math.PI * 2);
            ctx.fillStyle = auraLvl >= 3 ? 'rgba(255,50,50,0.08)' : 'rgba(0,255,255,0.08)';
            ctx.fill();
            ctx.strokeStyle = auraLvl >= 3 ? 'rgba(255,50,50,0.25)' : 'rgba(0,255,255,0.2)';
            ctx.stroke();
        }

        if (this.shieldReady) {
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(px, py, this.r + 6, 0, Math.PI * 2);
            ctx.stroke();
        }

        const orbitLvl = this.getSkillLvl('orbit');
        if (orbitLvl > 0) {
            const count = this.orbitals;
            const dist = 100 + (orbitLvl * 12);
            for (let i = 0; i < count; i++) {
                const angle = this.orbitalAngle + (i * (Math.PI * 2 / Math.max(1, count)));
                const ox = px + Math.cos(angle) * dist;
                const oy = py + Math.sin(angle) * dist;
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(ox, oy, 7, 0, Math.PI * 2);
                ctx.fill();
                if (orbitLvl >= 3) {
                    const nextAngle = this.orbitalAngle + (((i + 1) % count) * (Math.PI * 2 / Math.max(1, count)));
                    const nax = px + Math.cos(nextAngle) * dist;
                    const nay = py + Math.sin(nextAngle) * dist;
                    ctx.strokeStyle = '#00ffff';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(ox, oy);
                    ctx.lineTo(nax, nay);
                    ctx.stroke();
                }
            }
        }

        this.laserBeams.forEach(b => {
            ctx.save();
            ctx.globalAlpha = b.alpha;
            ctx.strokeStyle = '#ff55ff';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(b.x - state.camera.x, b.y - state.camera.y);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,0,255,0.9)';
            ctx.beginPath();
            ctx.arc(b.x - state.camera.x, b.y - state.camera.y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(px, py, this.r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#222';
        ctx.fillRect(px - 22, py + 26, 44, 6);
        const hpPct = Math.max(0, this.hp / this.maxHp);
        ctx.fillStyle = hpPct > 0.3 ? '#0f0' : '#f00';
        ctx.fillRect(px - 22, py + 26, 44 * hpPct, 6);
        
        ctx.globalAlpha = 1;
    }

    spawnParticles(color, count, x = this.x, y = this.y) {
        for (let i = 0; i < count; i++) {
            state.particles.push(new Particle(x, y, color, 2 + Math.random() * 2));
        }
    }
}