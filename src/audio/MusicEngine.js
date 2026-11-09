class ProceduralMusicEngine {
    constructor() {
        this.ctx = null;
        this.outputNode = null;
        this.isPlaying = false;
        this.intensity = 'menu';

        this.bpm = 124;
        this.stepTime = 60 / this.bpm / 4;
        this.currentStep = 0;
        this.nextNoteTime = 0;
        this.scheduleAheadTime = 0.18;
        this.timerId = null;

        this.scale = [
            73.42,
            87.31,
            98.00,
            110.00,
            130.81,
            146.83,
            174.61,
            220.00
        ];

        this.bassPattern = [
            0, 0, 5, 0,  0, 0, 3, 0,
            1, 1, 5, 1,  2, 2, 3, 4
        ];

        this.arpPattern = [
            5, 7, 6, 7,  5, 4, 3, 4,
            5, 6, 7, 6,  5, 7, 4, 3
        ];
    }

    init(audioCtx, targetGainNode) {
        this.ctx = audioCtx;
        this.outputNode = targetGainNode;
    }

    start() {
        if (!this.ctx || !this.outputNode) return;
        if (this.isPlaying) return;

        if (this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }

        this.isPlaying = true;
        this.currentStep = 0;
        this.nextNoteTime = this.ctx.currentTime + 0.05;

        this.scheduler();
    }

    stop() {
        this.isPlaying = false;
        if (this.timerId) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }
    }

    setIntensity(level) {

        if (this.intensity !== level) {
            this.intensity = level;
        }
    }

    scheduler() {
        if (!this.isPlaying || !this.ctx) return;

        while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
            this.scheduleStep(this.currentStep, this.nextNoteTime);
            this.nextNoteTime += this.stepTime;
            this.currentStep = (this.currentStep + 1) % 16;
        }

        this.timerId = setTimeout(() => this.scheduler(), 35);
    }

    scheduleStep(step, time) {
        const isMenu = this.intensity === 'menu';
        const isCalm = this.intensity === 'calm';
        const isBattle = this.intensity === 'battle';
        const isBoss = this.intensity === 'boss';

        if (!isMenu && (step === 0 || step === 4 || step === 8 || step === 12)) {
            this.playKick(time, isBoss ? 1.25 : 1.0);
        }

        if (isBoss && (step === 6 || step === 14)) {
            this.playKick(time, 0.85);
        }

        if (!isMenu) {
            const isAccent = step % 4 === 2;
            if (isBattle || isBoss || isAccent) {
                this.playHiHat(time, isAccent ? 0.35 : 0.18);
            }
        }

        if (isMenu) {

            if (step === 0 || step === 8) {
                this.playBassNote(time, this.scale[0], this.stepTime * 7, 0.22);
            }
        } else {

            const noteIdx = this.bassPattern[step];
            const freq = this.scale[noteIdx] || this.scale[0];
            const octaveMod = (step % 2 === 1) ? 2 : 1;
            this.playBassNote(time, freq * octaveMod, this.stepTime * 0.9, isBoss ? 0.38 : 0.26);
        }

        if (isBattle || isBoss || isMenu) {
            const arpIdx = this.arpPattern[step];
            const arpFreq = this.scale[arpIdx] * (isMenu ? 1.5 : 2.0);
            const prob = isMenu ? (step % 4 === 0) : true;
            if (prob) {
                this.playArpNote(time, arpFreq, this.stepTime * 0.85, isBoss ? 0.22 : 0.15);
            }
        }

        if ((isBattle || isBoss) && (step === 4 || step === 12)) {
            this.playSnare(time, isBoss ? 0.45 : 0.32);
        }
    }

    playKick(time, volumeMult = 1.0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const duration = 0.12;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, time);
        osc.frequency.exponentialRampToValueAtTime(36, time + duration);

        gain.gain.setValueAtTime(0.42 * volumeMult, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(gain);
        gain.connect(this.outputNode);

        osc.start(time);
        osc.stop(time + duration);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }

    playHiHat(time, volume = 0.2) {

        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        const duration = 0.035;

        osc.type = 'square';
        osc.frequency.setValueAtTime(7500, time);

        filter.type = 'highpass';
        filter.frequency.setValueAtTime(6000, time);

        gain.gain.setValueAtTime(volume, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.outputNode);

        osc.start(time);
        osc.stop(time + duration);
        osc.onended = () => { osc.disconnect(); filter.disconnect(); gain.disconnect(); };
    }

    playSnare(time, volume = 0.3) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const duration = 0.11;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, time);
        osc.frequency.exponentialRampToValueAtTime(60, time + duration);

        gain.gain.setValueAtTime(volume, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(gain);
        gain.connect(this.outputNode);

        osc.start(time);
        osc.stop(time + duration);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }

    playBassNote(time, freq, duration, volume = 0.28) {
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, time);

        filter.type = 'lowpass';

        filter.Q.setValueAtTime(5, time);
        filter.frequency.setValueAtTime(450, time);
        filter.frequency.exponentialRampToValueAtTime(90, time + duration);

        gain.gain.setValueAtTime(volume, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.outputNode);

        osc.start(time);
        osc.stop(time + duration);
        osc.onended = () => { osc.disconnect(); filter.disconnect(); gain.disconnect(); };
    }

    playArpNote(time, freq, duration, volume = 0.16) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(volume, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(gain);
        gain.connect(this.outputNode);

        osc.start(time);
        osc.stop(time + duration);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }
}

export const MusicEngine = new ProceduralMusicEngine();
