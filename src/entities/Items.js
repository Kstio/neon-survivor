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
        if (sx + this.w < 0 || sx > SCREEN_W() || sy + this.h < 0 || sy > SCREEN_H()) return;

        ctx.save();
        ctx.globalAlpha = 0.4;
        const grad = ctx.createLinearGradient(sx, sy, sx + this.w, sy + this.h);
        grad.addColorStop(0, '#00ff00');
        grad.addColorStop(0.5, '#ccff00');
        grad.addColorStop(1, '#00ff00');
        ctx.fillStyle = grad;
        const offset = Math.sin(state.frameCount * 0.05) * 2;
        ctx.fillRect(sx - offset, sy - offset, this.w + offset*2, this.h + offset*2);
        ctx.restore();
    }
}

export class AirdropZone {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 150;
        this.isActivated = false;
        this.isCompleted = false;
        
        this.taskType = Math.random() > 0.5 ? 'time' : 'kills';
        
        if (this.taskType === 'time') {
            this.target = 15;
            this.current = 0;
            this.label = 'УДЕРЖАНИЕ';
        } else {
            this.target = 5 + Math.floor(state.gameTime / 60);
            this.current = 0;
            this.label = 'ЗАЧИСТКА';
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
                if (inZone) {
                    this.current += 1/60;
                }
            }
            
            if (this.current >= this.target) {
                this.isCompleted = true;
            }
        }
    }

    draw(ctx) {
        const sx = this.x - state.camera.x;
        const sy = this.y - state.camera.y;
        
        if (sx < -200 || sx > SCREEN_W() + 200 || sy < -200 || sy > SCREEN_H() + 200) return;

        ctx.save();
        
        const pulse = Math.sin(state.frameCount * 0.1) * 5;
        const r = this.radius + pulse;

        let color = '#00ffff';
        if (this.isActivated) color = '#ffcc00';
        if (this.isCompleted) color = '#00ff00'; 

        ctx.globalAlpha = 0.1;
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
        ctx.font = '16px Russo One';
        ctx.textAlign = 'center';
        
        if (!this.isActivated) {
            ctx.fillText('ВОЙДИТЕ В ЗОНУ', sx, sy - r - 10);
        } else {
            let progressText = '';
            if (this.taskType === 'time') {
                progressText = `${Math.floor(this.target - this.current)} сек.`;
            } else {
                progressText = `${this.current} / ${this.target} Убито`;
            }
            ctx.fillText(this.label, sx, sy - r - 25);
            ctx.fillStyle = color;
            ctx.font = '24px Russo One';
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
        ctx.font = '24px Russo One';
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