import test from 'node:test';
import assert from 'node:assert/strict';
import {rasterScale} from '../image-export.js';

test('iOS exports stay within the mobile pixel budget and dimension limit', () => {
  for(const [width,height] of [[1600,870],[1600,4000],[1600,25000],[20000,200]]) {
    const scale=rasterScale(width,height,true),w=Math.floor(width*scale),h=Math.floor(height*scale);
    assert.ok(w*h<=3000000);assert.ok(w<=8192&&h<=8192);assert.ok(scale>0&&scale<=2);
  }
});

test('desktop retains double-size rendering for a normal one-day export', () => {
  assert.equal(rasterScale(1600,870,false),2);
  const scale=rasterScale(1600,25000,false);
  assert.ok(Math.floor(1600*scale)*Math.floor(25000*scale)<=32000000);
  assert.ok(Math.floor(25000*scale)<=16384);
});
