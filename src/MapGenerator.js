import { WORLD_SIZE } from './constants.js';
import { Obstacle } from './entities/Items.js';

export function generateWorld() {
    const obstacles = [];
    const half = WORLD_SIZE / 2;

    generateCityZone(obstacles, 0, 0, half, half);

    generateIndustrialZone(obstacles, half, 0, half, half);

    generateRuinsZone(obstacles, 0, half, half, half);

    generateWastelandZone(obstacles, half, half, half, half);

    addWorldBorders(obstacles);

    return obstacles;
}

function generateCityZone(obs, startX, startY, w, h) {
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
            }
        }
    }
}

function generateIndustrialZone(obs, startX, startY, w, h) {
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
    }
}

function generateRuinsZone(obs, startX, startY, w, h) {
    for (let i = 0; i < 200; i++) {
        const size = 40 + Math.random() * 60;
        const bx = startX + Math.random() * (w - size);
        const by = startY + Math.random() * (h - size);

        obs.push(new Obstacle(
            bx, by, size, size,
            '#2e2016', 
            '#664433' 
        ));
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