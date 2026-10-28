const test=require('node:test'),assert=require('node:assert/strict'),{fixture,worker}=require('./helpers/export-v2-fixture.cjs');
test('Revision catches same-count edits, insert/delete and rolled-back writes; export cannot mutate Master',async()=>{
 const {db,rpc}=await fixture();try{
 await db.exec("insert into public.pharmflow_global_items_v2(item_code,item_name) values('001','One');insert into public.pharmflow_global_item_identifiers_v2(id,item_code,identifier_display) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','001','000ABC');");
 const start=await rpc('',{p_kind:'Items'}),next=await rpc('',{p_kind:'Identifiers',p_version:start.version});assert.equal(start.items,1);assert.equal(next.items,undefined);assert.equal(next.rows[0].identifier_display,'000ABC');
 await db.exec("update public.pharmflow_global_items_v2 set item_name='Renamed' where item_code='001'");await assert.rejects(rpc('',{p_kind:'Identifiers',p_version:start.version}),/changed during export/);
 const before=await rpc('',{p_kind:'Items'});await db.exec("begin;update public.pharmflow_global_item_identifiers_v2 set identifier_display='OTHER';rollback;");const after=await rpc('',{p_kind:'Items'});assert.equal(before.version,after.version);
 await db.exec("delete from public.pharmflow_global_item_identifiers_v2;insert into public.pharmflow_global_item_identifiers_v2(id,item_code,identifier_display) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','001','NEW');");await assert.rejects(rpc('',{p_kind:'Identifiers',p_version:before.version}),/changed during export/);
 assert.equal((await db.query('select count(*)::int as n from public.pharmflow_global_items_v2')).rows[0].n,1);
 }finally{await db.close();}
});
test('Owner/session guard applies every page; pharmacy/anonymous/revoked owner cannot export or access revision',async()=>{
 const {db,rpc,identity}=await fixture();try{
 for(const uid of ['', '22222222-2222-4222-8222-222222222222']){await identity(uid);await assert.rejects(rpc('',{p_kind:'Items'}),/Owner permission/);}
 await identity();const p=await rpc('',{p_kind:'Items'});await identity('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444');await assert.rejects(rpc('',{p_kind:'Items',p_version:p.version}),/live session/);
 assert.equal((await db.query("select has_function_privilege('anon','public.owner_export_global_items_page_v2(text,text,integer,text)','execute') as allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select has_schema_privilege('authenticated','pharmflow_export_private','usage') as allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select md5(prosrc) as hash from pg_proc where oid='pharmflow_auth_private.password_change_complete()'::regprocedure")).rows[0].hash,'99bda52f1b8577ac07f5c0d81bdbd8f7');
 }finally{await db.close();}
});
test('Dense incremental Worker preserves two sheets, leading zeros, text and formula-looking names',async()=>{
 const w=worker();await w.send('start');await w.send('page',{kind:'Items',rows:[{item_code:'001',item_name:'=1+1',group_name:'Medicine',identifier_count:1}]});await w.send('page',{kind:'Identifiers',rows:[{id:'reference',item_code:'001',identifier_display:'000ABC'}]});const {buffer}=await w.send('finish'),book=w.c.XLSX.read(buffer,{type:'array'});
 assert.deepEqual(Array.from(book.SheetNames),['Items','Identifiers']);assert.equal(book.Sheets.Items.A2.v,'001');assert.equal(book.Sheets.Items.B2.v,'=1+1');assert.equal(book.Sheets.Items.B2.f,undefined);assert.equal(book.Sheets.Identifiers.B2.v,'000ABC');assert.equal(book.Sheets.Identifiers.B2.t,'s');
});
test('Stored ZIP fallback works without native compression',async()=>{
 const w=worker();w.c.CompressionStream=undefined;await w.send('start');await w.send('page',{kind:'Items',rows:[{item_code:'001',item_name:'A & B',identifier_count:0}]});const {buffer}=await w.send('finish'),book=w.c.XLSX.read(buffer,{type:'array'});assert.equal(book.Sheets.Items.B2.v,'A & B');
});
