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
test('Staging indicator is derived from actual backend and leaves Production unlabelled',()=>{
 const source=fs.readFileSync(path.join(root,'js/staging-environment.js'),'utf8');
 for(const [url,expected]of [['https://tovkcakucyagvbzvlnks.supabase.co',1],['https://zznoshzcyxmtwfbznjyr.supabase.co',0]]){
  const children=[];const document={getElementById:()=>null,createElement:()=>({setAttribute(){},style:{}}),body:{appendChild:x=>children.push(x)}};
  vm.runInNewContext(source,{CLOUD_CONFIG:{url},document});assert.equal(children.length,expected);
 }
});
test('Preview security headers deny framing and keep script policy report-only',()=>{
 const c=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
 const h=Object.fromEntries(c.headers[0].headers.map(x=>[x.key,x.value]));
 assert.equal(h['X-Content-Type-Options'],'nosniff');assert.equal(h['X-Frame-Options'],'DENY');
 assert.match(h['Content-Security-Policy'],/frame-ancestors 'none'/);
 assert(!h['Content-Security-Policy'].includes('script-src'));
 assert.match(h['Content-Security-Policy-Report-Only'],/script-src 'self'/);
 assert(!h['Content-Security-Policy-Report-Only'].includes('zznoshzcyxmtwfbznjyr'));
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
test('least-privilege proposal changes only the observed non-CRUD grants and preserves RLS/data in isolated PostgreSQL',async()=>{
 const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
 try{
  const sql=fs.readFileSync(path.join(root,'proposals/security/20261028_sec009_least_privilege.sql'),'utf8');
  const tables=[...sql.matchAll(/ON TABLE public\.([a-z0-9_]+) FROM anon, authenticated;/g)].map(x=>x[1]);
  assert.equal(tables.length,11);assert(!/\b(?:DELETE|TRUNCATE\s+TABLE|DROP|ALTER|UPDATE|INSERT)\b/.test(sql.replace(/^--.*$/mg,'')));
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  for(const table of tables)await db.exec(`CREATE TABLE public.${table}(id integer primary key, quantity integer); INSERT INTO public.${table} VALUES(1,62); ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY; GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.${table} TO anon,authenticated;`);
  await db.exec(sql);
  for(const table of tables){
   for(const role of ['anon','authenticated']){
    for(const privilege of ['TRUNCATE','REFERENCES','TRIGGER']) assert.equal((await db.query('select has_table_privilege($1,$2,$3) as ok',[role,'public.'+table,privilege])).rows[0].ok,false);
    for(const privilege of ['SELECT','INSERT','UPDATE','DELETE']) assert.equal((await db.query('select has_table_privilege($1,$2,$3) as ok',[role,'public.'+table,privilege])).rows[0].ok,true);
   }
   assert.equal((await db.query(`select quantity from public.${table}`)).rows[0].quantity,62);
   assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass',['public.'+table])).rows[0].relrowsecurity,true);
  }
 }finally{await db.close();}
});
