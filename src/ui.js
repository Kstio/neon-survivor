import { state } from './GameState.js';
import { SKILL_DB, SCREEN_W, SCREEN_H } from './constants.js';

export function updateUI() {
    if (!state.player) return;

    document.getElementById('score-display').innerText = state.score;
    document.getElementById('level-display').innerText = state.player.lvl;
    
    const pct = Math.min(100, (state.player.xp / state.player.nextXp) * 100);
    document.getElementById('xp-fill').style.width = pct + '%';
    
    const dPct = (state.player.dashCd / state.player.dashMax) * 100;
    document.getElementById('cd-dash').style.height = dPct + '%';
    
    const ePct = (state.player.empCd / state.player.empMax) * 100;
    document.getElementById('cd-emp').style.height = ePct + '%';
    
    const dSlot = document.getElementById('skill-dash');
    if (state.player.dashCd <= 0) dSlot.classList.add('ready'); else dSlot.classList.remove('ready');
    
    const eSlot = document.getElementById('skill-emp');
    if (state.player.empCd <= 0) eSlot.classList.add('ready'); else eSlot.classList.remove('ready');
}

export function updateIndicators() {
    const container = document.getElementById('loot-indicators');
    container.innerHTML = '';
    if (!state.player) return;

    const drawArrow = (tx, ty, cls) => {
        const dist = Math.hypot(tx - state.player.x, ty - state.player.y);
        if (dist < SCREEN_W() / 2) return;
        
        const angle = Math.atan2(ty - state.player.y, tx - state.player.x);
        const arrow = document.createElement('div');
        arrow.className = 'arrow ' + cls;
        
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const r = Math.min(cx, cy) - 40;
        
        const ax = cx + Math.cos(angle) * r;
        const ay = cy + Math.sin(angle) * r;
        
        arrow.style.left = ax + 'px';
        arrow.style.top = ay + 'px';
        arrow.style.transform = `translate(-50%, -50%) rotate(${angle + Math.PI / 2}rad)`;
        container.appendChild(arrow);
    };

    let nearC = null, distC = Infinity;
    state.crates.forEach(c => {
        const d = Math.hypot(c.x - state.player.x, c.y - state.player.y);
        if (d < distC) { distC = d; nearC = c; }
    });
    if (nearC) drawArrow(nearC.x, nearC.y, 'arrow-green');

    let nearS = null, distS = Infinity;
    state.skillCrates.forEach(s => {
        const d = Math.hypot(s.x - state.player.x, s.y - state.player.y);
        if (d < distS) { distS = d; nearS = s; }
    });
    if (nearS) drawArrow(nearS.x, nearS.y, 'arrow-blue');
}

export function renderStats() {
    const list = document.getElementById('stats-list');
    list.innerHTML = '';
    if (!state.player) return;

    const base = document.createElement('div');
    base.innerHTML = `Уровень: ${state.player.lvl}`;
    list.appendChild(base);

    Object.keys(state.player.skills).forEach(key => {
        const lvl = state.player.skills[key];
        if (lvl > 0) {
            const def = SKILL_DB[key];
            const item = document.createElement('div');
            item.style.marginTop = '6px';
            item.innerHTML = `${def.name}: Lvl ${lvl}`;
            list.appendChild(item);
        }
    });
}