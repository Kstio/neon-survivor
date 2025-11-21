import { state } from '../GameState.js';
import { SCREEN_W, SCREEN_H } from '../constants.js';

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

        ctx.fillStyle = this.color;
        ctx.fillRect(sx, sy, this.w, this.h);
        
        ctx.strokeStyle = this.borderColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, sy, this.w, this.h);
        
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#000';
        ctx.fillRect(sx + 5, sy + 5, this.w - 10, this.h - 10);
        ctx.globalAlpha = 1;
    }
}

export class LootCrate {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    draw(ctx) {
        const sx = this.x - state.camera.x;
        const sy = this.y - state.camera.y;
        if (sx < -50 || sx > SCREEN_W() + 50 || sy < -50 || sy > SCREEN_H() + 50) return;

        const scale = 1 + Math.sin(state.frameCount * 0.1) * 0.08;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(scale, scale);
        ctx.fillStyle = '#0f0';
        ctx.fillRect(-14, -14, 28, 28);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(-14, -14, 28, 28);
        ctx.fillStyle = '#fff';
        ctx.font = '18px Russo One';
        ctx.fillText('+', -6, 7);
        ctx.restore();
    }
}

export class SkillCrate {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    draw(ctx) {
        const sx = this.x - state.camera.x;
        const sy = this.y - state.camera.y;
        if (sx < -50 || sx > SCREEN_W() + 50 || sy < -50 || sy > SCREEN_H() + 50) return;

        const scale = 1 + Math.cos(state.frameCount * 0.15) * 0.12;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(scale, scale);
        ctx.fillStyle = '#00ffff';
        ctx.beginPath();
        ctx.moveTo(0, -18);
        ctx.lineTo(13, 6);
        ctx.lineTo(0, 18);
        ctx.lineTo(-13, 6);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#000';
        ctx.font = '14px Russo One';
        ctx.fillText('S', -5, 7);
        ctx.restore();
    }
}

export class Mine {
    constructor(x, y, lvl, pLvl) {
        this.x = x;
        this.y = y;
        this.dmg = 30 + (lvl * 15) + (pLvl * 2);
        this.range = 80;
        this.active = true;
        this.blink = 0;
    }

    draw(ctx) {
        if (!this.active) return;
        const sx = this.x - state.camera.x;
        const sy = this.y - state.camera.y;
        
        this.blink++;
        const col = (Math.floor(this.blink / 10) % 2 === 0) ? '#f00' : '#500';
        
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#f00';
        ctx.beginPath();
        ctx.arc(sx, sy, 10, 0, Math.PI * 2);
        ctx.stroke();
    }
}

export class Chip {
    constructor(x, y, val) {
        this.x = x;
        this.y = y;
        this.val = val;
        this.mag = false;
    }

    draw(ctx) {
        const sx = this.x - state.camera.x;
        const sy = this.y - state.camera.y;
        if (sx < -20 || sx > SCREEN_W() + 20 || sy < -20 || sy > SCREEN_H() + 20) return;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(state.frameCount * 0.1);
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(-4, -4, 8, 8);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(-4, -4, 8, 8);
        ctx.restore();
    }
}