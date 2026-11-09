import { state } from './GameState.js';
import { SCREEN_W, SCREEN_H } from './constants.js';

export function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

export function isPointOnScreen(x, y, margin = 0) {
    if (!state.player) return false;
    const halfW = SCREEN_W() / 2 + margin;
    const halfH = SCREEN_H() / 2 + margin;
    return Math.abs(x - state.player.x) <= halfW && Math.abs(y - state.player.y) <= halfH;
}

const GRID_CELL = 300;

export function buildSpatialGrid(obstacles) {
    const grid = new Map();
    obstacles.forEach((o, idx) => {
        const minCx = Math.floor(o.x / GRID_CELL);
        const maxCx = Math.floor((o.x + o.w) / GRID_CELL);
        const minCy = Math.floor(o.y / GRID_CELL);
        const maxCy = Math.floor((o.y + o.h) / GRID_CELL);
        for (let cx = minCx; cx <= maxCx; cx++) {
            for (let cy = minCy; cy <= maxCy; cy++) {
                const key = cx + ',' + cy;
                let bucket = grid.get(key);
                if (!bucket) { bucket = []; grid.set(key, bucket); }
                bucket.push(idx);
            }
        }
    });
    return grid;
}

function getCandidates(minX, minY, maxX, maxY) {
    const obstacles = state.obstacles;
    const grid = state.obstacleGrid;
    if (!grid) return obstacles;

    const minCx = Math.floor(minX / GRID_CELL);
    const maxCx = Math.floor(maxX / GRID_CELL);
    const minCy = Math.floor(minY / GRID_CELL);
    const maxCy = Math.floor(maxY / GRID_CELL);

    const seen = new Set();
    const result = [];
    for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cy = minCy; cy <= maxCy; cy++) {
            const bucket = grid.get(cx + ',' + cy);
            if (!bucket) continue;
            for (let i = 0; i < bucket.length; i++) {
                const idx = bucket[i];
                if (!seen.has(idx)) {
                    seen.add(idx);
                    result.push(obstacles[idx]);
                }
            }
        }
    }
    return result;
}

export function checkWall(x, y, r) {
    if (!state.obstacles || state.obstacles.length === 0) return false;

    const candidates = getCandidates(x - r, y - r, x + r, y + r);

    for (let i = 0; i < candidates.length; i++) {
        const o = candidates[i];

        if (x + r < o.x || x - r > o.x + o.w || y + r < o.y || y - r > o.y + o.h) {
            continue;
        }

        const closestX = clamp(x, o.x, o.x + o.w);
        const closestY = clamp(y, o.y, o.y + o.h);

        const distanceX = x - closestX;
        const distanceY = y - closestY;

        const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);
        if (distanceSquared < (r * r)) {
            return true;
        }
    }
    return false;
}

export function resolveWallOverlap(x, y, r) {
    if (!state.obstacles || state.obstacles.length === 0) {
        return { x, y, overlapped: false };
    }

    let cx = x;
    let cy = y;
    let overlapped = false;
    const eps = 0.05;

    for (let pass = 0; pass < 8; pass++) {
        let movedInPass = false;
        const candidates = getCandidates(cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2);

        for (let i = 0; i < candidates.length; i++) {
            const o = candidates[i];
            if (cx + r <= o.x || cx - r >= o.x + o.w || cy + r <= o.y || cy - r >= o.y + o.h) {
                continue;
            }

            const closestX = clamp(cx, o.x, o.x + o.w);
            const closestY = clamp(cy, o.y, o.y + o.h);
            const dx = cx - closestX;
            const dy = cy - closestY;
            const distSq = dx * dx + dy * dy;

            if (distSq >= r * r) {
                continue;
            }

            overlapped = true;
            movedInPass = true;

            if (distSq > 0.00001) {
                const dist = Math.sqrt(distSq);
                const push = (r - dist) + eps;
                cx += (dx / dist) * push;
                cy += (dy / dist) * push;
            } else {

                const dLeft = (cx - o.x) + r + eps;
                const dRight = (o.x + o.w - cx) + r + eps;
                const dTop = (cy - o.y) + r + eps;
                const dBottom = (o.y + o.h - cy) + r + eps;

                const dirs = [
                    { nx: cx - dLeft, ny: cy, pen: dLeft },
                    { nx: cx + dRight, ny: cy, pen: dRight },
                    { nx: cx, ny: cy - dTop, pen: dTop },
                    { nx: cx, ny: cy + dBottom, pen: dBottom }
                ];
                dirs.sort((a, b) => a.pen - b.pen);

                let chosen = dirs[0];
                for (let k = 0; k < dirs.length; k++) {
                    if (!checkWall(dirs[k].nx, dirs[k].ny, r) && !raycastWall(x, y, dirs[k].nx, dirs[k].ny)) {
                        chosen = dirs[k];
                        break;
                    }
                }
                cx = chosen.nx;
                cy = chosen.ny;
            }
        }

        if (!movedInPass) break;
    }

    return { x: cx, y: cy, overlapped };
}

export function getAccessibleTargetPoint(targetX, targetY, r) {
    const resolved = resolveWallOverlap(targetX, targetY, r);
    if (!raycastWall(targetX, targetY, resolved.x, resolved.y)) {
        return resolved;
    }

    const dx = resolved.x - targetX;
    const dy = resolved.y - targetY;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) * 0.5;
        const mx = targetX + dx * mid;
        const my = targetY + dy * mid;
        if (!raycastWall(targetX, targetY, mx, my)) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return {
        x: targetX + dx * lo,
        y: targetY + dy * lo,
        overlapped: true
    };
}

export function moveEntityWithWalls(x, y, dx, dy, r) {
    let resolved = resolveWallOverlap(x, y, r);
    let cx = resolved.x;
    let cy = resolved.y;

    if (!Number.isFinite(dx)) dx = 0;
    if (!Number.isFinite(dy)) dy = 0;

    const totalDist = Math.hypot(dx, dy);
    if (totalDist < 0.0001) {
        return { x: cx, y: cy, blockedX: false, blockedY: false };
    }

    const maxStep = Math.max(2.5, r * 0.35);
    const steps = Math.max(1, Math.ceil(totalDist / maxStep));
    const stepX = dx / steps;
    const stepY = dy / steps;

    let blockedX = false;
    let blockedY = false;

    for (let s = 0; s < steps; s++) {
        if (Math.abs(stepX) > 0.00001) {
            const tryX = cx + stepX;
            if (!checkWall(tryX, cy, r)) {
                cx = tryX;
            } else {
                blockedX = true;
            }
        }

        if (Math.abs(stepY) > 0.00001) {
            const tryY = cy + stepY;
            if (!checkWall(cx, tryY, r)) {
                cy = tryY;
            } else {
                blockedY = true;
            }
        }

        if (checkWall(cx, cy, r)) {
            const fix = resolveWallOverlap(cx, cy, r);
            cx = fix.x;
            cy = fix.y;
        }
    }

    return { x: cx, y: cy, blockedX, blockedY };
}

export function calcDmg(base, playerStats) {
    const isOverdrive = state.player && state.player.overdriveTimer > 0;
    const critChance = isOverdrive ? 1.0 : (playerStats.critChance || 0);
    const isCrit = Math.random() < critChance;
    const mult = isCrit ? 2 : 1;
    return { val: base * (playerStats.dmgMult || 1) * mult, isCrit: isCrit };
}

export function findNearestEnemies(x, y, count = 1) {
    if (count === 1) {
        let nearest = null;
        let minDist = Infinity;
        for (const e of state.enemies) {
            if (e.isDead) continue;
            const d = (e.x - x) ** 2 + (e.y - y) ** 2;
            if (d < minDist) {
                minDist = d;
                nearest = e;
            }
        }
        return nearest ? [nearest] : [];
    }

    let list = [];
    for (const e of state.enemies) {
        if (e.isDead) continue;
        const d = Math.hypot(e.x - x, e.y - y);
        list.push({ e, d });
    }
    list.sort((a, b) => a.d - b.d);
    return list.slice(0, count).map(item => item.e);
}

export function findNearestVisibleEnemies(x, y, count = 1, maxRange = Infinity) {
    let list = [];
    const enemies = state.enemies;
    const len = enemies.length;
    for (let i = 0; i < len; i++) {
        const e = enemies[i];
        if (e.isDead) continue;
        const d = Math.hypot(e.x - x, e.y - y);
        if (d > maxRange) continue;
        if (raycastWall(x, y, e.x, e.y)) continue;
        list.push({ e, d });
    }
    list.sort((a, b) => a.d - b.d);
    return list.slice(0, count).map(item => item.e);
}

export function canPassClearance(x1, y1, x2, y2, radius = 20) {
    if (!state.obstacles || state.obstacles.length === 0) return true;
    if (raycastWall(x1, y1, x2, y2)) return false;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0) return !checkWall(x1, y1, radius);
    const stepSize = Math.max(12, Math.min(18, radius * 0.75));
    const steps = Math.ceil(dist / stepSize);
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const sx = x1 + dx * t;
        const sy = y1 + dy * t;
        if (checkWall(sx, sy, radius)) {
            return false;
        }
    }
    return true;
}

export function raycastWall(x1, y1, x2, y2) {
    if (!state.obstacles || state.obstacles.length === 0) return false;

    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    const candidates = getCandidates(minX, minY, maxX, maxY);

    for (const o of candidates) {
        if (maxX < o.x || minX > o.x + o.w || maxY < o.y || minY > o.y + o.h) {
            continue;
        }

        const dx = x2 - x1;
        const dy = y2 - y1;

        const check = (fixed, p1, p2, q1, q2, minO, maxO) => {
            if (p2 === p1) return false;
            const t = (fixed - p1) / (p2 - p1);
            if (t >= 0 && t <= 1) {
                const intersect = q1 + t * (q2 - q1);
                if (intersect >= minO && intersect <= maxO) return true;
            }
            return false;
        };

        if (check(o.x, x1, x2, y1, y2, o.y, o.y + o.h)) return true;
        if (check(o.x + o.w, x1, x2, y1, y2, o.y, o.y + o.h)) return true;
        if (check(o.y, y1, y2, x1, x2, o.x, o.x + o.w)) return true;
        if (check(o.y + o.h, y1, y2, x1, x2, o.x, o.x + o.w)) return true;

        if (x1 > o.x && x1 < o.x + o.w && y1 > o.y && y1 < o.y + o.h) return true;
    }
    return false;
}
