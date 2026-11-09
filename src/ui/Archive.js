import { SKILL_DB, BESTIARY_DB } from '../constants.js';
import { Meta } from '../MetaGame.js';
import { makeModuleIcon } from '../systems/ModuleIcons.js';
import { drawHostile } from '../systems/HullRenderer.js';
import { skillFacts, skillRecipes } from '../systems/SkillPreview.js';

const groupNames = { weapon: 'Оружие', passive: 'Пассивка', evo: 'Эволюция', enemy: 'Противник' };
const $ = id => document.getElementById(id);
const normalize = str => str.toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[-_]/g,' ').trim();
const records = [
    ...Object.entries(SKILL_DB).map(([id, def]) => ({ id, def, group: ['passive','evo'].includes(def.type) ? def.type : 'weapon' })),
    ...Object.entries(BESTIARY_DB).map(([id, def]) => ({ id, def, group: 'enemy' }))
];
let group = 'weapon';
let selected = '';
let query = '';
let rank = 1;

export function archiveResults(category, search = '') {
    const key = normalize(search);
    if (!key) return records.filter(r => r.group === category);
    const words = key.split(/\s+/);
    return records.filter(r => {
        const text = normalize([r.def.name, r.id, groupNames[r.group], r.def.model || ''].join(' '));
        return words.every(word => text.includes(word));
    });
}

function archiveIcon(record, size) {
    if (record.group !== 'enemy') return makeModuleIcon(record.id, size);
    const canvas = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = canvas.height = Math.round(size * dpr);
    canvas.className = 'module-icon';
    canvas.style.width = canvas.style.height = size+'px';
    canvas.setAttribute('aria-hidden','true');
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width/2, canvas.height/2);
    drawHostile(ctx, {type:record.id, size:canvas.width*.37}, -.35, '#f1aa83');
    return canvas;
}

export function openArchive(firstId) {
    query = '';
    const record = records.find(entry => entry.id === firstId);
    group = record?.group || 'weapon';
    selected = record?.id || '';
    rank = 1;
    const field = $('archive-query');
    field.value = '';
    field.oninput = () => {
        query = field.value;
        rank = 1;
        renderIndex();
    };
    for (const button of $('archive-groups').querySelectorAll('button')) {
        button.onclick = () => {
            field.value = query = '';
            group = button.dataset.group;
            selected = '';
            rank = 1;
            $('archive-list').scrollTop = 0;
            renderIndex();
        };
    }
    $('archive-list').scrollTop = 0;
    renderIndex();
}

function chooseRecord(record, focusDetail = false) {
    selected = record.id;
    rank = 1;
    for (const button of $('archive-list').querySelectorAll('button')) {
        button.setAttribute('aria-pressed', String(button.dataset.id === selected));
    }
    renderDetail(record);
    if (focusDetail && window.matchMedia('(max-width: 690px)').matches) {
        $('archive-detail').scrollIntoView({block:'start'});
    }
}

function renderIndex() {
    const results = archiveResults(group, query);
    for (const button of $('archive-groups').querySelectorAll('button')) {
        button.setAttribute('aria-pressed', String(!query.trim() && button.dataset.group === group));
    }
    const current = results.find(r => r.id === selected) || results[0];
    selected = current?.id || '';
    const list = $('archive-list');
    list.replaceChildren();
    $('archive-count').textContent = query.trim() ? `Найдено по всей базе · ${results.length}` : `Записей · ${results.length}`;
    for (const r of results) {
        const btn = document.createElement('button');
        btn.dataset.id = r.id;
        btn.setAttribute('aria-pressed', String(r.id === selected));
        btn.appendChild(archiveIcon(r, 29));
        const title = document.createElement('span');
        title.textContent = r.def.name;
        btn.appendChild(title);
        btn.onclick = () => chooseRecord(r, true);
        list.appendChild(btn);
    }
    if (!current) {
        const container = $('archive-detail');
        container.innerHTML = '<div class="archive-empty"><h3>Совпадений нет</h3><p>Попробуй часть названия оружия, навыка или противника.</p><button class="station-link">Сбросить поиск</button></div>';
        container.querySelector('button').onclick = () => { openArchive(); $('archive-query').focus(); };
        return;
    }
    renderDetail(current);
}

function renderDetail(record) {
    const panel = $('archive-detail');
    const {def, group, id} = record;
    const isEnemy = group === 'enemy';
    const count = isEnemy ? Meta.data.stats.enemyKills[id] || 0 : 0;
    const status = isEnemy ? `Побед · ${count}` : Meta.data.discoveredSkills.includes(id) ? 'Получено в забеге' : 'Ещё не получено';
    panel.dataset.group = group;
    panel.innerHTML = `<div class="archive-summary"><div class="archive-medallion"></div><div><small>${groupNames[group]}</small><h3>${def.name}</h3><span class="record-status">${status}</span></div></div>`;
    panel.querySelector('.archive-medallion').appendChild(archiveIcon(record, 72));
    if (isEnemy) {
        const next = count < 10 ? 10 : count < 100 ? 100 : 1000;
        panel.insertAdjacentHTML('beforeend', `<div class="enemy-dossier"><h4>Изучение цели</h4><div class="dossier-progress"><span style="width:${Math.min(100, 100*count/next)}%"></span></div>
            <ul><li>${count >= 10 ? `Модель <strong>${def.model}</strong>` : '10 побед — идентификация модели'}</li><li>${count >= 100 ? def.lore : '100 побед — архивная запись'}</li><li>${count >= 1000 ? '<strong>Действует бонус +2% урона по этому типу.</strong>' : '1 000 побед — +2% урона по этому типу'}</li></ul></div>`);
        return;
    }
    panel.insertAdjacentHTML('beforeend', `<p class="record-description">${def.desc}</p>
        <div class="facts-heading"><h4>Базовые характеристики</h4>${def.max > 1 ? `<label>Уровень <select aria-label="Уровень навыка">${Array.from({length:def.max},(_,i) => `<option value="${i+1}"${i+1 === rank ? ' selected' : ''}>${i+1}</option>`).join('')}</select></label>` : ''}</div><dl class="record-facts"></dl>`);
    const facts = panel.querySelector('.record-facts');
    const displayFacts = () => {
        facts.innerHTML = skillFacts(id, null, rank).map(row => `<div><dt>${row.label}</dt><dd>${row.value}</dd></div>`).join('');
    };
    displayFacts();
    const select = panel.querySelector('select');
    if (select) select.onchange = () => {rank = Number(select.value); displayFacts();};
    const recipes = skillRecipes(id);
    if (!recipes.length) return;
    panel.insertAdjacentHTML('beforeend', `<div class="record-recipes"><h4>${recipes.length === 1 ? 'Рецепт эволюции' : 'Рецепты эволюций'}</h4></div>`);
    const box = panel.querySelector('.record-recipes');
    for (const r of recipes) {
        const row = document.createElement('div');
        row.className = 'recipe-row';
        for (const [index, key] of [r.baseId, r.passiveId, r.evoId].entries()) {
            if (index > 0) {
                const sep = document.createElement('span');
                sep.textContent = index === 1 ? '+' : '→';
                row.appendChild(sep);
            }
            const label = SKILL_DB[key].name + (index === 0 ? ` · ${SKILL_DB[key].max}` : index === 1 ? ' · 1' : '');
            const node = document.createElement(key === id ? 'strong' : 'button');
            node.textContent = label;
            if (key !== id) {
                node.onclick = () => {
                    openArchive(key);
                    const selectedButton = $('archive-list').querySelector('[aria-pressed="true"]');
                    if (selectedButton) $('archive-list').scrollTop += selectedButton.getBoundingClientRect().top - $('archive-list').getBoundingClientRect().top;
                    $('archive-detail').querySelector('h3').setAttribute('tabindex','-1');
                    $('archive-detail').querySelector('h3').focus({preventScroll:true});
                };
            }
            row.appendChild(node);
        }
        box.appendChild(row);
    }
}
