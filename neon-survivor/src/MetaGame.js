export const UPGRADES = {
    startHp: { 
        id: 'startHp', 
        name: 'Живучесть', 
        desc: '+10 Макс. HP на старте', 
        baseCost: 100, 
        costMult: 1.5, 
        maxLvl: 10,
        getVal: (lvl) => lvl * 10 
    },
    startDmg: { 
        id: 'startDmg', 
        name: 'Убойная сила', 
        desc: '+10% к базовому урону', 
        baseCost: 150, 
        costMult: 1.6, 
        maxLvl: 5,
        getVal: (lvl) => 1 + (lvl * 0.1) 
    },
    startGreed: {
        id: 'startGreed',
        name: 'Жадность',
        desc: '+10% Шанс выпадения чипов',
        baseCost: 200,
        costMult: 1.8,
        maxLvl: 5,
        getVal: (lvl) => lvl * 0.1
    }
};

const defaultData = {
    currency: 0,
    upgrades: {
        startHp: 0,
        startDmg: 0,
        startGreed: 0
    }
};

export const Meta = {
    data: null,

    load() {
        const stored = localStorage.getItem('neon_survivor_save');
        if (stored) {
            this.data = JSON.parse(stored);
            this.data = { ...defaultData, ...this.data, upgrades: { ...defaultData.upgrades, ...this.data.upgrades } };
        } else {
            this.data = JSON.parse(JSON.stringify(defaultData));
        }
    },

    save() {
        localStorage.setItem('neon_survivor_save', JSON.stringify(this.data));
    },

    addCurrency(amount) {
        this.data.currency += amount;
        this.save();
        this.updateUI();
    },

    buyUpgrade(id) {
        const upg = UPGRADES[id];
        const currentLvl = this.data.upgrades[id];
        
        if (currentLvl >= upg.maxLvl) return false;

        const cost = Math.floor(upg.baseCost * Math.pow(upg.costMult, currentLvl));
        
        if (this.data.currency >= cost) {
            this.data.currency -= cost;
            this.data.upgrades[id]++;
            this.save();
            this.updateUI();
            return true;
        }
        return false;
    },

    getUpgradeValue(id) {
        if (!this.data) this.load();
        return UPGRADES[id].getVal(this.data.upgrades[id]);
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
    }
};