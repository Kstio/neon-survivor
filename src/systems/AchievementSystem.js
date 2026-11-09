import { ACHIEVEMENTS_DB } from '../constants.js';
import { Meta } from '../MetaGame.js';
import { state } from '../GameState.js';
import { floatTextPool } from '../entities/Particle.js';
import { NotificationSystem } from './NotificationSystem.js';

class RealtimeAchievementSystem {
    constructor() {
        this.reset();
    }

    reset() {

        this.killHistory = [];
        this.killWindowCap = 100;

        this.pickupHistory = [];
        this.pickupWindowCap = 50;

        this.lowHpTimer = 0;

        this.activeTitanSpawnTime = null;
    }

    unlock(id) {
        const def = ACHIEVEMENTS_DB[id];
        if (!def) return false;

        const isNew = Meta.unlockAchievement(id, def.reward);
        if (isNew) {

            NotificationSystem.show({
                icon: def.icon || '🏆',
                name: def.name,
                desc: def.desc,
                reward: def.reward
            });

            if (state.player) {
                state.texts.push(
                    floatTextPool.acquire(
                        state.player.x,
                        state.player.y - 120,
                        `🏆 ДИРЕКТИВА: ${def.name.toUpperCase()}!`,
                        '#ffd700',
                        24
                    )
                );
            }
            return true;
        }
        return false;
    }

    onKill(enemy) {
        const now = performance.now();

        this.unlock('first_blood');

        this.killHistory.push(now);
        if (this.killHistory.length > this.killWindowCap) {
            this.killHistory.shift();
        }

        if (this.killHistory.length >= this.killWindowCap) {
            const timeSpanMs = now - this.killHistory[0];
            if (timeSpanMs <= 10000) {
                this.unlock('massacre_100');
            }
        }

        if (enemy && enemy.type === 'titan') {
            if (this.activeTitanSpawnTime !== null) {
                const elapsedSec = (now - this.activeTitanSpawnTime) / 1000;
                if (elapsedSec <= 20) {
                    this.unlock('titan_speedkill');
                }
            }

            if (state.sessionDamageTaken === 0) {
                this.unlock('untouchable');
            }
        }
    }

    onPickup() {
        const now = performance.now();

        this.pickupHistory.push(now);
        if (this.pickupHistory.length > this.pickupWindowCap) {
            this.pickupHistory.shift();
        }

        if (this.pickupHistory.length >= this.pickupWindowCap) {
            const timeSpanMs = now - this.pickupHistory[0];
            if (timeSpanMs <= 3000) {
                this.unlock('vacuum_rush');
            }
        }
    }

    onTitanSpawn() {
        this.activeTitanSpawnTime = performance.now();
    }

    onEvolution() {
        this.unlock('singularity');
    }

    onPlayerDamage() {
        if (state.sessionDamageTaken >= 1000) {
            this.unlock('tank');
        }
    }

    update(dt = 1 / 60) {
        if (!state.player || !state.isRunning || state.isPaused) return;

        const hpRatio = state.player.hp / state.player.maxHp;
        if (hpRatio > 0 && hpRatio < 0.15) {
            this.lowHpTimer += dt;
            if (this.lowHpTimer >= 15) {
                this.unlock('clutch_survivor');
            }
        } else {
            this.lowHpTimer = 0;
        }

        if (state.gameTime >= 120 && state.sessionKills === 0) {
            this.unlock('pacifist');
        }
    }
}

export const AchievementSystem = new RealtimeAchievementSystem();
