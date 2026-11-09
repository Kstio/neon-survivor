const WINGS = {
    vanguard: [[13,-9],[-12,-41],[-45,-68],[-30,-28],[-42,-14]],
    mechanist: [[25,-12],[16,-34],[24,-50],[-28,-56],[-36,-38],[-23,-19]],
    phantom: [[43,-5],[-44,-54],[-22,-22],[-58,-13],[-28,-10]],
    colossus: [[34,-11],[42,-37],[12,-54],[-44,-50],[-54,-30],[-36,-13]]
};

function plate(ctx, points, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(points[0][0],points[0][1]);
    for (let i=1;i<points.length;i++) ctx.lineTo(points[i][0],points[i][1]);
    ctx.closePath();
    ctx.fillStyle=fill;
    ctx.fill();
    if (stroke) { ctx.strokeStyle=stroke; ctx.stroke(); }
}

export function drawHull(ctx, id, color, x, y, radius, angle, thrust=0) {
    const wing=WINGS[id] || WINGS.vanguard;
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(angle);
    ctx.scale(radius/67,radius/67);
    ctx.lineWidth=1.8;
    ctx.lineJoin='round';
    for (const side of [-1,1]) {
        ctx.save();
        ctx.scale(1,side);
        plate(ctx,wing,'#223b45','#80a4aa');
        plate(ctx,[wing[0],wing[1],wing[2]],'#5a7376');
        plate(ctx,[[-8,-18],[-26,-34],[-33,-36],[-22,-22]],color);
        if (id==='mechanist') {
            ctx.fillStyle='#182a33';
            ctx.fillRect(-24,-49,30,19);
            ctx.fillStyle=color;
            ctx.fillRect(-19,-46,18,3);
        }
        if (id==='colossus') {
            ctx.fillStyle='#9faeaa'; ctx.fillRect(-8,-43,52,5);
            ctx.fillStyle='#263a42'; ctx.fillRect(-32,-38,29,10);
        }
        const flame=thrust?22+thrust*10:9;
        plate(ctx,[[-38,-6],[-43-flame,-9],[-38,-13]],color);
        plate(ctx,[[-22,-4],[-20,-17],[-44,-17],[-48,-5]],'#13252b','#749093');
        ctx.fillStyle=color; ctx.fillRect(-44,-13,3,6);
        ctx.restore();
    }
    const nose=id==='phantom'?70:id==='colossus'?43:59;
    plate(ctx,[[nose,0],[17,-16],[-28,-18],[-35,-7],[-35,7],[-28,18],[17,16]],'#9babaa','#d3e3dd');
    plate(ctx,[[nose,0],[-31,0],[-28,18],[17,16]],'#52686b');
    plate(ctx,[[31,0],[4,-10],[-9,-7],[-12,0],[-9,7],[4,10]],'#122a32','#789395');
    plate(ctx,[[23,-1],[4,-6],[-3,-4],[8,-1]],color);
    ctx.fillStyle='#284148';
    for(let dx=-25;dx<=-15;dx+=5) ctx.fillRect(dx,-6,2,12);
    ctx.restore();
}

export function drawHangar(canvas,pilot) {
    if (!canvas?.getContext) return;
    const ctx=canvas.getContext('2d'), w=canvas.width, h=canvas.height;
    ctx.clearRect(0,0,w,h);
    const cx=w*0.51, cy=h*0.50;
    ctx.save();
    ctx.lineWidth=1;
    ctx.strokeStyle='#1b333d';
    ctx.beginPath();
    for(let x=0;x<w;x+=24){ctx.moveTo(x,0);ctx.lineTo(x,h);}
    for(let y=0;y<h;y+=24){ctx.moveTo(0,y);ctx.lineTo(w,y);}
    ctx.stroke();
    const r=Math.min(w,h)*0.35;
    ctx.strokeStyle='#37595e';
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
    for(let i=0;i<60;i++){
        const a=i*Math.PI/30, inner=r-(i%5===0?8:3);
        ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*inner,cy+Math.sin(a)*inner);
        ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);ctx.stroke();
    }
    drawHull(ctx,pilot.id,pilot.color,cx,cy,r*0.98,-0.58);
    ctx.restore();
}

const HOSTILES = {
    basic:[[1,0],[0.2,-0.76],[-0.72,-0.69],[-1,0],[-0.72,0.69],[0.2,0.76]],
    runner:[[1,0],[-0.65,-0.85],[-0.34,-0.18],[-0.93,0],[-0.34,0.18],[-0.65,0.85]],
    shooter:[[1,0.13],[0.36,0.13],[0.26,0.75],[-0.77,0.88],[-0.65,0],[-0.77,-0.88],[0.26,-0.75],[0.36,-0.13],[1,-0.13]],
    tank:[[0.96,-0.48],[0.63,-0.86],[-0.65,-0.86],[-0.91,-0.54],[-0.91,0.54],[-0.65,0.86],[0.63,0.86],[0.96,0.48]],
    elite:[[1,0],[0.52,-0.27],[0.64,-0.88],[-0.12,-0.58],[-0.91,-0.74],[-0.54,0],[-0.91,0.74],[-0.12,0.58],[0.64,0.88],[0.52,0.27]],
    dasher:[[1,0],[-0.38,-0.96],[-0.28,-0.48],[-0.93,-0.54],[-0.5,0],[-0.93,0.54],[-0.28,0.48],[-0.38,0.96]],
    kamikaze:[[1,0],[0.22,-0.33],[0,-1],[-0.3,-0.34],[-0.94,-0.54],[-0.56,0],[-0.94,0.54],[-0.3,0.34],[0,1],[0.22,0.33]],
    spitter:[[1,-0.18],[0.42,-0.21],[0.16,-0.83],[-0.64,-0.77],[-1,0],[-0.64,0.77],[0.16,0.83],[0.42,0.21],[1,0.18]],
    stalker:[[1,0],[-0.93,-0.92],[-0.51,-0.16],[-0.81,0],[-0.51,0.16],[-0.93,0.92]],
    shield_bearer:[[0.87,-0.55],[0.46,-0.98],[-0.29,-0.74],[-0.79,-0.55],[-0.79,0.55],[-0.29,0.74],[0.46,0.98],[0.87,0.55]],
    swarmer:[[1,0],[0.17,-0.42],[-0.66,-0.87],[-0.54,0],[-0.66,0.87],[0.17,0.42]],
    titan:[[1,-0.25],[0.72,-0.46],[0.75,-0.76],[0.27,-0.82],[0,-1],[-0.35,-0.78],[-0.8,-0.7],[-0.82,-0.35],[-1,0],[-0.82,0.35],[-0.8,0.7],[-0.35,0.78],[0,1],[0.27,0.82],[0.75,0.76],[0.72,0.46],[1,0.25]]
};

export function drawHostile(ctx,enemy,angle,color) {
    ctx.save();ctx.rotate(angle);ctx.scale(enemy.size,enemy.size);
    ctx.lineWidth=1.5/enemy.size;
    plate(ctx,HOSTILES[enemy.type] || HOSTILES.basic,'#24343c',color);
    plate(ctx,[[0.55,0],[0,-0.29],[-0.39,0],[0,0.29]],color);
    if(enemy.type==='tank'||enemy.type==='titan') {
        ctx.fillStyle=color;
        ctx.fillRect(-0.48,-0.59,0.82,0.10);
        ctx.fillRect(-0.48,0.49,0.82,0.10);
    }
    ctx.restore();
}
