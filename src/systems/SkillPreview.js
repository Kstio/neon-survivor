import { SKILL_DB, WEAPON_INTERVALS } from '../constants.js';
import { Player } from '../entities/Player.js';
import { Mine, MAX_ACTIVE_MINES } from '../entities/Items.js';
import { WeaponSystem } from './WeaponSystem.js';

const numbers = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const recipes = Object.entries(SKILL_DB)
    .filter(([, def]) => def.evolveTo && def.require)
    .map(([baseId, def]) => Object.freeze({ baseId, passiveId: def.require, evoId: def.evolveTo }));

export function skillRecipes(id) {
    return recipes.filter(r => r.baseId === id || r.passiveId === id || r.evoId === id);
}

function projectedPlayer(player, id, level) {
    const skills = { ...player?.skills, [id]: level };
    const recipe = recipes.find(r => r.baseId === id || r.evoId === id);
    if (recipe) skills[id === recipe.evoId ? recipe.baseId : recipe.evoId] = 0;

    if (player) {
        const draft = Object.assign(Object.create(Object.getPrototypeOf(player)), player, {
            skills,
            stats: { ...player.stats }
        });
        draft.recalcStats();
        return draft;
    }

    return {
        skills, stats: {}, lvl: 1, dmg: 40, bulletSpeed: 14,
        maxHp: Math.floor(100 * (1 + (skills.hp || 0) * 0.2)),
        getSkillLvl(key) { return skills[key] || 0; }
    };
}

function fact(label, value, unit = '', priority = 0) {
    return { label, value, unit, priority };
}

function display(value, unit = '') {
    return typeof value === 'number' ? numbers.format(value) + unit : value;
}

function passiveFacts(id, level, p) {
    const s = p.stats;
    const mult = (label, value, priority = 0) => fact(label, value, '×', priority);
    const percent = (label, value, priority = 0) => fact(label, value * 100, '%', priority);
    switch (id) {
        case 'dmg':
            return [mult('Множитель урона', s.dmgMult ?? 1 + 0.25 * level, 3)];
        case 'spd': {
            const rate = s.fireRateMult ?? 1 - Math.min(0.6, level * 0.1);
            return [
                percent('Интервал бластера', rate, 3),
                percent('Интервал автооружия', WeaponSystem.getAutoCooldownMult(p), 3),
                fact('Спутники', 'Скорость вращения задаёт их собственный уровень')
            ];
        }
        case 'sniper':
            return [
                mult('Скорость пуль', s.bulletSpdMult ?? 1 + level * 0.18, 3),
                fact('Пробиваний', s.pierce ?? Math.ceil(level / 2), '', 3),
                fact('Отскоков от стен', s.ricochet ?? Math.floor(level / 2), '', 3),
                fact('Пробивание', 'Пули бластера и турели, ледяные осколки и наниты'),
                fact('Рикошет', 'Пули бластера и задней турели')
            ];
        case 'crit':
            return [
                percent('Базовый шанс крита', s.critChance ?? level * 0.1, 3),
                mult('Критический урон', 2),
                fact('Овердрайв', 'Временно гарантирует крит оружия')
            ];
        case 'hp':
            return [fact('Макс. здоровье', p.maxHp, ' HP', 3)];
        case 'regen': {
            const regen = s.regen ?? level * 2;
            const healing = p.getRegenPerSec ? p.getRegenPerSec()
                : Player.prototype.getRegenPerSec.call({ maxHp: p.maxHp, stats: { regen }, getSkillLvl: () => level });
            return [
                fact('Ремонт', healing, ' HP/с', 3),
                fact('Плоское лечение', regen, ' HP/с'),
                percent('Доля макс. HP в секунду', s.regenPct ?? level * 0.0025)
            ];
        }
        case 'shield':
            return [
                fact('Запас зарядов', Player.prototype.getShieldMaxCharges(level), '', 4),
                fact('Время на заряд', Player.prototype.getShieldCooldownTicks(level) / 60, ' с', 3),
                fact('Радиус взрыва', level ? 160 + level * 20 : 0, ' px', 2),
                fact('Урон в центре', level ? 80 + level * 30 : 0),
                fact('При получении', 'На уровнях 1 и 5 сразу доступен ещё один заряд')
            ];
        case 'armor':
            return [
                fact('Броня', s.armor ?? level * 3, '', 3),
                percent('Сопротивление', s.resist ?? Math.min(0.6, level * 0.03), 3)
            ];
        case 'dodge': {
            const chance = s.dodge ?? level * 0.08;
            const facts = [percent('Постоянный шанс', chance, 4), percent('Предел уклонения', 0.5)];
            if (p.getEarlyDodgeBonus?.() > 0) facts.push(percent('Со стартовой защитой', p.getEffectiveDodge(), 3));
            return facts;
        }
        case 'speed':
            return [fact('Скорость движения', (p.speed ?? 5 * (1 + level * 0.1)) * 60, ' px/с', 3)];
        case 'vamp':
            return [
                percent('Шанс при убийстве', s.vampChance ?? level * 0.12, 3),
                fact('Лечение', Player.prototype.getVampHealAmount.call(p), ' HP', 3),
                fact('Между лечениями', 0.4, ' с')
            ];
        case 'mag':
            return [fact('Радиус сбора', s.magnet ?? 150 + level * 50, ' px', 3)];
        case 'exp':
            return [mult('Множитель опыта', s.expMult ?? 1 + level * 0.2, 3)];
        default:
            return [];
    }
}

function weaponFacts(id, p) {
    const evo = SKILL_DB[id].type === 'evo';
    const base = evo ? recipes.find(r => r.evoId === id).baseId : id;
    const level = evo ? SKILL_DB[base].max : p.getSkillLvl(id);
    const effective = level + Number(evo);
    const stats = p.stats;
    const damageMult = stats.dmgMult ?? 1;
    const splash = 1 + (stats.splashDmgBonus || 0);
    const rate = (stats.fireRateMult ?? 1) * (p.overdriveTimer > 0 ? 1 / 1.5 : 1);
    const bulletSpeed = p.bulletSpeed * (stats.bulletSpdMult ?? 1);
    const damage = (value, label = 'Урон без крита', priority = 3) => fact(label, value * damageMult, '', priority);
    const interval = (ticks, multiplier = WeaponSystem.getAutoCooldownMult(p)) => fact('Интервал', ticks * multiplier / 60, ' с', 2);
    const radius = (value, label = 'Радиус', priority = 1) => fact(label, value, ' px', priority);
    const time = () => WEAPON_INTERVALS[base](effective);

    switch (base) {
        case 'multi':
        case 'fatboy': {
            const heavy = p.getSkillLvl('fatboy');
            const gatling = p.getSkillLvl('gatling') > 0;
            const penalty = gatling ? 0.5 : Math.max(0.45, 1 - p.getSkillLvl('multi') * 0.12);
            if (id === 'blackhole') return [
                damage(p.dmg * penalty, 'Урон одной пули', 4),
                damage(4 * p.dmg, 'Урон ядра'),
                radius(150, 'Радиус стяжки', 3),
                fact('Интервал воронок', 50 * rate / 60, ' с', 2),
                radius(WeaponSystem.getBlackholeCenterTravel(p), 'Путь центра воронки'),
                radius(60, 'Макс. радиус ядра'),
                fact('Попаданий по цели', 'Одно каждой воронкой')
            ];
            const facts = [
                fact('Пуль в залпе', gatling ? 1 : 1 + p.getSkillLvl('multi'), '', 4),
                damage(p.dmg * penalty * (1 + 0.15 * heavy), 'Урон одной пули', 4),
                interval(gatling ? 4.5 : 28, rate),
                fact('Скорость пули', bulletSpeed * (gatling ? 1.5 : 1) * 60, ' px/с')
            ];
            if (id === 'fatboy') {
                facts.push(radius(heavy ? 8 + 2 * heavy : 4, 'Радиус пули без крита', 3));
                facts.push(fact('Отброс', 'Ослабевает после 260 px и сходит к нулю на 460 px'));
            }
            return facts;
        }
        case 'rear':
            return [
                fact('Пуль в залпе', evo ? 5 : level, '', 4),
                damage(p.dmg * 1.6, 'Урон одной пули'),
                interval(26, rate),
                radius(evo ? 10 : 4, 'Радиус пули без крита', evo ? 4 : 0),
                fact('Отброс', evo ? 'Ослабевает от 260 до 460 px' : 'Действует на всей траектории', '', evo ? 2 : 0),
                fact('При остановке', 'Если цели и прицела нет, турель помнит последнее направление движения')
            ];
        case 'katana':
            return [
                damage(evo ? 340 : 125 + level * 32),
                fact('Дуг за взмах', evo ? 3 : level >= 3 ? 2 : 1, '', 4),
                radius(40 + (evo ? 80 : 52 + 4 * level), 'До края взмаха', 3),
                interval(evo ? 22 : time()),
                fact('Попаданий', 'Одно на цель за взмах')
            ];
        case 'boomerang': {
            const facts = [damage(evo ? 175 : 65 + level * 18), interval(time()), fact('Проходов через цель', 'До двух за бросок')];
            if (evo) facts.push(damage(175 * 0.45, 'Урон разряда', 4), radius(130, 'Дальность разряда'), fact('Целей разряда', 2, '', 4));
            return facts;
        }
        case 'plasma_shot': {
            const hit = evo ? 370 : 125 + level * 32;
            return [
                damage(hit, 'Прямой урон', 4),
                damage(hit * 0.7 * splash, 'Урон соседям', 3),
                radius(evo ? 200 : 120, 'Радиус взрыва', 3),
                interval(evo ? 44 : time()),
                fact('Пробивание и рикошет', 'Шар взрывается один раз при столкновении')
            ];
        }
        case 'cryo_beam': {
            const hit = evo ? 115 : 38 + level * 11;
            const facts = [
                fact('Осколков', evo ? 5 : Math.min(4, 2 + level), '', 4),
                damage(hit, 'Урон осколка'),
                interval(evo ? 24 : time()),
                fact('Длительность холода', 80 / 60, ' с')
            ];
            if (evo) facts.push(damage(hit * 0.6, 'Бонус раскола', 4));
            return facts;
        }
        case 'aura': {
            const { range, effTickRate } = WeaponSystem.getAuraParams(p);
            const pct = effective * 1.5;
            const cap = (30 + effective * 15) * damageMult;
            const facts = [
                radius(range, 'Радиус поля', 4),
                fact('Интервал', effTickRate / 60, ' с', 3),
                damage(16 + 7 * effective, 'Постоянная часть', 2),
                fact('Добавка от здоровья цели', display(pct * damageMult, '%') + ' макс. HP, до ' + display(cap))
            ];
            if (evo) facts.push(fact('Лечение за убийство', '3 HP при шансе 25%', '', 4), fact('Между лечениями', 0.2, ' с'));
            return facts;
        }
        case 'orbit':
            return [
                fact('Спутников', p.orbitals ?? (evo ? 5 : level), '', 4),
                damage(evo ? 125 : 45 + 14 * level),
                radius(WeaponSystem.getOrbitalRadius(p), 'Радиус орбиты', 3),
                fact('Повтор по одной цели', (evo ? 10 : 12) / 60, ' с', evo ? 4 : 1),
                fact('Время оборота', Math.PI * 2 / ((0.05 + level * 0.01 + (evo ? 0.05 : 0)) * 60), ' с')
            ];
        case 'mines': {
            const mine = new Mine(0, 0, effective, p.lvl, evo);
            const facts = [
                fact('Мин за установку', Math.min(6, 1 + effective), '', 4),
                damage(mine.dmg * splash, 'Урон мины'),
                radius(mine.range, 'Радиус взрыва'),
                interval(time()),
                radius(evo ? 320 : 120, 'Захват цели', evo ? 4 : 0),
                fact('Скорость мины', (evo ? 2.5 : 1.2) * 60, ' px/с'),
                fact('Лимит на карте', MAX_ACTIVE_MINES)
            ];
            if (mine.isCluster) facts.push(damage(mine.dmg * splash * 0.45, 'Урон каждой из трёх малых мин', level === 4 ? 4 : 0));
            return facts;
        }
        case 'laser':
            return [
                fact('Целей за залп', evo ? 2 : Math.min(5, 1 + level), '', 4),
                damage(70 + p.lvl * 8 + effective * 15),
                interval(evo ? 14 : time()),
                radius(760, 'Захват цели'),
                ...(evo ? [fact('Линия огня', 'Поражает всех на траектории до стены')] : [])
            ];
        case 'tesla':
            return [
                fact('Целей за разряд', 2 + level, '', 4),
                damage(50 + level * 22),
                interval(time()),
                radius(440, 'Радиус разряда')
            ];
        case 'nanite_swarm': {
            const facts = [
                fact('Нанитов за залп', Math.min(5, 2 + level), '', 4),
                damage(35 + level * 12 + (evo ? 25 : 0), 'Урон нанита'),
                interval(time()),
                radius(750, 'Захват от нанита'),
                fact('Сопротивление отбросу', '−8 п. п. за попадание, минимум −40%')
            ];
            if (evo) facts.push(fact('Лечение за убийство', 2, ' HP', 4), fact('Между лечениями', 0.2, ' с'));
            return facts;
        }
        default:
            return [];
    }
}

function rows(id, player, level) {
    const p = projectedPlayer(player, id, level);
    return SKILL_DB[id].type === 'passive' ? passiveFacts(id, level, p) : weaponFacts(id, p);
}

export function skillFacts(id, player = null, level = null) {
    const def = SKILL_DB[id];
    if (!def) return [];
    const requested = level ?? (player?.getSkillLvl(id) || 1);
    const rank = Math.max(1, Math.min(def.max, Math.trunc(requested) || 1));
    return rows(id, player, rank).map(({ label, value, unit }) => ({ label, value: display(value, unit) }));
}

export function skillPreview(player, id) {
    const def = SKILL_DB[id];
    if (!def || !player) return '';
    const level = player.getSkillLvl(id);
    if (level >= def.max) return 'Максимальный уровень';
    if (def.evolveTo && player.getSkillLvl(def.evolveTo)) return 'Уже заменено эволюцией';

    if (id === 'shield' && level === 0) {
        const cd = player.getShieldCooldownTicks(1) / 60;
        return 'Первый заряд готов сразу · Время на заряд ' + display(cd, ' с');
    }

    let previous = [];
    if (def.type === 'evo') {
        const recipe = recipes.find(r => r.evoId === id);
        previous = rows(recipe.baseId, player, SKILL_DB[recipe.baseId].max);
    } else if (level || def.type === 'passive' || id === 'multi' || id === 'fatboy') {
        previous = rows(id, player, level);
    }

    const earlier = new Map(previous.map(item => [item.label, item]));
    const next = rows(id, player, level + 1);
    return next.filter(item => item.priority && earlier.get(item.label)?.value !== item.value)
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 3)
        .map(({ label, value, unit }) => {
            const old = earlier.get(label);
            const current = old && typeof value === 'number' ? display(old.value) + ' → ' : '';
            return label + ' ' + current + display(value, unit);
        }).join(' · ');
}
