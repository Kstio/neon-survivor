import { state } from '../GameState.js';
import { WORLD_SIZE, SCREEN_W, SCREEN_H } from '../constants.js';

const DISTRICTS = [
    { floor: '#112129', line: '#1d333b', detail: '#32505b' },
    { floor: '#1c2323', line: '#2a3331', detail: '#495046' },
    { floor: '#222027', line: '#302d34', detail: '#4b4144' },
    { floor: '#182523', line: '#243530', detail: '#334940' }
];

export function drawGrid(ctx) {
    const sw=SCREEN_W(), sh=SCREEN_H(), cam=state.camera;
    const half=WORLD_SIZE/2, step=144;
    for (let i=0;i<DISTRICTS.length;i++) {
        const x=(i%2)*half-cam.x, y=Math.floor(i/2)*half-cam.y;
        const left=Math.max(0,x), right=Math.min(sw,x+half);
        const top=Math.max(0,y), bottom=Math.min(sh,y+half);
        if (left>=right || top>=bottom) continue;
        const theme=DISTRICTS[i];
        ctx.fillStyle=theme.floor;ctx.fillRect(left,top,right-left,bottom-top);
        ctx.save();
        ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();
        ctx.lineWidth=1;ctx.strokeStyle=theme.line;ctx.beginPath();
        for(let gx=left-((cam.x+left)%step);gx<right;gx+=step) {
            ctx.moveTo(gx,top);ctx.lineTo(gx,bottom);
        }
        for(let gy=top-((cam.y+top)%step);gy<bottom;gy+=step) {
            ctx.moveTo(left,gy);ctx.lineTo(right,gy);
        }
        ctx.stroke();ctx.strokeStyle=theme.detail;ctx.beginPath();
        for(let gx=left-((cam.x+left)%(step*2));gx<right;gx+=step*2) {
            for(let gy=top-((cam.y+top)%(step*2));gy<bottom;gy+=step*2) {
                if(i===0) {ctx.rect(gx+16,gy+16,18,7);}
                if(i===1) for(let n=0;n<3;n++){ctx.moveTo(gx+6*n,gy+12);ctx.lineTo(gx+6*n+5,gy+6);}
                if(i===2) {ctx.moveTo(gx+3,gy+4);ctx.lineTo(gx+12,gy+13);ctx.lineTo(gx+17,gy+10);}
                if(i===3) {ctx.moveTo(gx+6,gy);ctx.lineTo(gx+14,gy);ctx.moveTo(gx+10,gy-4);ctx.lineTo(gx+10,gy+4);}
            }
        }
        ctx.stroke();ctx.restore();
    }
}

export function beginShakeFrame() {
    let x = 0, y = 0;
    if (state.camera.shakeTimer > 0) {
        x = (Math.random() - 0.5) * 2 * state.camera.shakeIntensity;
        y = (Math.random() - 0.5) * 2 * state.camera.shakeIntensity;
        state.camera.x += x;
        state.camera.y += y;
        state.camera.shakeTimer--;
        state.camera.shakeIntensity *= 0.92;
        if (state.camera.shakeTimer <= 0) state.camera.shakeIntensity = 0;
    }
    return { x, y };
}

export function endShakeFrame(shake) {
    if (shake.x !== 0 || shake.y !== 0) {
        state.camera.x -= shake.x;
        state.camera.y -= shake.y;
    }
}

export function drawDirectorEvents(ctx) {
    if (state.directorEvents) {
        for (let i = 0; i < state.directorEvents.length; i++) {
            state.directorEvents[i].draw(ctx);
        }
    }
    if (state.convoyDrones) {
        for (let i = 0; i < state.convoyDrones.length; i++) {
            state.convoyDrones[i].draw(ctx);
        }
    }
}
