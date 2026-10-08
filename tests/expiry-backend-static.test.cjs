const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const path='proposals/expiry-backend/20261008004855_expiry_capture_integrity_final.sql';
test('Migration is reproducible and all legacy Receiving bodies remain exact apart from Expiry-only guard',()=>{
 const before=fs.readFileSync(path,'utf8');cp.execFileSync('python3',['tests/expiry-backend/build-proposal.py']);assert.equal(fs.readFileSync(path,'utf8'),before);
 for(const d of JSON.parse(fs.readFileSync('tests/expiry-backend/deployed-save-contracts.json','utf8'))){
  const guard=d.proname==='save_pharmacy_needs_review'?"if upper(btrim(coalesce(p_workflow,'')))='EXPIRY' then raise exception 'Expiry capture requires operation-aware V3';end if;":d.proname.includes('verified_state')?"if upper(btrim(coalesce(p_event_type,'CAPTURE')))='CAPTURE' then raise exception 'Expiry capture requires operation-aware V3';end if;":"raise exception 'Expiry capture requires operation-aware V3';";
  assert.ok(before.includes(d.definition.replace(/\bbegin\b/i,m=>m+'\n '+guard)),d.proname);
 }
});
test('Migration does not replace auth, Global Master, Receiving ledger or existing media policies',()=>{
 const sql=fs.readFileSync(path,'utf8');assert.doesNotMatch(sql,/\b(drop|truncate)\b/i);assert.doesNotMatch(sql,/create or replace function public\.(?:is_pharmacy_|.*global|.*receiving)/i);
 assert.doesNotMatch(sql,/(?:alter|insert into|update|delete from) (?:public\.)?pharmflow_(?:global|receiving)/i);
 assert.doesNotMatch(sql,/drop policy|alter policy/i);assert.match(sql,/create policy pharmflow_expiry_staged_photo_delete/);
});
test('Native integration runner refuses remote/non-disposable database targets before connection',()=>{
 const runner=fs.readFileSync('tests/expiry-backend-postgres.test.cjs','utf8');assert.match(runner,/Only a fresh disposable loopback synthetic database is allowed/);assert.match(runner,/Native synthetic database must be empty/);assert.match(runner,/NOT RUN: native PostgreSQL unavailable/);
});
