import { state } from './GameState.js';

export function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

export function checkWall(x, y, r) {
    if (!state.obstacles) return false;
    
    for (let i = 0; i < state.obstacles.length; i++) {
        const o = state.obstacles[i];
        
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

export function calcDmg(base, playerStats) {
    const isCrit = Math.random() < playerStats.critChance;
    const mult = isCrit ? 2.0 : 1.0;
    return { val: base * playerStats.dmgMult * mult, isCrit: isCrit };
}

export function findNearestEnemies(x, y, count = 1) {
    let list = [];
    for (const e of state.enemies) {
        if (e.isDead) continue;
        const d = Math.hypot(e.x - x, e.y - y);
        list.push({ e, d });
    }
    list.sort((a, b) => a.d - b.d);
    return list.slice(0, count).map(item => item.e);
}

export function raycastWall(x1, y1, x2, y2) {
    if (!state.obstacles) return false;

    for (const o of state.obstacles) {
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
        
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