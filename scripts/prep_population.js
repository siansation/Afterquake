// Town populations (GeoNames via all-the-cities) and USGS PAGER country fatality curves -> data/population.json
// Run from the repo root after `npm install`: node scripts/prep_population.js
const fs=require('fs');const cities=require('all-the-cities');
const D=JSON.parse(fs.readFileSync('data/sequences.json'));
// PAGER empirical fatality model (Jaiswal & Wald): rate(MMI) = Phi(ln(MMI/theta)/beta) per country
const {execSync}=require('child_process');
const xml=execSync('curl -sL https://raw.githubusercontent.com/usgs/pager/master/losspager/data/fatality.xml').toString();
const FAT={};for(const m of xml.matchAll(/<model ccode="(\w+)" theta="([\d.]+)" fform="\w+" beta="([\d.]+)"/g))FAT[m[1]]=[+m[2],+m[3]];
const SEQC={turkey:'TR',nepal:'NP',darfield:'NZ',noto:'JP',kaikoura:'NZ',ridgecrest:'US',myanmar:'MM',kumamoto:'JP',ecuador:'EC',morocco:'MA',indonesia26:'ID',panama26:'PA',nagqu26:'CN'};
const towns={},need=new Set(Object.values(SEQC));
for(const s of D.sequences){const sm=D.shakemaps[s.key];const w=sm.lon0,e=sm.lon0+(sm.nc-1)*sm.dlon,n=sm.lat0,so=sm.lat0-(sm.nr-1)*sm.dlat;
  const t=cities.filter(c=>{const [lon,lat]=c.loc.coordinates;return lon>=w&&lon<=e&&lat>=so&&lat<=n&&c.population>0})
    .map(c=>[c.name,+c.loc.coordinates[1].toFixed(4),+c.loc.coordinates[0].toFixed(4),c.population,c.country]).sort((a,b)=>b[3]-a[3]);
  t.forEach(x=>need.add(x[4]));towns[s.key]={towns:t,country:SEQC[s.key]}}
const fatality={};for(const c of need)if(FAT[c])fatality[c]=FAT[c];
fs.writeFileSync('data/population.json',JSON.stringify({towns,fatality,seqCountry:SEQC}));
console.log('countries',Object.keys(fatality).length,'bytes',fs.statSync('data/population.json').size);
