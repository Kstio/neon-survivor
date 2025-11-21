import { state } from './GameState.js';

export function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

export function checkWall(x, y, r) {
    if (!state.obstacles) return false;
    for (const o of state.obstacles) {
        if (x + r > o.x && x - r < o.x + o.w && y + r > o.y && y - r < o.y + o.h) {
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