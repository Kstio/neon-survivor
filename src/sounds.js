import { MusicEngine } from './audio/MusicEngine.js';

class SoundEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.sfxGain = null;
        this.musicGain = null;
        this.uiGain = null;
        this.compressor = null;
        this.noiseBuffer = null;

        this.masterVolume = 0.7;
        this.sfxVolume = 0.7;
        this.musicVolume = 0.6;
        this.uiVolume = 0.8;
        this.isMuted = false;

        this.lastPlayTimes = {};
        this.minIntervals = {
            laser: 0.035,
            hit: 0.030,
            explosion: 0.045,
            gem: 0.020,
            powerUp: 0.050,
            levelup: 0.100,
            preview: 0.080
        };

        this.lastGemTime = 0;
        this.gemStreak = 0;
        this.gemScale = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66, 1318.51];

        this.initOnUserGesture();
    }

    initContext() {
        if (this.ctx) {
            if (this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => {});
            }
            return;
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;

        this.ctx = new AudioContextClass();
        const now = this.ctx.currentTime;

        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-14, now);
        this.compressor.knee.setValueAtTime(10, now);
        this.compressor.ratio.setValueAtTime(8, now);
        this.compressor.attack.setValueAtTime(0.003, now);
        this.compressor.release.setValueAtTime(0.15, now);

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, now);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.setValueAtTime(this.sfxVolume, now);

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.setValueAtTime(this.musicVolume, now);

        this.uiGain = this.ctx.createGain();
        this.uiGain.gain.setValueAtTime(this.uiVolume, now);

        this.sfxGain.connect(this.compressor);
        this.musicGain.connect(this.compressor);
        this.uiGain.connect(this.compressor);
        this.compressor.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        MusicEngine.init(this.ctx, this.musicGain);

        this.generateNoiseBuffer();
    }

    initOnUserGesture() {
        const unlock = () => {
            this.initContext();
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => {});
            }
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('keydown', unlock);
            window.removeEventListener('touchstart', unlock);
        };

        window.addEventListener('pointerdown', unlock, { once: true, passive: true });
        window.addEventListener('keydown', unlock, { once: true, passive: true });
        window.addEventListener('touchstart', unlock, { once: true, passive: true });
    }

    generateNoiseBuffer() {
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate;
        this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
    }

    canPlay(name, now) {
        const minGap = this.minIntervals[name] || 0.03;
        const last = this.lastPlayTimes[name] || 0;
        if (now - last < minGap) {
            return false;
        }
        this.lastPlayTimes[name] = now;
        return true;
    }

    setMasterVolume(val) {
        this.masterVolume = Math.max(0, Math.min(1, val));
        if (this.masterGain && this.ctx) {
            const now = this.ctx.currentTime;
            this.masterGain.gain.cancelScheduledValues(now);
            const target = this.isMuted ? 0 : this.masterVolume;
            this.masterGain.gain.linearRampToValueAtTime(target, now + 0.02);
        }
    }

    setSfxVolume(val) {
        this.sfxVolume = Math.max(0, Math.min(1, val));
        if (this.sfxGain && this.ctx) {
            const now = this.ctx.currentTime;
            this.sfxGain.gain.cancelScheduledValues(now);
            this.sfxGain.gain.linearRampToValueAtTime(this.sfxVolume, now + 0.02);
        }
    }

    setMusicVolume(val) {
        this.musicVolume = Math.max(0, Math.min(1, val));
        if (this.musicGain && this.ctx) {
            const now = this.ctx.currentTime;
            this.musicGain.gain.cancelScheduledValues(now);
            this.musicGain.gain.linearRampToValueAtTime(this.musicVolume, now + 0.02);
        }
    }

    setUiVolume(val) {
        this.uiVolume = Math.max(0, Math.min(1, val));
        if (this.uiGain && this.ctx) {
            const now = this.ctx.currentTime;
            this.uiGain.gain.cancelScheduledValues(now);
            this.uiGain.gain.linearRampToValueAtTime(this.uiVolume, now + 0.02);
        }
    }

    setMuted(muted) {
        this.isMuted = !!muted;
        if (this.masterGain && this.ctx) {
            const now = this.ctx.currentTime;
            this.masterGain.gain.cancelScheduledValues(now);
            const target = this.isMuted ? 0 : this.masterVolume;
            this.masterGain.gain.linearRampToValueAtTime(target, now + 0.02);
        }
    }

    applySettings(settings = {}) {
        if (typeof settings.master === 'number') this.masterVolume = settings.master;
        if (typeof settings.sfx === 'number') this.sfxVolume = settings.sfx;
        if (typeof settings.music === 'number') this.musicVolume = settings.music;
        if (typeof settings.ui === 'number') this.uiVolume = settings.ui;
        if (typeof settings.muted === 'boolean') this.isMuted = settings.muted;

        if (this.ctx) {
            this.setMasterVolume(this.masterVolume);
            this.setSfxVolume(this.sfxVolume);
            this.setMusicVolume(this.musicVolume);
            this.setUiVolume(this.uiVolume);
            this.setMuted(this.isMuted);
        }
    }

    getSettings() {
        return {
            master: this.masterVolume,
            sfx: this.sfxVolume,
            music: this.musicVolume,
            ui: this.uiVolume,
            muted: this.isMuted
        };
    }

    playPreviewTone(channel = 'master') {
        this.initContext();
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        if (!this.canPlay('preview', now)) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const duration = 0.09;

        if (channel === 'sfx') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(150, now + duration);
            gain.gain.setValueAtTime(0.20, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
            osc.connect(gain);
            gain.connect(this.sfxGain || this.compressor);
        } else if (channel === 'music') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(146.83, now);
            gain.gain.setValueAtTime(0.20, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
            osc.connect(gain);
            gain.connect(this.musicGain || this.compressor);
        } else if (channel === 'ui') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.exponentialRampToValueAtTime(1174, now + duration);
            gain.gain.setValueAtTime(0.20, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
            osc.connect(gain);
            gain.connect(this.uiGain || this.compressor);
        } else {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523.25, now);
            gain.gain.setValueAtTime(0.22, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
            osc.connect(gain);
            gain.connect(this.compressor);
        }

        osc.start(now);
        osc.stop(now + duration);
        osc.onended = () => {
            osc.disconnect();
            gain.disconnect();
        };
    }

    playLaser() {
        this.initContext();
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        if (!this.canPlay('laser', now)) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        const detune = (Math.random() - 0.5) * 70;
        const startFreq = 880 + detune;
        const endFreq = 110 + detune * 0.2;
        const duration = 0.085;

        osc.type = Math.random() > 0.4 ? 'sawtooth' : 'square';
        osc.frequency.setValueAtTime(startFreq, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + duration);

        gain.gain.setValueAtTime(0.20, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(this.sfxGain || this.compressor);

        osc.start(now);
        osc.stop(now + duration);
        osc.onended = () => {
            osc.disconnect();
            gain.disconnect();
        };
    }

    playExplosion() {
        this.initContext();
        if (!this.ctx || this.isMuted || !this.noiseBuffer) return;
        const now = this.ctx.currentTime;
        if (!this.canPlay('explosion', now)) return;

        const duration = 0.38;

        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        noise.playbackRate.setValueAtTime(0.85 + Math.random() * 0.3, now);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(950, now);
        filter.frequency.exponentialRampToValueAtTime(35, now + duration);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.28, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.sfxGain || this.compressor);

        noise.start(now);
        noise.stop(now + duration);

        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = 'triangle';
        subOsc.frequency.setValueAtTime(130, now);
        subOsc.frequency.exponentialRampToValueAtTime(28, now + 0.22);

        subGain.gain.setValueAtTime(0.32, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        subOsc.connect(subGain);
        subGain.connect(this.sfxGain || this.compressor);

        subOsc.start(now);
        subOsc.stop(now + 0.22);

        noise.onended = () => {
            noise.disconnect();
            filter.disconnect();
            noiseGain.disconnect();
            subOsc.disconnect();
            subGain.disconnect();
        };
    }

    playHit() {
        this.initContext();
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        if (!this.canPlay('hit', now)) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const duration = 0.06;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + duration);

        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(this.sfxGain || this.compressor);

        osc.start(now);
        osc.stop(now + duration);
        osc.onended = () => {
            osc.disconnect();
            gain.disconnect();
        };
    }

    playGem() {
        this.initContext();
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        if (!this.canPlay('gem', now)) return;

        if (now - this.lastGemTime < 0.22) {
            this.gemStreak = (this.gemStreak + 1) % this.gemScale.length;
        } else {
            this.gemStreak = 0;
        }
        this.lastGemTime = now;

        const freq = this.gemScale[this.gemStreak];
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const duration = 0.055;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.08, now + duration);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(this.uiGain || this.compressor);

        osc.start(now);
        osc.stop(now + duration);
        osc.onended = () => {
            osc.disconnect();
            gain.disconnect();
        };
    }

    playLevelUp() {
        this.initContext();
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        if (!this.canPlay('levelup', now)) return;

        const notes = [523.25, 659.25, 783.99, 1046.50];
        const step = 0.065;

        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const noteStart = now + idx * step;
            const noteDuration = idx === notes.length - 1 ? 0.32 : 0.08;

            osc.type = idx === notes.length - 1 ? 'triangle' : 'square';
            osc.frequency.setValueAtTime(freq, noteStart);

            if (idx === notes.length - 1) {
                const vibrato = this.ctx.createOscillator();
                const vibratoGain = this.ctx.createGain();
                vibrato.frequency.setValueAtTime(14, noteStart);
                vibratoGain.gain.setValueAtTime(12, noteStart);
                vibrato.connect(osc.frequency);
                vibrato.start(noteStart);
                vibrato.stop(noteStart + noteDuration);
            }

            gain.gain.setValueAtTime(0.22, noteStart);
            gain.gain.exponentialRampToValueAtTime(0.001, noteStart + noteDuration);

            osc.connect(gain);
            gain.connect(this.uiGain || this.compressor);

            osc.start(noteStart);
            osc.stop(noteStart + noteDuration);
        });
    }

    playPowerUp() {
        this.initContext();
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        if (!this.canPlay('powerUp', now)) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const duration = 0.22;

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(960, now + duration);

        gain.gain.setValueAtTime(0.20, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(this.uiGain || this.compressor);

        osc.start(now);
        osc.stop(now + duration);
        osc.onended = () => {
            osc.disconnect();
            gain.disconnect();
        };
    }

    playAchievement() {
        this.initContext();
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        if (!this.canPlay('achievement', now)) return;

        const fanfareNotes = [523.25, 659.25, 783.99, 1046.50];
        const step = 0.075;

        fanfareNotes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const noteStart = now + idx * step;
            const isLast = idx === fanfareNotes.length - 1;
            const noteDuration = isLast ? 0.45 : 0.09;

            osc.type = isLast ? 'triangle' : 'square';
            osc.frequency.setValueAtTime(freq, noteStart);

            if (isLast) {

                const vib = this.ctx.createOscillator();
                const vibGain = this.ctx.createGain();
                vib.frequency.setValueAtTime(10, noteStart);
                vibGain.gain.setValueAtTime(16, noteStart);
                vib.connect(osc.frequency);
                vib.start(noteStart);
                vib.stop(noteStart + noteDuration);
            }

            gain.gain.setValueAtTime(0.24, noteStart);
            gain.gain.exponentialRampToValueAtTime(0.001, noteStart + noteDuration);

            osc.connect(gain);
            gain.connect(this.uiGain || this.compressor);

            osc.start(noteStart);
            osc.stop(noteStart + noteDuration);
        });
    }
}

const soundEngine = new SoundEngine();

export function loadSounds() {
    soundEngine.initContext();
}

export function playSound(name) {
    switch (name) {
        case 'laser':
            soundEngine.playLaser();
            break;
        case 'explosion':
            soundEngine.playExplosion();
            break;
        case 'hit':
            soundEngine.playHit();
            break;
        case 'gem':
            soundEngine.playGem();
            break;
        case 'levelup':
            soundEngine.playLevelUp();
            break;
        case 'powerUp':
            soundEngine.playPowerUp();
            break;
        case 'achievement':
            soundEngine.playAchievement();
            break;
        default:
            soundEngine.playLaser();
            break;
    }
}

export function setSoundVolume(volume) {
    soundEngine.setMasterVolume(volume);
}

export function setMasterVolume(val) {
    soundEngine.setMasterVolume(val);
}

export function setSfxVolume(val) {
    soundEngine.setSfxVolume(val);
}

export function setMusicVolume(val) {
    soundEngine.setMusicVolume(val);
}

export function setUiVolume(val) {
    soundEngine.setUiVolume(val);
}

export function setSoundMuted(muted) {
    soundEngine.setMuted(muted);
}

export function toggleSoundMute() {
    soundEngine.setMuted(!soundEngine.isMuted);
    return soundEngine.isMuted;
}

export function applyAudioSettings(settings) {
    soundEngine.applySettings(settings);
}

export function getAudioSettings() {
    return soundEngine.getSettings();
}

export function playAudioPreview(channel) {
    soundEngine.playPreviewTone(channel);
}
