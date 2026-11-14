import { faceOval } from './measurement.js';

export function drawFaceOverlay(canvas, source, result) {
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(source,0,0,canvas.width,canvas.height);
  if(!result) return;
  const p=result.landmarks.map(p=>[p.x*canvas.width,p.y*canvas.height]);
  ctx.lineWidth=Math.max(.6,canvas.width/1000);
  for(const tri of result.skinTriangles) {
    ctx.beginPath(); tri.forEach((id,i)=>ctx[i?'lineTo':'moveTo'](...p[id]));ctx.closePath();
    ctx.fillStyle='rgba(70,174,137,.19)';ctx.strokeStyle='rgba(29,104,77,.2)';ctx.fill();ctx.stroke();
  }
  ctx.beginPath(); faceOval.forEach((id,i)=>ctx[i?'lineTo':'moveTo'](...p[id]));ctx.closePath();
  ctx.strokeStyle='#ff8c35';ctx.lineWidth=Math.max(2,canvas.width/300);ctx.stroke();
  ctx.strokeStyle='#ff5e1f';
  for(const [a,b] of [[469,471],[474,476]]) {ctx.beginPath();ctx.moveTo(...p[a]);ctx.lineTo(...p[b]);ctx.stroke();}
}

export function fingerSVG(guide) {
  // Every row has the same displayed joint length; overlong strips continue on another row.
  const rowCount=Math.ceil(guide.joints/3);
  const rows=Array.from({length:rowCount},(_,i)=>{
    const fraction=Math.min(3,guide.joints-i*3), y=40+i*100;
    const end=40+fraction*100;
    return `<g transform="translate(0 ${y})"><path d="M360 0H73C29 0 20 65 73 65h287" fill="#fff8f2" stroke="#c3aaa0" stroke-width="1.3"/><path d="M140 13q-7 20 0 40m100-40q-7 20 0 40m100-40q-7 20 0 40" fill="none" stroke="#d8c1b5"/><path d="M43 33H${end.toFixed(2)}" stroke="#ff5e1f" stroke-width="9" stroke-linecap="round"/><path d="M40 83v-6m100 6v-6m100 6v-6m100 6v-6" stroke="#a3a3a3"/><text x="40" y="101" fill="#777" font-size="9">손끝</text><text x="140" y="101" text-anchor="middle" fill="#777" font-size="9">1마디</text><text x="240" y="101" text-anchor="middle" fill="#777" font-size="9">2마디</text><text x="340" y="101" text-anchor="middle" fill="#777" font-size="9">3마디</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 390 ${rowCount*100+55}" aria-hidden="true">${rows}</svg>`;
}
