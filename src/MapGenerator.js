import { WORLD_SIZE } from './constants.js';
import { Obstacle, ExplosiveBarrel, SlowZone } from './entities/Items.js';

export function generateWorld() {
    const obstacles = [];
    const barrels = [];
    const slowZones = [];
    const half = WORLD_SIZE / 2;

    generateCityZone(obstacles, barrels, 0, 0, half, half);

    generateIndustrialZone(obstacles, barrels, slowZones, half, 0, half, half);

    generateRuinsZone(obstacles, barrels, 0, half, half, half);

    generateWastelandZone(obstacles, half, half, half, half);

    addWorldBorders(obstacles);

    return { obstacles, barrels, slowZones };
}

function generateCityZone(obs, barrels, startX, startY, w, h) {
    const streetSize = 300;
    const gap = 80;
    
    for (let x = startX + 100; x < startX + w - 100; x += streetSize) {
        for (let y = startY + 100; y < startY + h - 100; y += streetSize) {
            if (Math.random() > 0.2) {
                if (Math.hypot(x - WORLD_SIZE/2, y - WORLD_SIZE/2) < 600) continue;

                obs.push(new Obstacle(
                    x, y, 
                    streetSize - gap, streetSize - gap, 
                    '#001a33',
                    '#00ccff'
                ));
            } else if (Math.random() < 0.3) {
                barrels.push(new ExplosiveBarrel(x + streetSize/2, y + streetSize/2));
            }
        }
    }
}

function generateIndustrialZone(obs, barrels, slowZones, startX, startY, w, h) {
    for(let i=0; i<40; i++) {
        const zw = 150 + Math.random() * 200;
        const zh = 150 + Math.random() * 200;
        const zx = startX + Math.random() * (w - zw);
        const zy = startY + Math.random() * (h - zh);
        slowZones.push(new SlowZone(zx, zy, zw, zh));
    }

    for (let i = 0; i < 60; i++) {
        const bw = 200 + Math.random() * 400;
        const bh = 100 + Math.random() * 200;
        const bx = startX + Math.random() * (w - bw);
        const by = startY + Math.random() * (h - bh);

        obs.push(new Obstacle(
            bx, by, bw, bh,
            '#1a1a1a',
            '#ffaa00' 
        ));
        
        if(Math.random() < 0.4) {
            barrels.push(new ExplosiveBarrel(bx - 30, by + bh/2));
        }
    }
}

function generateRuinsZone(obs, barrels, startX, startY, w, h) {
    for (let i = 0; i < 200; i++) {
        const size = 40 + Math.random() * 60;
        const bx = startX + Math.random() * (w - size);
        const by = startY + Math.random() * (h - size);

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