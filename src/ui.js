import { makeModuleIcon } from './systems/ModuleIcons.js';
import { skillFacts } from './systems/SkillPreview.js';
import { state } from './GameState.js';
import { SKILL_DB, SCREEN_W, SCREEN_H, ACHIEVEMENTS_DB } from './constants.js';
import { Meta } from './MetaGame.js';
import { playAudioPreview } from './sounds.js';

let prevHealth = '';
let prevScore = -1;
let prevLvl = -1;
let prevXpPct = -1;
let prevDashPct = -1;
let prevEmpPct = -1;
let prevDashReady = null;
let prevEmpReady = null;
let cachedDashTime = -1;
let cachedUltTime = -1;
let prevStarterShieldKey = '';
let prevEnergyShieldKey = '';

let scoreEl = null;
let levelEl = null;
let xpFillEl = null;
let cdDashEl = null;
let cdEmpEl = null;
let skillDashEl = null;
let skillEmpEl = null;
let indicatorsEl = null;
let starterShieldBoxEl = null;
let starterShieldValEl = null;
let energyShieldBoxEl = null;
let energyShieldValEl = null;

function cacheDOMElements() {
    if (!scoreEl) {
        scoreEl = document.getElementById('score-display');
        levelEl = document.getElementById('level-display');
        xpFillEl = document.getElementById('xp-fill');
        cdDashEl = document.getElementById('cd-dash');
        cdEmpEl = document.getElementById('cd-emp');
        skillDashEl = document.getElementById('skill-dash');
        skillEmpEl = document.getElementById('skill-emp');
        indicatorsEl = document.getElementById('loot-indicators');
        starterShieldBoxEl = document.getElementById('starter-shield-box');
        starterShieldValEl = document.getElementById('starter-shield-display');
        energyShieldBoxEl = document.getElementById('energy-shield-box');
        energyShieldValEl = document.getElementById('energy-shield-display');
    }
}

export function updateUI() {
    if (!state.player) return;
    cacheDOMElements();
    const health = Math.max(0, Math.ceil(state.player.hp)) + ' / ' + state.player.maxHp;
    if (health !== prevHealth) {
        const el = document.getElementById('hud-hp');
        if (el) el.textContent = health;
        prevHealth = health;
    }

    if (state.score !== prevScore && scoreEl) {
        scoreEl.innerText = state.score;
        prevScore = state.score;
    }

    if (state.player.lvl !== prevLvl && levelEl) {
        levelEl.innerText = state.player.lvl;
        prevLvl = state.player.lvl;
    }

    const pct = Math.floor(Math.min(100, (state.player.xp / state.player.nextXp) * 100));
    if (pct !== prevXpPct && xpFillEl) {
        xpFillEl.style.width = pct + '%';
        prevXpPct = pct;
    }

    const dPct = Math.floor((state.player.dashCd / state.player.dashMax) * 100);
    if (dPct !== prevDashPct && cdDashEl) {
        cdDashEl.style.height = dPct + '%';
        prevDashPct = dPct;
    }

    const ePct = Math.floor((state.player.empCd / state.player.empMax) * 100);
    if (ePct !== prevEmpPct && cdEmpEl) {
        cdEmpEl.style.height = ePct + '%';
        prevEmpPct = ePct;
    }

    const dashSeconds = Math.max(0, Math.ceil(state.player.dashCd / 60));
    const ultSeconds = Math.max(0, Math.ceil(state.player.empCd / 60));
    if (dashSeconds !== cachedDashTime) {
        document.getElementById('dash-time').textContent = dashSeconds ? dashSeconds + ' с' : '';
        cachedDashTime = dashSeconds;
    }
    if (ultSeconds !== cachedUltTime) {
        document.getElementById('ult-time').textContent = ultSeconds ? ultSeconds + ' с' : '';
        cachedUltTime = ultSeconds;
    }
    const dashReady = state.player.dashCd <= 0;
    if (dashReady !== prevDashReady && skillDashEl) {
        if (dashReady) skillDashEl.classList.add('ready');
        else skillDashEl.classList.remove('ready');
        prevDashReady = dashReady;
    }

    const empReady = state.player.empCd <= 0;
    if (empReady !== prevEmpReady && skillEmpEl) {
        if (empReady) skillEmpEl.classList.add('ready');
        else skillEmpEl.classList.remove('ready');
        prevEmpReady = empReady;
    }

    if (starterShieldBoxEl && starterShieldValEl) {
        const maxCharges = state.player.starterShieldMax || 0;
        const curCharges = state.player.starterShieldCharges || 0;
        const starterKey = `${curCharges}/${maxCharges}`;
        if (starterKey !== prevStarterShieldKey) {
            prevStarterShieldKey = starterKey;
            if (maxCharges <= 0 && curCharges <= 0) {
                starterShieldBoxEl.classList.add('hidden');
            } else {
                starterShieldBoxEl.classList.remove('hidden');
                const filled = '◆'.repeat(Math.max(0, curCharges));
                const empty = '◇'.repeat(Math.max(0, maxCharges - curCharges));
                starterShieldValEl.innerText = `${filled}${empty} ${curCharges}/${maxCharges}`;
            }
        }
    }

    if (energyShieldBoxEl && energyShieldValEl) {
        const shieldLvl = state.player.getSkillLvl('shield');
        const maxCharges = state.player.getShieldMaxCharges
            ? state.player.getShieldMaxCharges(shieldLvl)
            : (state.player.stats?.shieldMax || 0);
        const curCharges = state.player.shieldCharges || 0;
        const cd = state.player.getShieldCooldownTicks
            ? state.player.getShieldCooldownTicks(shieldLvl)
            : Math.max(60, 450 - (shieldLvl * 40));
        const cdPct = cd > 0 ? Math.min(99, Math.floor(((state.player.stats?.shieldTimer || 0) / cd) * 100)) : 0;
        const isRecharging = curCharges < maxCharges;
        const energyKey = (shieldLvl <= 0 || maxCharges <= 0)
            ? '0'
            : `${shieldLvl}:${curCharges}/${maxCharges}:${isRecharging ? cdPct : 100}`;
        if (energyKey !== prevEnergyShieldKey) {
            prevEnergyShieldKey = energyKey;
            if (shieldLvl <= 0 || maxCharges <= 0) {
                energyShieldBoxEl.classList.add('hidden');
            } else {
                energyShieldBoxEl.classList.remove('hidden');
                const filled = '◆'.repeat(Math.max(0, curCharges));
                const empty = '◇'.repeat(Math.max(0, maxCharges - curCharges));
                if (curCharges >= maxCharges) {
                    energyShieldBoxEl.classList.remove('recharging');
                    energyShieldValEl.innerText = `${filled} ${curCharges}/${maxCharges} ГОТОВ`;
                } else if (curCharges > 0) {
                    energyShieldBoxEl.classList.remove('recharging');
                    energyShieldValEl.innerText = `${filled}${empty} ${curCharges}/${maxCharges} (КД ${cdPct}%)`;
                } else {
                    energyShieldBoxEl.classList.add('recharging');
                    energyShieldValEl.innerText = `${empty} ${curCharges}/${maxCharges} КД ${cdPct}%`;
                }
            }
        }
    }

    const eventBanner = document.getElementById('event-banner');
    if (eventBanner) {
        if (state.eventAlert && state.eventAlert.timer > 0) {
            eventBanner.classList.remove('hidden');
            const titleEl = document.getElementById('event-title');
            const descEl = document.getElementById('event-desc');
            if (titleEl) titleEl.innerText = state.eventAlert.title;
            if (descEl) descEl.innerText = state.eventAlert.desc;
        } else {
            eventBanner.classList.add('hidden');
        }
    }
}

export function updateIndicators() {
    cacheDOMElements();
    if (!indicatorsEl || !state.player) return;

    const hasZone = state.airdropZones.length > 0 && !state.airdropZones[0].isCompleted;
    const hasLoot = !!state.activeLoot;

    if (!hasZone && !hasLoot) {
        if (indicatorsEl.innerHTML !== '') indicatorsEl.innerHTML = '';
        return;
    }

    indicatorsEl.innerHTML = '';

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
        indicatorsEl.appendChild(arrow);
    };

    if (hasZone) {
        const zone = state.airdropZones[0];
        drawArrow(zone.x, zone.y, 'arrow-blue');
    }

    if (hasLoot) {
        drawArrow(state.activeLoot.x, state.activeLoot.y, 'arrow-green');
    }
}

export function renderStats() {
    const list = document.getElementById('stats-list');
    if (!list) return;
    list.innerHTML = '';
    if (!state.player) return;

    const base = document.createElement('div');
    base.innerHTML = `Уровень: ${state.player.lvl}`;
    list.appendChild(base);

    const slots = state.player.getSlotCounts ? state.player.getSlotCounts() : { weapon: 0, passive: 0, maxWeapon: 4, maxPassive: 4 };
    const slotRow = document.createElement('div');
    slotRow.style.marginTop = '6px';
    slotRow.style.color = 'var(--clr-primary)';
    slotRow.innerHTML = `Оружие ${slots.weapon}/${slots.maxWeapon} • Пассивки ${slots.passive}/${slots.maxPassive}`;
    list.appendChild(slotRow);

    if (state.player.starterShieldMax > 0) {
        const sRow = document.createElement('div');
        sRow.style.marginTop = '6px';
        sRow.innerHTML = `Стартовый щит: ${state.player.starterShieldCharges}/${state.player.starterShieldMax}`;
        list.appendChild(sRow);
    }

    const shieldLvl = state.player.getSkillLvl ? state.player.getSkillLvl('shield') : 0;
    if (shieldLvl > 0) {
        const maxCharges = state.player.getShieldMaxCharges ? state.player.getShieldMaxCharges(shieldLvl) : (state.player.stats?.shieldMax || 1);
        const curCharges = state.player.shieldCharges || 0;
        const cd = state.player.getShieldCooldownTicks ? state.player.getShieldCooldownTicks(shieldLvl) : Math.max(60, 450 - (shieldLvl * 40));
        const cdPct = cd > 0 ? Math.min(99, Math.floor(((state.player.stats?.shieldTimer || 0) / cd) * 100)) : 0;
        const esRow = document.createElement('div');
        esRow.style.marginTop = '6px';
        if (curCharges >= maxCharges) {
            esRow.innerHTML = `Энерго-Щит: ${curCharges}/${maxCharges} (ГОТОВ)`;
        } else if (curCharges > 0) {
            esRow.innerHTML = `Энерго-Щит: ${curCharges}/${maxCharges} (активен, зарядка ${cdPct}%)`;
        } else {
            esRow.innerHTML = `Энерго-Щит: ${curCharges}/${maxCharges} (КД ${cdPct}%)`;
        }
        list.appendChild(esRow);
    }

    const permDodge = state.player.stats?.dodge || 0;
    const earlyDodge = state.player.getEarlyDodgeBonus ? state.player.getEarlyDodgeBonus() : 0;
    const totalDodge = state.player.getEffectiveDodge ? state.player.getEffectiveDodge() : Math.min(0.50, permDodge + earlyDodge);
    if (permDodge > 0 || earlyDodge > 0) {
        const permPct = Math.round(permDodge * 100);
        const earlyPct = Math.round(earlyDodge * 100);
        const totalPct = Math.round(totalDodge * 100);
        const dRow = document.createElement('div');
        dRow.style.marginTop = '6px';
        if (earlyPct > 0) {
            dRow.innerHTML = `Уклонение: ${totalPct}% (пост. ${permPct}% + врем. +${earlyPct}%, макс. 50%)`;
        } else {
            dRow.innerHTML = `Уклонение: ${permPct}% (пост. ${permPct}%, макс. 50%)`;
        }
        list.appendChild(dRow);
    }

    const regenTotal = state.player.getRegenPerSec ? state.player.getRegenPerSec() : (state.player.stats?.regen || 0);
    if (regenTotal > 0) {
        const rRow = document.createElement('div');
        rRow.style.marginTop = '6px';
        rRow.innerHTML = `Реген: +${Number(regenTotal.toFixed(2))} HP/с`;
        list.appendChild(rRow);
    }

    const vampLvl = state.player.getSkillLvl ? state.player.getSkillLvl('vamp') : 0;
    if (vampLvl > 0) {
        const vampChancePct = Math.round((state.player.stats?.vampChance || 0) * 100);
        const vampHealVal = state.player.getVampHealAmount ? state.player.getVampHealAmount() : (state.player.stats?.vampHeal || 0);
        const vRow = document.createElement('div');
        vRow.style.marginTop = '6px';
        vRow.innerHTML = `Вампиризм: ${vampChancePct}% (+${Number(vampHealVal.toFixed(2))} HP, КД 0.4с)`;
        list.appendChild(vRow);
    }

    Object.keys(state.player.skills).forEach(key => {
        const lvl = state.player.skills[key];
        if (lvl > 0) {
            const def = SKILL_DB[key];
            const item = document.createElement('div');
            item.style.marginTop = '6px';
            item.innerHTML = `${def.name}: Ур. ${lvl}`;
            list.appendChild(item);
        }
    });
}

export function renderAbilities() {
    const list = document.getElementById('abilities-list');
    const player = state.player;
    if (!list) return;
    list.innerHTML = '';
    if (!player) return;
    const counts = player.getSlotCounts();
    for (const [type, name, count, maximum] of [
        ['weapon', 'Оружие', counts.weapon, counts.maxWeapon],
        ['passive', 'Пассивки', counts.passive, counts.maxPassive]
    ]) {
        const group = document.createElement('section');
        group.className = 'loadout-group';
        group.innerHTML = `<h3>${name} ${count}/${maximum}</h3>`;
        for (const [id, level] of Object.entries(player.skills)) {
            const def = SKILL_DB[id];
            if (!def || !level || (def.type === 'passive') !== (type === 'passive')) continue;
            const item = document.createElement('details');
            item.innerHTML = `<summary><span class="loadout-icon"></span><strong>${def.name}</strong><small>${def.type === 'evo' ? 'Эволюция' : level + '/' + def.max}</small></summary>
                <p>${def.desc}</p><dl>${skillFacts(id, player, level).map(f => `<div><dt>${f.label}</dt><dd>${f.value}</dd></div>`).join('')}</dl>`;
            item.querySelector('.loadout-icon').appendChild(makeModuleIcon(id, 30));
            group.appendChild(item);
        }
        if (!count) {
            const empty = document.createElement('p');
            empty.className = 'empty-slots';
            empty.textContent = 'Свободно слотов · ' + maximum;
            group.appendChild(empty);
        }
        list.appendChild(group);
    }
}

function formatDuration(totalSec) {
    totalSec = Math.floor(totalSec || 0);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return h > 0 ? `${h}ч ${m}м` : `${m}м ${s}с`;
}

export function renderProfile() {
    const s = Meta.data.stats;

    const statsContainer = document.getElementById('profile-stats');
    statsContainer.innerHTML = '';

    const favKey = Meta.getFavoriteSkill();
    const favName = favKey && SKILL_DB[favKey] ? SKILL_DB[favKey].name : '—';

    const rows = [
        ['Забегов сыграно', s.runsPlayed],
        ['Всего убито врагов', s.totalKills],
        ['Убито Титанов', s.titansKilled],
        ['Всего чипов заработано', s.totalChips],
        ['Общее время выживания', formatDuration(s.totalPlaytime)],
        ['Рекорд времени в забеге', formatDuration(s.bestTime)],
        ['Рекорд уровня', s.maxLevel],
        ['Рекорд очков', s.bestScore],
        ['Предпочитаемое вооружение', favName]
    ];

    rows.forEach(([label, val]) => {
        const div = document.createElement('div');
        div.innerHTML = `<span>${label}</span><span style="color:var(--clr-warning)">${val}</span>`;
        statsContainer.appendChild(div);
    });

    const achContainer = document.getElementById('profile-achievements');
    achContainer.innerHTML = '';
    Object.keys(ACHIEVEMENTS_DB).forEach(key => {
        const def = ACHIEVEMENTS_DB[key];
        const unlocked = !!Meta.data.achievements[key];
        const div = document.createElement('div');
        div.innerHTML = `
            <span>${unlocked ? '✅ ' : '🔒 '}${def.icon ? def.icon + ' ' : ''}${def.name} <small style="color:var(--clr-warning)">(+${def.reward} $)</small></span>
            <span style="color:${unlocked ? 'var(--clr-success)' : '#666'}">${unlocked ? 'Выполнено' : def.desc}</span>
        `;
        achContainer.appendChild(div);
    });

    const logContainer = document.getElementById('profile-runlog');
    logContainer.innerHTML = '';
    if (Meta.data.runLogs.length === 0) {
        const empty = document.createElement('div');
        empty.innerText = 'Забегов ещё не было';
        empty.style.color = '#555';
        empty.style.justifyContent = 'center';
        logContainer.appendChild(empty);
    } else {
        Meta.data.runLogs.forEach((run, idx) => {
            const div = document.createElement('div');
            const dateStr = new Date(run.date).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            div.innerHTML = `
                <span>#${s.runsPlayed - idx} // ${dateStr} // ${formatDuration(run.duration)} // Ур.${run.level} // ${run.kills} убито</span>
                <span style="color:var(--clr-danger)">${run.cause}</span>
            `;
            logContainer.appendChild(div);
        });
    }
}

export function renderAudioSettings() {
    const audio = Meta.data?.audio || { master: 0.7, sfx: 0.7, music: 0.6, ui: 0.8, muted: false };

    const masterSlider = document.getElementById('master-volume-slider');
    const sfxSlider = document.getElementById('sfx-volume-slider');
    const musicSlider = document.getElementById('music-volume-slider');
    const uiSlider = document.getElementById('ui-volume-slider');
    const muteToggle = document.getElementById('mute-toggle');

    const masterBadge = document.getElementById('master-val-badge');
    const sfxBadge = document.getElementById('sfx-val-badge');
    const musicBadge = document.getElementById('music-val-badge');
    const uiBadge = document.getElementById('ui-val-badge');

    const musicVal = typeof audio.music === 'number' ? audio.music : 0.6;

    if (masterSlider) masterSlider.value = Math.round(audio.master * 100);
    if (sfxSlider) sfxSlider.value = Math.round(audio.sfx * 100);
    if (musicSlider) musicSlider.value = Math.round(musicVal * 100);
    if (uiSlider) uiSlider.value = Math.round(audio.ui * 100);
    if (muteToggle) muteToggle.checked = !!audio.muted;

    if (masterBadge) masterBadge.innerText = `${Math.round(audio.master * 100)}%`;
    if (sfxBadge) sfxBadge.innerText = `${Math.round(audio.sfx * 100)}%`;
    if (musicBadge) musicBadge.innerText = `${Math.round(musicVal * 100)}%`;
    if (uiBadge) uiBadge.innerText = `${Math.round(audio.ui * 100)}%`;
}

export function initAudioUI() {
    renderAudioSettings();

    const masterSlider = document.getElementById('master-volume-slider');
    const sfxSlider = document.getElementById('sfx-volume-slider');
    const musicSlider = document.getElementById('music-volume-slider');
    const uiSlider = document.getElementById('ui-volume-slider');
    const muteToggle = document.getElementById('mute-toggle');

    const masterBadge = document.getElementById('master-val-badge');
    const sfxBadge = document.getElementById('sfx-val-badge');
    const musicBadge = document.getElementById('music-val-badge');
    const uiBadge = document.getElementById('ui-val-badge');

    if (masterSlider) {
        masterSlider.oninput = (e) => {
            const val = parseInt(e.target.value, 10);
            if (masterBadge) masterBadge.innerText = `${val}%`;
            Meta.setAudioSetting('master', val / 100);
        };
        masterSlider.onchange = () => playAudioPreview('master');
    }

    if (sfxSlider) {
        sfxSlider.oninput = (e) => {
            const val = parseInt(e.target.value, 10);
            if (sfxBadge) sfxBadge.innerText = `${val}%`;
            Meta.setAudioSetting('sfx', val / 100);
        };
        sfxSlider.onchange = () => playAudioPreview('sfx');
    }

    if (musicSlider) {
        musicSlider.oninput = (e) => {
            const val = parseInt(e.target.value, 10);
            if (musicBadge) musicBadge.innerText = `${val}%`;
            Meta.setAudioSetting('music', val / 100);
        };
        musicSlider.onchange = () => playAudioPreview('music');
    }

    if (uiSlider) {
        uiSlider.oninput = (e) => {
            const val = parseInt(e.target.value, 10);
            if (uiBadge) uiBadge.innerText = `${val}%`;
            Meta.setAudioSetting('ui', val / 100);
        };
        uiSlider.onchange = () => playAudioPreview('ui');
    }

    if (muteToggle) {
        muteToggle.onchange = (e) => {
            Meta.setAudioSetting('muted', e.target.checked);
        };
    }
}
