import { state } from '../GameState.js';

export class Particle {
    constructor(x, y, c, s) {
        this.x = x;
        this.y = y;
        this.c = c;
        this.s = s;
        this.vx = (Math.random() - 0.5) * 5;
        this.vy = (Math.random() - 0.5) * 5;
        this.life = 1;
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

export class FloatText {
    constructor(x, y, t, c, fontSize = 14) {
        this.x = x;
        this.y = y;
        this.t = t;
        this.c = c;
        this.life = 60;
        this.fontSize = fontSize;
    }

    update() {
        this.y -= 0.45;
        this.life--;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.life / 60;
        ctx.fillStyle = this.c;
        ctx.font = `${this.fontSize}px 'Russo One', sans-serif`;
        ctx.fillText(this.t, this.x - state.camera.x, this.y - state.camera.y);
        ctx.restore();
    }
}