import { state } from '../GameState.js';
import { ObjectPool } from '../Pool.js';

export class Particle {
    constructor(x, y, c, s) {
        this.reset(x, y, c, s);
    }

    reset(x, y, c, s) {
        this.x = x;
        this.y = y;
        this.c = c;
        this.s = s;
        this.vx = (Math.random() - 0.5) * 5;
        this.vy = (Math.random() - 0.5) * 5;
        this.life = 1;
        this.active = true;
        return this;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= 0.05;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.c;
        ctx.fillRect(this.x - state.camera.x, this.y - state.camera.y, this.s, this.s);
        ctx.restore();
    }
}

export const particlePool = new ObjectPool((x, y, c, s) => new Particle(x, y, c, s));

export class FloatText {
    constructor(x, y, t, c, fontSize = 14) {
        this.reset(x, y, t, c, fontSize);
    }

    reset(x, y, t, c, fontSize = 14) {
        this.x = x;
        this.y = y;
        this.t = t;
        this.c = c;
        this.life = 60;
        this.fontSize = fontSize;
        this.active = true;
        return this;
    }

    update() {
        this.y -= 0.45;
        this.life--;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.life / 60;
        ctx.fillStyle = this.c;
        ctx.font = `900 ${this.fontSize}px 'Orbitron', sans-serif`;
        ctx.fillText(this.t, this.x - state.camera.x, this.y - state.camera.y);
        ctx.restore();
    }
}

export const floatTextPool = new ObjectPool((x, y, t, c, fontSize) => new FloatText(x, y, t, c, fontSize));
