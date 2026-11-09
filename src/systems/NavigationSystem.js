import { state } from '../GameState.js';
import { checkWall, raycastWall, canPassClearance, buildSpatialGrid, resolveWallOverlap, getAccessibleTargetPoint } from '../utils.js';

export const TEST_SECTOR_BOUNDS = {
    minX: 4200,
    minY: 4200,
    maxX: 5800,
    maxY: 5800
};

export const GRAPH_SECTOR_BOUNDS = {
    minX: 3300,
    minY: 3300,
    maxX: 6700,
    maxY: 6700
};

class NavigationManager {
    constructor() {
        this.waypoints = [];
        this.edges = new Map();
        this.recalcsThisFrame = 0;
        this.MAX_RECALCS_PER_FRAME = 8;
        this.lastFrame = -1;
        this.reachabilityGrid = null;
        this.mainComponentNodes = new Set();
        this.mainTitanComponentNodes = new Set();
        this.pendingQueue = new Set();
    }

    reset() {
        this.waypoints = [];
        this.edges.clear();
        this.recalcsThisFrame = 0;
        this.lastFrame = -1;
        this.reachabilityGrid = null;
        this.mainComponentNodes.clear();
        this.mainTitanComponentNodes.clear();
        this.pendingQueue.clear();
    }

    releaseEnemy(enemyId) {
        if (enemyId !== undefined && enemyId !== -1) {
            this.pendingQueue.delete(enemyId);
        }
    }

    buildGraph(sectorObstacles) {
        this.reset();
        if (state.obstacles && state.obstacles.length > 0) {
            state.obstacleGrid = buildSpatialGrid(state.obstacles);
        }
        const candidatePoints = [];

        const margins = [68, 46, 34];

        for (let i = 0; i < sectorObstacles.length; i++) {
            const o = sectorObstacles[i];
            if (o.w > 2000 || o.h > 2000) continue;
            if (o.x + o.w < GRAPH_SECTOR_BOUNDS.minX || o.x > GRAPH_SECTOR_BOUNDS.maxX ||
                o.y + o.h < GRAPH_SECTOR_BOUNDS.minY || o.y > GRAPH_SECTOR_BOUNDS.maxY) {
                continue;
            }

            const cornerSigns = [
                { sx: -1, sy: -1, bx: o.x, by: o.y },
                { sx: 1, sy: -1, bx: o.x + o.w, by: o.y },
                { sx: 1, sy: 1, bx: o.x + o.w, by: o.y + o.h },
                { sx: -1, sy: 1, bx: o.x, by: o.y + o.h }
            ];

            for (let c = 0; c < cornerSigns.length; c++) {
                const cs = cornerSigns[c];
                for (let m = 0; m < margins.length; m++) {
                    const margin = margins[m];
                    const pt = {
                        x: cs.bx + cs.sx * margin,
                        y: cs.by + cs.sy * margin
                    };
                    if (pt.x < GRAPH_SECTOR_BOUNDS.minX + 30 || pt.x > GRAPH_SECTOR_BOUNDS.maxX - 30 ||
                        pt.y < GRAPH_SECTOR_BOUNDS.minY + 30 || pt.y > GRAPH_SECTOR_BOUNDS.maxY - 30) {
                        continue;
                    }
                    const minClear = margin >= 68 ? 35 : 22;
                    if (!checkWall(pt.x, pt.y, minClear)) {
                        let isDuplicate = false;
                        for (let j = 0; j < candidatePoints.length; j++) {
                            if (Math.hypot(candidatePoints[j].x - pt.x, candidatePoints[j].y - pt.y) < 48) {
                                isDuplicate = true;
                                break;
                            }
                        }
                        if (!isDuplicate) {
                            candidatePoints.push({ x: pt.x, y: pt.y, id: candidatePoints.length });
                        }
                        break;
                    }
                }
            }
        }

        const centerNodes = [
            { x: 5000, y: 4400 },
            { x: 5000, y: 5600 },
            { x: 4400, y: 5000 },
            { x: 5600, y: 5000 },
            { x: 5000, y: 5000 },
            { x: 5385, y: 4560 },
            { x: 4200, y: 4200 },
            { x: 5800, y: 4200 },
            { x: 4200, y: 5800 },
            { x: 5800, y: 5800 },
            { x: 5000, y: 4150 },
            { x: 5000, y: 5850 },
            { x: 4150, y: 5000 },
            { x: 5850, y: 5000 }
        ];

        for (let k = 0; k < centerNodes.length; k++) {
            const cn = centerNodes[k];
            const clean = resolveWallOverlap(cn.x, cn.y, 35);
            if (!checkWall(clean.x, clean.y, 28)) {
                candidatePoints.push({ x: clean.x, y: clean.y, id: candidatePoints.length });
            }
        }

        this.waypoints = candidatePoints;

        for (let a = 0; a < this.waypoints.length; a++) {
            this.edges.set(a, []);
            const pA = this.waypoints[a];
            for (let b = 0; b < this.waypoints.length; b++) {
                if (a === b) continue;
                const pB = this.waypoints[b];
                const d = Math.hypot(pB.x - pA.x, pB.y - pA.y);
                if (d < 850) {
                    let clearance = 0;
                    if (canPassClearance(pA.x, pA.y, pB.x, pB.y, 60)) {
                        clearance = 60;
                    } else if (canPassClearance(pA.x, pA.y, pB.x, pB.y, 35)) {
                        clearance = 35;
                    } else if (canPassClearance(pA.x, pA.y, pB.x, pB.y, 28)) {
                        clearance = 28;
                    } else if (canPassClearance(pA.x, pA.y, pB.x, pB.y, 22)) {
                        clearance = 22;
                    } else if (canPassClearance(pA.x, pA.y, pB.x, pB.y, 16)) {
                        clearance = 16;
                    }

                    if (clearance >= 16) {
                        this.edges.get(a).push({
                            to: b,
                            dist: d,
                            clearance,
                            fitsTitan: clearance >= 60
                        });
                    }
                }
            }
        }

        this.mainComponentNodes.clear();
        this.mainTitanComponentNodes.clear();
        const plazaIdx = this.waypoints.findIndex(wp => wp.x === 5000 && wp.y === 5000);
        if (plazaIdx !== -1) {

            const q = [plazaIdx];
            this.mainComponentNodes.add(plazaIdx);
            while (q.length > 0) {
                const curr = q.shift();
                const neighbors = this.edges.get(curr) || [];
                for (const edge of neighbors) {
                    if (edge.clearance >= 22 && !this.mainComponentNodes.has(edge.to)) {
                        this.mainComponentNodes.add(edge.to);
                        q.push(edge.to);
                    }
                }
            }

            const qTitan = [plazaIdx];
            this.mainTitanComponentNodes.add(plazaIdx);
            while (qTitan.length > 0) {
                const curr = qTitan.shift();
                const neighbors = this.edges.get(curr) || [];
                for (const edge of neighbors) {
                    if (edge.clearance >= 60 && !this.mainTitanComponentNodes.has(edge.to)) {
                        this.mainTitanComponentNodes.add(edge.to);
                        qTitan.push(edge.to);
                    }
                }
            }
        }

        this.reachabilityGrid = this._computeReachabilityGrid(22);
        this.titanReachabilityGrid = this._computeReachabilityGrid(60);
    }

    _computeReachabilityGrid(radius) {
        const GRID_DIM = 200;
        const CELL_SIZE = 50;
        const grid = new Uint8Array(GRID_DIM * GRID_DIM);

        for (let gy = 0; gy < GRID_DIM; gy++) {
            for (let gx = 0; gx < GRID_DIM; gx++) {
                const cx = gx * CELL_SIZE + 25;
                const cy = gy * CELL_SIZE + 25;
                if (!checkWall(cx, cy, radius)) {
                    grid[gy * GRID_DIM + gx] = 1;
                }
            }
        }

        const startGx = 100;
        const startGy = 100;
        const startIdx = startGy * GRID_DIM + startGx;
        if (grid[startIdx] === 1) {
            grid[startIdx] = 2;
            const q = [startIdx];
            const dirs = [
                [-1, 0], [1, 0], [0, -1], [0, 1],
                [-1, -1], [1, -1], [-1, 1], [1, 1]
            ];

            while (q.length > 0) {
                const curr = q.shift();
                const cgx = curr % GRID_DIM;
                const cgy = Math.floor(curr / GRID_DIM);
                const ccx = cgx * CELL_SIZE + 25;
                const ccy = cgy * CELL_SIZE + 25;

                for (let d = 0; d < 8; d++) {
                    const dx = dirs[d][0];
                    const dy = dirs[d][1];
                    const ngx = cgx + dx;
                    const ngy = cgy + dy;
                    if (ngx >= 0 && ngx < GRID_DIM && ngy >= 0 && ngy < GRID_DIM) {
                        const nIdx = ngy * GRID_DIM + ngx;
                        if (grid[nIdx] === 1) {
                            const ncx = ngx * CELL_SIZE + 25;
                            const ncy = ngy * CELL_SIZE + 25;
                            let pass = canPassClearance(ccx, ccy, ncx, ncy, radius);
                            if (!pass && (dx === 0 || dy === 0)) {

                                const px = dy !== 0 ? 15 : 0;
                                const py = dx !== 0 ? 15 : 0;
                                pass = (canPassClearance(ccx + px, ccy + py, ncx + px, ncy + py, radius) &&
                                        canPassClearance(ccx, ccy, ccx + px, ccy + py, radius) &&
                                        canPassClearance(ncx + px, ncy + py, ncx, ncy, radius)) ||
                                       (canPassClearance(ccx - px, ccy - py, ncx - px, ncy - py, radius) &&
                                        canPassClearance(ccx, ccy, ccx - px, ccy - py, radius) &&
                                        canPassClearance(ncx - px, ncy - py, ncx, ncy, radius));
                            }
                            if (pass) {
                                grid[nIdx] = 2;
                                q.push(nIdx);
                            }
                        } else if (grid[nIdx] === 0 && (dx === 0 || dy === 0)) {

                            const n2gx = cgx + dx * 2;
                            const n2gy = cgy + dy * 2;
                            if (n2gx >= 0 && n2gx < GRID_DIM && n2gy >= 0 && n2gy < GRID_DIM) {
                                const n2Idx = n2gy * GRID_DIM + n2gx;
                                if (grid[n2Idx] === 1) {
                                    const n2cx = n2gx * CELL_SIZE + 25;
                                    const n2cy = n2gy * CELL_SIZE + 25;
                                    const px = dy !== 0 ? 15 : 0;
                                    const py = dx !== 0 ? 15 : 0;
                                    const pass2 = canPassClearance(ccx, ccy, n2cx, n2cy, radius) ||
                                        (canPassClearance(ccx + px, ccy + py, n2cx + px, n2cy + py, radius) &&
                                         canPassClearance(ccx, ccy, ccx + px, ccy + py, radius) &&
                                         canPassClearance(n2cx + px, n2cy + py, n2cx, n2cy, radius)) ||
                                        (canPassClearance(ccx - px, ccy - py, n2cx - px, n2cy - py, radius) &&
                                         canPassClearance(ccx, ccy, ccx - px, ccy - py, radius) &&
                                         canPassClearance(n2cx - px, n2cy - py, n2cx, n2cy, radius));
                                    if (pass2) {
                                        grid[n2Idx] = 2;
                                        q.push(n2Idx);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        return grid;
    }

    isPointConnectedToMain(x, y, enemyRadius = 22) {
        if (x < 50 || x > 9950 || y < 50 || y > 9950) return false;
        if (checkWall(x, y, enemyRadius)) return false;

        const activeGrid = (enemyRadius > 35 && this.titanReachabilityGrid) ? this.titanReachabilityGrid : this.reachabilityGrid;
        if (activeGrid) {
            const GRID_DIM = 200;
            const CELL_SIZE = 50;
            const gx = Math.floor(x / CELL_SIZE);
            const gy = Math.floor(y / CELL_SIZE);
            if (gx < 0 || gx >= GRID_DIM || gy < 0 || gy >= GRID_DIM) return false;

            let connected = false;

            const dirs = [
                [0, 0], [-1, 0], [1, 0], [0, -1], [0, 1],
                [-1, -1], [1, -1], [-1, 1], [1, 1]
            ];
            for (let d = 0; d < dirs.length; d++) {
                const ngx = gx + dirs[d][0];
                const ngy = gy + dirs[d][1];
                if (ngx >= 0 && ngx < GRID_DIM && ngy >= 0 && ngy < GRID_DIM) {
                    if (activeGrid[ngy * GRID_DIM + ngx] === 2) {
                        const ncx = ngx * CELL_SIZE + 25;
                        const ncy = ngy * CELL_SIZE + 25;
                        if (canPassClearance(x, y, ncx, ncy, enemyRadius)) {
                            connected = true;
                            break;
                        }
                    }
                }
            }
            if (!connected) return false;
        }

        if (this.isInTestSector(x, y)) {
            const component = (enemyRadius > 35) ? this.mainTitanComponentNodes : this.mainComponentNodes;
            if (component.size > 0) {
                let seesMainWp = false;
                for (const wpId of component) {
                    const wp = this.waypoints[wpId];
                    if (Math.hypot(wp.x - x, wp.y - y) < 850) {
                        if (canPassClearance(x, y, wp.x, wp.y, enemyRadius)) {
                            seesMainWp = true;
                            break;
                        }
                    }
                }
                if (!seesMainWp) return false;
            }
        }

        return true;
    }

    isInTestSector(x, y) {
        return x >= TEST_SECTOR_BOUNDS.minX && x <= TEST_SECTOR_BOUNDS.maxX &&
               y >= TEST_SECTOR_BOUNDS.minY && y <= TEST_SECTOR_BOUNDS.maxY;
    }

    isInGraphSector(x, y) {
        return x >= GRAPH_SECTOR_BOUNDS.minX && x <= GRAPH_SECTOR_BOUNDS.maxX &&
               y >= GRAPH_SECTOR_BOUNDS.minY && y <= GRAPH_SECTOR_BOUNDS.maxY;
    }

    _findLocalBypass(sX, sY, gX, gY, enemyRadius = 22) {
        const obsList = state.obstacles || [];
        const totalDist = Math.hypot(gX - sX, gY - sY);
        if (totalDist < 1) return null;

        const stepSize = Math.max(10, enemyRadius * 0.5);
        const steps = Math.ceil(totalDist / stepSize);
        let blockingObs = null;

        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const px = sX + (gX - sX) * t;
            const py = sY + (gY - sY) * t;
            for (let i = 0; i < obsList.length; i++) {
                const o = obsList[i];
                if (o.w > 2000 || o.h > 2000) continue;
                const cx = Math.max(o.x, Math.min(px, o.x + o.w));
                const cy = Math.max(o.y, Math.min(py, o.y + o.h));
                const dx = px - cx;
                const dy = py - cy;
                if (dx * dx + dy * dy < enemyRadius * enemyRadius) {
                    blockingObs = o;
                    break;
                }
            }
            if (blockingObs) break;
        }

        if (!blockingObs) return null;

        const margins = [enemyRadius + 14, enemyRadius + 28, 68];
        const corners = [];
        const signs = [
            { sx: -1, sy: -1, bx: blockingObs.x, by: blockingObs.y },
            { sx: 1, sy: -1, bx: blockingObs.x + blockingObs.w, by: blockingObs.y },
            { sx: 1, sy: 1, bx: blockingObs.x + blockingObs.w, by: blockingObs.y + blockingObs.h },
            { sx: -1, sy: 1, bx: blockingObs.x, by: blockingObs.y + blockingObs.h }
        ];

        for (let c = 0; c < 4; c++) {
            const cs = signs[c];
            let added = false;
            for (let m = 0; m < margins.length; m++) {
                const pt = resolveWallOverlap(
                    cs.bx + cs.sx * margins[m],
                    cs.by + cs.sy * margins[m],
                    enemyRadius + 2
                );
                if (!checkWall(pt.x, pt.y, enemyRadius)) {
                    corners.push(pt);
                    added = true;
                    break;
                }
            }
            if (!added) {
                corners.push(null);
            }
        }

        let bestPath = null;
        let bestScore = Infinity;

        for (let c = 0; c < 4; c++) {
            const pt = corners[c];
            if (!pt) continue;
            if (canPassClearance(sX, sY, pt.x, pt.y, enemyRadius)) {
                const d1 = Math.hypot(pt.x - sX, pt.y - sY);
                const d2 = Math.hypot(gX - pt.x, gY - pt.y);
                const clearToGoal = canPassClearance(pt.x, pt.y, gX, gY, enemyRadius);
                const score = d1 + d2 + (clearToGoal ? 0 : 250);
                if (score < bestScore) {
                    bestScore = score;
                    bestPath = clearToGoal ? [pt, { x: gX, y: gY }] : [pt];
                }

                const adj = [(c + 1) % 4, (c + 3) % 4];
                for (let k = 0; k < adj.length; k++) {
                    const pt2 = corners[adj[k]];
                    if (!pt2) continue;
                    if (canPassClearance(pt.x, pt.y, pt2.x, pt2.y, enemyRadius)) {
                        const dMid = Math.hypot(pt2.x - pt.x, pt2.y - pt.y);
                        const dEnd = Math.hypot(gX - pt2.x, gY - pt2.y);
                        const clear2 = canPassClearance(pt2.x, pt2.y, gX, gY, enemyRadius);
                        const score2 = d1 + dMid + dEnd + (clear2 ? 0 : 200);
                        if (score2 < bestScore) {
                            bestScore = score2;
                            bestPath = clear2 ? [pt, pt2, { x: gX, y: gY }] : [pt, pt2];
                        }
                    }
                }
            }
        }

        return bestPath;
    }

    findPath(startX, startY, targetX, targetY, enemyRadius = 22, enemyId = -1) {

        const sClean = getAccessibleTargetPoint(startX, startY, enemyRadius + 1);
        const gClean = getAccessibleTargetPoint(targetX, targetY, enemyRadius + 1);
        const sX = sClean.x;
        const sY = sClean.y;
        const gX = gClean.x;
        const gY = gClean.y;

        if (canPassClearance(sX, sY, gX, gY, enemyRadius)) {
            if (enemyId !== -1) this.pendingQueue.delete(enemyId);
            return { status: 'found', path: [{ x: gX, y: gY }] };
        }

        if (state.frameCount !== this.lastFrame) {
            this.lastFrame = state.frameCount;
            this.recalcsThisFrame = 0;
        }

        const isQueued = enemyId !== -1 && this.pendingQueue.has(enemyId);
        const unreservedSlots = Math.max(0, this.MAX_RECALCS_PER_FRAME - this.pendingQueue.size);
        let canProceed = false;

        if (this.recalcsThisFrame < this.MAX_RECALCS_PER_FRAME) {
            if (isQueued) {
                canProceed = true;
            } else if (this.recalcsThisFrame < unreservedSlots) {
                canProceed = true;
            }
        }

        if (!canProceed) {
            if (enemyId !== -1) {
                if (this.pendingQueue.has(enemyId)) {
                    this.pendingQueue.delete(enemyId);
                }
                this.pendingQueue.add(enemyId);
            }
            return { status: 'postponed' };
        }

        if (isQueued) {
            this.pendingQueue.delete(enemyId);
        }
        this.recalcsThisFrame++;

        if (this.waypoints.length === 0 || (!this.isInGraphSector(sX, sY) && !this.isInGraphSector(gX, gY))) {
            const bypass = this._findLocalBypass(sX, sY, gX, gY, enemyRadius);
            if (bypass) {
                return { status: 'found', path: bypass };
            }
            return { status: 'unreachable' };
        }

        const startWps = [];
        let nearestStartWp = -1;
        let minDistStart = Infinity;

        for (let i = 0; i < this.waypoints.length; i++) {
            const wp = this.waypoints[i];
            const d = Math.hypot(wp.x - sX, wp.y - sY);
            if (d < 850 && canPassClearance(sX, sY, wp.x, wp.y, enemyRadius)) {
                startWps.push({ id: i, dist: d });
            }
            if (d < minDistStart && !checkWall(wp.x, wp.y, enemyRadius)) {
                minDistStart = d;
                nearestStartWp = i;
            }
        }
        if (startWps.length === 0 && nearestStartWp !== -1) {
            if (canPassClearance(sX, sY, this.waypoints[nearestStartWp].x, this.waypoints[nearestStartWp].y, enemyRadius)) {
                startWps.push({ id: nearestStartWp, dist: minDistStart });
            }
        }

        const goalWps = [];
        let nearestGoalWp = -1;
        let minDistGoal = Infinity;

        for (let i = 0; i < this.waypoints.length; i++) {
            const wp = this.waypoints[i];
            const d = Math.hypot(wp.x - gX, wp.y - gY);
            if (d < 850 && canPassClearance(gX, gY, wp.x, wp.y, enemyRadius)) {
                goalWps.push({ id: i, dist: d });
            }
            if (d < minDistGoal && !checkWall(wp.x, wp.y, enemyRadius)) {
                minDistGoal = d;
                nearestGoalWp = i;
            }
        }
        if (goalWps.length === 0 && nearestGoalWp !== -1) {
            if (canPassClearance(gX, gY, this.waypoints[nearestGoalWp].x, this.waypoints[nearestGoalWp].y, enemyRadius)) {
                goalWps.push({ id: nearestGoalWp, dist: minDistGoal });
            }
        }

        if (startWps.length === 0 || goalWps.length === 0) {
            const bypass = this._findLocalBypass(sX, sY, gX, gY, enemyRadius);
            if (bypass) {
                return { status: 'found', path: bypass };
            }
            return { status: 'unreachable' };
        }

        const goalSet = new Set(goalWps.map(g => g.id));

        const openSet = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        const getG = (id) => gScore.has(id) ? gScore.get(id) : Infinity;
        const getF = (id) => fScore.has(id) ? fScore.get(id) : Infinity;

        for (let s = 0; s < startWps.length; s++) {
            const sid = startWps[s].id;
            const cost = startWps[s].dist;
            gScore.set(sid, cost);
            fScore.set(sid, cost + Math.hypot(this.waypoints[sid].x - gX, this.waypoints[sid].y - gY));
            openSet.add(sid);
        }

        let bestGoal = -1;

        while (openSet.size > 0) {
            let current = -1;
            let lowestF = Infinity;
            for (const id of openSet) {
                const f = getF(id);
                if (f < lowestF) {
                    lowestF = f;
                    current = id;
                }
            }

            if (current === -1) break;

            if (goalSet.has(current)) {
                bestGoal = current;
                break;
            }

            openSet.delete(current);
            const neighbors = this.edges.get(current) || [];

            for (let n = 0; n < neighbors.length; n++) {
                const neighbor = neighbors[n];
                if (enemyRadius > neighbor.clearance) {
                    continue;
                }

                const tentativeG = getG(current) + neighbor.dist;
                if (tentativeG < getG(neighbor.to)) {
                    cameFrom.set(neighbor.to, current);
                    gScore.set(neighbor.to, tentativeG);
                    const h = Math.hypot(this.waypoints[neighbor.to].x - gX, this.waypoints[neighbor.to].y - gY);
                    fScore.set(neighbor.to, tentativeG + h);
                    openSet.add(neighbor.to);
                }
            }
        }

        if (bestGoal === -1) {
            const bypass = this._findLocalBypass(sX, sY, gX, gY, enemyRadius);
            if (bypass) {
                return { status: 'found', path: bypass };
            }
            return { status: 'unreachable' };
        }

        const path = [{ x: gX, y: gY }];
        let curr = bestGoal;
        while (curr !== undefined) {
            path.unshift({ x: this.waypoints[curr].x, y: this.waypoints[curr].y });
            curr = cameFrom.get(curr);
        }

        return { status: 'found', path };
    }

    getSearchWaypoint(x, y, enemyRadius = 22, lastWpId = -1, seed = 0) {
        const clean = resolveWallOverlap(x, y, enemyRadius + 1);
        const candidates = [];
        for (let i = 0; i < this.waypoints.length; i++) {
            if (i === lastWpId) continue;
            const wp = this.waypoints[i];
            const d = Math.hypot(wp.x - clean.x, wp.y - clean.y);
            if (d > 90 && d < 750 && canPassClearance(clean.x, clean.y, wp.x, wp.y, enemyRadius)) {
                candidates.push(wp);
            }
        }
        if (candidates.length > 0) {
            return candidates[Math.abs(seed) % candidates.length];
        }
        return null;
    }

    findEscapeWaypoint(x, y, targetX, targetY, enemyRadius = 22) {
        const clean = resolveWallOverlap(x, y, enemyRadius + 1);
        let bestWp = null;
        let bestScore = Infinity;

        for (let i = 0; i < this.waypoints.length; i++) {
            const wp = this.waypoints[i];
            const dFromMe = Math.hypot(wp.x - clean.x, wp.y - clean.y);
            if (dFromMe > 35 && dFromMe < 800 && canPassClearance(clean.x, clean.y, wp.x, wp.y, enemyRadius)) {
                const dToGoal = Math.hypot(targetX - wp.x, targetY - wp.y);
                const score = dFromMe * 0.6 + dToGoal;
                if (score < bestScore) {
                    bestScore = score;
                    bestWp = wp;
                }
            }
        }
        if (bestWp) {
            return { x: bestWp.x, y: bestWp.y };
        }

        const bypass = this._findLocalBypass(clean.x, clean.y, targetX, targetY, enemyRadius);
        if (bypass && bypass.length > 0) {
            return bypass[0];
        }
        return null;
    }
}

export const NavigationSystem = new NavigationManager();
