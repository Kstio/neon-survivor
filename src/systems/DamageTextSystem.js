import { state } from '../GameState.js';
import { SCREEN_W, SCREEN_H } from '../constants.js';

class DamageNumber {
    constructor() {
        this.active = false;
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.text = '';
        this.isCrit = false;
        this.color = '#ffffff';
        this.life = 0;
        this.maxLife = 36;
        this.scale = 1.0;
        this.alpha = 1.0;
    }

    init(x, y, amount, isCrit = false, element = null) {

        this.x = x + (Math.random() - 0.5) * 16;
        this.y = y - 10 + (Math.random() - 0.5) * 10;

        this.vx = (Math.random() - 0.5) * 3.2;
        this.vy = -(2.8 + Math.random() * 2.2);

        this.isCrit = !!isCrit;
        this.text = Math.round(amount) + (this.isCrit ? '!' : '');
        this.maxLife = this.isCrit ? 44 : 34;
        this.life = this.maxLife;

        if (this.isCrit) {
            this.color = '#ffd700';
            this.scale = 1.45;
        } else if (element === 'acid') {
            this.color = '#39ff14';
            this.scale = 1.1;
        } else if (element === 'emp' || element === 'plasma') {
            this.color = '#00ffff';
            this.scale = 1.1;
        } else {
            this.color = '#f0f0f0';
            this.scale = 1.0;
        }

        this.alpha = 1.0;
        this.active = true;
        return this;
    }

    update() {
        if (!this.active) return false;

        this.x += this.vx;
        this.y += this.vy;

        this.vy += 0.15;
        this.vx *= 0.96;

        if (this.scale > 1.0) {
            this.scale = Math.max(1.0, this.scale - 0.08);
        }

        this.life--;
        if (this.life <= 0) {
            this.active = false;
            return false;
        }

        const fadeThreshold = this.maxLife * 0.4;
        if (this.life < fadeThreshold) {
            this.alpha = this.life / fadeThreshold;
        } else {
            this.alpha = 1.0;
        }

        return true;
    }
}

class DamageTextManager {
    constructor() {
        this.maxPool = 160;
        this.pool = [];
        this.activeList = [];

        for (let i = 0; i < this.maxPool; i++) {
            this.pool.push(new DamageNumber());
        }
    }

    reset() {
        for (let i = 0; i < this.activeList.length; i++) {
            this.activeList[i].active = false;
            this.pool.push(this.activeList[i]);
        }
        this.activeList.length = 0;
    }

    add(x, y, amount, isCrit = false, element = null) {
        if (amount <= 0) return;

        let item;
        if (this.pool.length > 0) {
            item = this.pool.pop();
        } else if (this.activeList.length > 0) {

            item = this.activeList.shift();
        } else {
            item = new DamageNumber();
        }

        item.init(x, y, amount, isCrit, element);
        this.activeList.push(item);
    }

    update() {
        for (let i = this.activeList.length - 1; i >= 0; i--) {
            const item = this.activeList[i];
            const alive = item.update();
            if (!alive) {
                this.activeList.splice(i, 1);
                this.pool.push(item);
            }
        }
    }

    draw(ctx) {
        if (this.activeList.length === 0) return;

        const camX = state.camera.x;
        const camY = state.camera.y;
        const sw = SCREEN_W();
        const sh = SCREEN_H();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = "bold 13px 'Orbitron', monospace";
        for (let i = 0; i < this.activeList.length; i++) {
            const item = this.activeList[i];
            if (item.isCrit) continue;

            const sx = Math.round(item.x - camX);
            const sy = Math.round(item.y - camY);

            if (sx < -30 || sx > sw + 30 || sy < -30 || sy > sh + 30) continue;

            ctx.globalAlpha = item.alpha;
            ctx.fillStyle = item.color;
            ctx.fillText(item.text, sx, sy);
        }

        ctx.font = "900 18px 'Orbitron', monospace";
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#111111';

        for (let i = 0; i < this.activeList.length; i++) {
            const item = this.activeList[i];
            if (!item.isCrit) continue;

            const sx = Math.round(item.x - camX);
            const sy = Math.round(item.y - camY);

            if (sx < -40 || sx > sw + 40 || sy < -40 || sy > sh + 40) continue;

            ctx.globalAlpha = item.alpha;

            if (item.scale !== 1.0) {
                ctx.save();
                ctx.translate(sx, sy);
                ctx.scale(item.scale, item.scale);
                ctx.strokeText(item.text, 0, 0);
                ctx.fillStyle = item.color;
                ctx.fillText(item.text, 0, 0);
                ctx.restore();
            } else {
                ctx.strokeText(item.text, sx, sy);
                ctx.fillStyle = item.color;
                ctx.fillText(item.text, sx, sy);
            }
        }

        ctx.globalAlpha = 1.0;
    }
}

export const DamageTextSystem = new DamageTextManager();
