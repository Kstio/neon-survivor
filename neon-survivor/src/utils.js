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