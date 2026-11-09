const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {performance}=require('node:perf_hooks');
const {PGlite}=require('@electric-sql/pglite');
const pid='11111111-1111-4111-8111-111111111111';
const foreign='22222222-2222-4222-8222-222222222222';
const original=fs.readFileSync('supabase/migrations/20261109135921_receiving_bulk_mapping_review_quick_add.sql','utf8');
const hotfix=fs.readFileSync('supabase/migrations/20261109211140_receiving_identifier_projection_set_lookup.sql','utf8');
const oldFunction=original.match(/CREATE FUNCTION public\.get_pharmflow_workspace_identifiers_v1[\s\S]*?END \$\$;/)[0];
const normalizer=fs.readFileSync('tests/fixtures/receiving-admin/canonical-functions.sql','utf8').match(/CREATE OR REPLACE FUNCTION public\.pharmflow_receiving_item_code_v1[\s\S]*?END \$function\$/)[0]+';';
let db;
async function read(){return (await db.query('select public.get_pharmflow_workspace_identifiers_v1($1) result',[pid])).rows[0].result;}
async function manifest(rows,active=true){
 await db.query('insert into pharmflow_active_order_manifest_v1 values($1,$2) on conflict(pharmacy_id) do update set manifest=excluded.manifest',[pid,JSON.stringify({active,orderData:rows})]);
}
const order=(itemCode,qty=1,orders=['A'])=>({itemCode,itemName:'Order '+itemCode,orderedQty:qty,orderNumbers:orders});
async function setup(){
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema pharmflow_auth_private;
 create function pharmflow_auth_private.require_access(uuid,text,boolean,text,text default null) returns void language plpgsql as $$
 begin if $1 is distinct from '${pid}'::uuid or current_setting('test.deny',true)=$2 then raise exception 'permission denied';end if;end$$;
 create table pharmflow_active_order_manifest_v1(pharmacy_id uuid primary key,manifest jsonb);
 create table pharmflow_global_items_v2(item_code text primary key,item_name text,group_name text);
 create table pharmflow_global_item_identifiers_v2(item_code text,identifier_key text unique,identifier_display text);
 create index identifiers_item_idx on pharmflow_global_item_identifiers_v2(item_code);
 create table pharmflow_pharmacy_gtin_v1(pharmacy_id uuid,item_code text,identifier_key text,identifier_display text,unique(pharmacy_id,identifier_key));`);
 await db.exec(normalizer);
 await db.exec(oldFunction);
 await db.exec(`insert into pharmflow_global_items_v2 values
 ('105','Approved A','Medicine'),('200','Approved B','Beauty'),('000300','First collision','HomeHealth'),('300','Second collision','Medicine'),
 ('400','Unmapped','Medicine'),('500','Overridden','Medicine'),('600','Local winner','Medicine'),('700','Same mapping','Medicine');
 insert into pharmflow_global_item_identifiers_v2 values
 ('105','ID-105','ID-105'),('200','ID-200','ID-200'),('000300','ID-FIRST','ID-FIRST'),('300','ID-SECOND','ID-SECOND'),
 ('500','OVERRIDE','OVERRIDE'),('700','SAME','SAME');
 insert into pharmflow_pharmacy_gtin_v1 values
 ('${pid}','600','OVERRIDE','OVERRIDE'),('${pid}','700','SAME','SAME'),('${foreign}','400','FOREIGN','FOREIGN');`);
 await manifest([order('000105.00',3,['A']),order('105',2,['B']),...['200','300','400','500','600','700','900'].map(c=>order(c))]);
}
test.beforeEach(setup);
test.afterEach(async()=>db?.close());

test('set lookup is exactly equivalent for deduplication, normalization, groups, overrides and canonical conflicts',async()=>{
 const before=await read();await db.exec(hotfix);const after=await read();assert.deepEqual(after,before);
 assert.equal(after.rows.length,8);
 const byCode=new Map(after.rows.map(r=>[r.itemCode,r]));
 assert.equal(byCode.get('105').orderedQty,5);assert.deepEqual(byCode.get('105').orderMemberships,[['A'],['B']]);
 assert.equal(byCode.get('300').exists,false);assert.equal(byCode.get('300').conflict,true);
 assert.equal(byCode.get('300').groupName,'HomeHealth');assert.deepEqual(byCode.get('300').identifiers,['ID-FIRST']);
 assert.deepEqual(byCode.get('400').identifiers,[]);assert.deepEqual(byCode.get('500').identifiers,[]);
 assert.deepEqual(byCode.get('600').identifiers,['OVERRIDE']);assert.deepEqual(byCode.get('700').identifiers,['SAME','SAME']);
 assert.equal(byCode.get('900').exists,false);assert.equal(byCode.get('900').groupName,null);
});

test('absent and inactive manifests remain empty; other pharmacies cannot contribute rows or overrides',async()=>{
 await db.query('insert into pharmflow_active_order_manifest_v1 values($1,$2)',[foreign,JSON.stringify({active:true,orderData:[order('FOREIGN')]})]);
 const before=await read();await db.exec(hotfix);assert.deepEqual(await read(),before);
 await manifest([order('105')],false);assert.deepEqual((await read()).rows,[]);
 await db.query('delete from pharmflow_active_order_manifest_v1 where pharmacy_id=$1',[pid]);assert.deepEqual((await read()).rows,[]);
});

test('Receiving and DATA authorization and deny-anon execution remain enforced',async()=>{
 await db.exec(hotfix);
 for(const module of ['RECEIVING','DATA']){
  await db.query("select set_config('test.deny',$1,false)",[module]);await assert.rejects(read(),/permission denied/);
 }
 await db.exec("select set_config('test.deny','',false)");
 await assert.rejects(db.query('select get_pharmflow_workspace_identifiers_v1($1)',[foreign]),/permission denied/);
 await db.exec('set role anon');await assert.rejects(read(),/permission denied/);await db.exec('reset role');
 const guards=s=>s.match(/PERFORM pharmflow_auth_private\.require_access[^;]+;/g);
 assert.deepEqual(guards(hotfix),guards(oldFunction));
 assert.match(hotfix,/SECURITY DEFINER/);assert.match(hotfix,/SET search_path=pg_catalog,public,pg_temp/);
 assert.doesNotMatch(hotfix,/statement_timeout|CREATE INDEX|INSERT INTO|UPDATE public\.|DELETE FROM/i);
});

test('production-scale lookup uses bounded index probes with no expression statistics and one pharmacy read',async()=>{
 await db.exec(`truncate pharmflow_global_items_v2,pharmflow_global_item_identifiers_v2,pharmflow_pharmacy_gtin_v1;
 insert into pharmflow_global_items_v2 select '9'||lpad(n::text,6,'0'),'Synthetic '||n,'Medicine' from generate_series(1,56604)n;
 insert into pharmflow_global_item_identifiers_v2 select '9'||lpad((((n-1)%56604)+1)::text,6,'0'),'SCALE-'||n,'SCALE-'||n from generate_series(1,78192)n;
 insert into pharmflow_pharmacy_gtin_v1 select '${pid}','9'||lpad((56161+n)::text,6,'0'),'LOCAL-'||n,'LOCAL-'||n from generate_series(1,443)n;
 analyze pharmflow_global_items_v2;analyze pharmflow_global_item_identifiers_v2;analyze pharmflow_pharmacy_gtin_v1;
 create index canonical_code_idx on pharmflow_global_items_v2(public.pharmflow_receiving_item_code_v1(item_code));`);
 await manifest(Array.from({length:486},(_,i)=>order(String(9056119+i),10,['A','B'])));
 await db.exec(hotfix);
 const start=performance.now(),result=await read(),elapsed=performance.now()-start;
 assert.equal(result.rows.length,486);assert(result.rows.every(r=>r.exists&&!r.conflict));assert(elapsed<6000,`Projection exceeded 6s budget: ${elapsed}ms`);
 const body=hotfix.slice(hotfix.indexOf(' WITH codes'),hotfix.indexOf("\n RETURN jsonb_build_object")).replace(/INTO v_rows\s+/,'').replaceAll('p_pharmacy_id',`'${pid}'::uuid`);
 const plan=(await db.query('explain (analyze,format json) '+body)).rows[0]['QUERY PLAN'][0].Plan;
 const scans=[],nodes=[];function walk(n){nodes.push(n);if(n['Relation Name'])scans.push(n);for(const p of n.Plans||[])walk(p);}walk(plan);
 const globalScans=scans.filter(n=>n['Relation Name']==='pharmflow_global_items_v2');
 assert(nodes.some(n=>n['Index Name']==='canonical_code_idx'));
 assert(globalScans.every(n=>!n.Filter?.includes('pharmflow_receiving_item_code_v1')), 'Normalizer must be an index condition, never a primary-key filter');
 assert(scans.filter(n=>n['Relation Name']==='pharmflow_pharmacy_gtin_v1').every(n=>n['Actual Loops']===1));
 console.log(`Synthetic scale: 56604 items, 78192 identifiers, 443 overrides, 486 codes; ${elapsed.toFixed(1)}ms`);
});
