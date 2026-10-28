const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const {buildArtifact}=require('../scripts/build-pages-artifact.cjs');

test('Pages artifact retains referenced local assets, fonts and parser while excluding repository internals',()=>{
 const out=path.join(root,'.sec010-fixture-'+process.pid);
 try{
  buildArtifact(out);
  const html=fs.readFileSync(path.join(out,'index.html'),'utf8');
  for(const [,url]of html.matchAll(/(?:src|href)="([^\"]+)"/g)){
   if(/^(?:https?:|data:|#|javascript:)/.test(url))continue;
   assert(fs.existsSync(path.join(out,url.split(/[?#]/)[0])),'missing '+url);
  }
  for(const f of ['js/excel-parser-worker.js','js/vendor/sheetjs-0.20.3/xlsx.full.min.js','assets/fonts/DejaVuSans.ttf','js/auth.js','js/expiry.js','cloud-workspace.js'])
   assert.deepEqual(fs.readFileSync(path.join(out,f)),fs.readFileSync(path.join(root,f)));
  for(const f of ['.github','supabase','tests','proposals','scripts','package.json','PharmFlow_Zebra_Raw_Scan_Diagnostic.html','pharmacy-receiving-system-main'])
   assert(!fs.existsSync(path.join(out,f)),f+' must not be published');
  assert.throws(()=>buildArtifact(out),/fresh artifact/);
 }finally{fs.rmSync(out,{recursive:true,force:true});}
});
test('password-handler root imports are exact versions, with the accepted caller guard retained',()=>{
 for(const slug of ['pharmflow-password-admin','pharmflow-password-admin-settings-rc']){
  const source=fs.readFileSync(path.join(root,'supabase/functions',slug,'index.ts'),'utf8');
  assert(source.includes('https://esm.sh/@supabase/supabase-js@2.118.0"'));
  assert(!source.includes('supabase-js@2"'));
  assert(source.includes('updateUserById(caller.id'));
  assert(source.includes('sameCredential'));
  assert(source.includes('is_system_owner'));
 }
});

test('Production environment and Pages base guard remain bound to Production',()=>{
 const config=fs.readFileSync('js/supabase.js','utf8'),html=fs.readFileSync('index.html','utf8'),vite=fs.readFileSync('vite.config.js','utf8');
 assert(config.includes('https://zznoshzcyxmtwfbznjyr.supabase.co'));
 assert(!config.includes('tovkcakucyagvbzvlnks'));assert(!html.includes('tovkcakucyagvbzvlnks'));assert(!html.includes('staging-environment.js'));
 assert(html.includes('connect-src \'self\' https://zznoshzcyxmtwfbznjyr.supabase.co'));
 assert(vite.includes("process.env.VERCEL_ENV!=='production'"));assert(vite.includes("process.env.VERCEL_GIT_COMMIT_REF!=='main'"));
 assert(vite.includes("'/pharmacy-receiving-system/'"));
});
test('runtime artifact serves nested Pages HTML, styles, Worker and fonts at the repository prefix',async()=>{
 const http=require('node:http');const out=path.join(root,'.asset-http-'+process.pid);buildArtifact(out);
 const prefix='/pharmacy-receiving-system/';
 const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(!u.pathname.startsWith(prefix)){res.writeHead(404).end();return;}let file=path.join(out,decodeURIComponent(u.pathname.slice(prefix.length))||'index.html');if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.end(fs.readFileSync(file));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
 const base=`http://127.0.0.1:${server.address().port}${prefix}`;
 const html=await (await fetch(base)).text();const urls=new Set(['js/excel-parser-worker.js','js/vendor/sheetjs-0.20.3/xlsx.full.min.js','assets/fonts/DejaVuSans.ttf']);
 for(const [,url] of html.matchAll(/(?:src|href)="([^\"]+)"/g))if(!/^(?:https?:|data:|#|javascript:)/.test(url))urls.add(url);
 for(const url of urls){const response=await fetch(new URL(url,base));assert.equal(response.status,200,url);if(url.split('?')[0].endsWith('.css')){const css=await response.text();for(const [,raw] of css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)){if(/^(?:https?:|data:|#)/.test(raw))continue;const asset=new URL(raw,new URL(url,base));assert.equal((await fetch(asset)).status,200,asset.pathname);}}}
 assert.equal((await fetch(base+'supabase/migrations/20261027223203_sec007_trusted_session_gate.sql')).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(out,{recursive:true,force:true});}
});
