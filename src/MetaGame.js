import { applyAudioSettings } from './sounds.js';

export const UPGRADES = {
    startHp: {
        id: 'startHp',
        name: 'Живучесть',
        desc: '+10 макс. HP на старте',
        baseCost: 50,
        costMult: 1.2,
        maxLvl: 10,
        getVal: (lvl) => lvl * 10
    },
    startDmg: {
        id: 'startDmg',
        name: 'Убойная сила',
        desc: '+7% к базовому урону',
        baseCost: 100,
        costMult: 1.25,
        maxLvl: 5,
        getVal: (lvl) => 1 + (lvl * 0.07)
    },
    startGreed: {
        id: 'startGreed',
        name: 'Жадность',
        desc: '+5% Шанс чипов с врагов',
        baseCost: 100,
        costMult: 1.3,
        maxLvl: 10,
        getVal: (lvl) => lvl * 0.05
    },
    speed: {
        id: 'speed',
        name: 'Сервоприводы',
        desc: '+4% к скорости движения',
        baseCost: 75,
        costMult: 1.25,
        maxLvl: 5,
        getVal: (lvl) => lvl * 0.04
    },
    shield: {
        id: 'shield',
        name: 'Стартовый щит',
        desc: '+1 поглощаемый удар',
        baseCost: 150,
        costMult: 1.4,
        maxLvl: 3,
        getVal: (lvl) => lvl
    },
    magnet: {
        id: 'magnet',
        name: 'Магнитный шпиль',
        desc: '+30 px к радиусу притяжения',
        baseCost: 60,
        costMult: 1.2,
        maxLvl: 5,
        getVal: (lvl) => lvl * 30
    },
    crit: {
        id: 'crit',
        name: 'Крит-чипсет',
        desc: '+3% шанс критического урона',
        baseCost: 120,
        costMult: 1.3,
        maxLvl: 5,
        getVal: (lvl) => lvl * 0.03
    },
    regen: {
        id: 'regen',
        name: 'Нано-ремонт',
        desc: '+0,3 HP в секунду',
        baseCost: 140,
        costMult: 1.35,
        maxLvl: 5,
        getVal: (lvl) => lvl * 0.3
    }
};

const defaultData = {
    currency: 0,
    selectedPilot: 'vanguard',
    unlockedPilots: ['vanguard'],

    autoAim: false,
    upgrades: {
        startHp: 0,
        startDmg: 0,
        startGreed: 0,
        speed: 0,
        shield: 0,
        magnet: 0,
        crit: 0,
        regen: 0
    },

    audio: {
        master: 0.7,
        sfx: 0.7,
        music: 0.6,
        ui: 0.8,
        muted: false
    },

    discordId: null,
    discordName: null,
    discordAvatar: null,

    stats: {
        runsPlayed: 0,
        totalKills: 0,
        titansKilled: 0,
        totalChips: 0,
        totalPlaytime: 0,
        bestTime: 0,
        bestScore: 0,
        maxLevel: 0,
        enemyKills: {}
    },

    discoveredSkills: [],
    favoriteSkillCounts: {},

    runLogs: [],

    achievements: {
        pacifist: false,
        tank: false,
        untouchable: false
    }
};

function mergeDefaults(parsed) {
    return {
        ...defaultData,
        ...parsed,
        selectedPilot: parsed.selectedPilot || defaultData.selectedPilot,
        unlockedPilots: Array.isArray(parsed.unlockedPilots) && parsed.unlockedPilots.length > 0 ? parsed.unlockedPilots : defaultData.unlockedPilots,
        upgrades: { ...defaultData.upgrades, ...(parsed.upgrades || {}) },
        stats: {
            ...defaultData.stats,
            ...(parsed.stats || {}),
            enemyKills: { ...((parsed.stats && parsed.stats.enemyKills) || {}) }
        },
        discoveredSkills: parsed.discoveredSkills || [],
        favoriteSkillCounts: parsed.favoriteSkillCounts || {},
        runLogs: parsed.runLogs || [],
        achievements: { ...defaultData.achievements, ...(parsed.achievements || {}) },
        audio: { ...defaultData.audio, ...(parsed.audio || {}) }
    };
}

export const Meta = {
    data: null,

    async load() {
        try {
            const stored = localStorage.getItem('neon_survivor_save');
            if (stored) {
                const parsed = JSON.parse(stored);
                this.data = mergeDefaults(parsed);
            } else {
                this.data = JSON.parse(JSON.stringify(defaultData));
            }
        } catch (err) {
            console.error('Сохранение повреждено, сброс до значений по умолчанию:', err);
            this.data = JSON.parse(JSON.stringify(defaultData));
        }
        applyAudioSettings(this.data.audio);
    },

    async save() {
        try {
            localStorage.setItem('neon_survivor_save', JSON.stringify(this.data));
        } catch (err) {
            console.error('Не удалось сохранить прогресс:', err);
        }
    },

    async addCurrency(amount) {
        this.data.currency += amount;
        await this.save();
        this.updateUI();
    },

    setAutoAim(enabled) {
        this.data.autoAim = !!enabled;
        this.save();
    },

    setAudioSetting(key, val) {
        if (!this.data) return;
        if (!this.data.audio) this.data.audio = { ...defaultData.audio };
        this.data.audio[key] = val;
        applyAudioSettings(this.data.audio);
        this.save();
    },

    selectPilot(pilotId) {
        if (!this.data) return false;
        if (!this.data.unlockedPilots.includes(pilotId)) return false;
        this.data.selectedPilot = pilotId;
        this.save();
        return true;
    },

    async unlockPilot(pilotId, cost = 0) {
        if (!this.data) return false;
        if (this.data.unlockedPilots.includes(pilotId)) return true;
        if (this.data.currency >= cost) {
            this.data.currency -= cost;
            this.data.unlockedPilots.push(pilotId);
            this.data.selectedPilot = pilotId;
            await this.save();
            this.updateUI();
            return true;
        }
        return false;
    },

    async buyUpgrade(id) {
        const upg = UPGRADES[id];
        const currentLvl = this.data.upgrades[id];

        if (currentLvl >= upg.maxLvl) return false;

        const cost = Math.floor(upg.baseCost * Math.pow(upg.costMult, currentLvl));

        if (this.data.currency >= cost) {
            this.data.currency -= cost;
            this.data.upgrades[id]++;
            await this.save();
            this.updateUI();
            return true;
        }
        return false;
    },

    getUpgradeValue(id) {
        if (!UPGRADES[id]) return 0;
        if (!this.data) return UPGRADES[id].getVal(0);
        return UPGRADES[id].getVal(this.data.upgrades[id] || 0);
    },

    getUpgradeCost(id) {
        const upg = UPGRADES[id];
        const currentLvl = this.data.upgrades[id];
        if (currentLvl >= upg.maxLvl) return 'MAX';
        return Math.floor(upg.baseCost * Math.pow(upg.costMult, currentLvl));
    },

    updateUI() {
        const el = document.getElementById('meta-currency');
        if (el) el.innerText = Math.floor(this.data.currency);
    },

    recordSkillDiscovered(id) {
        if (!this.data.discoveredSkills.includes(id)) {
            this.data.discoveredSkills.push(id);
            this.save();
        }
    },

    recordSkillMaxed(id) {
        this.data.favoriteSkillCounts[id] = (this.data.favoriteSkillCounts[id] || 0) + 1;
        this.save();
    },

    getFavoriteSkill() {
        const counts = this.data.favoriteSkillCounts;
        let best = null, bestCount = 0;
        for (const key in counts) {
            if (counts[key] > bestCount) {
                best = key;
                bestCount = counts[key];
            }
        }
        return best;
    },

    getBestiaryDamageBonus(type) {
        if (!this.data) return 1;
        const kills = this.data.stats.enemyKills[type] || 0;
        return kills >= 1000 ? 1.02 : 1;
    },

    recordRunEnd({ duration, kills, level, score, chipsEarned, cause, enemyKills }) {
        const s = this.data.stats;
        s.runsPlayed++;
        s.totalKills += kills;
        s.titansKilled += (enemyKills.titan || 0);
        s.totalChips += chipsEarned;
        s.totalPlaytime += duration;
        s.bestTime = Math.max(s.bestTime, duration);
        s.bestScore = Math.max(s.bestScore, score);
        s.maxLevel = Math.max(s.maxLevel, level);

        for (const type in enemyKills) {
            s.enemyKills[type] = (s.enemyKills[type] || 0) + enemyKills[type];
        }

        this.data.runLogs.unshift({ date: Date.now(), duration, kills, level, cause });
        this.data.runLogs = this.data.runLogs.slice(0, 10);

        this.save();
    },

    unlockAchievement(id, reward = 0) {
        if (!this.data || this.data.achievements[id]) return false;
        this.data.achievements[id] = true;
        this.data.currency += reward;
        this.save();
        this.updateUI();
        return true;
    }
};
