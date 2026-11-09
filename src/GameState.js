export const state = {
    player: null,
    enemies: [],
    bullets: [],
    enemyBullets: [],
    gems: [],
    chips: [],
    particles: [],
    texts: [],
    obstacles: [],
    obstacleGrid: null,
    enemySpatialGrid: null,
    barrelSpatialGrid: null,
    mines: [],

    airdropZones: [],
    activeLoot: null,
    nextCargoFrame: 0,
    nextTitanFrame: 300 * 60,

    crates: [],
    skillCrates: [],

    barrels: [],
    slowZones: [],
    acidPuddles: [],
    directorEvents: [],
    convoyDrones: [],
    eventAlert: { title: '', desc: '', timer: 0 },

    camera: { x: 0, y: 0, shakeIntensity: 0, shakeTimer: 0 },

    hitStop: 0,
    nextCriticalImpactFrame: 0,

    score: 0,
    sessionChips: 0,

    sessionKills: 0,
    sessionEnemyKills: {},
    sessionDamageTaken: 0,
    lastDamageSource: null,
    gameTime: 0,
    frameCount: 0,
    globalDifficulty: 1,
    isRunning: false,
    isPaused: false,

    director: {
        credits: 0,
        waveState: 'calm',
        stateTimer: 0,
        spawnRate: 60,
        nextSpawn: 0,
        assaultAngle: 0,
        assaultName: 'ВОСТОК',
        localPressure: 0,
        isHighPressurePaused: false,
        calmStage: 'dissipating',
        calmTimer: 0,
        quietTimer: 0,
        phaseTimer: 0,
        isSurroundEvent: false
    },

    xpTelemetry: createEmptyXpTelemetry()
};

export function createEmptyXpTelemetry() {
    return {
        pilotId: 'vanguard',
        pilotName: 'Штурмовик',
        starterSkill: 'multi',
        metaExpBonus: 0,
        expSkillTimeline: [],
        skillBoxSkillsCount: 0,
        skillBoxFallbackChipsCount: 0,
        levelUpFallbackChipsCount: 0,
        weaponSlotsFilledTimeSec: null,
        weaponSlotsFilledFrame: null,
        weaponSlotsFilledSource: null,
        passiveSlotsFilledTimeSec: null,
        passiveSlotsFilledFrame: null,
        passiveSlotsFilledSource: null,
        evolutionsTimeline: [],
        firstFallbackChipReward: null,
        totalBaseXp: 0,
        totalAwardedXp: 0,
        pickupCount: 0,
        sources: {
            enemy: { base: 0, awarded: 0, pickups: 0 },
            convoy: { base: 0, awarded: 0, pickups: 0 },
            titan: { base: 0, awarded: 0, pickups: 0 },
            other: { base: 0, awarded: 0, pickups: 0 }
        },
        titanKillsTimeline: [],
        titanPickups: [],
        lastPendingTitanEntry: null,
        checkpoints: [],
        snapshot5m: null
    };
}

export function recordFallbackChipReward(source = 'levelup', label = 'ЛИМИТ СБОРКИ') {
    if (!state.xpTelemetry) return;
    const tel = state.xpTelemetry;
    if (source === 'skillbox') {
        tel.skillBoxFallbackChipsCount++;
    } else {
        tel.levelUpFallbackChipsCount++;
    }
    if (!tel.firstFallbackChipReward) {
        tel.firstFallbackChipReward = {
            timeSec: state.gameTime,
            frameCount: state.frameCount,
            source,
            label,
            playerLvl: state.player ? state.player.lvl : 1
        };
    }
}

export function getXpThresholdForLevel(lvl) {
    if (lvl <= 1) return 50;
    const base = 100 + lvl * 50 + Math.pow(lvl, 1.5) * 10;
    const ramp = Math.max(0, Math.min(1, (lvl - 3) / 8));
    return Math.floor(base * (1 + 3 * ramp));
}

export function getCumulativeXpForLevel(targetLvl) {
    if (!Number.isFinite(targetLvl) || targetLvl <= 1) return 0;
    let sum = 0;
    for (let l = 1; l < targetLvl; l++) {
        sum += getXpThresholdForLevel(l);
    }
    return sum;
}

function formatTimeSec(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export function captureXpTelemetrySnapshot(label = formatTimeSec(state.gameTime)) {
    const p = state.player;
    const tel = state.xpTelemetry || createEmptyXpTelemetry();
    const lvl = p ? p.lvl : 1;
    const currentXp = p ? p.xp : 0;
    const nextXp = p ? p.nextXp : 50;
    const passedThresholdsSum = getCumulativeXpForLevel(lvl);
    const reconciledTotalXp = passedThresholdsSum + currentXp;
    const discrepancy = tel.totalAwardedXp - reconciledTotalXp;
    const titanAlive = state.enemies.some(e => e && e.type === 'titan' && !e.isDead);
    const slots = p ? p.getSlotCounts() : { weapon: 0, maxWeapon: 4, passive: 0, maxPassive: 4 };

    return {
        label,
        timeSec: state.gameTime,
        timeFormatted: formatTimeSec(state.gameTime),
        frameCount: state.frameCount,
        pilotId: p?.pilotId || tel.pilotId || 'vanguard',
        pilotName: tel.pilotName || (p?.pilotId || 'vanguard'),
        starterSkill: tel.starterSkill || 'multi',
        metaExpBonus: tel.metaExpBonus || 0,
        expSkillLvl: p ? p.getSkillLvl('exp') : 0,
        expMult: p?.stats?.expMult || 1,
        expSkillTimeline: tel.expSkillTimeline.map(item => ({ ...item })),
        lvl,
        currentXp,
        nextXp,
        kills: state.sessionKills || 0,
        enemyKillsByType: { ...(state.sessionEnemyKills || {}) },
        chips: state.sessionChips,
        totalBaseXp: tel.totalBaseXp,
        totalAwardedXp: tel.totalAwardedXp,
        sources: {
            enemy: { ...tel.sources.enemy },
            convoy: { ...tel.sources.convoy },
            titan: { ...tel.sources.titan },
            other: { ...tel.sources.other }
        },
        skillBoxSkillsCount: tel.skillBoxSkillsCount,
        skillBoxFallbackChipsCount: tel.skillBoxFallbackChipsCount,
        levelUpFallbackChipsCount: tel.levelUpFallbackChipsCount,
        weaponSlots: `${slots.weapon}/${slots.maxWeapon}`,
        passiveSlots: `${slots.passive}/${slots.maxPassive}`,
        weaponSlotsFilledTimeSec: tel.weaponSlotsFilledTimeSec,
        weaponSlotsFilledSource: tel.weaponSlotsFilledSource,
        passiveSlotsFilledTimeSec: tel.passiveSlotsFilledTimeSec,
        passiveSlotsFilledSource: tel.passiveSlotsFilledSource,
        evolutionsTimeline: tel.evolutionsTimeline.map(ev => ({ ...ev })),
        firstFallbackChipReward: tel.firstFallbackChipReward ? { ...tel.firstFallbackChipReward } : null,
        titanAlive,
        titanKillsUpToSnapshot: tel.titanKillsTimeline.map(tk => ({ ...tk })),
        titanPickupsUpToSnapshot: tel.titanPickups.map(tp => ({ ...tp })),
        passedThresholdsSum,
        reconciledTotalXp,
        discrepancy,
        skills: p ? { ...p.skills } : {},
        evolvedSkills: p && p.evolvedSkills ? Array.from(p.evolvedSkills) : []
    };
}

export function formatXpDiagnosticReport() {
    const tel = state.xpTelemetry || createEmptyXpTelemetry();
    const snap = tel.snapshot5m || captureXpTelemetrySnapshot(state.gameTime >= 300 ? '5:00+' : `ТЕКУЩИЙ (${formatTimeSec(state.gameTime)})`);
    const isLocked5m = Boolean(tel.snapshot5m);

    const expHistoryStr = snap.expSkillTimeline.length > 0
        ? snap.expSkillTimeline.map(e => `L${e.lvl} в ${formatTimeSec(e.timeSec)} (${e.source === 'skillbox' ? 'груз' : 'уровень'}, ×${Number(e.expMult).toFixed(1)})`).join(', ')
        : 'не брался (L0)';

    const fmtNum = (n) => Number.isFinite(n) ? (Math.abs(n - Math.round(n)) < 0.005 ? String(Math.round(n)) : n.toFixed(1)) : '0';
    const fmtSource = (src) => src === 'skillbox' ? 'Груз Академии' : (src === 'evo' ? 'Эволюция' : 'Повышение уровня');

    const wFilledStr = tel.weaponSlotsFilledTimeSec !== null
        ? `${formatTimeSec(tel.weaponSlotsFilledTimeSec)} (${fmtSource(tel.weaponSlotsFilledSource)})`
        : 'ещё не заполнены (4/4)';
    const pFilledStr = tel.passiveSlotsFilledTimeSec !== null
        ? `${formatTimeSec(tel.passiveSlotsFilledTimeSec)} (${fmtSource(tel.passiveSlotsFilledSource)})`
        : 'ещё не заполнены (4/4)';
    const evosStr = tel.evolutionsTimeline.length > 0
        ? tel.evolutionsTimeline.map(ev => `${ev.name} (${ev.id}) в ${formatTimeSec(ev.timeSec)} [Ур. ${ev.playerLvl}]`).join(', ')
        : 'нет';
    const firstFallbackStr = tel.firstFallbackChipReward
        ? `в ${formatTimeSec(tel.firstFallbackChipReward.timeSec)} (источник: ${fmtSource(tel.firstFallbackChipReward.source)}, Ур. ${tel.firstFallbackChipReward.playerLvl})`
        : 'не срабатывала';

    const lines = [
        `=== ДИАГНОСТИЧЕСКАЯ СВОДКА XP (${isLocked5m ? 'ЗАФИКСИРОВАНО НА 05:00' : `СРЕЗ НА ${snap.timeFormatted}`}) ===`,
        `1. Корпус и множители опыта:`,
        `   • Корпус: ${snap.pilotName} (${snap.pilotId})`,
        `   • Бонус Меты к опыту: +${fmtNum(snap.metaExpBonus * 100)}% (в Мете апгрейда XP нет, множитель Меты = ×1.00)`,
        `   • Навык exp (Нейро-Линк): L${snap.expSkillLvl} (множитель ×${Number(snap.expMult).toFixed(2)}) | Хронология: ${expHistoryStr}`,
        `2. Уровень и общий опыт на отметке ${snap.timeFormatted}:`,
        `   • Уровень HUD: ${snap.lvl} (повышений за XP: ${Math.max(0, snap.lvl - 1)})`,
        `   • Опыт внутри текущего уровня: ${fmtNum(snap.currentXp)} / ${snap.nextXp} XP`,
        `   • Убийств всего: ${snap.kills} | Первого Титана на ${snap.timeFormatted}: ${snap.titanAlive ? 'ЖИВ В БОЮ' : (snap.sources.titan.pickups > 0 ? 'УБИТ (кристалл подобран)' : (snap.titanKillsUpToSnapshot?.length > 0 ? 'УБИТ (кристалл ещё на земле)' : 'НЕТ НА АРЕНЕ / КРИСТАЛЛ НЕ ПОДОБРАН'))}`,
        `   • Всего начислено XP (после множителей): ${fmtNum(snap.totalAwardedXp)} XP (базовый подобранный XP: ${fmtNum(snap.totalBaseXp)} XP)`,
        `3. XP по источникам (подобранные кристаллы, базовый -> начисленный с expMult):`,
        `   • Обычные противники: база ${fmtNum(snap.sources.enemy.base)} XP -> начислено ${fmtNum(snap.sources.enemy.awarded)} XP (сборов: ${snap.sources.enemy.pickups})`,
        `   • Конвой (ConvoyDrone): база ${fmtNum(snap.sources.convoy.base)} XP -> начислено ${fmtNum(snap.sources.convoy.awarded)} XP (сборов: ${snap.sources.convoy.pickups})`,
        `   • Титан (Titan): база ${fmtNum(snap.sources.titan.base)} XP -> начислено ${fmtNum(snap.sources.titan.awarded)} XP (сборов: ${snap.sources.titan.pickups})`,
        `   • Прочее: база ${fmtNum(snap.sources.other.base)} XP -> начислено ${fmtNum(snap.sources.other.awarded)} XP (сборов: ${snap.sources.other.pickups})`,
        `4. Не-уровневые источники навыков и заполнение сборки (лимиты 4+4):`,
        `   • Стартовый навык корпуса: ${snap.starterSkill} L1 (1 уровень)`,
        `   • Бесплатных навыков из Грузов Академии (на 05:00 / всего): ${snap.skillBoxSkillsCount} / ${tel.skillBoxSkillsCount}`,
        `   • Заполнение слотов оружия (4/4): ${wFilledStr}`,
        `   • Заполнение слотов пассивок (4/4): ${pFilledStr}`,
        `   • Взятые эволюции: ${evosStr}`,
        `   • Первая резервная награда 25 чипов: ${firstFallbackStr} (всего за грузы: ${tel.skillBoxFallbackChipsCount}, за уровни: ${tel.levelUpFallbackChipsCount})`
    ];

    if (tel.titanKillsTimeline.length > 0 || tel.titanPickups.length > 0) {
        lines.push(`5. Хронология убийства и подбора награды Титана:`);
        tel.titanKillsTimeline.forEach((tk, idx) => {
            const killTag = tk.timeSec > 300 ? 'ПОСЛЕ 05:00' : 'ДО/НА 05:00';
            lines.push(`   • Гибель Титана #${idx + 1} (${killTag}, ${formatTimeSec(tk.timeSec)}): выпал кристалл на ${fmtNum(tk.xp)} базового XP`);
        });
        if (tel.titanPickups.length > 0) {
            tel.titanPickups.forEach((tp, idx) => {
                const timingTag = tp.timeSec > 300 ? 'ПОСЛЕ 05:00' : 'ДО/НА 05:00';
                lines.push(
                    `   • Подбор кристалла Титана #${idx + 1} (${timingTag}, ${formatTimeSec(tp.timeSec)}): база ${fmtNum(tp.baseXp)} XP -> начислено ${fmtNum(tp.awardedXp)} XP | Уровень ДО: ${tp.lvlBefore} (${fmtNum(tp.xpBefore)}/${tp.nextXpBefore}) -> ПОСЛЕ: ${tp.lvlAfter} (${fmtNum(tp.xpAfter)}/${tp.nextXpAfter})`
                );
            });
        } else {
            lines.push(`   • Кристалл убитого Титана ещё НЕ подобран игроком.`);
        }
    } else {
        lines.push(`5. Подбор награды Титана: Титан ещё не убит, кристалл не подбирался.`);
    }

    lines.push(
        `6. Сверка баланса XP на отметке ${snap.timeFormatted}:`,
        `   • Сумма пройденных порогов (Ур. 1 -> ${snap.lvl}): ${snap.passedThresholdsSum} XP`,
        `   • Сумма порогов + текущий остаток (${snap.passedThresholdsSum} + ${fmtNum(snap.currentXp)}): ${fmtNum(snap.reconciledTotalXp)} XP`,
        `   • Фактически начисленный XP: ${fmtNum(snap.totalAwardedXp)} XP | Расхождение: ${fmtNum(snap.discrepancy)} XP (${Math.abs(snap.discrepancy) < 0.01 ? 'СОВПАДАЕТ ТОЧНО' : 'ЕСТЬ РАСХОЖДЕНИЕ!'})`
    );

    if (isLocked5m && state.gameTime > 300 && state.player) {
        const curPassed = getCumulativeXpForLevel(state.player.lvl);
        const curReconciled = curPassed + state.player.xp;
        const deltaEnemy = tel.sources.enemy.awarded - snap.sources.enemy.awarded;
        const deltaConvoy = tel.sources.convoy.awarded - snap.sources.convoy.awarded;
        const deltaTitan = tel.sources.titan.awarded - snap.sources.titan.awarded;
        const deltaOther = tel.sources.other.awarded - snap.sources.other.awarded;
        lines.push(
            `7. Текущее состояние после 05:00 (${formatTimeSec(state.gameTime)}):`,
            `   • Текущий уровень: ${state.player.lvl} (${fmtNum(state.player.xp)}/${state.player.nextXp} XP), всего начислено: ${fmtNum(tel.totalAwardedXp)} XP (сверка: ${fmtNum(curReconciled)} XP, расхождение: ${fmtNum(tel.totalAwardedXp - curReconciled)} XP)`,
            `   • Прирост XP после 05:00 (+${fmtNum(tel.totalAwardedXp - snap.totalAwardedXp)} XP): обычные враги +${fmtNum(deltaEnemy)} XP, Конвой +${fmtNum(deltaConvoy)} XP, Титан +${fmtNum(deltaTitan)} XP, прочее +${fmtNum(deltaOther)} XP`
        );
    }

    if (tel.checkpoints?.length) {
        lines.push('Контрольные отметки забега');
        for (const point of tel.checkpoints) {
            lines.push(`   • ${point.timeFormatted} · Ур. ${point.lvl} · ${fmtNum(point.totalAwardedXp)} XP · Навыки из грузов ${point.skillBoxSkillsCount} · Эволюции ${point.evolutionsTimeline.length} · Чипы ${point.chips}`);
        }
    }
    return lines.join('\n');
}

export const AttackCoordinator = {
    rangedHolders: new Set(),
    lungeHolders: new Set(),
    kamikazeHolders: new Set(),

    lastRangedStartFrame: -999,
    lastLungeStartFrame: -999,
    lastKamikazeStartFrame: -999,

    MAX_RANGED_SLOTS: 2,
    MAX_LUNGE_SLOTS: 1,
    MAX_KAMIKAZE_SLOTS: 1,

    MIN_RANGED_STAGGER_TICKS: 25,
    MIN_LUNGE_STAGGER_TICKS: 45,
    MIN_KAMIKAZE_STAGGER_TICKS: 60,

    reset() {
        this.rangedHolders.clear();
        this.lungeHolders.clear();
        this.kamikazeHolders.clear();
        this.lastRangedStartFrame = -999;
        this.lastLungeStartFrame = -999;
        this.lastKamikazeStartFrame = -999;
    },

    canStartRanged(enemyId, frameCount) {
        if (this.rangedHolders.has(enemyId)) return true;
        if (this.rangedHolders.size >= this.MAX_RANGED_SLOTS) return false;
        if (frameCount - this.lastRangedStartFrame < this.MIN_RANGED_STAGGER_TICKS) return false;
        return true;
    },

    requestRanged(enemyId, frameCount) {
        if (this.canStartRanged(enemyId, frameCount)) {
            this.rangedHolders.add(enemyId);
            this.lastRangedStartFrame = frameCount;
            return true;
        }
        return false;
    },

    releaseRanged(enemyId) {
        this.rangedHolders.delete(enemyId);
    },

    canStartLunge(enemyId, frameCount) {
        if (this.lungeHolders.has(enemyId)) return true;
        if (this.lungeHolders.size >= this.MAX_LUNGE_SLOTS) return false;
        if (frameCount - this.lastLungeStartFrame < this.MIN_LUNGE_STAGGER_TICKS) return false;
        return true;
    },

    requestLunge(enemyId, frameCount) {
        if (this.canStartLunge(enemyId, frameCount)) {
            this.lungeHolders.add(enemyId);
            this.lastLungeStartFrame = frameCount;
            return true;
        }
        return false;
    },

    releaseLunge(enemyId) {
        this.lungeHolders.delete(enemyId);
    },

    canStartKamikaze(enemyId, frameCount) {
        if (this.kamikazeHolders.has(enemyId)) return true;
        if (this.kamikazeHolders.size >= this.MAX_KAMIKAZE_SLOTS) return false;
        if (frameCount - this.lastKamikazeStartFrame < this.MIN_KAMIKAZE_STAGGER_TICKS) return false;
        return true;
    },

    requestKamikaze(enemyId, frameCount) {
        if (this.canStartKamikaze(enemyId, frameCount)) {
            this.kamikazeHolders.add(enemyId);
            this.lastKamikazeStartFrame = frameCount;
            return true;
        }
        return false;
    },

    releaseKamikaze(enemyId) {
        this.kamikazeHolders.delete(enemyId);
    },

    releaseAll(enemyId) {
        this.rangedHolders.delete(enemyId);
        this.lungeHolders.delete(enemyId);
        this.kamikazeHolders.delete(enemyId);
    }
};

export function resetGameState() {
    AttackCoordinator.reset();
    state.enemies = [];
    state.bullets = [];
    state.enemyBullets = [];
    state.gems = [];
    state.chips = [];
    state.particles = [];
    state.texts = [];
    state.obstacles = [];
    state.obstacleGrid = null;
    if (state.enemySpatialGrid) state.enemySpatialGrid.clear();
    if (state.barrelSpatialGrid) state.barrelSpatialGrid.clear();
    state.mines = [];

    state.crates = [];
    state.skillCrates = [];

    state.barrels = [];
    state.slowZones = [];
    state.acidPuddles = [];
    state.directorEvents = [];
    state.convoyDrones = [];
    state.eventAlert = { title: '', desc: '', timer: 0 };

    state.airdropZones = [];
    state.activeLoot = null;
    state.nextCargoFrame = 0;
    state.nextTitanFrame = 300 * 60;

    state.score = 0;
    state.sessionChips = 0;
    state.sessionKills = 0;
    state.sessionEnemyKills = {};
    state.sessionDamageTaken = 0;
    state.lastDamageSource = null;
    state.gameTime = 0;
    state.frameCount = 0;
    state.globalDifficulty = 1;

    state.camera.shakeIntensity = 0;
    state.camera.shakeTimer = 0;
    state.hitStop = 0;
    state.nextCriticalImpactFrame = 0;

    state.director = {
        credits: 0,
        waveState: 'calm',
        stateTimer: 0,
        spawnRate: 60,
        nextSpawn: 0,
        assaultAngle: 0,
        assaultName: 'ВОСТОК',
        localPressure: 0,
        isHighPressurePaused: false,
        calmStage: 'dissipating',
        calmTimer: 0,
        quietTimer: 0,
        phaseTimer: 0,
        isSurroundEvent: false
    };

    state.xpTelemetry = createEmptyXpTelemetry();
}

export function triggerShake(intensity, durationFrames) {
    state.camera.shakeIntensity = Math.max(state.camera.shakeIntensity, intensity);
    state.camera.shakeTimer = Math.max(state.camera.shakeTimer, durationFrames);
}

export function triggerHitStop(frames, ordinaryCritical = false) {
    if (ordinaryCritical) {
        if (state.frameCount < state.nextCriticalImpactFrame) return;
        state.nextCriticalImpactFrame = state.frameCount + 30;
        frames = Math.min(2, frames);
    }
    state.hitStop = Math.max(state.hitStop, frames);
}
