// Decode the QR's rendered SVG pixels using an independent scanner. This checks
// the generated link and quiet zone; a physical phone/camera still needs a check.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const qrcode=require('qrcode-generator');
const jsQR=require('jsqr');
const source=fs.readFileSync(require.resolve('../src/livemoment.js'),'utf8');
const functions=source.slice(source.indexOf('function joinLink()'),source.indexOf('function renderJoin()'));
function decode(svg){
  const [,w,h]=svg.match(/viewBox="0 0 (\d+) (\d+)"/).map(Number),pixels=new Uint8ClampedArray(w*h*4).fill(255);
  const squares=[...svg.matchAll(/M(\d+),(\d+)l(\d+),0 0,(\d+) -\d+,0 0,-\d+z/g)];
  assert.ok(squares.length>0);
  for(const square of squares){const [,x,y,width,height]=square.map(Number);for(let r=y;r<y+height;r++)for(let c=x;c<x+width;c++){const i=(r*w+c)*4;pixels[i]=pixels[i+1]=pixels[i+2]=0}}
  assert.ok(Math.min(...squares.flatMap(s=>[+s[1],+s[2]]))>=24,'Keep a four-module white quiet zone');
  return jsQR(pixels,w,h,{inversionAttempts:'dontInvert'})?.data;
}
test('the rendered Türkiye group QR decodes to the correct hosted invite',()=>{
  const group='a'.repeat(32),ctx=vm.createContext({qrcode,S:{key:'turkey'},ci:{ready:true,group},location:new URL('https://afterquake.vercel.app/'),HOSTED_ORIGIN:'https://afterquake.vercel.app/'});
  vm.runInContext(functions,ctx);const link=vm.runInContext('joinLink()',ctx),svg=vm.runInContext('drawQR(joinLink())',ctx);
  assert.equal(decode(svg),link);assert.equal(new URL(link).hash,'#j=turkey.'+group);
});
test('live-quake and offline forecast QR links retain their event without an editing token',()=>{
  for(const href of ['https://afterquake.vercel.app/','file:///local/index.html']){
    const ctx=vm.createContext({qrcode,S:{key:'live:us6000u43g'},ci:{ready:false,group:null,owner:'private-owner'},location:new URL(href),HOSTED_ORIGIN:'https://afterquake.vercel.app/'});
    vm.runInContext(functions,ctx);const svg=vm.runInContext('drawQR(joinLink())',ctx),link=decode(svg);
    assert.equal(link,'https://afterquake.vercel.app/#j=live%3Aus6000u43g');assert.ok(!link.includes('private-owner'));
  }
});
