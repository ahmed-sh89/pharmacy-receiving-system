const test=require('node:test'),assert=require('node:assert/strict'),{harness}=require('./expiry-desktop-harness.cjs');
const tick=()=>new Promise(setImmediate);
function fixture(count=53,server){
 const h=harness(),base=h.c.authRpc;server??={rows:Array.from({length:count},(_,i)=>({...h.data[i%h.data.length],row_id:'resolved-'+i,version:'revision-'+i,status:'RESOLVED',cleared:false,restored:false})),receipts:new Map(),writes:0};
 h.c.showToast=(message,kind)=>h.toasts.push({message,kind});h.toasts=[];
 const eligible=p=>server.rows.filter(r=>!r.cleared&&!r.restored&&(!p.p_filters?.search||r.item_name.includes(p.p_filters.search))&&(!p.p_ids||p.p_ids.includes(r.row_id)));
 h.c.authRpc=async(name,p)=>{
  if(p?.p_resolved&&name==='query_pharmflow_expiry_inventory_v1'){h.calls.push({name,p});const rows=eligible(p);return {rows:structuredClone(rows.slice(p.p_offset,p.p_offset+p.p_limit)),count:rows.length,units:rows.reduce((n,r)=>n+r.quantity,0),groups:[...h.c.PharmFlowClassificationFilters.approvedGroups],has_unassigned_group:false,months:[]};}
  if(p?.p_resolved&&name==='select_pharmflow_expiry_inventory_v1'){h.calls.push({name,p});const rows=eligible(p);return {count:rows.length,units:rows.reduce((n,r)=>n+r.quantity,0),selection:rows.map(r=>({id:r.row_id,version:r.version}))};}
  if(name==='mutate_pharmflow_expiry_inventory_v1'&&['CLEAR_RESOLVED','RESTORE'].includes(p.p_action)){
   h.calls.push({name,p:structuredClone(p)});const payload=JSON.stringify(p),old=server.receipts.get(p.p_request_id);
   if(old){if(old.payload!==payload)throw Object.assign(Error('Request payload conflict'),{serverRejected:true});return old.result;}
   const rows=p.p_selection.map(s=>server.rows.find(r=>r.row_id===s.id&&!r.cleared&&!r.restored&&r.version===s.version));
   if(rows.some(r=>!r))throw Object.assign(Error('Inventory changed; refresh and confirm selection again'),{serverRejected:true});
   rows.forEach(r=>r[p.p_action==='CLEAR_RESOLVED'?'cleared':'restored']=true);server.writes++;
   const result={request_id:p.p_request_id,count:rows.length,action:p.p_action};server.receipts.set(p.p_request_id,{payload,result});return result;
  }
  return base(name,p);
 };
 return {...h,server,async open(){await this.refresh();await this.click('btnOpenExpiryInventory');this.e('expiryResolved').onclick();await tick();},async clear(){this.e('expiryClearResolved').onclick();await tick();}};
}
test('Clear All is available only in Resolved, with Restore All preserved',async()=>{
 const h=fixture();await h.click('btnOpenExpiryInventory');assert.equal(h.e('expiryClearResolved').hidden,true);h.e('expiryClearResolved').onclick();await tick();assert.equal(h.document.querySelector('dialog'),null);
 h.e('expiryResolved').onclick();await tick();assert.equal(h.e('expiryClearResolved').hidden,false);assert.equal(h.e('expiryClearResolved').textContent,'Clear All');assert.equal(h.e('expiryAll').textContent,'Restore All');
});
test('one confirmation uses all 53 reviewed rows, Cancel writes nothing; confirmation clears count and rows',async()=>{
 const h=fixture();await h.open();assert.equal(h.document.querySelectorAll('[data-row-actions]').length,40);const active=JSON.stringify(h.data);
 await h.clear();let d=h.document.querySelector('dialog');assert.match(d.textContent,/Clear resolved list\?/);assert.match(d.textContent,/53 records/);assert.match(d.textContent,/Historical data will be kept/);assert.equal(d.querySelector('[type=submit]').textContent,'Clear All');
 d.querySelector('[data-cancel]').click();assert.equal(h.server.writes,0);await h.clear();await h.submit();await h.submit();
 assert.equal(h.server.writes,1);assert.equal(h.server.rows.length,53);assert(h.server.rows.every(r=>r.cleared));assert.equal(h.e('expiryCurrentStateCount').textContent,'0');assert.equal(h.document.querySelectorAll('[data-row-actions]').length,0);assert.equal(h.e('expiryAll').disabled,true);assert.equal(h.e('expiryClearResolved').disabled,true);assert.equal(JSON.stringify(h.data),active);assert.match(h.toasts.at(-1).message,/Cleared 53 records/);
 const m=h.calls.find(c=>c.name==='mutate_pharmflow_expiry_inventory_v1');assert.equal(m.p.p_action,'CLEAR_RESOLVED');assert.equal(m.p.p_selection.length,53);assert.equal(m.p.p_pharmacy_id,'pharmacy1');
 await h.refresh();assert.equal(h.e('expiryCurrentStateCount').textContent,'0');
 const pc2=fixture(0,h.server);await pc2.open();assert.equal(pc2.e('expiryCurrentStateCount').textContent,'0');
});
test('Clear All targets only current filtered list, not unrelated resolved entries',async()=>{
 const h=fixture(5);await h.open();h.e('expiryCurrentSearch').value='Product 2';h.e('expiryCurrentSearch').oninput({target:h.e('expiryCurrentSearch')});await h.flush();await h.clear();assert.match(h.document.querySelector('dialog').textContent,/1 records/);await h.submit();assert.equal(h.server.rows.filter(r=>r.cleared).length,1);assert.equal(h.server.rows.filter(r=>!r.cleared).length,4);assert.equal(h.e('expiryCurrentStateCount').textContent,'0');
});
test('stale Restore/Clear conflicts are visible and abort the selection; context changes block execution',async()=>{
 const h=fixture(3);await h.open();await h.clear();h.server.rows[0].restored=true;await h.submit();assert.equal(h.server.writes,0);assert.equal(h.server.rows.filter(r=>r.cleared).length,0);const d=h.document.querySelector('dialog');assert.match(d.querySelector('[role=alert]').textContent,/Inventory changed/);assert.equal(d.querySelector('[type=submit]').disabled,true);
 d.close();await h.refresh();await h.clear();h.c.pharmacy='different-pharmacy';h.c.account='employee/different-pharmacy';await h.submit();assert.equal(h.server.writes,0);assert.match(d.querySelector('[role=alert]').textContent,/scope or filters changed/);
});
test('uncertain Clear retry reuses the same receipt and never clears twice',async()=>{
 const h=fixture(2);await h.open();const rpc=h.c.authRpc;let fail=true;
 h.c.authRpc=async(name,p)=>{const result=await rpc(name,p);if(name==='mutate_pharmflow_expiry_inventory_v1'&&fail){fail=false;throw Error('Network response lost');}return result;};
 await h.clear();await h.submit();assert.equal(h.server.writes,1);assert.equal(h.storage.size,1);assert.match(h.document.querySelector('dialog [role=alert]').textContent,/Network response lost/);
 await h.submit();assert.equal(h.server.writes,1);assert.equal(h.storage.size,0);assert.equal(h.e('expiryCurrentStateCount').textContent,'0');
});
test('Restore All continues to affect only uncleared, unrestored records',async()=>{
 const h=fixture(4);h.server.rows[0].cleared=true;h.server.rows[1].restored=true;await h.open();assert.equal(h.e('expiryCurrentStateCount').textContent,'2');h.e('expiryAll').onclick();await tick();await h.submit();assert.equal(h.server.rows[0].restored,false);assert.equal(h.server.rows[1].restored,true);assert.equal(h.server.rows.filter(r=>r.restored).length,3);assert.equal(h.e('expiryCurrentStateCount').textContent,'0');
});
