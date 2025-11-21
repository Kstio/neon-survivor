const sounds = {};

const soundFiles = {
    laser: new URL('./entities/sounds/laser.wav', import.meta.url).href,
    hit: new URL('./entities/sounds/hit.wav', import.meta.url).href,
    explosion: new URL('./entities/sounds/explosion.wav', import.meta.url).href,
    levelup: new URL('./entities/sounds/levelup.wav', import.meta.url).href,
    powerUp: new URL('./entities/sounds/powerUp.wav', import.meta.url).href
};

function createAudio(key) {
    if (!soundFiles[key]) return null;
    
    const audio = new Audio(soundFiles[key]);
    audio.volume = 0.4;
    
    audio.onerror = () => {
        console.error(`Ошибка загрузки файла: ${soundFiles[key]}`);
    };
    
    return audio;
}

export function loadSounds() {
    console.log('Начинаю загрузку звуков...');
    Object.keys(soundFiles).forEach(key => {
        sounds[key] = createAudio(key);
    });
    console.log('Звуки загружены:', Object.keys(sounds));
}

export function playSound(name) {
    if (!sounds[name]) {
        console.warn(`Звук "${name}" не был загружен заранее. Загружаю на лету...`);
        sounds[name] = createAudio(name);
    }

    const sound = sounds[name];

    if (!sound) {
        console.error(`Звук "${name}" не найден в списке файлов!`);
        return;
    }

    try {
        const clone = sound.cloneNode();
        clone.volume = sound.volume;
        if (name === 'levelup') clone.volume = 0.10;
        if (name === 'powerUp') clone.volume = 0.10;
        if (name === 'hit') clone.volume = 0.10;
        if (name === 'explosion') clone.volume = 0.15;
        if (name === 'laser') clone.volume = 0.05; 

        const playPromise = clone.play();
        if (playPromise !== undefined) {
            playPromise.catch(e => {
                if (e.name !== 'NotAllowedError') {
                    console.warn('Ошибка воспроизведения:', e);
                }
            });
        }
    } catch (err) {
        console.error('Критическая ошибка аудио:', err);
    }
}