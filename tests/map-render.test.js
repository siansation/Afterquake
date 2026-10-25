const test=require('node:test');
const assert=require('node:assert/strict');
const MAP=require('../src/map-render.js');

test('overview textures stay bounded, preserve aspect ratio and never upscale small grids',()=>{
  for(const [width,height] of [[662,527],[427,428],[10000,2],[2,10000]]){
    const {cols,rows}=MAP.fit(width,height);
    assert.ok(cols<=128&&rows<=128&&cols*rows<=16384);
    assert.ok(cols>=1&&rows>=1);
  }
  assert.deepEqual(MAP.fit(3,2),{cols:3,rows:2});
  assert.throws(()=>MAP.fit(0,10),RangeError);
  assert.throws(()=>MAP.fit(Infinity,10),RangeError);
  const heat=MAP.heatSize({nc:662,lat0:1,lat1:0,lon1:1,lon0:0,c:1});
  assert.ok(heat.cols*heat.rows<=6400);
});

test('overview sampling reads valid source cells without changing the source data',()=>{
  const data=Uint8Array.from({length:64},(_,i)=>i),copy=data.slice();
  const sampled=Array.from({length:4},(_,i)=>data[MAP.sampleIndex(i,2,2,8,8)]);
  assert.deepEqual(sampled,[18,22,50,54]);
  assert.deepEqual(data,copy);
  for(let i=0;i<12;i++)assert.equal(MAP.sampleIndex(i,4,3,4,3),i);
});

test('large and high-density globe canvases stay within the pixel budget',()=>{
  for(const [width,height,density] of [[1200,800,3],[3840,2160,2],[390,844,3]]){
    const ratio=MAP.globeRatio(width,height,density);
    assert.ok(ratio<=1.5&&Math.round(width*ratio)*Math.round(height*ratio)<=2003000);
  }
  assert.equal(MAP.globeRatio(800,600,1),1);
});
