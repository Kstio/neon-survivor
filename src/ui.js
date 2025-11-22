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

    if (state.airdropZones.length > 0 && !state.airdropZones[0].isCompleted) {
        const zone = state.airdropZones[0];
        drawArrow(zone.x, zone.y, 'arrow-blue');
    }

    if (state.activeLoot) {
        drawArrow(state.activeLoot.x, state.activeLoot.y, 'arrow-green');
    }
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

export function renderAbilities() {
    const list = document.getElementById('abilities-list');
    list.innerHTML = '';
    if (!state.player) return;

    const header = document.createElement('div');
    header.innerHTML = `<span style="color:#fff">Уровень доступа</span> <span style="color:var(--neon-blue)">${state.player.lvl}</span>`;
    list.appendChild(header);

    const sortedKeys = Object.keys(state.player.skills).sort((a,b) => {
        const typeA = SKILL_DB[a].type;
        const typeB = SKILL_DB[b].type;
        if(typeA === typeB) return 0;
        return typeA > typeB ? 1 : -1;
    });

    sortedKeys.forEach(key => {
        const lvl = state.player.skills[key];
        if (lvl > 0) {
            const def = SKILL_DB[key];
            const item = document.createElement('div');
            
            let typeIcon = '🔹'; 
            if(def.type === 'weapon') typeIcon = '⚔️';
            if(def.type === 'active') typeIcon = '⚡';

            item.innerHTML = `
                <span>${typeIcon} ${def.name}</span> 
                <span style="color:var(--neon-gold)">Lvl ${lvl}</span>
            `;
            list.appendChild(item);
        }
    });

    if (sortedKeys.length === 0) {
        const empty = document.createElement('div');
        empty.innerText = "Нет установленных модулей";
        empty.style.color = "#555";
        empty.style.justifyContent = "center";
        list.appendChild(empty);
    }
}