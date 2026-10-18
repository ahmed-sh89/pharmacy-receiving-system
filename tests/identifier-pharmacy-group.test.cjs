const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const migration='supabase/migrations/20261018201931_expiry_identifier_pharmacy_group_metadata.sql';
const PA='11111111-1111-4111-8111-111111111111',PB='22222222-2222-4222-8222-222222222222',UA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const groups=['Beauty','FMCG','HomeHealth','Medicine','Mom & Baby','Supplement'];let db;
async function one(sql,params=[]){return (await db.query(sql,params)).rows[0];}
test.before(async()=>{
 const {PGlite}=await import('@electric-sql/pglite');db=new PGlite();
 await db.exec(`create schema auth;create role anon;create role authenticated;grant usage on schema public,auth to authenticated,anon;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function public.is_pharmacy_member(p uuid) returns boolean language sql stable as $$select auth.uid()='${UA}'::uuid and p='${PA}'::uuid$$;
 create function public.pharmflow_identifier_key_v2(p text) returns text language sql immutable as $$select upper(btrim(coalesce(p,'')))$$;
 create table public.pharmflow_global_items_v2(item_code text primary key,item_name text,group_name text,category text,sub_category text);
 create table public.pharmflow_global_item_identifiers_v2(id uuid default gen_random_uuid(),item_code text,identifier_display text,identifier_key text,mapping_revision bigint default 1);
 create table public.pharmflow_pharmacy_gtin_v1(id uuid default gen_random_uuid(),pharmacy_id uuid,item_code text,item_name text,identifier_display text,identifier_key text,mapping_revision bigint default 1);
 alter table public.pharmflow_pharmacy_gtin_v1 enable row level security;`);
 await db.exec(fs.readFileSync(migration,'utf8'));
 await db.exec(`revoke all on function public.resolve_pharmflow_identifier_v2(uuid,text) from public,anon;grant execute on function public.resolve_pharmflow_identifier_v2(uuid,text) to authenticated;`);
 for(let i=0;i<groups.length;i++){
  await db.query('insert into public.pharmflow_global_items_v2 values($1,$2,$3,$4,null)',['I'+i,'Global '+i,groups[i],'Legacy wrong category']);
  await db.query('insert into public.pharmflow_global_item_identifiers_v2(item_code,identifier_display,identifier_key) values($1,$2,$2)',['I'+i,'G'+i]);
  await db.query('insert into public.pharmflow_pharmacy_gtin_v1(pharmacy_id,item_code,item_name,identifier_display,identifier_key) values($1,$2,$3,$4,$4)',[PA,'I'+i,'Local name '+i,'L'+i]);
 }
 await db.exec(`select set_config('request.jwt.claim.sub','${UA}',false);set role authenticated;`);
});
test.after(async()=>{await db?.close()});
test('All six canonical Groups returned in pharmacy and global branches, without legacy category substitution',async()=>{
 for(let i=0;i<groups.length;i++)for(const scope of ['L','G']){const r=(await one('select public.resolve_pharmflow_identifier_v2($1,$2) r',[PA,scope+i])).r;assert.equal(r.groupName,groups[i]);assert.equal(r.itemCode,'I'+i);assert.equal(r.source,scope==='L'?'PHARMACY_V2':'GLOBAL_V2');assert.equal(r.itemName,scope==='L'?'Local name '+i:'Global '+i);assert.equal(r.mappingRevision,1);}
});
test('Existing pharmacy priority, missing-Global-item behavior and unknown lookup remain compatible',async()=>{
 await db.exec('reset role');
 await db.exec(`insert into public.pharmflow_global_item_identifiers_v2(item_code,identifier_display,identifier_key) values('I1','L0','L0');insert into public.pharmflow_pharmacy_gtin_v1(pharmacy_id,item_code,item_name,identifier_display,identifier_key) values('${PA}','LEGACY-ONLY','Original local','000123','000123');set role authenticated;`);
 assert.equal((await one('select public.resolve_pharmflow_identifier_v2($1,$2) r',[PA,'L0'])).r.groupName,'Beauty');
 const legacy=(await one('select public.resolve_pharmflow_identifier_v2($1,$2) r',[PA,'000123'])).r;assert.equal(legacy.found,true);assert.equal(legacy.identifierDisplay,'000123');assert.equal(legacy.groupName,null);
 assert.equal((await one('select public.resolve_pharmflow_identifier_v2($1,$2) r',[PA,'MISSING'])).r.found,false);
});
test('Cross-pharmacy and anonymous calls denied; lookup leaves mappings unchanged',async()=>{
 await assert.rejects(()=>one('select public.resolve_pharmflow_identifier_v2($1,$2)',[PB,'L0']),/Pharmacy access required/);
 await db.exec('reset role');const before=await one('select md5(jsonb_agg(to_jsonb(t))::text) digest from public.pharmflow_pharmacy_gtin_v1 t');
 await db.exec('set role authenticated');await one('select public.resolve_pharmflow_identifier_v2($1,$2)',[PA,'L0']);
 await db.exec('reset role');assert.deepEqual(await one('select md5(jsonb_agg(to_jsonb(t))::text) digest from public.pharmflow_pharmacy_gtin_v1 t'),before);
 await db.exec("select set_config('request.jwt.claim.sub','',false);set role authenticated");await assert.rejects(()=>one('select public.resolve_pharmflow_identifier_v2($1,$2)',[PA,'L0']),/Pharmacy access required/);
 await db.exec('reset role;set role anon');await assert.rejects(()=>one('select public.resolve_pharmflow_identifier_v2($1,$2)',[PA,'L0']),/permission denied/);
});
