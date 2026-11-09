import { Meta, UPGRADES } from '../MetaGame.js';
import { SKILL_DB } from '../constants.js';
import { PILOTS, PilotManager } from '../systems/PilotClasses.js';
import { drawHangar, drawHull } from '../systems/HullRenderer.js';
import { makeModuleIcon } from '../systems/ModuleIcons.js';
import { playSound } from '../sounds.js';

const $ = id => document.getElementById(id);
const numeric = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const percent = n => `${numeric.format(n * 100)}%`;
const workshopEffects = {
    startHp: ['Запас корпуса', n => `+${n} HP`],
    startDmg: ['Базовый урон', n => `+${percent(n - 1)}`],
    startGreed: ['Шанс выпадения чипа', n => `+${percent(n)}`],
    speed: ['Скорость хода', n => `+${percent(n)}`],
    shield: ['Заряды в начале забега', n => String(n)],
    magnet: ['Радиус сбора', n => `+${n} px`],
    crit: ['Шанс крита', n => `+${percent(n)}`],
    regen: ['Постоянный ремонт', n => `+${numeric.format(n)} HP/с`]
};
const hullTraits = {
    vanguard: p => [['Урон', `+${percent(p.dmgMultBonus)}`], ['Перезарядка бластера', `−${percent(p.fireRateBonus)}`], ['Откат рывка', `−${percent(p.dashCdBonus)}`], ['Скорость', `+${percent(p.speedBonus)}`]],
    mechanist: p => [['Доп. спутники', `+${p.extraOrbitals}`], ['Радиус сбора', `+${p.magnetBonus} px`], ['Урон по площади', `+${percent(p.splashDmgBonus)}`], ['Прочность', `+${p.maxHpBonus} HP`]],
    phantom: p => [['Скорость', `+${percent(p.speedBonus)}`], ['Шанс крита', `+${percent(p.critBonus)}`], ['Пробитие', `+${p.pierceBonus}`], ['Уклонение', `+${percent(p.dodgeBonus)}`]],
    colossus: p => [['Прочность', `+${p.maxHpBonus} HP`], ['Броня', `+${p.armorBonus}`], ['Сопротивление урону', `${percent(p.resistBonus)}`], ['Сила сейсмотолчка', `+${percent(p.pushBonus)}`]]
};
let inspectedPilot = 'vanguard';
let workshopFilter = 'all';
let buying = false;

export function workshopOffer(id) {
    const upgrade = UPGRADES[id];
    const level = Meta.data.upgrades[id] || 0;
    const price = Meta.getUpgradeCost(id);
    const [label, format] = workshopEffects[id];
    return {
        level, price, label, max: price === 'MAX', affordable: price !== 'MAX' && Meta.data.currency >= price,
        current: format(upgrade.getVal(level)), next: format(upgrade.getVal(Math.min(level + 1, upgrade.maxLvl)))
    };
}

export function updateHangar() {
    const pilot = PilotManager.getPilot(Meta.data?.selectedPilot);
    drawHangar($('hangar-art'), pilot);
    $('hangar-model').textContent = pilot.model;
    $('hangar-pilot').textContent = pilot.name;
}

export function openFleet() {
    inspectedPilot = PilotManager.getPilot(Meta.data.selectedPilot).id;
    $('pilot-feedback').textContent = '';
    renderFleet();
}

function previewPilot(id, keyboard = false) {
    inspectedPilot = id;
    $('pilot-feedback').textContent = '';
    renderPilotDetail();
    for (const card of $('chassis-container').querySelectorAll('button')) {
        card.setAttribute('aria-pressed', String(card.dataset.id === id));
        if (keyboard && card.dataset.id === id) card.focus();
    }
}

function renderFleet() {
    const fleet = $('chassis-container');
    fleet.replaceChildren();
    $('chassis-currency').textContent = numeric.format(Meta.data.currency);
    const pilots = Object.values(PILOTS);
    for (const [i, pilot] of pilots.entries()) {
        const equipped = Meta.data.selectedPilot === pilot.id;
        const owned = Meta.data.unlockedPilots.includes(pilot.id);
        const card = document.createElement('button');
        card.className = 'fleet-card';
        card.dataset.id = pilot.id;
        card.style.setProperty('--ship-color', pilot.color);
        card.setAttribute('aria-pressed', String(inspectedPilot === pilot.id));
        card.innerHTML = `<canvas width="160" height="98" aria-hidden="true"></canvas><span><strong>${pilot.name}</strong><small>${equipped ? 'В строю' : owned ? 'Доступен' : `◇ ${numeric.format(pilot.unlockCost)}`}</small></span>`;
        const ctx = card.querySelector('canvas').getContext('2d');
        drawHull(ctx, pilot.id, pilot.color, 80, 50, 36, -.45);
        card.onclick = () => previewPilot(pilot.id);
        card.onkeydown = event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            let next = i;
            if (event.key === 'Home') next = 0;
            if (event.key === 'End') next = pilots.length - 1;
            if (event.key === 'ArrowLeft') next = (i + pilots.length - 1) % pilots.length;
            if (event.key === 'ArrowRight') next = (i + 1) % pilots.length;
            previewPilot(pilots[next].id, true);
        };
        fleet.appendChild(card);
    }
    renderPilotDetail();
}

function renderPilotDetail() {
    const pilot = PILOTS[inspectedPilot];
    const current = Meta.data.selectedPilot === pilot.id;
    const owned = Meta.data.unlockedPilots.includes(pilot.id);
    const shortfall = Math.max(0, pilot.unlockCost - Meta.data.currency);
    const detail = $('pilot-detail');
    const actionLabel = current ? 'Корпус выбран' : owned ? 'Выбрать корпус' : `Открыть и выбрать · ${numeric.format(pilot.unlockCost)} ◇`;
    detail.style.setProperty('--ship-color', pilot.color);
    detail.innerHTML = `<div class="blueprint"><div class="blueprint-label">${pilot.model}</div><canvas width="700" height="420" aria-label="Чертёж корпуса ${pilot.name}"></canvas></div>
        <div class="pilot-spec"><h3>${pilot.name}</h3><p class="pilot-role">${pilot.subtitle}</p>
        <dl class="spec-grid">${hullTraits[pilot.id](pilot.stats).map(([label,value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
        <div class="pilot-kit"><div class="starter-icon"></div><div><small>Стартовое оружие</small><strong>${SKILL_DB[pilot.starterSkill].name}</strong></div></div>
        <div class="pilot-ult"><kbd>E</kbd><div><strong>${pilot.ultName}</strong><span>Откат ${numeric.format(pilot.ultCd / 60)} с</span><p>${pilot.ultDesc}</p></div></div>
        <button class="btn btn--primary pilot-action" ${current || (!owned && shortfall) ? 'disabled' : ''}>${actionLabel}</button>
        ${!owned && shortfall ? `<small class="purchase-note">До открытия не хватает ${numeric.format(shortfall)} ◇</small>` : ''}</div>`;
    drawHangar(detail.querySelector('canvas'), pilot);
    detail.querySelector('.starter-icon').appendChild(makeModuleIcon(pilot.starterSkill, 38));
    const btn = detail.querySelector('.pilot-action');
    btn.onclick = async () => {
        if (btn.disabled || buying) return;
        buying = true;
        btn.disabled = true;
        try {
            const changed = owned ? Meta.selectPilot(pilot.id) : await Meta.unlockPilot(pilot.id, pilot.unlockCost);
            if (changed) {
                playSound('powerUp');
                updateHangar();
                $('pilot-feedback').textContent = `На следующий забег выбран ${pilot.name}.`;
            }
            if (!$('chassis-screen').classList.contains('hidden')) {
                renderFleet();
                $('chassis-container').querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});
            }
        } finally { buying = false; }
    };
}

export function openWorkshop() {
    workshopFilter = 'all';
    $('shop-feedback').textContent = '';
    for (const button of $('workshop-filters').querySelectorAll('button')) {
        button.onclick = () => {
            workshopFilter = button.dataset.shopFilter;
            $('shop-feedback').textContent = '';
            renderWorkshop();
        };
    }
    renderWorkshop();
}

function renderWorkshop() {
    $('meta-currency').textContent = numeric.format(Meta.data.currency);
    const list = $('shop-container');
    list.replaceChildren();
    for (const button of $('workshop-filters').querySelectorAll('button')) {
        button.setAttribute('aria-pressed', String(workshopFilter === button.dataset.shopFilter));
    }
    for (const upg of Object.values(UPGRADES)) {
        const offer = workshopOffer(upg.id);
        if (workshopFilter === 'affordable' && !offer.affordable || workshopFilter === 'max' && !offer.max) continue;
        const card = document.createElement('article');
        card.className = 'workshop-item';
        card.innerHTML = `<div class="work-icon"></div><div class="work-spec"><div class="work-heading"><h3>${upg.name}</h3><small>Ур. ${offer.level}/${upg.maxLvl}</small></div>
            <p>${offer.label}</p><div class="work-delta"><span>${offer.current}</span>${offer.max ? '' : ` <i aria-hidden="true">→</i> <b>${offer.next}</b>`}</div>
            <div class="tier-track" aria-hidden="true">${Array.from({length:upg.maxLvl}, (_,i) => `<i${i < offer.level ? ' class="filled"' : ''}></i>`).join('')}</div></div>
            <div class="work-action"><button class="station-buy" ${offer.affordable ? '' : 'disabled'}>${offer.max ? 'Максимум' : `◇ ${numeric.format(offer.price)}`}</button><small>${offer.max ? 'Установлено' : offer.affordable ? 'Улучшить' : `Не хватает ${numeric.format(offer.price - Meta.data.currency)} ◇`}</small></div>`;
        card.querySelector('.work-icon').appendChild(makeModuleIcon(`meta:${upg.id}`, 47));
        const btn = card.querySelector('button');
        btn.dataset.upgrade = upg.id;
        btn.setAttribute('aria-label', offer.max ? `${upg.name} — максимальный уровень` : `Улучшить ${upg.name} за ${offer.price} чипов`);
        btn.onclick = async () => {
            if (buying || btn.disabled) return;
            buying = true;
            btn.disabled = true;
            try {
                const bought = await Meta.buyUpgrade(upg.id);
                if (bought) {
                    playSound('powerUp');
                    $('shop-feedback').textContent = `${upg.name} · уровень ${Meta.data.upgrades[upg.id]}. Списано ${offer.price} чипов.`;
                }
                if (!$('shop-screen').classList.contains('hidden')) {
                    renderWorkshop();
                    const next = list.querySelector(`[data-upgrade="${upg.id}"]:enabled`) || list.querySelector('button:enabled') || $('workshop-filters').querySelector('[aria-pressed="true"]');
                    next?.focus({preventScroll:true});
                }
            } finally { buying = false; }
        };
        list.appendChild(card);
    }
    if (!list.children.length) {
        const empty = document.createElement('p');
        empty.className = 'station-empty';
        empty.textContent = workshopFilter === 'max' ? 'Пока ни одно улучшение не достигло максимума.' : 'Пока нет доступных покупок. Чипы можно собрать в забеге.';
        list.appendChild(empty);
    }
}
