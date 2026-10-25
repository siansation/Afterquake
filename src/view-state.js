// Small, validated view descriptions. Links carry inputs, never cached probabilities.
// The URL fragment stays client-side until the user explicitly shares the link.
const VIEW_STATE=(()=>{
  const MINUTES=[5,10,30,60,480,1440],BUILDINGS=['local','6','7','8','9'],LIMITS=[.001,.01,.02,.1];
  const lon180=lon=>lon>=-180&&lon<=180?lon:((lon+540)%360)-180;
  function point(p){
    if(!p||!Number.isFinite(p.lat)||Math.abs(p.lat)>90||!Number.isFinite(p.lon)||Math.abs(p.lon)>360||typeof p.name!=='string'||p.name.length>160)throw new Error('The link contains an invalid map pin.');
    return {lat:p.lat,lon:lon180(p.lon),name:p.name};
  }
  function clean(s){
    if(!s||s.v!==1||!s.event||!['case','live'].includes(s.event.kind)||typeof s.event.id!=='string'||!/^[a-z0-9_-]{1,80}$/i.test(s.event.id))throw new Error('This view link is invalid or uses an unsupported version.');
    if(!MINUTES.includes(s.minutes)||!BUILDINGS.includes(s.building)||!LIMITS.includes(s.tolerance)||typeof s.calibrated!=='boolean')throw new Error('The view has unsupported forecast settings.');
    if(typeof s.at!=='string'||!Number.isFinite(Date.parse(s.at)))throw new Error('The view has an invalid forecast time.');
    if(typeof s.dataAt!=='string'||s.dataAt.length>80)throw new Error('The view has an invalid data timestamp.');
    return {v:1,event:{kind:s.event.kind,id:s.event.id},a:point(s.a),b:s.b==null?null:point(s.b),
      minutes:s.minutes,building:s.building,tolerance:s.tolerance,calibrated:s.calibrated,
      at:new Date(s.at).toISOString(),dataAt:s.dataAt};
  }
  function fragment(s){return '#'+new URLSearchParams({view:JSON.stringify(clean(s))}).toString()}
  function parse(hash){
    if(!hash||!new URLSearchParams(hash.replace(/^#/, '')).has('view'))return null;
    if(hash.length>6000)throw new Error('This view link is too long.');
    const raw=new URLSearchParams(hash.replace(/^#/, '')).get('view');
    try{return clean(JSON.parse(raw))}catch(e){throw new Error('Could not open this view link: '+e.message)}
  }
  function url(base,s){
    const u=new URL(base);if(!['https:','http:'].includes(u.protocol))throw new Error('Open the hosted app to create a link others can use.');
    u.username='';u.password='';u.search='';
    u.hash=fragment(s);return u.href;
  }
  function fromCheck(s){
    const live=s.sequence.startsWith('live:');
    return clean({v:1,event:{kind:live?'live':'case',id:live?s.sequence.slice(5):s.sequence},a:s.location,b:s.comparison||null,
      minutes:s.minutes,building:s.building,tolerance:s.tolerance,calibrated:s.calibrated,
      // New saved checks record absolute time so later origin revisions do not move it.
      at:s.at,dataAt:s.dataVersion});
  }
  return {clean,parse,fragment,url,fromCheck,point,lon180};
})();
if(typeof module!=='undefined')module.exports=VIEW_STATE;
