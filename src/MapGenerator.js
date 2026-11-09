import { WORLD_SIZE } from './constants.js';
import { Obstacle, ExplosiveBarrel, SlowZone } from './entities/Items.js';
import { NavigationSystem, TEST_SECTOR_BOUNDS } from './systems/NavigationSystem.js';
import { state } from './GameState.js';
import { buildSpatialGrid } from './utils.js';

function inTestSector(x, y, w = 0, h = 0) {
    return (x + w >= TEST_SECTOR_BOUNDS.minX - 50 && x <= TEST_SECTOR_BOUNDS.maxX + 50 &&
            y + h >= TEST_SECTOR_BOUNDS.minY - 50 && y <= TEST_SECTOR_BOUNDS.maxY + 50);
}

export function generateWorld() {
    const obstacles = [];
    const barrels = [];
    const slowZones = [];
    const half = WORLD_SIZE / 2;

    const testObstacles = generateTestDistrict(obstacles, barrels);

    generateCityZone(obstacles, barrels, 0, 0, half, half);
    generateIndustrialZone(obstacles, barrels, slowZones, half, 0, half, half);
    generateRuinsZone(obstacles, barrels, 0, half, half, half);
    generateWastelandZone(obstacles, half, half, half, half);

    addWorldBorders(obstacles);

    state.obstacles = obstacles;
    state.obstacleGrid = buildSpatialGrid(obstacles);

    NavigationSystem.buildGraph(obstacles);

    return { obstacles, barrels, slowZones };
}

function generateTestDistrict(obs, barrels) {
    const districtObs = [];

    const addObs = (x, y, w, h, col = '#001a33', border = '#00ccff') => {
        const o = new Obstacle(x, y, w, h, col, border);
        obs.push(o);
        districtObs.push(o);
        return o;
    };

    addObs(4840, 4840, 45, 45, '#001528', '#00e5ff');
    addObs(5115, 5115, 45, 45, '#001528', '#00e5ff');
    addObs(4840, 5115, 45, 45, '#001528', '#00e5ff');
    addObs(5115, 4840, 45, 45, '#001528', '#00e5ff');

    addObs(5240, 4320, 120, 75, '#0d1b2a', '#00b4d8');

    addObs(5530, 4320, 70, 75, '#0d1b2a', '#00b4d8');

    addObs(5530, 4395, 70, 330, '#0d1b2a', '#00b4d8');

    addObs(5530, 4725, 70, 75, '#0d1b2a', '#00b4d8');

    addObs(5240, 4725, 120, 75, '#0d1b2a', '#00b4d8');

    addObs(4380, 4320, 350, 170, '#101c2e', '#0077b6');

    addObs(4380, 4660, 350, 170, '#101c2e', '#0077b6');

    addObs(4360, 5200, 290, 200, '#1c1b22', '#ffaa00');

    addObs(4560, 5490, 290, 180, '#1c1b22', '#ffaa00');

    addObs(5240, 5200, 220, 340, '#1a0933', '#b5179e');

    addObs(5540, 5360, 200, 180, '#1a0933', '#b5179e');

    barrels.push(new ExplosiveBarrel(5220, 4820));
    barrels.push(new ExplosiveBarrel(4750, 4420));
    barrels.push(new ExplosiveBarrel(4520, 5200));
    barrels.push(new ExplosiveBarrel(5480, 5560));

    return districtObs;
}

function generateCityZone(obs, barrels, startX, startY, w, h) {
    const streetSize = 300;
    const gap = 120;

    for (let x = startX + 100; x < startX + w - 100; x += streetSize) {
        for (let y = startY + 100; y < startY + h - 100; y += streetSize) {
            const bw = streetSize - gap;
            const bh = streetSize - gap;
            if (inTestSector(x, y, bw, bh)) continue;

            if (Math.random() > 0.25) {
                obs.push(new Obstacle(
                    x, y,
                    bw, bh,
                    '#001a33',
                    '#00ccff'
                ));
            } else if (Math.random() < 0.2) {
                barrels.push(new ExplosiveBarrel(x + streetSize/2, y + streetSize/2));
            }
        }
    }
}

function generateIndustrialZone(obs, barrels, slowZones, startX, startY, w, h) {
    for (let i = 0; i < 35; i++) {
        const zw = 150 + Math.random() * 200;
        const zh = 150 + Math.random() * 200;
        const zx = startX + Math.random() * (w - zw);
        const zy = startY + Math.random() * (h - zh);
        if (inTestSector(zx, zy, zw, zh)) continue;
        slowZones.push(new SlowZone(zx, zy, zw, zh));
    }

    for (let i = 0; i < 50; i++) {
        const bw = 200 + Math.random() * 350;
        const bh = 100 + Math.random() * 200;
        const bx = startX + Math.random() * (w - bw);
        const by = startY + Math.random() * (h - bh);
        if (inTestSector(bx, by, bw, bh)) continue;

        obs.push(new Obstacle(
            bx, by, bw, bh,
            '#1a1a1a',
            '#ffaa00'
        ));

        if (Math.random() < 0.3) {
            barrels.push(new ExplosiveBarrel(bx - 30, by + bh/2));
        }
    }
}

function generateRuinsZone(obs, barrels, startX, startY, w, h) {
    for (let i = 0; i < 120; i++) {
        const size = 60 + Math.random() * 60;
        const bx = startX + Math.random() * (w - size);
        const by = startY + Math.random() * (h - size);
        if (inTestSector(bx, by, size, size)) continue;

        obs.push(new Obstacle(
            bx, by, size, size,
            '#2e2016',
            '#664433'
        ));

        if (Math.random() < 0.05) {
             barrels.push(new ExplosiveBarrel(bx + size + 20, by));
        }
    }
}

function generateWastelandZone(obs, startX, startY, w, h) {
    for (let i = 0; i < 20; i++) {
        const bw = 100 + Math.random() * 300;
        const bh = 100 + Math.random() * 300;
        const bx = startX + Math.random() * (w - bw);
        const by = startY + Math.random() * (h - bh);
        if (inTestSector(bx, by, bw, bh)) continue;

        obs.push(new Obstacle(
            bx, by, bw, bh,
            '#110000',
            '#550000'
        ));
    }
}

function addWorldBorders(obs) {
    const T = 100;
    obs.push(new Obstacle(-T, -T, WORLD_SIZE + 2*T, T, '#000', '#fff'));
    obs.push(new Obstacle(-T, WORLD_SIZE, WORLD_SIZE + 2*T, T, '#000', '#fff'));
    obs.push(new Obstacle(-T, 0, T, WORLD_SIZE, '#000', '#fff'));
    obs.push(new Obstacle(WORLD_SIZE, 0, T, WORLD_SIZE, '#000', '#fff'));
}
