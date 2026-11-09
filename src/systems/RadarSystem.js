import { state } from '../GameState.js';
import { SCREEN_W, SCREEN_H } from '../constants.js';

class TacticalRadarSystem {
    constructor() {
        this.enabled = true;
        this.radius = 62;
        this.worldRange = 2500;
        this.marginRight = 88;
        this.marginTop = 165;
        this.sweepAngle = 0;
    }

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    draw(ctx) {
        if (!this.enabled || !state.player) return;

        const sw = SCREEN_W();
        const sh = SCREEN_H();
        const isCompact = sw < 768 || sh < 620;

        const r = isCompact ? 50 : this.radius;
        const rx = sw - (isCompact ? 68 : this.marginRight);
        const ry = isCompact ? 132 : this.marginTop;
        const scale = r / this.worldRange;

        const px = state.player.x;
        const py = state.player.y;

        ctx.save();

        ctx.beginPath();
        ctx.arc(rx, ry, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(5, 2, 14, 0.78)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.clip();

        ctx.strokeStyle = 'rgba(0, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(rx, ry, 1000 * scale, 0, Math.PI * 2);
        ctx.arc(rx, ry, 2000 * scale, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(rx - r, ry);
        ctx.lineTo(rx + r, ry);
        ctx.moveTo(rx, ry - r);
        ctx.lineTo(rx, ry + r);
        ctx.stroke();

        this.sweepAngle += 0.035;
        const sweepX = rx + Math.cos(this.sweepAngle) * r;
        const sweepY = ry + Math.sin(this.sweepAngle) * r;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(sweepX, sweepY);
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.25)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.strokeStyle = 'rgba(0, 204, 255, 0.14)';
        ctx.lineWidth = 1;
        for (let i = 0; i < state.obstacles.length; i++) {
            const o = state.obstacles[i];
            const ox = rx + (o.x + o.w / 2 - px) * scale;
            const oy = ry + (o.y + o.h / 2 - py) * scale;
            const ow = o.w * scale;
            const oh = o.h * scale;

            if (Math.hypot(ox - rx, oy - ry) < r + 20) {
                ctx.strokeRect(ox - ow / 2, oy - oh / 2, ow, oh);
            }
        }

        ctx.fillStyle = 'rgba(255, 0, 85, 0.55)';
        for (let i = 0; i < state.enemies.length; i++) {
            const e = state.enemies[i];
            if (e.isDead || e.type === 'titan' || e.type === 'elite') continue;

            const ex = rx + (e.x - px) * scale;
            const ey = ry + (e.y - py) * scale;

            if (Math.hypot(ex - rx, ey - ry) < r) {
                ctx.fillRect(ex - 1, ey - 1, 2, 2);
            }
        }

        for (let i = 0; i < state.enemies.length; i++) {
            const e = state.enemies[i];
            if (e.isDead || (e.type !== 'elite' && e.type !== 'spitter' && e.type !== 'stalker')) continue;

            const ex = rx + (e.x - px) * scale;
            const ey = ry + (e.y - py) * scale;

            if (Math.hypot(ex - rx, ey - ry) < r) {
                ctx.fillStyle = '#ff6600';
                ctx.beginPath();
                ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        for (let i = 0; i < state.enemies.length; i++) {
            const e = state.enemies[i];
            if (e.isDead || e.type !== 'titan') continue;

            const ex = rx + (e.x - px) * scale;
            const ey = ry + (e.y - py) * scale;
            const dist = Math.hypot(ex - rx, ey - ry);

            let bx = ex, by = ey;
            if (dist >= r) {
                const angle = Math.atan2(ey - ry, ex - rx);
                bx = rx + Math.cos(angle) * (r - 6);
                by = ry + Math.sin(angle) * (r - 6);
            }

            const pulse = 3 + Math.sin(state.frameCount * 0.15) * 1.5;
            ctx.fillStyle = '#ff0033';
            ctx.beginPath();
            ctx.arc(bx, by, pulse, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        if (state.airdropZones && state.airdropZones.length > 0) {
            const z = state.airdropZones[0];
            const zx = rx + (z.x - px) * scale;
            const zy = ry + (z.y - py) * scale;
            this.drawObjectiveBlip(ctx, rx, ry, r, zx, zy, '#ffd700', 'ГРУЗ');
        }

        if (state.activeLoot) {
            const lx = rx + (state.activeLoot.x - px) * scale;
            const ly = ry + (state.activeLoot.y - py) * scale;
            this.drawObjectiveBlip(ctx, rx, ry, r, lx, ly, '#00ffff', 'ЯЩИК');
        }

        if (state.convoyDrones) {
            for (let i = 0; i < state.convoyDrones.length; i++) {
                const cd = state.convoyDrones[i];
                if (cd.isDead) continue;
                const cdx = rx + (cd.x - px) * scale;
                const cdy = ry + (cd.y - py) * scale;
                this.drawObjectiveBlip(ctx, rx, ry, r, cdx, cdy, '#ffea00', 'ДРОН');
            }
        }

        ctx.fillStyle = state.player.color || '#00ffff';
        const moveAngle = Math.atan2(state.player.lastMoveY || -1, state.player.lastMoveX || 0);

        ctx.translate(rx, ry);
        ctx.rotate(moveAngle + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(4, 5);
        ctx.lineTo(0, 3);
        ctx.lineTo(-4, 5);
        ctx.closePath();
        ctx.fill();

        ctx.restore();

        ctx.save();
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(rx, ry, r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(rx, ry - r); ctx.lineTo(rx, ry - r + 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(rx, ry + r); ctx.lineTo(rx, ry + r - 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(rx + r, ry); ctx.lineTo(rx + r - 6, ry); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(rx - r, ry); ctx.lineTo(rx - r + 6, ry); ctx.stroke();

        ctx.fillStyle = '#00ffff';
        ctx.font = "900 9px 'Orbitron', monospace";
        ctx.textAlign = 'center';
        ctx.fillText('N', rx, ry - r + 15);

        if (state.director) {
            if (state.director.waveState === 'calm') {
                ctx.fillStyle = 'rgba(0, 255, 136, 0.85)';
                ctx.font = "700 8px 'Orbitron', monospace";
                const quiet = state.director.calmStage === 'quiet' && state.director.localPressure <= 8;
                ctx.fillText(quiet ? 'ПЕРЕДЫШКА' : 'ЗАЧИСТКА', rx, ry + r + 13);
            } else {
                const aAngle = state.director.assaultAngle || 0;
                ctx.save();
                ctx.strokeStyle = state.director.waveState === 'peak' ? 'rgba(255, 0, 85, 0.85)' : 'rgba(255, 140, 0, 0.75)';
                ctx.lineWidth = 3.5;
                ctx.beginPath();
                ctx.arc(rx, ry, r - 2, aAngle - 0.6, aAngle + 0.6);
                ctx.stroke();
                ctx.restore();

                ctx.fillStyle = state.director.waveState === 'peak' ? 'rgba(255, 50, 100, 0.9)' : 'rgba(0, 255, 255, 0.75)';
                ctx.font = "700 8px 'Orbitron', monospace";
                ctx.fillText(state.director.assaultName ? `СЕКТОР: ${state.director.assaultName}` : 'RADAR 2.5K', rx, ry + r + 13);
            }
        } else {
            ctx.fillStyle = 'rgba(0, 255, 255, 0.75)';
            ctx.font = "700 8px 'Orbitron', monospace";
            ctx.fillText('RADAR 2.5K', rx, ry + r + 13);
        }
        ctx.restore();
    }

    drawObjectiveBlip(ctx, rx, ry, r, ox, oy, color, label) {
        const dist = Math.hypot(ox - rx, oy - ry);
        let bx = ox, by = oy;

        if (dist >= r) {
            const angle = Math.atan2(oy - ry, ox - rx);
            bx = rx + Math.cos(angle) * (r - 7);
            by = ry + Math.sin(angle) * (r - 7);
        }

        const pulse = 3 + Math.sin(state.frameCount * 0.12) * 1.5;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(bx, by, pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

export const RadarSystem = new TacticalRadarSystem();
