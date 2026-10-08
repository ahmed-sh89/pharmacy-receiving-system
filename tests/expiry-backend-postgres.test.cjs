const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
let db;const PA='11111111-1111-4111-8111-111111111111',PB='22222222-2222-4222-8222-222222222222';
const UA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',UB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',AD='cccccccc-cccc-4ccc-8ccc-cccccccccccc',SO='dddddddd-dddd-4ddd-8ddd-dddddddddddd',W='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const uuid=()=>crypto.randomUUID();
const migration='proposals/expiry-backend/20261008004855_expiry_capture_integrity_final.sql';
async function identity(user=UA,role='authenticated'){await db.exec(`reset role;set role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);}
function capture(id='U0030',kind='KNOWN'){return {kind,identifier_display:id,raw_scan:id,scan_format:'PLAIN',quantity:3,expiry_month:8,expiry_year:2028,worker_id:W,device_id:'synthetic-device',source:'HANDHELD',batch_no:null,sample_serial:null,item_code:'ITEM-'+id,item_name:'Synthetic '+id,category:'Medicine'};}
async function save(p,op=uuid(),pharmacy=PA){return (await db.query('select public.save_pharmflow_expiry_capture_v3($1,$2,$3::jsonb) as r',[pharmacy,op,JSON.stringify(p)])).rows[0].r;}
async function photos(p,op=uuid()){
 await db.query('select public.reserve_pharmflow_expiry_capture_v1($1,$2)',[PA,op]);
 for(const role of ['product','expiry']){const path=`${PA}/expiry-v1/${op}/${role}/${uuid()}.jpg`;await db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4::jsonb)',['pharmflow-needs-review',path,UA,JSON.stringify({mimetype:'image/jpeg',size:500})]);p[role+'_photo_path']=path;}
 return op;
}
async function value(sql,args=[]){return (await db.query(sql,args)).rows[0];}
async function denied(fn,pattern){await assert.rejects(fn,pattern);}
test.before(async()=>{
 const localUrl=process.env.PHARMFLOW_LOCAL_PG_URL;
 if(localUrl){
  const url=new URL(localUrl);
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!/^\/pharmflow_expiry_synthetic_[a-z0-9_]+$/.test(url.pathname))throw new Error('Only a fresh disposable loopback synthetic database is allowed');
  const {Client}=require('pg'),client=new Client({connectionString:localUrl});await client.connect();
  const existing=await client.query("select count(*)::int n from information_schema.tables where table_schema in ('public','auth','storage')");
  if(existing.rows[0].n!==0){await client.end();throw new Error('Native synthetic database must be empty; no cleanup/destructive reset is performed');}
  db={exec:sql=>client.query(sql),query:(...a)=>client.query(...a),close:()=>client.end()};
 }else{const {PGlite}=await import('@electric-sql/pglite');db=new PGlite();}
 await db.exec(fs.readFileSync('tests/expiry-backend/fixture.sql','utf8'));
 const schema=fs.readFileSync('PHASE2C1176_EXPIRY_STAGE1_CURRENT_STATE.sql','utf8');await db.exec(schema.slice(0,schema.indexOf('create or replace function public.save_pharmacy_expiry_verified_state_v1')));
 const defs=JSON.parse(fs.readFileSync('tests/expiry-backend/deployed-save-contracts.json','utf8'));
 for(const d of defs){await db.exec(d.definition+';');const types=d.arguments.split(', ').map(a=>a.slice(a.indexOf(' ')+1)).join(',');await db.exec(`revoke all on function public.${d.proname}(${types}) from public,anon;grant execute on function public.${d.proname}(${types}) to authenticated;`);}
 await db.exec(`insert into public.pharmacies values('${PA}'),('${PB}');insert into auth.users values('${UA}'),('${UB}'),('${AD}'),('${SO}');insert into public.test_members values('${UA}','${PA}',false),('${UB}','${PB}',false),('${AD}','${PA}',true);insert into public.pharmflow_expiry_workers_v1 values('${W}','${PA}','Synthetic HHP084 worker',true);`);
 await db.exec(fs.readFileSync(migration,'utf8'));await identity();
 console.log('LOCAL SQL ENGINE:',(await value('select version() as version')).version);
});
test.after(async()=>{if(db)await db.close()});
for(const id of ['U0030','S00110','1234A','001234','04065272072977'])test('SQL exact identity and additive acknowledgement: '+id,async()=>{
 await identity();const p=capture(id),op=uuid(),r=await save(p,op);assert.ok(r.state_id&&r.event_id);assert.deepEqual(await save(p,op),r);
 await identity(UA,'postgres');const row=await value('select * from public.pharmflow_expiry_current_state_v1 where id=$1',[r.state_id]);assert.equal(row.identifier_display,id);assert.equal(row.verified_quantity,3);assert.equal((await value('select count(*)::int as n from public.pharmflow_expiry_events_v1 where state_id=$1',[r.state_id])).n,1);
});
test('SQL raw GS1, batch, serial, month-end day00 and both photos survive authorized read',async()=>{
 await identity();const p=capture('04065272072977','UNKNOWN');Object.assign(p,{raw_scan:']C101040652720729771728080010LOT-A\u001d21SERIAL-A',scan_format:'GS1',batch_no:'LOT-A',sample_serial:'SERIAL-A',quantity:7});const op=await photos(p),r=await save(p,op);
 const read=(await db.query('select public.get_pharmflow_expiry_review_v1($1,$2) as r',[PA,r.review_id])).rows[0].r;
 for(const field of Object.keys(p))assert.deepEqual(read[field],p[field],field);assert.equal(read.worker_name,'Synthetic HHP084 worker');assert.equal(read.status,'PENDING');assert.equal(read.pharmacy_id,PA);assert.equal(read.identifier_key,'04065272072977');assert.deepEqual(await save(p,op),r);
 await identity(UB);await denied(()=>db.query('select public.get_pharmflow_expiry_review_v1($1,$2)',[PA,r.review_id]),/Pharmacy access/);
 await identity();assert.equal((await db.query('select public.get_pharmflow_expiry_review_v1($1,$2) as r',[PA,uuid()])).rows[0].r,null);
});
test('SQL required fields, raw identity mismatch and bad dates reject atomically',async()=>{
 await identity();for(const change of [{raw_scan:null},{identifier_display:'0030'},{device_id:''},{quantity:0},{quantity:1.5},{expiry_month:13},{expiry_month:null},{worker_id:null},{batch_no:7},{sample_serial:7}]){const p={...capture(),...change};await denied(()=>save(p),/required|match|Invalid|invalid|Worker|integer|Integer/);}
 const p=capture();delete p.raw_scan;await denied(()=>save(p),/Complete capture/);
 await identity(UA,'postgres');assert.equal((await value("select count(*)::int n from pharmflow_expiry_private.operations where status='COMMITTING'")).n,0);
});
test('SQL GS1 mismatches and unsupported/malformed input reject; optional manual batch works',async()=>{
 await identity();const p=capture('04065272072977');Object.assign(p,{scan_format:'GS1',raw_scan:'(01)04065272072977(17)280831(10)BATCH',expiry_month:8,expiry_year:2028,batch_no:'BATCH'});await save(p);
 for(const change of [{batch_no:'OTHER'},{expiry_month:7},{raw_scan:'(01)04065272072977(17)280832(10)BATCH'},{raw_scan:'(01)04065272072977(99)UNSUPPORTED'}])await denied(()=>save({...p,...change}),/GS1|range/);
 const manual=capture('MANUAL1');manual.batch_no='MANUAL-LOT';await save(manual);
});
test('SQL photo replacement/rename/deletion is blocked before resolution, including another member/admin',async()=>{
 await identity();const p=capture('PHOTO1','UNKNOWN'),op=await photos(p),r=await save(p,op);
 await denied(()=>db.query('update storage.objects set metadata=$1 where name=$2',[{mimetype:'image/jpeg',size:20},p.product_photo_path]),/immutable/);
 await denied(()=>db.query('update storage.objects set name=$1 where name=$2',[`${PA}/unprotected.jpg`,p.product_photo_path]),/immutable/);
 await identity(AD);await denied(()=>db.query('delete from storage.objects where name=$1',[p.product_photo_path]),/cleanup authorization/);
 await denied(()=>db.query('select public.authorize_pharmflow_expiry_photo_cleanup_v1($1,$2)',[PA,r.review_id]),/Successfully resolved/);
 await identity(UB);const objects=await db.query('select * from storage.objects where name=$1',[p.product_photo_path]);assert.equal(objects.rows.length,0);
});
test('SQL safe retake deletes only uploader staging object; missing/type-invalid/wrong-role photos reject',async()=>{
 await identity();const p=capture('RETAKE1','UNKNOWN'),op=await photos(p);await db.query('delete from storage.objects where name=$1',[p.product_photo_path]);await denied(()=>save(p,op),/Both uploaded/);
 const path=`${PA}/expiry-v1/${op}/product/${uuid()}.jpg`;
 await denied(()=>db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4::jsonb)',['pharmflow-needs-review',path,UA,JSON.stringify({size:100})]),/type or size/);
 await db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4::jsonb)',['pharmflow-needs-review',path,UA,JSON.stringify({size:100,mimetype:'image/jpeg'})]);p.product_photo_path=path;const reversed={...p,product_photo_path:p.expiry_photo_path,expiry_photo_path:p.product_photo_path};await denied(()=>save(reversed,op),/role-correct/);await save(p,op);
});
test('SQL resolved cleanup requires admin authorization; row/audit/photo references survive Storage deletion',async()=>{
 await identity();const p=capture('CLEANUP1','UNKNOWN'),op=await photos(p),r=await save(p,op);
 // Synthetic successful resolution: database owner changes only resolution fields,
 // retaining the real trigger authorization check with an admin JWT identity.
 await identity(AD,'postgres');await db.query("update public.pharmflow_needs_review_v2 set status='RESOLVED',resolved_by=$1,resolved_item_code='RESOLVED1',resolved_item_name='Resolved synthetic product' where id=$2",[AD,r.review_id]);
 await identity();await denied(()=>db.query('select public.authorize_pharmflow_expiry_photo_cleanup_v1($1,$2)',[PA,r.review_id]),/admin/);
 await identity(AD);await denied(()=>db.query('delete from storage.objects where name=$1',[p.product_photo_path]),/cleanup authorization/);const authorization=(await db.query('select public.authorize_pharmflow_expiry_photo_cleanup_v1($1,$2) as r',[PA,r.review_id])).rows[0].r;assert.equal(authorization.paths.length,2);
 for(const path of authorization.paths)await db.query('delete from storage.objects where name=$1',[path]);
 const read=(await db.query('select public.get_pharmflow_expiry_review_v1($1,$2) as r',[PA,r.review_id])).rows[0].r;assert.equal(read.product_photo_deleted,true);assert.equal(read.expiry_photo_deleted,true);assert.equal(read.raw_scan,p.raw_scan);assert.equal(read.status,'RESOLVED');
 await identity(AD,'postgres');await denied(()=>db.query('delete from public.pharmflow_needs_review_v2 where id=$1',[r.review_id]),/audit cannot/);
 await denied(()=>db.query("update public.pharmflow_needs_review_v2 set resolved_item_code='OTHER' where id=$1",[r.review_id]),/attribution is immutable/);
});
test('SQL idempotency payload/owner conflict, uncertain response reconciliation and separate legitimate captures',async()=>{
 await identity();const p=capture('RETRY1'),op=uuid(),r=await save(p,op);await denied(()=>save({...p,quantity:4},op),/payload conflict/);
 assert.deepEqual((await db.query('select public.get_pharmflow_expiry_capture_operation_v1($1,$2) as r',[PA,op])).rows[0].r,r);
 await identity(AD);await denied(()=>save(p,op),/owner conflict/);assert.equal((await db.query('select public.get_pharmflow_expiry_capture_operation_v1($1,$2) as r',[PA,op])).rows[0].r,null);
 await identity();await save(p);await identity(UA,'postgres');assert.equal((await value('select verified_quantity from public.pharmflow_expiry_current_state_v1 where id=$1',[r.state_id])).verified_quantity,6);
});
test('SQL cross-pharmacy/worker, anonymous and System Owner without membership cannot bypass new permissions',async()=>{
 await identity(UB);await denied(()=>save(capture(),uuid(),PA),/Pharmacy access/);await denied(()=>save(capture(),uuid(),PB),/Active pharmacy worker/);
 await identity(SO);await denied(()=>save(capture()),/Pharmacy access/);await identity(null,'anon');await denied(()=>save(capture()),/permission denied/);
 await identity();await denied(()=>db.query('select * from pharmflow_expiry_private.operations'),/permission denied/);
 await identity(UA,'postgres');await db.exec('grant usage on schema pharmflow_expiry_private to rls_probe;grant select on all tables in schema pharmflow_expiry_private to rls_probe;set role rls_probe');assert.equal((await db.query('select * from pharmflow_expiry_private.operations')).rows.length,0);await identity();
});
test('SQL all legacy Expiry capture paths reject; Receiving legacy bodies and legacy media behavior remain unchanged',async()=>{
 await identity();const common=[PA,'ITEM','Product','001234','Medicine',1,8,2028,W];
 await denied(()=>db.query('select * from public.save_pharmacy_expiry_capture($1,$2,$3,$4,$5,$6,$7,$8,$9)',common),/operation-aware/);
 await denied(()=>db.query('select * from public.save_pharmacy_expiry_capture_smart($1,$2,$3,$4,$5,$6,$7,$8,$9)',common),/operation-aware/);
 for(const v of ['v1','v2'])await denied(()=>db.query(`select * from public.save_pharmacy_expiry_verified_state_${v}($1,$2,$3,$4,$5,$6,$7,$8,$9)`,common),/operation-aware/);
 for(const args of [[PA,'EXPIRY','U0030'],[PA,'EXPIRY','U0030',null,null,null,1,8,2028,W,'device','HANDHELD','UNKNOWN_GTIN']])await denied(()=>db.query(`select * from public.save_pharmacy_needs_review(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args),/operation-aware|ambiguous|not unique/);
 // Explicit signatures disambiguate the deployed default overloads.
 const a=[PA,'RECEIVING','001234','raw','ORDER1','Order',2,null,null,null,'device','PC'];
 const q='select * from public.save_pharmacy_needs_review($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::integer,$8::integer,$9::integer,$10::uuid,$11::text,$12::text,$13::text)';
 // The deployed 13-argument legacy body already contains an unqualified
 // created_at/RETURNS TABLE ambiguity. Verify identical behavior rather than
 // quietly fixing unrelated Receiving SQL or treating its error as a regression.
 await denied(()=>db.query(q,[...a,'UNKNOWN_GTIN']),/created_at.*ambiguous/);
 await identity(UA,'postgres');
 const original=JSON.parse(fs.readFileSync('tests/expiry-backend/deployed-save-contracts.json','utf8')).find(d=>d.proname==='save_pharmacy_needs_review'&&d.arguments.includes('p_review_reason'));
 const guarded=original.definition.replace(/\bbegin\b/i,m=>m+"\n if upper(btrim(coalesce(p_workflow,'')))='EXPIRY' then raise exception 'Expiry capture requires operation-aware V3';end if;");
 await db.exec(original.definition+';');await identity();await denied(()=>db.query(q,[...a,'UNKNOWN_GTIN']),/created_at.*ambiguous/);
 await identity(UA,'postgres');await db.exec(guarded+';');await identity();
 console.log('Legacy Receiving 13-argument RPC: same pre-existing created_at ambiguity before/after');
 await identity();const path=`${PA}/legacy-review/photo.jpg`;await db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4::jsonb)',['pharmflow-needs-review',path,UA,'{}']);await db.query('update storage.objects set metadata=$1 where name=$2',[{size:999},path]);await identity(AD);await db.query('delete from storage.objects where name=$1',[path]);
 await identity(UA,'postgres');assert.equal((await value('select quantity from public.test_receiving_ledger where id=1')).quantity,42);assert.equal((await value("select item_code from public.test_global_master where identifier_display='U0030'")).item_code,'GLOBAL1');
});
test('SQL alternate creators cannot insert incomplete Expiry review or mutate saved evidence',async()=>{
 await identity(UA,'postgres');await denied(()=>db.query("insert into public.pharmflow_needs_review_v2(pharmacy_id,workflow,gtin,identifier_display,identifier_key,pending_quantity,created_by) values($1,'EXPIRY','U0030','U0030','U0030',1,$2)",[PA,UA]),/complete operation/);
 await identity();const p=capture('IMMUTABLE1','UNKNOWN'),op=await photos(p),r=await save(p,op);await identity(UA,'postgres');await denied(()=>db.query('update public.pharmflow_needs_review_v2 set pending_quantity=9 where id=$1',[r.review_id]),/immutable/);
});
test('SQL known capture cannot orphan uploaded review photos',async()=>{
 await identity();const p=capture('ORPHAN1'),op=await photos(p);await denied(()=>save(p,op),/cannot orphan/);
});

test('Native PostgreSQL independent-connection duplicate and same-item concurrency', {skip:!process.env.PHARMFLOW_LOCAL_PG_URL?'NOT RUN: native PostgreSQL unavailable; PGlite has one connection':false},async()=>{
 const {Client}=require('pg'),clients=[new Client({connectionString:process.env.PHARMFLOW_LOCAL_PG_URL}),new Client({connectionString:process.env.PHARMFLOW_LOCAL_PG_URL})];
 try{
  for(const c of clients){await c.connect();await c.query('set role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,false)",[UA]);}
  const p=capture('NATIVE-DUPLICATE'),op=uuid(),q='select public.save_pharmflow_expiry_capture_v3($1,$2,$3::jsonb) as r';
  const results=await Promise.all(clients.map(c=>c.query(q,[PA,op,JSON.stringify(p)])));assert.deepEqual(results[0].rows[0].r,results[1].rows[0].r);
  const p2=capture('NATIVE-ADDITIVE');await Promise.all(clients.map(c=>c.query(q,[PA,uuid(),JSON.stringify(p2)])));
  await identity(UA,'postgres');assert.equal((await value("select verified_quantity from public.pharmflow_expiry_current_state_v1 where item_code='ITEM-NATIVE-ADDITIVE'")).verified_quantity,6);
  assert.equal((await value('select count(*)::int n from public.pharmflow_expiry_events_v1 where state_id=$1',[results[0].rows[0].r.state_id])).n,1);
 }finally{for(const c of clients)await c.end();}
});
test('Client adapter executes actual operation SQL, two media rows and authorized review read',async()=>{
 const vm=require('node:vm'),context={Blob,structuredClone};vm.createContext(context);vm.runInContext(fs.readFileSync('js/expiry-operation.js','utf8')+'\nthis.api=ExpiryOperation;',context);
 await identity();const operation={id:uuid(),pharmacyId:PA},p=capture('S00110','UNKNOWN');let saves=0;
 const rpc=async(name,args)=>{
  if(name==='reserve_pharmflow_expiry_capture_v1')return (await db.query('select public.reserve_pharmflow_expiry_capture_v1($1,$2) r',[args.p_pharmacy_id,args.p_operation_id])).rows[0].r;
  if(name==='save_pharmflow_expiry_capture_v3'){saves++;return save(args.p_capture,args.p_operation_id,args.p_pharmacy_id);}
  if(name==='get_pharmflow_expiry_review_v1')return (await db.query('select public.get_pharmflow_expiry_review_v1($1,$2) r',[args.p_pharmacy_id,args.p_review_id])).rows[0].r;
  throw new Error('Unexpected RPC '+name);
 };
 const input={rpc,upload:async(path,file)=>db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4::jsonb)',['pharmflow-needs-review',path,UA,JSON.stringify({mimetype:file.type,size:file.size})]),persist:async()=>{},scope:UA+'/'+PA,currentScope:()=>UA+'/'+PA,operation,payload:p,photos:{product:new Blob(['product'],{type:'image/jpeg'}),expiry:new Blob(['expiry'],{type:'image/png'})},uuid};
 const first=await context.api.save(input),second=await context.api.save(input);assert.equal(first.review_id,second.review_id);assert.equal(saves,2);
 assert.equal((await value('select count(*)::int n from public.pharmflow_needs_review_v2 where operation_id=$1',[operation.id])).n,1);
 await identity(UB);await assert.rejects(context.api.readReview(PA,first.review_id,rpc),/Pharmacy access/);await identity();
});
