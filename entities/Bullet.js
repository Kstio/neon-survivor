import { state } from '../GameState.js';
import { checkWall } from '../utils.js';
import { Particle, FloatText } from './Particle.js';

export class Bullet {
    constructor(x, y, a, dmg, spd, isPlayer, isCrit = false) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(a) * spd;
        this.vy = Math.sin(a) * spd;
        this.dmg = dmg;
        this.isPlayer = isPlayer;
        this.life = isPlayer ? (state.player?.bulletLife || 60) : 140;
        this.pierce = isPlayer ? (state.player?.stats.pierce || 0) : 0;
        this.ricochet = isPlayer ? (state.player?.stats.ricochet || 0) : 0;
        this.hitList = [];
        this.isCrit = isCrit;
        this.size = isCrit ? 7 : (isPlayer ? 4 : 6);
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;

        if (checkWall(this.x, this.y, 4)) {
            if (this.ricochet > 0) {
                this.ricochet--;
                this.vx = -this.vx;
                this.vy = -this.vy;
            } else {
                this.life = 0;
            }
            this.spawnParticles('#fff', 2);
        }
    }

    draw(ctx) {
        const sx = this.x - state.camera.x;
        const sy = this.y - state.camera.y;
        
        ctx.fillStyle = this.isPlayer 
            ? (this.isCrit ? '#ffcc00' : '#ffd86b') 
            : '#f0f';
        
        ctx.beginPath();
        ctx.arc(sx, sy, this.size, 0, Math.PI * 2);
        ctx.fill();
    }

    spawnParticles(color, count) {
        for (let i = 0; i < count; i++) {
            state.particles.push(new Particle(this.x, this.y, color, 2 + Math.random() * 2));
        }
    }
}