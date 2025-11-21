export const WORLD_SIZE = 4000;

export const SCREEN_W = () => window.innerWidth;
export const SCREEN_H = () => window.innerHeight;

export const SKILL_DB = {
    multi: { name: "Мульти-выстрел", desc: "+1 Пуля к залпу", max: 5, type: "weapon", evolveAt: 3, evoDesc: "Плазменный веер" },
    rear: { name: "Задняя турель", desc: "+1 Пуля назад", max: 5, type: "weapon", evolveAt: 3, evoDesc: "Широкий калибр" },
    aura: { name: "Электро-Аура", desc: "Частота ударов выше", max: 5, type: "active", evolveAt: 3, evoDesc: "Штормовое поле" },
    orbit: { name: "Дроны-Защитники", desc: "+1 Спутник", max: 5, type: "active", evolveAt: 3, evoDesc: "Лазерная связь" },
    thorns: { name: "Шипы", desc: "Возврат урона", max: 5, type: "passive", evolveAt: 3, evoDesc: "Энерго-щит" },
    boom: { name: "Взрыв трупов", desc: "Радиус и Урон взрыва", max: 5, type: "passive", evolveAt: 3, evoDesc: "Цепная реакция" },
    mines: { name: "Миноукладчик", desc: "+1 Мина в кассете", max: 5, type: "active", evolveAt: 3, evoDesc: "Кластерные бомбы" },
    laser: { name: "Авто-Лазер", desc: "+1 Луч (Мульти-таргет)", max: 5, type: "active", evolveAt: 3, evoDesc: "Испепелитель" },
    freeze: { name: "Крио-модуль", desc: "Радиус замедления", max: 5, type: "active", evolveAt: 3, evoDesc: "Вечная мерзлота" },
    dmg: { name: "Усилитель Урона", desc: "Урон +20%", max: 10, type: "passive" },
    spd: { name: "Скорострельность", desc: "Задержка -15%", max: 10, type: "passive" },
    sniper: { name: "Снайпер", desc: "Скорость пуль +25%", max: 5, type: "passive" },
    crit: { name: "Крит. Модуль", desc: "Шанс крита +10%", max: 5, type: "passive", evolveAt: 3, evoDesc: "Смертельные удары" },
    hp: { name: "Нано-Броня", desc: "Макс HP +50", max: 10, type: "passive" },
    regen: { name: "Регенерация", desc: " +2 HP/сек", max: 5, type: "passive", evolveAt: 3, evoDesc: "Быстрое восстановление" },
    shield: { name: "Энерго-Щит", desc: "Блок + Взрыв щита", max: 5, type: "passive", evolveAt: 3, evoDesc: "Быстрая зарядка" },
    armor: { name: "Броня", desc: "Урон по вам -2", max: 5, type: "passive" },
    dodge: { name: "Уклонение", desc: "Уворот +10%", max: 5, type: "passive" },
    speed: { name: "Приводы", desc: "Скорость +10%", max: 5, type: "passive" },
    vamp: { name: "Вампиризм", desc: "5% шанс лечить 5 HP", max: 5, type: "passive" },
    mag: { name: "Магнит", desc: "Радиус сбора +40%", max: 5, type: "passive" },
    exp: { name: "Нейро-Линк", desc: "Опыт +20%", max: 5, type: "passive" }
};