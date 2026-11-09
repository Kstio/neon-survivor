export class SpatialGrid {

    constructor(cellSize = 128) {
        this.cellSize = cellSize;
        this.invCellSize = 1 / cellSize;

        this.cells = new Map();

        this._queryResults = [];
        this._visitedQueryId = 0;
    }

    hash(cx, cy) {
        return ((cx & 0xffff) << 16) | (cy & 0xffff);
    }

    clear() {
        for (const bucket of this.cells.values()) {
            bucket.length = 0;
        }
    }

    insert(entity) {
        const radius = entity.size || entity.radius || entity.r || 8;
        const minX = entity.x - radius;
        const maxX = entity.x + radius;
        const minY = entity.y - radius;
        const maxY = entity.y + radius;

        const minCx = Math.floor(minX * this.invCellSize);
        const maxCx = Math.floor(maxX * this.invCellSize);
        const minCy = Math.floor(minY * this.invCellSize);
        const maxCy = Math.floor(maxY * this.invCellSize);

        for (let cx = minCx; cx <= maxCx; cx++) {
            for (let cy = minCy; cy <= maxCy; cy++) {
                const key = this.hash(cx, cy);
                let bucket = this.cells.get(key);
                if (!bucket) {
                    bucket = [];
                    this.cells.set(key, bucket);
                }
                bucket.push(entity);
            }
        }
    }

    queryBox(minX, minY, maxX, maxY) {
        this._queryResults.length = 0;
        this._visitedQueryId++;
        const qId = this._visitedQueryId;

        const minCx = Math.floor(minX * this.invCellSize);
        const maxCx = Math.floor(maxX * this.invCellSize);
        const minCy = Math.floor(minY * this.invCellSize);
        const maxCy = Math.floor(maxY * this.invCellSize);

        for (let cx = minCx; cx <= maxCx; cx++) {
            for (let cy = minCy; cy <= maxCy; cy++) {
                const bucket = this.cells.get(this.hash(cx, cy));
                if (!bucket) continue;
                const len = bucket.length;
                for (let i = 0; i < len; i++) {
                    const entity = bucket[i];
                    if (entity._gridQueryId !== qId) {
                        entity._gridQueryId = qId;
                        this._queryResults.push(entity);
                    }
                }
            }
        }
        return this._queryResults;
    }

    queryCircle(x, y, radius) {
        return this.queryBox(x - radius, y - radius, x + radius, y + radius);
    }
}
