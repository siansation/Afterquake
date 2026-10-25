const test=require('node:test');
const assert=require('node:assert/strict');
const {createHandler,validate}=require('../api/checkins');
const {poolConfig}=require('../server/checkins-store');
const group='a'.repeat(32),owner='b'.repeat(64);
function response(){return {headers:{},code:200,setHeader(k,v){this.headers[k]=v},status(code){this.code=code;return this},json(body){this.body=body;return this}}}
function request(method='GET',body=null){return {method,headers:{authorization:'Bearer '+group,'x-checkin-owner':owner,'content-type':'application/json'},query:{sequence:'live:usTest'},body}}
const entry={sequence:'live:usTest',status:'help',lat:1.123456,lon:-2.123456,note:'  Waiting by the park  '};

test('availability reveals no entries and missing configuration cannot accept writes',async()=>{
  const handler=createHandler({configured:()=>false}),probe=response();await handler({method:'GET',headers:{}},probe);
  assert.deepEqual(probe.body,{configured:false,provider:'Tiger Data'});assert.equal(probe.headers['Cache-Control'],'no-store');
  const write=response();await handler(request('PUT',entry),write);assert.equal(write.code,503);
});
test('check-in methods and credentials are validated before reaching the database',async()=>{
  let calls=0;const handler=createHandler({configured:()=>true,store:{list(){calls++}}});
  for(const req of [{...request(),method:'POST'},{...request(),headers:{authorization:'bad','x-checkin-owner':owner}},{...request(),query:{sequence:'x; DROP TABLE checkins'}}]){
    const res=response();await handler(req,res);assert.ok([400,401,405].includes(res.code));
  }
  assert.equal(calls,0);
});
test('writes use hashed scope/owner keys and rounded coordinates rather than caller-selected IDs',async()=>{
  let saved;const handler=createHandler({configured:()=>true,throttle:()=>false,store:{async save(...args){saved=args}}});
  const res=response();await handler(request('PUT',JSON.stringify({...entry,id:'another-user'})),res);
  assert.equal(res.code,200);assert.match(saved[0],/^[a-f0-9]{64}$/);assert.match(saved[2],/^[a-f0-9]{64}$/);
  assert.notEqual(saved[0],group);assert.notEqual(saved[2],owner);assert.deepEqual(saved[3],{status:'help',lat:1.123,lon:-2.123,note:'Waiting by the park'});
});
test('invalid notes, coordinates, content types and oversized bodies cannot write',async()=>{
  const handler=createHandler({configured:()=>true,throttle:()=>false,store:{save(){throw new Error('Must not write')}}});
  for(const [body,headers,code] of [[{...entry,lat:'1'},{},400],[{...entry,lon:181},{},400],[{...entry,note:'x'.repeat(81)},{},400],
    [{...entry,note:'line\nbreak'},{},400],['{broken',{},400],['x'.repeat(2049),{},413],[entry,{'content-type':'text/plain'},415]]){
    const req=request('PUT',body);Object.assign(req.headers,headers);const res=response();await handler(req,res);assert.equal(res.code,code);
  }
  assert.ok(validate({...entry,status:'rescued'}));
});
test('failed database operations do not disclose connection strings and rate limits are explicit',async()=>{
  const handler=createHandler({configured:()=>true,throttle:()=>false,store:{async list(){throw new Error('postgres://user:secret@private.example/db')}}});
  const res=response();await handler(request(),res);assert.equal(res.code,503);assert.ok(!JSON.stringify(res.body).includes('secret'));
  const blocked=createHandler({configured:()=>true,throttle:()=>true}),limit=response();await blocked(request(),limit);
  assert.equal(limit.code,429);assert.equal(limit.headers['Retry-After'],'60');
});
test('TLS verifies remote hosts even when URL parameters request weaker settings',()=>{
  const remote=poolConfig({TIGER_DATABASE_URL:'postgres://user:secret@remote.example/tsdb?ssl=0&sslmode=disable&sslrootcert=ignored',TIGER_DATABASE_CA:'one\\ntwo'});
  assert.equal(remote.ssl.rejectUnauthorized,true);assert.equal(remote.ssl.ca,'one\ntwo');assert.ok(!remote.connectionString.includes('sslmode'));
  const {Client}=require('pg');assert.equal(new Client(remote).connectionParameters.ssl.rejectUnauthorized,true);
  assert.equal(poolConfig({TIGER_DATABASE_URL:'postgres://u:p@localhost/test?sslmode=disable'}).ssl,false);
  assert.throws(()=>poolConfig({TIGER_DATABASE_URL:'https://example.com'}));
});
