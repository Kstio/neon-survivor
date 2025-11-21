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
    crates: [],
    skillCrates: [],
    camera: { x: 0, y: 0 },
    
    score: 0,
    gameTime: 0,
    frameCount: 0,
    globalDifficulty: 1,
    isRunning: false,
    isPaused: false
};

export function resetGameState() {
    state.enemies = [];
    state.bullets = [];
    state.enemyBullets = [];
    state.gems = [];
    state.chips = [];
    state.particles = [];
    state.texts = [];
    state.obstacles = [];
    state.crates = [];
    state.skillCrates = [];
    state.score = 0;
    state.gameTime = 0;
    state.frameCount = 0;
    state.globalDifficulty = 1;
}