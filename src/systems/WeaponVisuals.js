import { state } from '../GameState.js';
import { SCREEN_W, SCREEN_H } from '../constants.js';
import { checkWall, raycastWall } from '../utils.js';

const TAU = Math.PI * 2;
const impacts = new WeakMap();
const tileSize = 384;
const fieldMargin = 320;
const obstacleTiles = new Map();
let obstacleList;
let obstacleIndex;
let obstacleCount;

function inView(x, y, radius) {
    return x + radius >= state.camera.x && y + radius >= state.camera.y
        && x - radius <= state.camera.x + SCREEN_W() && y - radius <= state.camera.y + SCREEN_H();
}

function neighbors(x, y) {
    const walls = state.obstacles;
    if (!walls?.length) return [];
    if (walls !== obstacleList || state.obstacleGrid !== obstacleIndex || walls.length !== obstacleCount) {
        obstacleTiles.clear();
        obstacleList = walls;
        obstacleIndex = state.obstacleGrid;
        obstacleCount = walls.length;
    }
    const col = Math.floor(x / tileSize);
    const row = Math.floor(y / tileSize);
    const key = col + ',' + row;
    let nearby = obstacleTiles.get(key);
    if (!nearby) {
        const left = col * tileSize - fieldMargin;
        const top = row * tileSize - fieldMargin;
        const span = tileSize + 2 * fieldMargin;
        nearby = walls.filter(w => w.x + w.w >= left && w.y + w.h >= top && w.x <= left + span && w.y <= top + span);
        if (obstacleTiles.size >= 64) obstacleTiles.clear();
        obstacleTiles.set(key, nearby);
    }
    return nearby;
}

function cutFace(ctx, limit, ax, ay, bx, by, depth) {
    const projection = 2 * limit / Math.max(0.001, depth) + 1;
    ctx.beginPath();
    ctx.rect(-limit, -limit, limit * 2, limit * 2);
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx * projection, by * projection);
    ctx.lineTo(ax * projection, ay * projection);
    ctx.closePath();
    ctx.clip('evenodd');
}

function clipVisibleField(ctx, wx, wy, radius) {
    const near = radius > fieldMargin ? state.obstacles || [] : neighbors(wx, wy);
    const limit = radius + 3;
    for (const w of near) {
        const left = w.x - wx;
        const top = w.y - wy;
        const right = left + w.w;
        const bottom = top + w.h;
        if (left > limit || top > limit || right < -limit || bottom < -limit) continue;
        if (left > 0) cutFace(ctx, limit, left, top, left, bottom, left);
        else if (right < 0) cutFace(ctx, limit, right, bottom, right, top, -right);
        if (top > 0) cutFace(ctx, limit, right, top, left, top, top);
        else if (bottom < 0) cutFace(ctx, limit, left, bottom, right, bottom, -bottom);
    }
}

function arc(ctx, x, y, radius, start, end, color, width = 1) {
    ctx.beginPath();
    ctx.arc(x, y, radius, start, end);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
}

function disk(ctx, x, y, radius, color) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fillStyle = color;
    ctx.fill();
}

function line(ctx, x1, y1, x2, y2, color, width = 1) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
}

function diamond(ctx, x, length, width, color) {
    ctx.beginPath();
    ctx.moveTo(x + length, 0);
    ctx.lineTo(x, -width);
    ctx.lineTo(x - length, 0);
    ctx.lineTo(x, width);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
}

function chevron(ctx, x, halfWidth, depth, color, width = 1.5) {
    ctx.beginPath();
    ctx.moveTo(x - depth, -halfWidth);
    ctx.lineTo(x, 0);
    ctx.lineTo(x - depth, halfWidth);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
}

function drawRound(ctx, b) {
    const r = b.size;
    const heavy = b.type === 'fatboy';
    const color = b.isRearRound ? '#76dce0' : heavy ? '#ffaf61' : '#f7d179';
    if (b.isGatlingRound) line(ctx, -r * 2.4 - 3, 0, -r * 0.6, 0, '#edb05b9a', heavy ? 3 : 2);
    if (heavy) {
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(r * 0.35, -r * 0.67);
        ctx.lineTo(-r * 0.65, -r * 0.67);
        ctx.lineTo(-r, 0);
        ctx.lineTo(-r * 0.65, r * 0.67);
        ctx.lineTo(r * 0.35, r * 0.67);
        ctx.closePath();
        ctx.fillStyle = b.isRearRound ? '#225f71' : '#9c562e';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.7;
        ctx.stroke();
    } else {
        diamond(ctx, 0, r + 2, r * 0.65, color);
    }
    if (b.isRearRound) chevron(ctx, r * 0.35, r * 0.52, r * 0.55, '#e8fffa', 1.6);
    else if (heavy || b.isCrit) line(ctx, -r * 0.5, 0, r * 0.48, 0, '#ffefc7', 2);
}

function drawKatana(ctx, b) {
    const r = b.size;
    const evo = b.isDimensionCut;
    const life = Math.max(0, Math.min(1, b.life / 15));
    const edge = evo ? '#dca2ff' : '#91f4ed';
    ctx.globalAlpha = 0.28 + life * 0.72;
    arc(ctx, 0, 0, r, 0, TAU, evo ? '#aa7df94a' : '#7debd840', 1);
    const sweep = (1 - life) * 1.25 - 0.5;
    arc(ctx, 0, 0, r - 1.5, sweep - 1.3, sweep + 0.75, edge, evo ? 2.6 : 2.1);
    arc(ctx, 0, 0, r - 4, sweep + 0.1, sweep + 0.78, '#edfff7', 2);
    if (evo) {
        line(ctx, -r * 0.75, r * 0.45, r * 0.83, -r * 0.26, '#d3b1ffaf', 1.8);
        line(ctx, -r * 0.24, r * 0.4, r * 0.64, -r * 0.02, '#efe4ff', 1);
    }
}

function drawBoomerang(ctx, b, tick) {
    const evo = b.isThunderBlade;
    const returning = b.returnState !== 0;
    const edge = evo ? '#92e7ff' : '#b5e483';
    chevron(ctx, -12, 3.5, 5, returning ? '#daffdb' : '#8aa88899', 1);
    if (returning) chevron(ctx, -17, 3.5, 5, edge, 1.5);
    ctx.rotate(tick * (returning ? -0.24 : 0.24));
    ctx.beginPath();
    ctx.moveTo(-8, -8);
    ctx.lineTo(10, -2);
    ctx.lineTo(10, 2);
    ctx.lineTo(-8, 8);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fillStyle = evo ? '#254c77' : '#385746';
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (evo) chevron(ctx, 5, 6, 7, '#fff0a0');
}

function drawBlackhole(ctx, b, range, tick) {
    const phase = tick * 0.043 + b.bhUid * 2.4;
    const r = b.size;
    for (let n = 0; n < 3; n++) {
        const theta = phase + n * TAU / 3;
        arc(ctx, 0, 0, range, theta, theta + 0.21, '#b699ff55');
        const pulse = (tick / 54 + n / 3) % 1;
        const pullR = range - (range - r) * pulse;
        arc(ctx, 0, 0, pullR, theta + pulse, theta + pulse + 0.31, '#ae8cec73', 1.3);
    }
    disk(ctx, 0, 0, r, '#25193548');
    arc(ctx, 0, 0, r, 0, TAU, '#c8a0ffb8', 1.5);
    arc(ctx, 0, 0, Math.max(2, r - 3), phase + 0.6, phase + 2.7, '#eee0ff', 1.6);
}

function drawPlasma(ctx, b, tick) {
    const evolved = b.type === 'supernova';
    const r = b.size;
    const color = evolved ? '#ffb568' : '#ce93ff';
    disk(ctx, 0, 0, r - 1, evolved ? '#ef9e4433' : '#ae68e533');
    const turns = evolved ? 4 : 2;
    for (let i = 0; i < turns; i++) {
        const a = tick * 0.07 + i * TAU / turns;
        arc(ctx, 0, 0, r - 1, a, a + TAU / turns * 0.6, color, 2);
    }
    if (evolved) {
        diamond(ctx, 0, r * 0.67, r * 0.47, '#ffb970');
        diamond(ctx, 0, r * 0.4, r * 0.25, '#fff4c2');
    } else {
        disk(ctx, 0, 0, r * 0.43, '#f9d7ff');
    }
}

function drawCryo(ctx, b) {
    diamond(ctx, 0, b.size + 3, b.size * 0.47, '#a9ecff');
    line(ctx, -b.size, 0, b.size * 0.7, 0, '#217887', 1.2);
    if (b.isAbsoluteZero) {
        chevron(ctx, 0, 5.3, 6.5, '#eaffff', 2);
        chevron(ctx, -4.8, 7, 6, '#82c7fa', 1.5);
    }
}

function drawNanite(ctx, b, tick) {
    const r = b.size;
    const saw = 1 + Math.sin(tick * 0.42 + b.angle) * 1.5;
    diamond(ctx, 0, r, r * 0.54, b.isDevourer ? '#f5d4a2' : '#a4e9b3');
    if (b.isDevourer) {
        for (let side = -1; side <= 1; side += 2) {
            ctx.beginPath();
            ctx.moveTo(-r, side);
            ctx.lineTo(r * 0.2, side * (r + saw));
            ctx.lineTo(r * 1.6, side * 2.8);
            ctx.strokeStyle = '#f6bc7b';
            ctx.lineWidth = 1.7;
            ctx.stroke();
        }
    } else chevron(ctx, -2, r * 0.85 + saw, 5, '#80deb0', 1.4);
}

export function drawProjectile(ctx, b, pullRange) {
    const r = b.type === 'blackhole' ? pullRange : b.size + 42;
    if (!inView(b.x, b.y, r)) return;
    const cam = state.camera;
    const tick = state.frameCount;
    ctx.save();
    if (b.type === 'katana' && !b.isDimensionCut && state.player) {
        const p = state.player;
        ctx.translate(p.x - cam.x, p.y - cam.y);
        clipVisibleField(ctx, p.x, p.y, b.size + 42);
        ctx.translate(b.x - p.x, b.y - p.y);
    } else ctx.translate(b.x - cam.x, b.y - cam.y);
    if (b.type === 'blackhole') {
        clipVisibleField(ctx, b.x, b.y, pullRange);
        drawBlackhole(ctx, b, pullRange, tick);
    } else {
        ctx.rotate(b.type === 'katana' ? b.angle : Math.atan2(b.vy, b.vx));
        if (!b.isPlayer) {
            diamond(ctx, -1, b.size * 1.5, b.size + 1.4, '#180f19');
            diamond(ctx, 0, b.size * 1.32, b.size, b.isAcidSpit ? '#b1f36b' : '#ff816e');
            diamond(ctx, 0, b.size * 0.84, b.size * 0.56, '#fff4d4');
        } else {
            switch (b.type) {
                case 'katana': drawKatana(ctx, b); break;
                case 'boomerang': drawBoomerang(ctx, b, tick); break;
                case 'deathray':
                    line(ctx, -29, -3.5, 5, -3.5, '#ff899f', 2.5);
                    line(ctx, -29, 3.5, 5, 3.5, '#ff899f', 2.5);
                    diamond(ctx, 4, b.size, 4, '#ffe5da');
                    break;
                case 'plasma':
                case 'supernova': drawPlasma(ctx, b, tick); break;
                case 'cryo': drawCryo(ctx, b); break;
                case 'nanite': drawNanite(ctx, b, tick); break;
                default: drawRound(ctx, b);
            }
        }
    }
    ctx.restore();
}

export function drawMine(ctx, m, showRange = false) {
    if (!m.active || !inView(m.x, m.y, showRange ? m.range : 15)) return;
    const r = m.isMini ? 4.5 : 8.5;
    const c = m.isVacuum ? '#81dfdd' : '#f0bc7c';
    const pulse = Math.sin((state.frameCount + m.x * 0.15 + m.y * 0.08) * 0.09);
    ctx.save();
    ctx.translate(m.x - state.camera.x, m.y - state.camera.y);
    if (showRange) {
        ctx.save();
        clipVisibleField(ctx, m.x, m.y, m.range);
        for (let n = 0; n < 4; n++) {
            const a = Math.PI / 4 + n * Math.PI / 2;
            arc(ctx, 0, 0, m.range, a - 0.10, a + 0.10, m.isVacuum ? '#90e9dc58' : '#ffca8658');
        }
        ctx.restore();
    }
    if (m.travelAngle != null) {
        const dx = Math.cos(m.travelAngle), dy = Math.sin(m.travelAngle);
        line(ctx, -dx * (r + 7), -dy * (r + 7), -dx * r, -dy * r, c, 1.6);
    }
    disk(ctx, 0, 0, r, '#182934');
    for (let n = 0; n < 3; n++) {
        const a = -Math.PI / 2 + n * TAU / 3;
        arc(ctx, 0, 0, r, a - 0.72, a + 0.72, c, 2);
        if (m.isCluster && !m.isMini) disk(ctx, Math.cos(a) * (r + 2.5), Math.sin(a) * (r + 2.5), 1.7, c);
    }
    if (m.isVacuum) {
        arc(ctx, 0, 0, 5, state.frameCount * 0.07, state.frameCount * 0.07 + 4, c, 1.5);
    } else {
        diamond(ctx, 0, r * 0.45, r * 0.45, pulse > -0.1 ? '#ffdfad' : '#ac8049');
    }
    ctx.restore();
}

function drawAura(ctx, player, params) {
    const { bloodLvl, range, effTickRate } = params;
    const phase = Math.min(1, player.auraTimer / Math.max(1, effTickRate));
    ctx.save();
    ctx.translate(player.x - state.camera.x, player.y - state.camera.y);
    clipVisibleField(ctx, player.x, player.y, range);
    arc(ctx, 0, 0, range, 0, TAU, bloodLvl ? '#ec78925c' : '#6bddd864', 1.2);
    const progress = Math.min(1, phase * 2.2);
    if (progress < 1) {
        ctx.globalAlpha = 1 - progress;
        arc(ctx, 0, 0, Math.max(3, range * progress), 0, TAU, bloodLvl ? '#fd9ab2' : '#a0ece8', 1.6);
    }
    ctx.globalAlpha = 1;
    const count = bloodLvl ? 8 : 4;
    for (let i = 0; i < count; i++) {
        const a = i * TAU / count - Math.PI / 2;
        arc(ctx, 0, 0, range - 2, a - 0.04, a + 0.04, bloodLvl ? '#f7a2af' : '#98e9e2', 1.5);
        if (bloodLvl) {
            const x = Math.cos(a), y = Math.sin(a);
            line(ctx, x * (range - 4), y * (range - 4), x * (range - 9), y * (range - 9), '#f289a1a3');
        }
    }
    ctx.restore();
}

function drawSatellites(ctx, player, radius, neural) {
    for (let i = 0; i < player.orbitals; i++) {
        const a = player.orbitalAngle + i * TAU / player.orbitals;
        const wx = player.x + Math.cos(a) * radius;
        const wy = player.y + Math.sin(a) * radius;
        if (!inView(wx, wy, 13) || checkWall(wx, wy, 2) || raycastWall(player.x, player.y, wx, wy)) continue;
        ctx.save();
        ctx.translate(wx - state.camera.x, wy - state.camera.y);
        ctx.rotate(a + Math.PI * 0.5);
        diamond(ctx, 0, 12, 7, neural ? '#6c5b30' : '#28575f');
        chevron(ctx, 9, 7, 9, neural ? '#ffe5a4' : '#a6eee5', 2.2);
        if (neural) {
            disk(ctx, -2, -3.6, 2.3, '#fff0b6');
            disk(ctx, -2, 3.6, 2.3, '#fff0b6');
        } else diamond(ctx, -1, 3, 2, '#c1fff5');
        ctx.restore();
    }
}

function drawBeam(ctx, beam, player) {
    const cam = state.camera;
    const x = (beam.fromX ?? player.x) - cam.x;
    const y = (beam.fromY ?? player.y) - cam.y;
    const dx = beam.x - cam.x - x;
    const dy = beam.y - cam.y - y;
    const d = Math.hypot(dx, dy);
    if (!d) return;
    const electric = beam.kind === 'tesla' || beam.kind === 'thunder';
    const color = electric ? (beam.kind === 'thunder' ? '#b7eaff' : '#7cd7ff') : '#eb8bce';
    ctx.save();
    ctx.globalAlpha = Math.max(0, beam.alpha);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    if (electric) {
        const segments = Math.max(2, Math.min(10, Math.ceil(d / 40)));
        const phase = beam.x * 0.31 + beam.y * 0.17;
        for (let i = 1; i < segments; i++) {
            const t = i / segments;
            const w = Math.sin(phase + i * 4.24) * Math.min(5, d / 24);
            ctx.lineTo(x + dx * t - dy / d * w, y + dy * t + dx / d * w);
        }
    }
    ctx.lineTo(x + dx, y + dy);
    ctx.strokeStyle = color;
    ctx.lineWidth = electric ? 2 : 2.5;
    ctx.stroke();
    if (!electric) {
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = '#ffe6ef';
        ctx.stroke();
    }
    arc(ctx, x + dx, y + dy, 3.5, 0, TAU, color, 1.3);
    ctx.restore();
}

export function emitWeaponImpact(kind, x, y, radius) {
    const player = state.player;
    if (!player || !inView(x, y, radius)) return;
    let entries = impacts.get(player);
    if (!entries) {
        entries = [];
        impacts.set(player, entries);
    }
    if (entries.length >= 18) entries.shift();
    entries.push({ kind, x, y, radius, start: state.frameCount });
}

function drawImpacts(ctx, player) {
    const entries = impacts.get(player);
    if (!entries) return;
    const cam = state.camera;
    for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        const age = state.frameCount - e.start;
        if (age >= 15 || age < 0) {
            entries.splice(i, 1);
            continue;
        }
        if (!inView(e.x, e.y, e.radius)) continue;
        const progress = age / 15;
        ctx.save();
        ctx.translate(e.x - cam.x, e.y - cam.y);
        ctx.globalAlpha = (1 - progress) * 0.75;
        if (e.kind === 'shatter') {
            for (let n = 0; n < 6; n++) {
                const a = n * TAU / 6 + 0.22;
                const r = e.radius * (0.6 + progress * 0.4);
                const dx = Math.cos(a), dy = Math.sin(a);
                line(ctx, dx * (r - 6), dy * (r - 6), dx * r, dy * r, '#c2f5ff', 2);
            }
        } else {
            clipVisibleField(ctx, e.x, e.y, e.radius);
            const pulling = e.kind === 'supernova' || e.kind === 'vacuum';
            const color = e.kind === 'plasma' ? '#d69aff' : e.kind === 'vacuum' ? '#90e9dc' : '#ffca86';
            const radius = Math.max(2, e.radius * (pulling ? 1 - progress * 0.78 : 0.22 + progress * 0.78));
            for (let n = 0; n < 6; n++) {
                const a = n * TAU / 6;
                arc(ctx, 0, 0, e.radius, a - 0.05, a + 0.05, color, 1.3);
                arc(ctx, 0, 0, radius, a + 0.09, a + 0.83, color, 1.6);
            }
        }
        ctx.restore();
    }
}

export function drawWeaponFields(ctx, player, aura, orbitRadius) {
    if (aura.hasAura) drawAura(ctx, player, aura);
    if (player.getSkillLvl('orbit') || player.getSkillLvl('neural')) {
        drawSatellites(ctx, player, orbitRadius, player.getSkillLvl('neural') > 0);
    }
    for (const beam of player.laserBeams) drawBeam(ctx, beam, player);
    drawImpacts(ctx, player);
}
