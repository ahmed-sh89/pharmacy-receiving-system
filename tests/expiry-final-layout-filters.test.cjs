const test=require('node:test'),assert=require('node:assert/strict'),{harness}=require('./expiry-desktop-harness.cjs');
const tick=()=>new Promise(setImmediate);
async function inventory(){const h=harness();await h.refresh();await h.click('btnOpenExpiryInventory');return h;}
test('canonical Group is shared by Session and Inventory; missing values use dash',async()=>{
 const h=harness();await h.refresh();assert.equal(h.document.querySelectorAll('.expirySessionTable th').length,7);assert.equal(h.document.querySelector('.expiryInventoryGroup').textContent,'Home Health');assert.equal(h.c.ExpiryInventoryFilters.rowGroup({group_name:null,category:'Medicine'}).label,'—');
 await h.click('btnOpenExpiryInventory');assert.equal(h.document.querySelectorAll('.expiryInventoryTable th').length,10);assert.equal(h.c.ExpiryInventoryFilters.rowGroup({group_name:'Mom & Baby'}).label,'Mom and Baby');
});
test('Operator, canonical Group and expiry combine in Apply; Reset All removes all three',async()=>{
 const h=await inventory();await h.click('expiryFilter');await h.click('expirySectionoperators');const op=h.e('expiryOperators').querySelector('[data-operator="Alex Pharmacy Employee"]');op.onclick();await h.click('expirySectiongroups');h.e('expiryGroups').querySelector('[data-group="Medicine"]').onclick();await h.click('expirySectionmonths');h.e('expiryMonths').querySelector('[data-month="2027-01"]').onclick();await h.click('expiryApplyFilters');
 const req=h.calls.filter(x=>x.name==='query_pharmflow_expiry_inventory_v1'&&x.p.p_limit!==1).at(-1).p.p_filters;assert.deepEqual([...req.operators],['Alex Pharmacy Employee']);assert.deepEqual([...req.groups],['Medicine']);assert.deepEqual([...req.months],['2027-01']);
 assert([...h.document.querySelectorAll('.expiryOperatorCell')].every(e=>e.textContent==='Alex Pharmacy Employee'));await h.click('expiryFilter');await h.click('btnClearExpiryFilters');const reset=h.calls.filter(x=>x.name==='query_pharmflow_expiry_inventory_v1'&&x.p.p_limit!==1).at(-1).p.p_filters;assert.equal(reset.operators,undefined);assert.equal(reset.groups.length,0);assert.equal(reset.months.length,0);
});
test('Restore Selected and Clear Selected stay disabled without selection; Clear submits exact ids only',async()=>{
 const h=await inventory();await h.click('expiryResolved');await h.click('expirySelect');assert.equal(h.e('expiryBulkAction').textContent,'Restore Selected');assert.equal(h.e('expiryBulkAction').disabled,true);assert.equal(h.e('expiryClearSelected').disabled,true);assert.equal(h.e('expiryClearSelected').hidden,false);
 const checks=[...h.document.querySelectorAll('[data-row-selection]')];for(const c of checks.slice(0,2)){c.checked=true;c.onchange();}assert.equal(h.e('expiryClearSelected').disabled,false);await h.click('expiryClearSelected');assert.match(h.document.querySelector('dialog').textContent,/2 records/);assert.match(h.document.querySelector('dialog footer').textContent,/Clear Selected/);await h.submit();const m=h.calls.find(x=>x.name==='mutate_pharmflow_expiry_inventory_v1');assert.equal(m.p.p_action,'CLEAR_RESOLVED');assert.deepEqual(Array.from(m.p.p_selection,x=>x.id),['r0','r1']);
});
test('Restore Selected supports multiple records through the existing transactional contract',async()=>{
 const h=await inventory();await h.click('expiryResolved');await h.click('expirySelect');for(const c of [...h.document.querySelectorAll('[data-row-selection]')].slice(0,2)){c.checked=true;c.onchange();}await h.click('expiryBulkAction');await h.submit();const m=h.calls.find(x=>x.name==='mutate_pharmflow_expiry_inventory_v1');assert.equal(m.p.p_action,'RESTORE');assert.equal(m.p.p_selection.length,2);
});
test('row action anchor is exact and highlight clears when closed',async()=>{
 const h=await inventory();const triggers=h.document.querySelectorAll('[data-row-actions]'),trigger=triggers[3];trigger.getBoundingClientRect=()=>({left:1200,right:1230,top:350,bottom:380});trigger.onclick();assert.equal(trigger.classList.contains('is-menu-open'),true);h.e('expiryRowActionPanel').querySelector('[data-menu-edit]').click();assert.equal(trigger.classList.contains('is-menu-open'),false);assert.match(h.document.querySelector('dialog').textContent,/Product 3/);
});
test('Excel full active export ignores applied Operator and month selections',async()=>{
 const h=await inventory();await h.click('expiryFilter');h.e('expiryOperators').querySelector('[data-operator="Handheld"]').onclick();h.e('expiryMonths').querySelector('[data-month="2027-01"]').onclick();await h.click('expiryApplyFilters');
 let written;h.c.XLSX={utils:{json_to_sheet:data=>{written=data;return {'!ref':'A1:J74',A2:{},B2:{}}},book_new:()=>({}),book_append_sheet(){}}};h.c.ExpiryInventoryReport.saveWorkbook=()=>{};await h.click('btnExportExpiryInventory');const req=h.calls.filter(x=>x.name==='export_pharmflow_expiry_inventory_v1').at(-1).p;assert.equal(req.p_resolved,false);assert.deepEqual(Object.keys(req.p_filters),[]);assert.equal(written.length,73);
});
