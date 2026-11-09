const TURN = Math.PI * 2;
const TOP = -Math.PI / 2;
const NO_TICK = -Infinity;

const REPAIRS = {
    repair: '#9af4bb',
    regen: '#82eaae',
    vamp: '#ef9bbb',
    blood_circle: '#ff97ab',
    devourer: '#b7a9ff',
    hp: '#b1fbd1'
};

const PASSIVE_FAMILIES = {
    dmg: 'sight', spd: 'sight', crit: 'sight', sniper: 'sight',
    speed: 'drive', dodge: 'drive',
    hp: 'repair', regen: 'repair', vamp: 'repair',
    armor: 'armor', shield: 'armor',
    exp: 'sensor', mag: 'sensor'
};

function ring(ctx, x, y, r, start = 0, end = TURN) {
    ctx.beginPath();
    ctx.arc(x, y, r, start, end);
    ctx.stroke();
}

function segment(ctx, x1, y1, x2, y2) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
}

function drawShieldPulse(ctx, pulse, frame) {
    const t = (frame - pulse.frame) / 16;
    if (t < 0 || t >= 1) return;
    ctx.strokeStyle = '#76e8ff';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.36 * (1 - t);
    ring(ctx, pulse.x, pulse.y, pulse.radius);
    ctx.globalAlpha = 0.65 * (1 - t);
    ctx.lineWidth = 1.8;
    for (let i = 0; i < 6; i++) {
        const a = i * TURN / 6;
        ring(ctx, pulse.x, pulse.y, pulse.radius * (0.18 + 0.82 * t), a, a + 0.68);
    }
}

function drawEmp(ctx, cast, t) {
    const core = cast.origins[0];
    ctx.strokeStyle = '#f4cc70';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.30 * (1 - t);
    ctx.beginPath();
    for (let i = 1; i < cast.origins.length; i++) {
        const p = cast.origins[i];
        segment(ctx, core.x, core.y, p.x, p.y);
    }
    ctx.stroke();
    for (const origin of cast.origins) {
        ctx.globalAlpha = (origin === core ? 0.40 : 0.19) * (1 - t);
        ring(ctx, origin.x, origin.y, cast.radius);
        ctx.globalAlpha = 0.64 * (1 - t);
        const front = 5 + (cast.radius - 5) * t;
        for (let i = 0; i < 3; i++) {
            const a = i * TURN / 3 + (origin === core ? 0 : 0.65);
            ring(ctx, origin.x, origin.y, front, a, a + 0.54);
        }
    }
}

function drawPhaseShift(ctx, cast, t) {
    const dx = cast.endX - cast.x, dy = cast.endY - cast.y;
    const length = Math.hypot(dx, dy);
    ctx.translate(cast.x, cast.y);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.strokeStyle = '#df96f2';
    ctx.globalAlpha = 0.40 * (1 - t);
    ctx.lineWidth = 1;
    if (length < 0.01) {
        ring(ctx, 0, 0, cast.radius);
    } else {
        const step = length / cast.steps;
        const boundaryAngle = Math.acos(Math.min(1, step / (2 * cast.radius)));
        ring(ctx, 0, 0, cast.radius, boundaryAngle, TURN - boundaryAngle);
        ring(ctx, length, 0, cast.radius, Math.PI + boundaryAngle, 3 * Math.PI - boundaryAngle);
        for (let i = 1; i < cast.steps; i++) {
            ring(ctx, i * step, 0, cast.radius, boundaryAngle, Math.PI - boundaryAngle);
            ring(ctx, i * step, 0, cast.radius, Math.PI + boundaryAngle, TURN - boundaryAngle);
        }
    }
    ctx.globalAlpha = 0.80 * (1 - t);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    segment(ctx, 0, 0, length, 0);
    for (let i = 0; i <= cast.steps; i++) {
        const x = i * length / cast.steps;
        segment(ctx, x - 6, -6, x + 4, 6);
    }
    ctx.stroke();
}

function drawSeismic(ctx, cast, t) {
    const r = cast.radius;
    ctx.translate(cast.x, cast.y);
    ctx.strokeStyle = '#9dddab';
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.42 * (1 - t);
    ring(ctx, 0, 0, r);
    const front = r * (0.22 + t * 0.78);
    ctx.globalAlpha = 0.62 * (1 - t);
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.rotate(i * TURN / 8 + 0.16);
        const zig = i % 2 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(front * 0.79, -3);
        ctx.lineTo(front * 0.88, zig * 6);
        ctx.lineTo(front * 0.91, 1);
        ctx.lineTo(front, zig * 3);
        ctx.stroke();
        ring(ctx, 0, 0, front, -0.14, 0.14);
        ctx.restore();
    }
}

function drawShields(ctx, p) {
    const shieldLevel = p.getSkillLvl('shield');
    if (shieldLevel > 0) {
        const max = p.getShieldMaxCharges(shieldLevel);
        const charge = p.shieldCharges;
        const step = TURN / max;
        ctx.lineWidth = 2;
        for (let i = 0; i < max; i++) {
            const start = TOP + i * step + 0.10;
            const arc = step - 0.20;
            ctx.strokeStyle = i < charge ? '#85edff' : '#344b59';
            ring(ctx, 0, 0, p.r + 6, start, start + arc);
            if (i === charge && p.stats.shieldTimer > 0) {
                const progress = Math.min(1, p.stats.shieldTimer / p.getShieldCooldownTicks(shieldLevel));
                ctx.strokeStyle = '#4e93a9';
                ring(ctx, 0, 0, p.r + 6, start, start + arc * progress);
            }
        }
    }

    ctx.strokeStyle = '#ffce72';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < p.starterShieldCharges; i++) {
        const a = TOP + (i - (p.starterShieldMax - 1) / 2) * 0.42;
        ring(ctx, 0, 0, p.r + 11, a - 0.12, a + 0.12);
    }

    if (p.overdriveShield > 0) {
        ctx.strokeStyle = '#8cf7cd';
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
            const a = TOP + (i + 0.5) * TURN / 4;
            ring(ctx, 0, 0, p.r + 14, a - 0.22, a + 0.22);
        }
    }
}

function drawMotion(ctx, p, frame, heading) {
    if (!p.dashActive && !p.stealthTimer && !p.overdriveTimer) return;
    ctx.save();
    ctx.rotate(heading);
    const motion = Math.hypot(p.vx, p.vy);
    const pulse = (1 + Math.sin(frame * 0.20)) / 2;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (p.dashActive && motion > 0) {
        ctx.strokeStyle = '#8ce9ff';
        const length = 17 + Math.min(22, motion * 1.4);
        segment(ctx, -length, -7, -10, -4);
        segment(ctx, -length, 7, -10, 4);
    }
    if (p.stealthTimer > 0) {
        ctx.stroke();
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(222,155,255,0.69)';
        const offset = 2 + pulse * 2;
        segment(ctx, -17 - offset, -9, -8 - offset, -5);
        segment(ctx, -17 - offset, 9, -8 - offset, 5);
    }
    if (p.overdriveTimer > 0) {
        ctx.stroke();
        ctx.beginPath();
        ctx.strokeStyle = '#ffe1a0';
        const k = 2 + pulse * 3;
        segment(ctx, -7 - k, -12, 4, -12);
        segment(ctx, -7 - k, 12, 4, 12);
    }
    ctx.stroke();
    ctx.restore();
}

function drawGuard(ctx, kind, t) {
    ctx.save();
    ctx.globalAlpha = 0.86 * (1 - t);
    ctx.lineWidth = 1.8;
    const r = 21 + 8 * t;
    if (kind === 'dodge') {
        ctx.strokeStyle = '#e7dfff';
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
            const x = i * 5 - 16 - 8 * t;
            segment(ctx, x - 3, -13, x + 5, 0);
        }
        ctx.stroke();
    } else if (kind === 'starter') {
        ctx.strokeStyle = '#ffd381';
        ctx.beginPath();
        ctx.moveTo(-7 - 6 * t, -r);
        ctx.lineTo(-11 - 6 * t, -r + 3);
        ctx.lineTo(-12 - 6 * t, -r + 8);
        ctx.moveTo(5 + 6 * t, -r);
        ctx.lineTo(11 + 6 * t, -r + 2);
        ctx.lineTo(12 + 6 * t, -r + 6);
        ctx.stroke();
    } else {
        const ready = kind === 'ready';
        ctx.strokeStyle = ready ? '#94eeff' : kind === 'barrier' ? '#96f9d5' : '#e6b793';
        for (let i = 0; i < 3; i++) {
            const a = i * TURN / 3 - 0.7;
            ring(ctx, 0, 0, ready ? 34 - 11 * t : r, a, a + 0.46);
        }
    }
    ctx.restore();
}

function drawRepair(ctx, source, amount, t) {
    ctx.strokeStyle = REPAIRS[source];
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = Math.min(0.90, 0.68 + amount * 0.02) * (1 - t);
    ctx.beginPath();
    if (source === 'vamp' || source === 'blood_circle' || source === 'devourer') {
        const offset = 9 * (1 - t);
        const y = source === 'devourer' ? 12 : source === 'vamp' ? -2 : 6;
        for (const sign of [-1, 1]) {
            const x = sign * (20 + offset);
            ctx.moveTo(x + sign * 5, y - 3);
            ctx.lineTo(x, y + 1);
            ctx.lineTo(x + sign * 3, y + 3);
        }
    } else {
        const x = 15, y = -14 - 7 * t;
        segment(ctx, x - 3, y, x + 3, y);
        segment(ctx, x, y - 3, x, y + 3);
    }
    ctx.stroke();
}

function drawInstallation(ctx, installation, player, t) {
    const family = installation.family;
    const r = 27 - t * 5;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.72 * (1 - t);
    ctx.beginPath();
    if (family === 'sight') {
        ctx.strokeStyle = '#ffd494';
        for (let i = 0; i < 4; i++) {
            const a = (i + 0.5) * TURN / 4;
            const x = r * Math.cos(a), y = r * Math.sin(a);
            segment(ctx, x * 0.78, y, x, y);
            segment(ctx, x, y, x, y * 0.78);
        }
    } else if (family === 'drive') {
        ctx.strokeStyle = '#9ae7ef';
        for (const sign of [-1, 1]) {
            ctx.moveTo(sign * (r - 4), -4);
            ctx.lineTo(sign * r, 0);
            ctx.lineTo(sign * (r - 4), 4);
        }
    } else if (family === 'armor') {
        ctx.strokeStyle = '#adc8dc';
        for (const sign of [-1, 1]) {
            ctx.moveTo(sign * (r - 4), -9);
            ctx.lineTo(sign * r, -6);
            ctx.lineTo(sign * r, 6);
            ctx.lineTo(sign * (r - 4), 9);
        }
    } else if (family === 'repair') {
        ctx.strokeStyle = '#a4e8c1';
        segment(ctx, -r - 3, 0, -r + 3, 0);
        segment(ctx, -r, -3, -r, 3);
    } else {
        ctx.strokeStyle = '#b9a8f2';
        if (installation.id === 'mag') {
            ctx.globalAlpha = 0.43 * (1 - t);
            for (let i = 0; i < 8; i++) {
                const a = i * TURN / 8;
                ring(ctx, 0, 0, player.stats.magnet, a, a + 0.26);
            }
            return;
        }
        for (let i = -1; i <= 1; i++) {
            const y = -r + i * 4;
            ctx.moveTo(-4, y + 2);
            ctx.lineTo(0, y);
            ctx.lineTo(4, y + 2);
        }
    }
    ctx.stroke();
}

export class PilotVisuals {
    constructor() {
        this.cast = null;
        this.blast = null;
        this.guard = { frame: NO_TICK, kind: '' };
        this.repairs = Object.create(null);
        for (const source of Object.keys(REPAIRS)) {
            this.repairs[source] = { frame: NO_TICK, amount: 0 };
        }
        this.installation = { frame: NO_TICK, family: '', id: '' };
    }

    showGuard(kind, frame) {
        this.guard.kind = kind;
        this.guard.frame = frame;
    }

    showRepair(source, amount, frame) {
        const event = this.repairs[source] || this.repairs.repair;
        event.frame = frame;
        event.amount = amount;
    }

    showPassive(id, frame) {
        this.installation.id = id;
        this.installation.family = PASSIVE_FAMILIES[id];
        this.installation.frame = frame;
    }

    drawWorld(ctx, camera, frame) {
        const blastAge = this.blast ? frame - this.blast.frame : Infinity;
        const castAge = this.cast ? frame - this.cast.frame : Infinity;
        if (blastAge >= 16 && castAge >= 21) return;
        ctx.save();
        ctx.translate(-camera.x, -camera.y);
        if (blastAge < 16) drawShieldPulse(ctx, this.blast, frame);
        if (castAge >= 0 && castAge < 21) {
            const cast = this.cast, t = castAge / 21;
            if (cast.kind === 'emp') drawEmp(ctx, cast, t);
            else if (cast.kind === 'blink') drawPhaseShift(ctx, cast, t);
            else if (cast.kind === 'seismic') drawSeismic(ctx, cast, t);
        }
        ctx.restore();
    }

    drawLocal(ctx, player, x, y, heading, frame) {
        ctx.save();
        ctx.translate(x, y);
        drawMotion(ctx, player, frame, heading);
        drawShields(ctx, player);
        const guardAge = (frame - this.guard.frame) / 13;
        if (guardAge >= 0 && guardAge < 1) drawGuard(ctx, this.guard.kind, guardAge);
        for (const name in this.repairs) {
            const event = this.repairs[name], age = (frame - event.frame) / 15;
            if (age >= 0 && age < 1) drawRepair(ctx, name, event.amount, age);
        }
        const installAge = (frame - this.installation.frame) / 18;
        if (this.installation.family && installAge >= 0 && installAge < 1) {
            drawInstallation(ctx, this.installation, player, installAge);
        }
        ctx.restore();
    }
}
