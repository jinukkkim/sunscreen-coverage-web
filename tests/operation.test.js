import test from 'node:test';
import assert from 'node:assert/strict';
import {createOperationGuard} from '../src/lib/operation.js';
test('cancelled and superseded analyses cannot publish stale results',()=>{
  const g=createOperationGuard(), first=g.begin();
  assert.equal(g.isCurrent(first),true);
  g.cancel(); assert.equal(g.isCurrent(first),false);
  const second=g.begin(), third=g.begin();
  assert.equal(g.isCurrent(second),false); assert.equal(g.isCurrent(third),true);
});
