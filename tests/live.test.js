const test=require('node:test');
const assert=require('node:assert/strict');
const LIVE=require('../src/live.js');

// A tiny ShakeMap grid.xml: 5 x 4 cells at 0.1 degrees, columns LON LAT MMI SVEL
function gridXml({lonMin=10,lonMax=10.4,latMin=20,latMax=20.3}={}){
  const rows=[];for(let r=0;r<4;r++)for(let c=0;c<5;c++)rows.push(`${(lonMin+c*0.1).toFixed(1)} ${(latMax-r*0.1).toFixed(1)} ${(5+c*0.5).toFixed(2)} ${200+r*100}`);
  return `<shakemap_grid shakemap_version="3" process_timestamp="2026-10-24T00:00:00Z" map_status="RELEASED" intensity_observations="12" seismic_stations="4" point_source="False">
<grid_specification lon_min="${lonMin}" lat_min="${latMin}" lon_max="${lonMax}" lat_max="${latMax}" nominal_lon_spacing="0.1" nominal_lat_spacing="0.1" nlon="5" nlat="4" />
<grid_field index="1" name="LON" units="dd" />
<grid_field index="2" name="LAT" units="dd" />
<grid_field index="3" name="MMI" units="intensity" />
<grid_field index="4" name="SVEL" units="ms" />
<grid_data>
${rows.join('\n')}
</grid_data>
</shakemap_grid>`;
}

test('grid parsing and clipping use the same scaling as the bundled data',()=>{
  const g=LIVE.parseGrid(gridXml());
  const G=LIVE.clipGrid(g,{lat:20.15,lon:10.2,radiusKm:200});
  assert.deepEqual([G.nc,G.nr,G.lon0,G.lat0],[5,4,10,20.3]);
  assert.equal(G.mmi[0],100);                  // MMI 5 x 20
  assert.equal(G.mmi[4],140);                  // MMI 7 x 20
  assert.equal(G.vs30[0],25);                  // Vs30 200 / 8
  assert.equal(G.vs30[3*5],63);                // Vs30 500 / 8, rounded
  assert.deepEqual([G.version,G.status,G.obs,G.stations],['3','RELEASED',12,4]);
});

test('a grid that crosses 180 degrees keeps one longitude frame',()=>{
  const g=LIVE.parseGrid(gridXml({lonMin:179.8,lonMax:-179.8}));
  assert.equal(g.lon0,179.8);assert.ok(Math.abs(g.lonMax-180.2)<1e-9);
});

test('coastlines from both sides of 180 degrees are clipped into the grid frame',()=>{
  // Land squares at 179.5..180 and -180..-179.5, borders along the 180 line
  const sq=(w,e)=>({type:'Feature',geometry:{type:'Polygon',coordinates:[[[w,-1],[e,-1],[e,1],[w,1],[w,-1]]]}});
  const geo={land:{type:'FeatureCollection',features:[sq(179.5,180),sq(-180,-179.5)]},borders:{type:'MultiLineString',coordinates:[[[-179.6,-1],[-179.6,1]]]}};
  const G={lon0:179.6,lat0:0.5,dlon:0.1,dlat:0.1,nc:9,nr:11};  // 179.6 .. 180.4
  const towns=[['West',0,179.7,9000,'FJ'],['East',0,-179.7,8000,'FJ'],['Far',0,170,7000,'XX']];
  const m=LIVE.basemap(geo,G,{lat:0,lon:180},towns);
  const xs=m.base.land.flat().map(p=>p[0]);
  assert.ok(Math.min(...xs)>=179.29&&Math.max(...xs)<=180.71,'land stays within the padded box');
  assert.ok(xs.some(x=>x>180.4),'land east of 180 is shifted by +360');
  assert.ok(m.base.borders.flat().every(p=>Math.abs(p[0]-180.4)<1e-9),'border shifted into the grid frame');
  assert.deepEqual(m.towns.towns.map(t=>[t[0],t[2]]),[['West',179.7],['East',180.3]]);
  assert.equal(m.country,'FJ');assert.equal(m.base.labels.length,1);
});

test('PAGER parsing reads alerts, building notes and exposure',()=>{
  const p=LIVE.parsePager('<pager version_number="4"><alert type="fatality" level="orange"/><alert type="economic" level="yellow"/><structcomment> Mostly brick. </structcomment><exposure dmin="6.5" dmax="7.5" exposure="12000"/></pager>');
  assert.deepEqual(p.alerts,[['fatality','orange'],['economic','yellow']]);
  assert.equal(p.struct,'Mostly brick.');assert.deepEqual(p.exposure,[[6.5,7.5,12000]]);assert.equal(p.version,'4');
});

test('display context extends inland land beyond the forecast without changing its mask',()=>{
  const geo={land:{type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[[[0,0],[20,0],[20,20],[0,20],[0,0]]]}}]},borders:{type:'MultiLineString',coordinates:[]}};
  const grid={lon0:9.5,lat0:10.5,dlon:.1,dlat:.1,nc:11,nr:11},seq={lat:10,lon:10};
  const local=LIVE.basemap(geo,grid,seq,[]),context=LIVE.basemap(geo,grid,seq,[],2);
  const extent=m=>[Math.min(...m.base.land.flat().map(p=>p[0])),Math.max(...m.base.land.flat().map(p=>p[0]))];
  assert.deepEqual(extent(local),[9.2,10.8]);assert.deepEqual(extent(context),[7.5,12.5]);
  assert.deepEqual(extent(LIVE.basemap(geo,grid,seq,[])),[9.2,10.8],'Display padding must not change the calculation coastline');
});

test('PAGER text is decoded from XML entities to plain text',()=>{
  const p=LIVE.parsePager('<structcomment>Brick &amp; adobe, &lt;b&gt;weak&lt;/b&gt;</structcomment>');
  assert.equal(p.struct,'Brick & adobe, <b>weak</b>');   // plain text: the page escapes it before display
});

test('current PAGER XML uses the event revision rather than the schema version',()=>{
  const p=LIVE.parsePager('<pager version="2.1" xml_version="1"><event eventcode="usTest" number="7" shakeversion="9"/></pager>');
  assert.equal(p.version,'7');
});

test('aftershock radius matches the bundled download',()=>{
  assert.equal(LIVE.radiusKm(7.8),Math.round(Math.pow(10,-2.44+0.59*7.8)*1.2+30));
});
