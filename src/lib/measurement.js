import { triangles } from './topology.js';

export const faceOval = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const excludedContours = [
  [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185],
  [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246],
  [263,249,390,373,374,380,381,382,362,398,384,385,386,387,388,466],
];
const distance = (a,b) => Math.hypot(a[0]-b[0], a[1]-b[1]);
const irisDiameters = points => [distance(points[469],points[471]),distance(points[474],points[476])];

// Current-frame diagnostics use the exact same scale and area calculation as the dose guide.
// Keep the raw iris pixels visible even when the area fails its quality checks.
export function getLiveFaceMeasurement(faces,width,height) {
  const empty = {irisPx:null,irisDiametersPx:[],areaCm2:null};
  if(!Array.isArray(faces)||!faces.length) return {...empty,reason:'얼굴을 정면으로 비춰 주세요.'};
  if(faces.length!==1) return {...empty,reason:'한 사람만 화면에 들어오게 해 주세요.'};
  const landmarks=faces[0];
  if(!Array.isArray(landmarks)||landmarks.length<478 ||
    ![width,height].every(n=>Number.isFinite(n)&&n>0) ||
    !landmarks.every(p=>p&&[p.x,p.y,p.z].every(Number.isFinite))) {
    return {...empty,reason:'얼굴과 양쪽 홍채 좌표를 읽지 못했습니다.'};
  }
  const irises=irisDiameters(landmarks.map(p=>[p.x*width,p.y*height]));
  const irisPx=(irises[0]+irises[1])/2;
  const current={irisPx,irisDiametersPx:irises,areaCm2:null};
  try { return {...current,areaCm2:estimateFace(landmarks,width,height).areaCm2,reason:''}; }
  catch(error) { return {...current,reason:error.message}; }
}
export function triangleAreaCm2(a,b,c) {
  const u=b.map((v,i)=>v-a[i]), v=c.map((n,i)=>n-a[i]);
  return Math.hypot(u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0])/200;
}
export function pointInPolygon([x,y], polygon) {
  let hit=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];
    if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) hit=!hit;
  }
  return hit;
}
export function estimateFace(landmarks,width,height) {
  if(!Array.isArray(landmarks)||landmarks.length<478) throw new Error('얼굴과 양쪽 홍채가 보이는 사진을 선택해 주세요.');
  if(![width,height].every(n=>Number.isFinite(n)&&n>0) || !landmarks.every(p=>[p.x,p.y,p.z].every(Number.isFinite))) throw new Error('얼굴 좌표를 읽지 못했습니다. 다시 촬영해 주세요.');
  const points=landmarks.map(p=>[p.x*width,p.y*height,p.z*width]);
  const irises=irisDiameters(points);
  const irisPx=(irises[0]+irises[1])/2;
  if(Math.min(...irises)<12) throw new Error('홍채가 작게 보입니다. 더 가까이, 더 선명하게 촬영해 주세요.');
  if(Math.abs(irises[0]-irises[1])/irisPx>.2) throw new Error('양쪽 홍채 크기가 다르게 보입니다. 정면을 바라봐 주세요.');
  const eyeWidth=distance(points[33],points[263]);
  if(!eyeWidth || Math.abs(points[33][2]-points[263][2])/eyeWidth>.25) throw new Error('얼굴이 옆으로 돌아가 있습니다. 정면으로 다시 촬영해 주세요.');
  if(faceOval.some(i=>landmarks[i].x<.015||landmarks[i].x>.985||landmarks[i].y<.015||landmarks[i].y>.985)) throw new Error('얼굴 윤곽이 잘렸습니다. 얼굴 전체가 보이게 해 주세요.');
  const scale=11.7/irisPx;
  const polygons=excludedContours.map(ids=>ids.map(i=>points[i]));
  const skinTriangles=triangles.filter(t=>{
    const center=[0,1].map(axis=>t.reduce((s,i)=>s+points[i][axis],0)/3);
    return !polygons.some(poly=>pointInPolygon(center,poly));
  });
  const metric=points.map(p=>p.map(n=>n*scale));
  const areaCm2=skinTriangles.reduce((sum,t)=>sum+triangleAreaCm2(...t.map(i=>metric[i])),0);
  if(!Number.isFinite(areaCm2)||areaCm2<50||areaCm2>900) throw new Error('안정적인 면적을 얻지 못했습니다. 밝은 곳에서 정면 사진으로 다시 시도해 주세요.');
  return {widthCm:distance(points[234],points[454])*scale/10,
    heightCm:distance(points[10],points[152])*scale/10, areaCm2,doseGrams:areaCm2*.002,
    irisPx,irisDisagreement:Math.abs(irises[0]-irises[1])/irisPx,
    areaSensitivity:[11.2,12.2].map(d=>areaCm2*(d/11.7)**2),
    landmarks,skinTriangles};
}
