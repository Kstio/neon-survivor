export class ObjectPool {
    constructor(factory) {
        this.factory = factory;
        this.free = [];
    }

    acquire(...args) {
        let obj = this.free.pop();
        if (obj) {
            obj.reset(...args);
        } else {
            obj = this.factory(...args);
        }
        obj.active = true;
        return obj;
    }

    release(obj) {
        if (!obj || obj.active === false) return;
        obj.active = false;
        this.free.push(obj);
    }

    get size() {
        return this.free.length;
    }
}
