// Local version of the two Vercel routes, plus the prebuilt single-file app.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
function createDevServer({checkins=require('../api/checkins'),chat=require('../api/chat')}={}){
  return http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    res.setHeader('Cache-Control','no-store');
    if(url.pathname==='/'||url.pathname==='/index.html'){
      if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return}
      const file=path.join(__dirname,'..','index.html');res.setHeader('Content-Type','text/html; charset=utf-8');
      if(req.method==='HEAD'){res.end();return}
      const stream=fs.createReadStream(file);stream.on('error',()=>{res.statusCode=500;res.end('Run npm run build first.')});stream.pipe(res);return;
    }
    const handler=url.pathname==='/api/checkins'?checkins:url.pathname==='/api/chat'?chat:null;
    if(!handler){res.writeHead(404);res.end('Not found');return}
    const limit=url.pathname==='/api/checkins'?2048:200000;let size=0,body='';
    for await(const chunk of req){size+=chunk.length;if(size>limit){res.writeHead(413,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Request too large.'}));return}body+=chunk}
    req.body=body||undefined;req.query=Object.fromEntries(url.searchParams);
    res.status=code=>{res.statusCode=code;return res};
    res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return res};
    try{await handler(req,res)}catch{if(!res.headersSent)res.status(500).json({error:'Request could not be completed.'});else res.end()}
  });
}
if(require.main===module){
  const env=path.join(__dirname,'..','.env.local');if(fs.existsSync(env))process.loadEnvFile(env);
  const server=createDevServer(),port=Number(process.env.AFTERQUAKE_PORT||3000);
  server.listen(port,'127.0.0.1',()=>console.log(`Afterquake: http://127.0.0.1:${server.address().port}`));
  server.on('error',()=>{console.error('Could not start the local server. Check AFTERQUAKE_PORT or close another server on that port.');process.exitCode=1});
}
module.exports={createDevServer};
