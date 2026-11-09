export function bindTouchStick(stick, keys, canMove) {
    let owner = null;
    const thumb = stick.querySelector('span');

    function release() {
        if (owner === null) return;
        const id = owner;
        owner = null;
        Object.assign(keys, { w:false, a:false, s:false, d:false });
        thumb.style.transform = '';
        if (stick.hasPointerCapture?.(id)) stick.releasePointerCapture(id);
    }

    function move(event) {
        if (event.pointerId !== owner) return;
        if (!canMove()) { release(); return; }
        const rect = stick.getBoundingClientRect();
        const dx = event.clientX - rect.left - rect.width / 2;
        const dy = event.clientY - rect.top - rect.height / 2;
        const dist = Math.hypot(dx, dy);
        const scale = Math.min(1, (rect.width * .32) / (dist || 1));
        const threshold = Math.max(7, dist * .38);
        keys.a = dx < -threshold; keys.d = dx > threshold;
        keys.w = dy < -threshold; keys.s = dy > threshold;
        thumb.style.transform = `translate(${dx * scale}px,${dy * scale}px)`;
    }
    stick.addEventListener('pointerdown', event => {
        if (owner !== null || !canMove()) return;
        event.preventDefault();
        owner = event.pointerId;
        stick.setPointerCapture(owner);
        move(event);
    });
    stick.addEventListener('pointermove', move);
    for (const name of ['pointerup','pointercancel','lostpointercapture']) {
        stick.addEventListener(name, event => { if (event.pointerId === owner) release(); });
    }
    return release;
}
