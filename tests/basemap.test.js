const test=require('node:test');
const assert=require('node:assert/strict');
const BASEMAP=require('../src/basemap.js');

function harness(){
  const handlers={},layers=new Set(),timers=new Map(),status={textContent:'',hidden:true};
  let nextTimer=0,requests=0;
  const tiles={on(name,fn){handlers[name]=fn;return this},
    addTo(){layers.add(this);requests++;handlers.loading();return this},
    redraw(){requests++;handlers.loading();return this}};
  const map={hasLayer:t=>layers.has(t),removeLayer:t=>layers.delete(t)};
  const controller=BASEMAP.create({tileLayer:()=>tiles},map,status,{
    schedule(fn){timers.set(++nextTimer,fn);return nextTimer},cancel:id=>timers.delete(id)
  });
  return {controller,status,layers,timers,requests:()=>requests,emit:name=>handlers[name](),
    timeout(){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn())}};
}

test('street requests start only in the visible forecast, and stop in the world view',()=>{
  const h=harness();assert.equal(h.requests(),0);
  h.controller.show();h.controller.show();assert.equal(h.requests(),1);
  assert.match(h.status.textContent,/Loading/);
  h.controller.hide();assert.equal(h.layers.size,0);assert.equal(h.timers.size,0);assert.equal(h.status.hidden,true);
  h.emit('tileerror');h.emit('load');assert.equal(h.status.hidden,true,'Late hidden-map events must not reopen its status');
  h.controller.show();assert.equal(h.requests(),2);
});

test('the first street tile is usable without waiting for every tile',()=>{
  const h=harness();h.controller.show();h.emit('tileload');
  assert.equal(h.status.hidden,true);assert.equal(h.timers.size,0);
  h.emit('tileerror');h.emit('load');assert.equal(h.status.hidden,true,'One failed tile must not hide a usable map');
});

test('a failed street provider leaves the fallback usable and can recover',()=>{
  const h=harness();h.controller.show();h.emit('tileerror');h.emit('load');
  assert.match(h.status.textContent,/Street details unavailable/);
  assert.match(h.status.textContent,/still use the map/);
  h.controller.retry();assert.equal(h.requests(),2);assert.match(h.status.textContent,/Loading/);
  h.emit('tileload');h.emit('load');assert.equal(h.status.hidden,true);
  h.controller.hide();h.controller.retry();assert.equal(h.requests(),2,'Reconnect must not load a hidden map');
});

test('a stalled connection has a bounded loading message and accepts late tiles',()=>{
  const h=harness();h.controller.show();h.timeout();
  assert.match(h.status.textContent,/still use the map/);assert.equal(h.layers.size,1);
  h.emit('tileload');assert.equal(h.status.hidden,true);
});
