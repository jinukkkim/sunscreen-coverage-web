import test from 'node:test';
import assert from 'node:assert/strict';
import { getLiveFaceMeasurement as measure } from '../src/lib/measurement.js';
import { face } from './helpers/landmarks.js';

function landmarks(scale=1) {
  const points=face();
  for(const x of [.43,.57]) points.push(
    {x,y:.42,z:0},{x:x+.02,y:.42,z:0},{x,y:.44,z:0},
    {x:x-.02,y:.42,z:0},{x,y:.40,z:0},
  );
  return points.map(p=>({x:.5+(p.x-.5)*scale,y:.5+(p.y-.5)*scale,z:p.z*scale}));
}

test('live measurements show shrinking iris pixels while proportional face area remains stable',()=>{
  const near=measure([landmarks()],1000,1000),far=measure([landmarks(.5)],1000,1000);
  assert.ok(Math.abs(near.irisPx-40)<1e-6);
  assert.ok(Math.abs(far.irisPx-20)<1e-6);
  assert.ok(near.areaCm2>0);
  assert.ok(Math.abs(near.areaCm2-far.areaCm2)<1e-8);
  assert.equal(near.reason,'');
});

test('a small iris remains visible as pixels but cannot publish an area',()=>{
  const result=measure([landmarks(.2)],1000,1000);
  assert.ok(Math.abs(result.irisPx-8)<1e-6);
  assert.equal(result.areaCm2,null);
  assert.match(result.reason,/홍채/);
});

test('missing, multiple or malformed faces never retain a previous measurement',()=>{
  for(const faces of [[],[landmarks(),landmarks()],[[]]]){
    const result=measure(faces,1000,1000);
    assert.equal(result.irisPx,null);
    assert.equal(result.areaCm2,null);
    assert.ok(result.reason);
  }
});
