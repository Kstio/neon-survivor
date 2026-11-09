const COLOR = {
    mint: '#83e3c9',
    amber: '#ffca86',
    ice: '#90d8f4',
    lilac: '#c1acfa',
    coral: '#ffac9d',
    rose: '#f9adc7',
    alloy: '#a1b7bd',
    green: '#b2dead'
};

const ICONS = {
    multi: {
        tone: 'amber',
        plate: 'M4 12H9L13 16L9 20H4L8 16Z',
        core: 'M12 6L15 4L23 8L25 12L20 12Z M14 14H24L29 16L24 18H14Z M12 26L20 20H25L23 24L15 28Z'
    },
    gatling: {
        tone: 'amber',
        plate: 'M3 17L5 11L18 6L25 8L29 16L26 23L12 27L6 24Z M16 12L20 8L25 9L28 16L25 22L20 24L16 20Z',
        ink: 'M5 15L13 12M7 22L13 20',
        core: 'M19 13a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0 M18.5 18.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0 M23.3 16a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0'
    },
    rear: {
        tone: 'amber',
        plate: 'M14 10L20 7L26 9L29 15L26 22L20 25L14 21L12 16Z',
        ink: 'M23 10L26 15L23.5 20M11 11L6 9M11 21L6 23',
        core: 'M15 13H8V10L2 16L8 22V19H15Z'
    },
    fortress: {
        tone: 'amber',
        plate: 'M13 7H19V10H23V6H27L29 11V21L23 26H15L10 22V12Z',
        core: 'M13 12L6 8L3 9L5 12L12 16Z M13 15H5L2 17L5 19H13Z M13 19L5 22L3 25L7 25L14 22Z',
        shine: 'M18 14H24M18 18H24M18 22H21'
    },
    fatboy: {
        tone: 'lilac',
        plate: 'M5 18L15 8Q20 3 27 5Q28 12 23 17L13 27L5 25Z',
        ink: 'M10 14L18 22M7 17L15 25',
        core: 'M19 9Q22 6 25 7Q25 11 21 14L18 12Z'
    },
    blackhole: {
        tone: 'lilac',
        plate: 'M7 19C4 13 9 6 15 6C21 5 25 9 26 14L22 16C22 11 18 9 15 10C11 10 9 14 10 17Z M7 20L11 18C13 23 21 22 24 17L28 15C28 24 16 31 9 24Z',
        ink: 'M3 23Q14 19 29 10',
        shine: 'M11 21Q17 19 23 16'
    },
    boomerang: {
        tone: 'mint',
        plate: 'M3 12L13 9L26 4L26 8L19 17L15 28L12 27L12 18Z',
        ink: 'M7 12L14 14L22 8',
        shine: 'M14 18L14 23'
    },
    thunder_blade: {
        tone: 'mint',
        plate: 'M2 13L12 10L27 4L25 9L18 18L14 28L11 27L12 18Z',
        core: 'M10 3L10 7L6 8L8 12L3 9L5 6L3 5Z M27 15L23 21L27 20L21 29L22 23L18 24Z',
        shine: 'M7 13L14 14L21 9'
    },
    katana: {
        tone: 'mint',
        plate: 'M11 20C17 15 24 8 27 3C26 12 21 18 14 23Z',
        ink: 'M8 18L16 25M5 28L11.5 21',
        shine: 'M6 25L8 27'
    },
    dimension_cut: {
        tone: 'mint',
        core: 'M4 24Q13 14 17 4Q16 16 7 25Z M8 27Q18 16 24 4Q23 16 12 27Z M15 28Q23 21 28 13Q26 23 18 28Z',
        shine: 'M3 11L10 14M16 17L23 20M25 21L28 22'
    },
    plasma_shot: {
        tone: 'coral',
        plate: 'M4 24C8 17 9 12 15 8C19 5 24 6 26 9C29 14 24 20 20 22C14 25 10 22 4 26Z',
        core: 'M14 18C12 14 16 9 20 10C23 10 23 14 21 17C19 20 17 20 14 18Z',
        shine: 'M7 19L3 21M9 25L6 28'
    },
    supernova: {
        tone: 'coral',
        plate: 'M16 3L19 11L25 8L22 14L29 17L22 19L24 26L18 22L14 29L12 22L5 25L9 18L2 15L10 13L8 6L14 10Z',
        core: 'M19 12Q23 16 18 20Q14 23 12 19Q10 16 13 13Q16 10 19 12Z',
        shine: 'M4 6L7 8M24 5L27 3M26 24L29 26'
    },
    cryo_beam: {
        tone: 'ice',
        plate: 'M7 21L5 17L24 4L19 13Z M11 23L10 20L28 15L20 21Z',
        core: 'M4 21L10 26L6 28L2 24Z',
        shine: 'M13 25L21 24M7 12L12 8'
    },
    absolute_zero: {
        tone: 'ice',
        plate: 'M16 3L25 8L15 14L10 9Z M26 10L28 20L20 26L18 18Z M16 19L17 29L7 24L4 15Z',
        ink: 'M6 6L9 8M25 24L28 27',
        shine: 'M11 20L6 17M21 11L24 9M13 9L16 6'
    },
    aura: {
        tone: 'rose',
        plate: 'M16 10L21 16L16 22L11 16Z',
        ink: 'M9 8C3 12 3 20 9 24M23 8C29 12 29 20 23 24',
        shine: 'M11 5Q16 2 21 5M11 27Q16 30 21 27'
    },
    blood_circle: {
        tone: 'rose',
        plate: 'M16 5C15 10 9 14 9 19C9 24 13 26 16 26C21 26 24 23 23 18C22 14 18 10 16 5Z',
        ink: 'M7 8C2 13 2 21 7 25M25 8C30 13 30 21 25 25',
        shine: 'M14 22Q18 24 20 20'
    },
    orbit: {
        tone: 'ice',
        plate: 'M16 11L20 14V19L16 22L12 19V14Z M21 5L26 4L28 8L23 10Z',
        ink: 'M20 7C13 8 4 14 3 21C2 28 17 25 25 16Q28 13 28 11',
        core: 'M6 21a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0'
    },
    neural: {
        tone: 'ice',
        plate: 'M14 3H19L20 7L16 10L12 7Z M3 20L8 17L12 21L10 25H5Z M21 21L25 17L29 20L27 26H22Z',
        ink: 'M7 15L12 9M20 9L25 15M12 25H20',
        core: 'M16 11L20 16L16 20L12 16Z'
    },
    mines: {
        tone: 'green',
        plate: 'M10 10H21L26 15V22L21 25H10L6 22V15Z',
        ink: 'M9 11L6 7M22 11L25 7M5 17H3M27 17H29M9 25L7 28M22 25L24 28',
        core: 'M11 18L14 14H19L22 18Z',
        shine: 'M12 21H19'
    },
    vacuum: {
        tone: 'green',
        plate: 'M12 11H20L23 15V20L19 23H13L9 20V15Z',
        ink: 'M4 5L9 10M5 10H9V6M28 5L23 10M23 6V10H27M16 29V24M13 27L16 24L19 27',
        core: 'M13 14H19L20 16H12Z',
        shine: 'M13 19H19'
    },
    laser: {
        tone: 'coral',
        plate: 'M3 24L9 16L16 21L9 29Z M10 15L13 12L20 17L17 20Z',
        ink: 'M17 13L27 3',
        shine: 'M20 14L28 6'
    },
    deathray: {
        tone: 'coral',
        plate: 'M2 23L7 16L13 18L17 23L9 29Z M10 15L12 12L21 19L18 22Z',
        core: 'M14 12L24 2L28 2L18 15Z M19 16L29 6L29 10L21 18Z',
        shine: 'M8 23L11 25'
    },
    nanite_swarm: {
        tone: 'lilac',
        plate: 'M5 11L10 8L15 11V17L10 20L5 17Z M18 6L21 4L25 6V10L21 12L18 10Z M16 20L20 17L25 20V25L20 28L16 25Z',
        core: 'M8 13L10 12L12 13V15L10 16L8 15Z M19 21H22V24H19Z'
    },
    devourer: {
        tone: 'lilac',
        plate: 'M6 12L13 7L20 10L23 14L18 15L16 12L11 15L13 21L17 21L20 18L24 17L23 22L17 27L8 24L4 18Z',
        core: 'M19 4L26 3L23 8Z M25 12L28 10L30 14L27 16Z M11 16L14 15L16 18L13 20Z'
    },
    tesla: {
        tone: 'ice',
        plate: 'M6 26L9 22H18L21 26V28H6Z M9 7L13 4L18 7V10H9Z',
        ink: 'M13 11V21M8 13H18M7 17H19M9 20H17',
        core: 'M25 3L20 13H24L21 21L30 9H25Z'
    },

    dmg: {
        tone: 'amber',
        plate: 'M4 21L16 7L19 16L14 17L8 25H4Z M15 22L22 12L27 16L20 25Z',
        shine: 'M22 7L25 4M26 10L29 9'
    },
    spd: {
        tone: 'amber',
        plate: 'M4 20V12H8V20Z M12 24V8H16V24Z M20 26V6H24V26Z',
        ink: 'M3 27H9M25 4H29',
        shine: 'M13 10V14M21 8V12'
    },
    sniper: {
        tone: 'ice',
        plate: 'M16 6A10 10 0 1 1 15.99 6Z',
        ink: 'M16 3V10M22 16H29M16 22V29M3 16H10',
        core: 'M14 16a2 2 0 1 0 4 0a2 2 0 1 0 -4 0'
    },
    crit: {
        tone: 'rose',
        plate: 'M15 4L18 11L25 7L22 14L29 17L22 19L23 25L17 22L12 29L12 22L5 24L9 18L3 14L11 13Z',
        core: 'M12 18L18 12L20 14L14 20Z'
    },
    hp: {
        tone: 'mint',
        plate: 'M12 4H20V11H27V20H20V27H12V20H5V11H12Z',
        shine: 'M15 8H17M8 15V17M15 23H17'
    },
    regen: {
        tone: 'mint',
        core: 'M14 10H18V14H22V18H18V22H14V18H10V14H14Z',
        ink: 'M5 14Q6 5 16 5Q22 5 26 10M26 5V10H21M27 18Q25 27 16 27Q10 27 6 22M6 27V22H11'
    },
    shield: {
        tone: 'ice',
        plate: 'M16 3Q21 7 27 7V15Q26 23 16 29Q6 23 5 15V7Q11 7 16 3Z',
        core: 'M16 8V23Q22 19 23 15V10Z'
    },
    armor: {
        tone: 'alloy',
        plate: 'M4 9L16 4L28 9L16 15Z M4 14L16 20L28 14V18L16 24L4 18Z',
        ink: 'M5 22L16 28L27 22'
    },
    dodge: {
        tone: 'mint',
        plate: 'M15 24L20 11L28 7L26 16Z',
        ink: 'M4 24Q10 24 10 16T18 6M14 5L18 6L16 10',
        shine: 'M5 19L6 15'
    },
    speed: {
        tone: 'mint',
        plate: 'M15 5L28 16L15 27L20 16Z',
        core: 'M7 8L16 16L7 24L10 16Z',
        shine: 'M3 12H6M2 20H5'
    },
    vamp: {
        tone: 'rose',
        plate: 'M16 4C15 10 8 15 8 20C8 25 12 28 16 28C22 28 26 22 23 17C21 13 17 8 16 4Z',
        ink: 'M3 8L6 10L7 15M28 6L25 9L24 12',
        shine: 'M12 22Q15 26 19 22'
    },
    mag: {
        tone: 'ice',
        plate: 'M6 6H12V17C12 23 20 23 20 17V6H26V17C26 31 6 31 6 17Z',
        shine: 'M7 12H11M21 12H25'
    },
    exp: {
        tone: 'lilac',
        plate: 'M12 12L16 9L20 12V18L16 21L12 18Z',
        ink: 'M16 8V5H23M11 14H6V9M21 16H26V22M15 22V26H8',
        core: 'M22 3H26V7H22Z M4 6H8V10H4Z M24 21H28V25H24Z M5 24H9V28H5Z'
    },

    'meta:startHp': {
        tone: 'mint',
        plate: 'M7 8L10 5H24V23L20 27H7Z',
        core: 'M14 10H18V14H22V18H18V22H14V18H10V14H14Z',
        shine: 'M3 11H6M3 16H6M3 21H6M25 10H28M25 16H28M25 21H28'
    },
    'meta:startDmg': {
        tone: 'amber',
        plate: 'M5 22L17 7L23 9L26 15L12 27L6 27Z',
        ink: 'M9 18L15 23M12 14L19 20M15 10L22 17',
        shine: 'M24 6L27 3M27 10L30 8'
    },
    'meta:startGreed': {
        tone: 'amber',
        plate: 'M4 16L10 10H21L25 14L19 21H8Z M6 21L9 24H20L27 17V21L20 28H9L5 24Z',
        core: 'M10 16L13 13H18L16 17H11Z',
        shine: 'M21 4V7M26 6L24 8'
    },
    'meta:speed': {
        tone: 'mint',
        plate: 'M3 19L7 15L13 16L16 20L15 24L11 28H6L3 25Z M17 7L20 4H25L29 8V13L25 17H20L17 14Z',
        ink: 'M12 17L18 10M15 21L22 15',
        core: 'M6.5 21a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0 M20.5 10a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0'
    },
    'meta:shield': {
        tone: 'amber',
        plate: 'M4 8V5H13V18L9 22L4 17Z M12 10V7H21V21L16 25L12 21Z M20 12V9H28V23L24 27L20 23Z',
        shine: 'M7 9H10M15 11H18M23 13H26'
    },
    'meta:magnet': {
        tone: 'ice',
        plate: 'M13 24L16 10L19 24L22 27H10Z',
        ink: 'M10 9Q6 13 10 17M22 9Q26 13 22 17M7 5Q1 12 6 20M25 5Q31 12 26 20',
        shine: 'M12 27H20'
    },
    'meta:crit': {
        tone: 'rose',
        plate: 'M7 7H21L25 11V25H11L7 21Z',
        core: 'M17 9L18 14L23 16L18 18L16 23L14 18L10 16L15 14Z',
        shine: 'M11 3V6M17 3V6M22 26V29M16 26V29M3 12H6M26 20H29'
    },
    'meta:regen': {
        tone: 'mint',
        plate: 'M22 4L20 10L23 13L28 10Q29 17 23 19L19 19L10 28L5 27L5 23L15 14C14 8 17 5 22 4Z',
        ink: 'M7 5V12M3.5 8.5H10.5',
        shine: 'M8 24L10 22'
    },
    'ability:dash': {tone:'mint', core:'M4 23L15 8H22L13 19H19L12 25Z', ink:'M22 8H28L20 18M5 15L11 8'},
    'ability:vanguard': {tone:'ice', plate:'M16 3L26 9L23 24L16 29L9 24L6 9Z', core:'M19 7L11 17H16L13 24L22 13H17Z'},
    'ability:mechanist': {tone:'amber', core:'M13 13L16 11L19 13V17L16 19L13 17Z', ink:'M10 10Q4 16 10 22M22 10Q28 16 22 22M6 6Q-2 16 6 26M26 6Q34 16 26 26'},
    'ability:phantom': {tone:'rose', plate:'M5 23L15 9L11 20Z M15 22L27 6L24 18Z', ink:'M4 26L13 23M19 24L26 21', shine:'M19 16L24 11'},
    'ability:colossus': {tone:'mint', plate:'M16 5L23 12L16 20L9 12Z', ink:'M4 18L11 22L16 25L22 21L28 18M5 24L15 29L27 24', shine:'M12 12L16 8L20 12'},
    unknown: {
        tone: 'alloy',
        plate: 'M7 13H25V23L22 26H7Z',
        ink: 'M11 13V10A5 5 0 0 1 21 10V13',
        core: 'M14.5 18a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0 M15 18H17V22H15Z'
    }
};

const paths = new Map();

function getPath(data) {
    if (!paths.has(data)) paths.set(data, new Path2D(data));
    return paths.get(data);
}

export function drawModuleIcon(canvas, id, size = 40) {
    const logicalSize = Number.isFinite(size) && size > 0 ? size : 40;
    const pixelRatio = Math.min(3, Math.max(1, globalThis.devicePixelRatio || 1));
    const pixels = Math.max(1, Math.round(logicalSize * pixelRatio));
    canvas.width = pixels;
    canvas.height = pixels;
    canvas.classList?.add('module-icon');
    canvas.setAttribute?.('aria-hidden', 'true');
    if (canvas.style) {
        canvas.style.position = 'static';
        canvas.style.width = logicalSize + 'px';
        canvas.style.height = logicalSize + 'px';
        canvas.style.flexShrink = '0';
        canvas.style.zIndex = 'auto';
        canvas.style.imageRendering = 'auto';
    }

    const ctx = canvas.getContext?.('2d');
    if (!ctx) return canvas;
    const icon = Object.hasOwn(ICONS, id) ? ICONS[id] : ICONS.unknown;
    const tone = COLOR[icon.tone];
    ctx.save();
    ctx.setTransform(pixels / 32, 0, 0, pixels / 32, 0, 0);
    ctx.clearRect(0, 0, 32, 32);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (typeof Path2D === 'undefined') {
        ctx.strokeStyle = COLOR.alloy;
        ctx.lineWidth = 2;
        ctx.strokeRect(7, 13, 18, 13);
        ctx.beginPath();
        ctx.arc(16, 12, 5, Math.PI, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        return canvas;
    }
    if (icon.plate) {
        const body = getPath(icon.plate);
        ctx.fillStyle = tone + '35';
        ctx.fill(body);
        ctx.strokeStyle = tone;
        ctx.lineWidth = 1.55;
        ctx.stroke(body);
    }
    if (icon.ink) {
        ctx.strokeStyle = tone;
        ctx.lineWidth = 1.9;
        ctx.stroke(getPath(icon.ink));
    }
    if (icon.core) {
        ctx.fillStyle = tone;
        ctx.fill(getPath(icon.core));
    }
    if (icon.shine) {
        ctx.strokeStyle = '#e4efea';
        ctx.lineWidth = 1.35;
        ctx.stroke(getPath(icon.shine));
    }
    ctx.restore();
    return canvas;
}

export function makeModuleIcon(id, size = 40) {
    return drawModuleIcon(document.createElement('canvas'), id, size);
}
