import test from 'node:test';
import assert from 'node:assert/strict';
import { triangleAreaCm2, estimateFace, pointInPolygon } from '../src/lib/measurement.js';
import { getFingerGuide, product } from '../src/lib/dose.js';

function syntheticFace() {
  const points = Array.from({length:478},(_,i)=>{
    const angle=i/478*Math.PI*2;
    return {x:.5+.23*Math.cos(angle),y:.5+.32*Math.sin(angle),z:-.025*Math.cos(angle)};
  });
  const set=(id,x,y,z=0)=>points[id]={x,y,z};
  set(234,.25,.5); set(454,.75,.5); set(10,.5,.18); set(152,.5,.82);
  set(33,.39,.42); set(263,.61,.42);
  for(const [center,ids] of [[.43,[468,469,470,471,472]],[.57,[473,474,475,476,477]]]) {
    set(ids[0],center,.42);
    set(ids[1],center+.025,.42); set(ids[2],center,.445);
    set(ids[3],center-.025,.42); set(ids[4],center,.395);
  }
  return points;
}

test('right triangle in millimeters converts to square centimeters', () => {
  assert.equal(triangleAreaCm2([0,0,0], [30,0,0], [0,40,0]), 6);
  assert.equal(triangleAreaCm2([0,0,0], [0,0,30], [0,40,0]), 6);
});
test('polygon exclusion recognizes lip interior and keeps outside skin', () => {
  const square = [[0,0],[10,0],[10,10],[0,10]];
  assert.equal(pointInPolygon([5,5], square), true);
  assert.equal(pointInPolygon([11,5], square), false);
});
test('a valid face yields a bounded partial-area dose and keeps iris scale stable across image sizes', () => {
  const landmarks=syntheticFace();
  const normal=estimateFace(landmarks,500,700);
  const doubled=estimateFace(landmarks,1000,1400);
  assert.ok(normal.areaCm2>=50&&normal.areaCm2<=900);
  assert.ok(normal.widthCm>0&&normal.heightCm>0);
  assert.ok(Math.abs(normal.widthCm-11.7)<.01);
  assert.ok(Math.abs(normal.areaCm2-doubled.areaCm2)<1e-9);
  assert.ok(Math.abs(normal.doseGrams-normal.areaCm2*.002)<1e-12);
  assert.equal(normal.skinTriangles.length>0,true);
});
test('invalid or missing face data never produces a dose', () => {
  assert.throws(() => estimateFace([], 493,740), /얼굴/);
  const invalid = Array.from({length:478},()=>({x:NaN,y:0,z:0}));
  assert.throws(() => estimateFace(invalid,493,740), /좌표/);
});
test('a face with no visible iris is rejected instead of dividing by zero', () => {
  const points = Array.from({length:478},()=>({x:.5,y:.5,z:0}));
  assert.throws(() => estimateFace(points,493,740), /홍채/);
});
test('a strong left-right depth difference is rejected as a turned face', () => {
  const points=syntheticFace();
  points[263]={...points[263],z:.15};
  assert.throws(()=>estimateFace(points,500,700),/옆으로/);
});
test('standard strip length stays fixed while personal joint length changes the fraction', () => {
  const a=getFingerGuide(.6,25), b=getFingerGuide(.6,30);
  assert.equal(a.stripMm,30);
  assert.equal(b.stripMm,30);
  assert.equal(a.joints,1.2);
  assert.equal(b.joints,1);
  assert.equal(a.calibrated,false);
  assert.equal(product.calibrated,false);
});
test('invalid grams and hand length cannot become confident guide values', () => {
  for(const grams of [-1, NaN, Infinity]) assert.throws(()=>getFingerGuide(grams,25));
  for(const joint of [0,NaN,Infinity,60]) assert.throws(()=>getFingerGuide(.6,joint));
});
