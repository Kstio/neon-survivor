import { state } from '../GameState.js';
import { SCREEN_W, SCREEN_H } from '../constants.js';
import { calcDmg, checkWall, raycastWall } from '../utils.js';
import { Particle } from './Particle.js';
import { ObjectPool } from '../Pool.js';
import { drawMine } from '../systems/WeaponVisuals.js';

export const MAX_ACTIVE_MINES = 24;

export function addMineWithLimit(newMine) {
    if (!newMine) return null;
    while (state.mines.length >= MAX_ACTIVE_MINES) {
        let evictIdx = -1;
        for (let i = 0; i < state.mines.length; i++) {
            if (!state.mines[i].isMini) {
                evictIdx = i;
                break;
            }
        }
        if (evictIdx === -1) evictIdx = 0;
        const [evicted] = state.mines.splice(evictIdx, 1);
        if (evicted && evicted.active) {
            evicted.active = false;
            minePool.release(evicted);
        }
    }
    state.mines.push(newMine);
    return newMine;
}

export class Obstacle {
    constructor(x, y, w, h, color = '#112', borderColor = '#0ff') {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.color = color;
        this.borderColor = borderColor;
    }

    draw(ctx) {
        const sx = this.x - state.camera.x;
        const sy = this.y - state.camera.y;
        if (sx + this.w < 0 || sx > SCREEN_W() || sy + this.h < 0 || sy > SCREEN_H()) return;

        const w=this.w,h=this.h;
        ctx.fillStyle='#09161c';ctx.fillRect(sx+3,sy+6,w,h);
        ctx.fillStyle=this.color;ctx.fillRect(sx,sy,w,h);
        ctx.fillStyle='rgba(140,175,177,.14)';ctx.fillRect(sx+2,sy+2,w-4,h-4);
        ctx.strokeStyle='#50818a';ctx.lineWidth=1.2;ctx.strokeRect(sx,sy,w,h);
        ctx.fillStyle=this.borderColor;ctx.fillRect(sx,sy,Math.min(13,w),2);
        ctx.fillRect(sx+w-2,sy+h-Math.min(13,h),2,Math.min(13,h));
        if(w>34 && h>34) {
            ctx.strokeStyle='#34515a';ctx.strokeRect(sx+6,sy+6,w-12,h-12);
            const ventWidth=Math.min(28,w-20);
            ctx.fillStyle='#14272e';ctx.fillRect(sx+10,sy+10,ventWidth,14);
            ctx.fillStyle='#4b676d';
            for(let k=2;k<ventWidth-2;k+=5) ctx.fillRect(sx+10+k,sy+12,2,10);
        }
    }
}

export class Mine {
    constructor(x, y, lvl, pLvl, isVacuum = false) {
        this.reset(x, y, lvl, pLvl, isVacuum);
    }

    reset(x, y, lvl, pLvl, isVacuum = false) {
        this.x = x;
        this.y = y;
        this.lvl = lvl;
        this.pLvl = pLvl;
        this.dmg = 35 + (lvl * 16) + (pLvl * 2);
        this.range = 100 + (lvl * 10);
        this.active = true;
        this.travelAngle = null;
        this.isVacuum = Boolean(isVacuum);

        this.isCluster = lvl >= 4;
        this.isMini = false;
        return this;
    }

    draw(ctx, showRange = false) {
        drawMine(ctx, this, showRange);
    }

    explode() {
        if (this.isCluster && !this.isMini) {
            const parentDmg = this.dmg;
            const parentRange = this.range;
            for (let i = 0; i < 3; i++) {
                const angle = (Math.PI * 2 / 3) * i;
                const dist = 40;
                let mx = this.x + Math.cos(angle) * dist;
                let my = this.y + Math.sin(angle) * dist;
                if (checkWall(mx, my, 6) || raycastWall(this.x, this.y, mx, my)) {
                    mx = this.x;
                    my = this.y;
                }
                const mini = minePool.acquire(mx, my, this.lvl, this.pLvl, false);
                mini.range = parentRange * 0.6;
                mini.dmg = parentDmg * 0.45;
                mini.isMini = true;
                mini.isCluster = false;
                mini.isVacuum = false;
                addMineWithLimit(mini);
            }
        }
    }

    update() {
        if (!this.active) return;
        this.travelAngle = null;
        const grid = state.enemySpatialGrid;
        const seekRadius = this.isVacuum ? 320 : 120;
        const candidates = grid ? grid.queryCircle(this.x, this.y, seekRadius) : state.enemies;
        let nearest = null;
        let minDist = seekRadius;

        for (let i = 0; i < candidates.length; i++) {
            const e = candidates[i];
            if (!e.isDead) {
                const d = Math.hypot(e.x - this.x, e.y - this.y);
                if (d < minDist && !raycastWall(this.x, this.y, e.x, e.y)) {
                    minDist = d;
                    nearest = e;
                }
            }
        }

        if (nearest) {
            const speed = this.isVacuum ? 2.5 : 1.2;
            const dist = Math.hypot(nearest.x - this.x, nearest.y - this.y) || 1;
            const nextX = this.x + ((nearest.x - this.x) / dist) * speed;
            const nextY = this.y + ((nearest.y - this.y) / dist) * speed;
            if (!checkWall(nextX, nextY, 6) && !raycastWall(this.x, this.y, nextX, nextY)) {
                this.travelAngle = Math.atan2(nextY - this.y, nextX - this.x);
                this.x = nextX;
                this.y = nextY;
            }
        }
    }
}

export const minePool = new ObjectPool((x, y, lvl, pLvl, isVacuum) => new Mine(x, y, lvl, pLvl, isVacuum));

export class Chip {
    constructor(x, y, val) {
        this.reset(x, y, val);
    }

    reset(x, y, val) {
        this.x = x;
        this.y = y;
        this.val = val;
        this.mag = false;
        this.size = 8;
        this.active = true;
        return this;
    }

    draw(ctx) {
        const sx = this.x - state.camera.x;
        const sy = this.y - state.camera.y;
        if (sx < -20 || sx > SCREEN_W() + 20 || sy < -20 || sy > SCREEN_H() + 20) return;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(state.frameCount * 0.1);

        ctx.fillStyle = this.val >= 10 ? '#ff00ff' : (this.val >= 5 ? '#00ffff' : '#ffd700');

        ctx.fillRect(-this.size/2, -this.size/2, this.size, this.size);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(-this.size/2, -this.size/2, this.size, this.size);
        ctx.restore();
    }
}

export const chipPool = new ObjectPool((x, y, val) => new Chip(x, y, val));

export class Gem {
    constructor(x, y, val, source = 'enemy') {
        this.reset(x, y, val, source);
    }

    reset(x, y, val, source = 'enemy') {
        this.x = x;
        this.y = y;
        this.val = val;
        this.source = source || 'enemy';
        this.sourceBreakdown = null;
        this.mag = false;
        this.active = true;
        return this;
    }
}

export const gemPool = new ObjectPool((x, y, val, source) => new Gem(x, y, val, source));

export class ExplosiveBarrel {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 18;
        this.hp = 20;
        this.color = '#ff3300';
    }

    draw(ctx) {
        const sx = this.x - state.camera.x;
        const sy = this.y - state.camera.y;
        if (sx < -50 || sx > SCREEN_W() + 50 || sy < -50 || sy > SCREEN_H() + 50) return;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.fillStyle = this.color;
        ctx.fillRect(-14, -20, 28, 40);
        ctx.fillStyle = '#500';
        ctx.fillRect(-14, -15, 28, 5);
        ctx.fillRect(-14, 10, 28, 5);
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.lineTo(5, 5);
        ctx.lineTo(-5, 5);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(-14, -20, 28, 40);
        ctx.restore();
    }
}

export class SlowZone {
    constructor(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
    }

    draw(ctx) {
        const sx = this.x - state.camera.x;
        const sy = this.y - state.camera.y;
        if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(this.w) || !Number.isFinite(this.h) || this.w <= 0 || this.h <= 0) return;
        const sw = SCREEN_W();
        const sh = SCREEN_H();
        if (sx + this.w < 0 || sx > sw || sy + this.h < 0 || sy > sh) return;

        ctx.save();
        ctx.globalAlpha = 0.4;
        try {
            const grad = ctx.createLinearGradient(sx, sy, sx + this.w, sy + this.h);
            grad.addColorStop(0, '#00ff00');
            grad.addColorStop(0.5, '#ccff00');
            grad.addColorStop(1, '#00ff00');
            ctx.fillStyle = grad;
        } catch {
            ctx.fillStyle = '#00ff00';
        }
        const offset = Math.sin(state.frameCount * 0.05) * 2;
        ctx.fillRect(sx - offset, sy - offset, this.w + offset*2, this.h + offset*2);
        ctx.restore();
    }
}

export class AirdropZone {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 500;
        this.isActivated = false;
        this.isCompleted = false;

        this.taskType = Math.random() > 0.5 ? 'time' : 'kills';

        if (this.taskType === 'time') {
            this.target = 15;
            this.current = 0;
            this.label = 'СИГНАЛ';
        } else {
            this.target = 5 + Math.floor(state.gameTime / 60);
            this.current = 0;
            this.label = 'ЗАЧИСТКА';
        }
    }

    recordKill(player) {
        if (this.taskType === 'kills' && this.isActivated && !this.isCompleted &&
            Math.hypot(player.x - this.x, player.y - this.y) < this.radius) {
            this.current = Math.min(this.target, this.current + 1);
        }
    }

    update() {
        if (this.isCompleted) return;

        const dist = Math.hypot(state.player.x - this.x, state.player.y - this.y);
        const inZone = dist < this.radius;

        if (!this.isActivated && inZone) {
            this.isActivated = true;
        }

        if (this.isActivated) {
            if (this.taskType === 'time') {

                this.current += 1/60;
            }

            if (this.current >= this.target) {
                this.isCompleted = true;
            }
        }
    }

    draw(ctx) {
        const sx = this.x - state.camera.x;
        const sy = this.y - state.camera.y;

        if (sx < -this.radius || sx > SCREEN_W() + this.radius || sy < -this.radius || sy > SCREEN_H() + this.radius) return;

        ctx.save();

        const r = this.radius;

        let color = '#84e6ce';
        if (this.isActivated) color = '#ffc776';
        if (this.isCompleted) color = '#9cf2c9';

        ctx.globalAlpha = 0.055;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        if (this.isActivated && !this.isCompleted) {
             ctx.setLineDash([10, 10]);
             ctx.translate(sx, sy);
             ctx.rotate(state.frameCount * 0.02);
             ctx.beginPath();
             ctx.arc(0, 0, r, 0, Math.PI * 2);
             ctx.stroke();
             ctx.setLineDash([]);
             ctx.rotate(-state.frameCount * 0.02);
             ctx.translate(-sx, -sy);
        } else {
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff';
        ctx.font = '600 13px system-ui, sans-serif';
        ctx.textAlign = 'center';

        if (!this.isActivated) {
            ctx.fillText('ВОЙДИТЕ В ЗОНУ', sx, sy - r - 10);
        } else {
            let progressText = '';
            if (this.taskType === 'time') {
                progressText = `${Math.max(0, Math.ceil(this.target - this.current))} сек.`;
            } else {
                progressText = `Убито ${this.current} / ${this.target}`;
            }
            ctx.fillText(this.label, sx, sy - r - 25);
            ctx.fillStyle = color;
            ctx.font = '700 19px system-ui, sans-serif';
            ctx.fillText(progressText, sx, sy - r - 5);

        }

        ctx.restore();
    }
}

export class YellowLootBox {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 40;
        this.bobOffset = 0;
    }

    draw(ctx) {
        const sx = this.x - state.camera.x;
        const sy = this.y - state.camera.y;

        this.bobOffset = Math.sin(state.frameCount * 0.1) * 5;

        ctx.save();
        ctx.translate(sx, sy + this.bobOffset);

        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 20;

        ctx.fillStyle = '#ffd700';
        ctx.fillRect(-20, -20, 40, 40);

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.strokeRect(-20, -20, 40, 40);

        ctx.fillStyle = '#000';
        ctx.font = '700 19px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 0;
        ctx.fillText('?', 0, 2);

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(-10, -30);
        ctx.lineTo(10, -30);
        ctx.lineTo(0, -20);
        ctx.fill();

        ctx.restore();
    }
}

export class AcidPuddle {
    constructor(x, y, r = 45, duration = 360, dmg = 8) {
        this.x = x;
        this.y = y;
        this.r = r;
        this.maxLife = duration;
        this.life = duration;
        this.dmg = dmg;
        this.color = '#39ff14';
        this.tickTimer = 0;
    }

    update() {
        this.life--;
        this.tickTimer++;
        if (state.player && this.tickTimer % 20 === 0) {
            const dist = Math.hypot(state.player.x - this.x, state.player.y - this.y);
            if (dist < this.r + state.player.r) {
                state.player.takeDamage(this.dmg, 'spitter');
            }
        }
        return this.life <= 0;
    }

    draw(ctx) {
        const sx = this.x - state.camera.x;
        const sy = this.y - state.camera.y;
        if (sx < -60 || sx > SCREEN_W() + 60 || sy < -60 || sy > SCREEN_H() + 60) return;

        const progress = Math.max(0.1, this.life / this.maxLife);
        ctx.save();
        ctx.translate(sx, sy);
        ctx.globalAlpha = 0.35 * progress;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, 0, this.r, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#22dd00';
        ctx.lineWidth = 2;
        ctx.stroke();

        if (state.frameCount % 10 === 0) {
            const bx = (Math.random() - 0.5) * this.r * 1.2;
            const by = (Math.random() - 0.5) * this.r * 1.2;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(bx, by, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}
