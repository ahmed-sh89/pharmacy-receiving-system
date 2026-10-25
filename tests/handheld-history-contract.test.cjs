// Disposable PostgreSQL engine only. Never connects to Supabase.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
let db,sql,oldDefinition;const PA='11111111-1111-4111-8111-111111111111',PB='22222222-2222-4222-8222-222222222222';
const UA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',UB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
before(async()=>{
 const {PGlite}=await import('@electric-sql/pglite');db=new PGlite();sql=fs.readFileSync(process.env.HH_HISTORY_MIGRATION||'supabase/migrations/20261025175436_handheld_receiving_history_scope_read.sql','utf8');
 await db.exec(`CREATE ROLE authenticated NOLOGIN;CREATE ROLE anon NOLOGIN;CREATE SCHEMA auth;CREATE SCHEMA pharmflow_auth_private;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION public.is_pharmacy_member(p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT (p='${PA}'::uuid AND auth.uid()='${UA}'::uuid) OR (p='${PB}'::uuid AND auth.uid()='${UB}'::uuid) $$;
 CREATE FUNCTION pharmflow_auth_private.require_access(p uuid,m text,w boolean,n text,x text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF m<>'RECEIVING' OR w OR NOT coalesce(public.is_pharmacy_member(p),false) OR coalesce(current_setting('test.receiving_disabled',true),'')='true' THEN RAISE EXCEPTION 'DENIED' USING ERRCODE='42501'; END IF; END $$;
 CREATE TABLE public.pharmflow_active_order_manifest_v1(pharmacy_id uuid PRIMARY KEY,manifest jsonb);
 CREATE TABLE public.pharmflow_needs_review_v2(id uuid PRIMARY KEY,pharmacy_id uuid,workflow text DEFAULT 'RECEIVING',session_id text,order_number text,order_name text,gtin text,raw_barcode text,pending_quantity integer DEFAULT 2,review_reason text,master_item_code_hint text,master_item_name_hint text,photo_path text,source text DEFAULT 'HANDHELD',device_id text DEFAULT 'TC26',status text, resolved_item_code text,resolved_item_name text,resolution_type text,resolution_transaction_id text,created_at timestamptz NOT NULL,updated_at timestamptz,resolved_at timestamptz,work_scope_order_numbers text[],identifier_display text);
 ALTER TABLE public.pharmflow_needs_review_v2 ENABLE ROW LEVEL SECURITY;
 INSERT INTO public.pharmflow_active_order_manifest_v1 VALUES('${PA}','{"handheldScopeConfigured":true,"handheldOrderNumbers":["A","B","NOT-ACTIVE"],"orderFiles":[{"documentId":"A"},{"orderNumber":"B"},{"documentId":"OLD"}]}');`);
 const states=['PENDING','RESOLVED','DELETED'];
 for(let i=1;i<=16;i++)await db.query('INSERT INTO pharmflow_needs_review_v2(id,pharmacy_id,order_number,work_scope_order_numbers,status,created_at) VALUES($1,$2,$3,$4,$5,$6)',[id(i),PA,i%2?'A':null,i%2?['A']:['OLD','B'],states[i%3],`2026-10-25T10:${i<5?'00':String(i).padStart(2,'0')}:00Z`]);
 for(const [n,ph,order,scope,dev] of [[50,PA,'OLD',['OLD'],'TC26'],[51,PB,'A',['A'],'TC26'],[52,PA,'A',['A'],'OTHER'],[53,PA,null,null,'TC26'],[54,PA,null,[],'TC26']])await db.query('INSERT INTO pharmflow_needs_review_v2(id,pharmacy_id,order_number,work_scope_order_numbers,device_id,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id(n),ph,order,scope,dev,'DELETED','2026-10-25T12:00:00Z']);
 const source=fs.readFileSync('supabase/migrations/20261025115032_authorization_permissions_release_20261025.sql','utf8');
 const old=source.match(/CREATE OR REPLACE FUNCTION public\.list_pharmflow_needs_review_history_v3[\s\S]*?end \$function\$\n;/)[0];await db.exec(old);
 oldDefinition=(await db.query("SELECT pg_get_functiondef('public.list_pharmflow_needs_review_history_v3(uuid,text,text)'::regprocedure) d")).rows[0].d;
 await db.exec(sql);await identity(UA);
});
after(async()=>db?.close());
function id(n){return '00000000-0000-4000-8000-'+String(n).padStart(12,'0');}
async function identity(user,role='authenticated'){await db.exec('RESET ROLE;SET ROLE '+role);await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user||'']);}
async function read(limit=10,cursor=null,ph=PA){return (await db.query('SELECT public.list_pharmflow_handheld_receiving_history_v1($1,$2,$3,$4,$5) r',[ph,'TC26',cursor?.created_at||null,cursor?.review_id||null,limit])).rows[0].r;}
test('all statuses, raw multi-order scope, authoritative assigned intersection and filter-before-limit',async()=>{
 const r=await read();assert.deepEqual(r.assigned_orders,['A','B']);assert.equal(r.rows.length,10);assert.equal(r.has_more,true);assert.equal(r.indeterminate_count,2);assert.ok(r.rows.every(x=>Number(x.review_id.slice(-12))<=16));assert.deepEqual(new Set(r.rows.map(x=>x.status)),new Set(['PENDING','RESOLVED','DELETED']));assert.ok(r.rows.some(x=>x.order_number===''&&x.work_scope_order_numbers.includes('B')));
});
test('keyset pages are stable and complete across equal timestamps',async()=>{
 const ids=[];let cursor=null;for(let n=0;n<10;n++){const r=await read(3,cursor);ids.push(...r.rows.map(x=>x.review_id));if(!r.has_more)break;cursor=r.next_cursor;}
 assert.equal(ids.length,16);assert.equal(new Set(ids).size,16);assert.deepEqual(ids.slice(-4),[id(4),id(3),id(2),id(1)]);
});
test('authenticated pharmacy isolation, anon and Disabled denial',async()=>{
 await assert.rejects(()=>read(10,null,PB),/DENIED/);await db.query("SELECT set_config('test.receiving_disabled','true',false)");await assert.rejects(()=>read(),/DENIED/);await db.query("SELECT set_config('test.receiving_disabled','false',false)");await identity(null,'anon');await assert.rejects(()=>read(),/permission denied/);await identity(null);await assert.rejects(()=>read(),/DENIED/);await identity(UA);
});
test('zero, one and changed assignments; malformed cursor fails closed',async()=>{
 await identity(UA,'postgres');await db.exec(`UPDATE pharmflow_active_order_manifest_v1 SET manifest=jsonb_set(manifest,'{handheldOrderNumbers}','["A"]') WHERE pharmacy_id='${PA}'`);await identity(UA);let r=await read(100);assert.equal(r.rows.length,8);
 await assert.rejects(()=>db.query('SELECT public.list_pharmflow_handheld_receiving_history_v1($1,$2,$3,NULL,10)',[PA,'TC26','2026-10-25T00:00:00Z']),/Complete history cursor/);
 await identity(UA,'postgres');await db.exec(`UPDATE pharmflow_active_order_manifest_v1 SET manifest=jsonb_set(manifest,'{handheldOrderNumbers}','[]') WHERE pharmacy_id='${PA}'`);await identity(UA);r=await read();assert.deepEqual(r.assigned_orders,[]);assert.deepEqual(r.rows,[]);
});
test('repeatable migration preserves records and cannot grant table access',async()=>{
 await identity(UA,'postgres');const fingerprint=async()=>JSON.stringify((await db.query('SELECT * FROM pharmflow_needs_review_v2 ORDER BY id')).rows);const before=await fingerprint();await db.exec('BEGIN');await db.exec(sql);await db.exec('ROLLBACK');await db.exec(sql);assert.equal(await fingerprint(),before);assert.equal((await db.query("SELECT has_table_privilege('authenticated','pharmflow_needs_review_v2','select') ok")).rows[0].ok,false);assert.ok(!/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP)\s/i.test(sql));
});

test('previous History signature, definition and result semantics remain available',async()=>{
 await identity(UA);const definition=(await db.query("SELECT pg_get_functiondef('public.list_pharmflow_needs_review_history_v3(uuid,text,text)'::regprocedure) d")).rows[0].d;assert.equal(definition,oldDefinition);const rows=(await db.query("SELECT * FROM public.list_pharmflow_needs_review_history_v3($1,'RECEIVING',NULL)",[PA])).rows;assert.equal(rows.length,20);assert.ok(!Object.hasOwn(rows[0],'work_scope_order_numbers'));
});
