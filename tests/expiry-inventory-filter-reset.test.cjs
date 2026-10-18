const test=require('node:test'),assert=require('node:assert/strict'),{harness}=require('./expiry-desktop-harness.cjs');
const fs=require('node:fs'),path=require('node:path');
test('Inventory pages are server limited; session and Inventory never share KPI authority',async()=>{const h=harness();await h.refresh();assert.equal(h.document.querySelectorAll('[data-metric]').length,0);assert.equal(h.document.querySelector('[data-session-total=items]').textContent,'2');assert.equal(h.calls.some(x=>x.name==='query_pharmflow_expiry_inventory_v1'),false);await h.click('btnOpenExpiryInventory');assert.equal(h.e('expiryCurrentStateCount').textContent,'73');assert.equal(h.document.querySelectorAll('tbody tr').length,40);assert.equal(h.document.querySelector('.expiryCaptureCard').hidden,true);const q=h.calls.filter(x=>x.name==='query_pharmflow_expiry_inventory_v1').at(-1).p;assert.equal(q.p_limit,40);assert.equal(q.p_offset,0);assert.equal(q.p_sort,'ADDED');});
test('Combined search, month, Group and KPI bounds share one query contract; Clear removes every restriction',async()=>{
 const h=harness();await h.click('btnOpenExpiryInventory');h.document.querySelector('[data-period=NEXT6]').onclick();await new Promise(r=>setImmediate(r));
 await h.click('expiryFilter');h.e('expirySectiongroups').onclick();h.e('expiryGroups').querySelector('[data-group]').onclick();h.e('expirySectionmonths').onclick();h.e('expiryMonths').querySelector('[data-month]').onclick();
 await h.e('expiryApplyFilters').onclick();await h.refresh();h.e('expiryCurrentSearch').value='Product';h.e('expiryCurrentSearch').oninput({target:h.e('expiryCurrentSearch')});await h.flush();
 const q=h.calls.filter(x=>x.name==='query_pharmflow_expiry_inventory_v1').at(-1).p;assert.equal(q.p_filters.groups.length,1);assert.ok(q.p_filters.months.includes('2027-01'));assert.equal(q.p_filters.search,'Product');assert.equal(q.p_sort,'EXPIRY');
 await h.click('btnClearExpiryFilters');const cleared=h.calls.filter(x=>x.name==='query_pharmflow_expiry_inventory_v1').at(-1).p;assert.deepEqual(JSON.parse(JSON.stringify(cleared.p_filters)),{search:'',groups:[],include_unassigned:false,months:[]});assert.equal(cleared.p_sort,'ADDED');
});
test('Late pharmacy and older filter responses cannot replace current rows',async()=>{const h=harness();await h.click('btnOpenExpiryInventory');const rpc=h.c.authRpc;let release;h.c.authRpc=(name,p)=>name==='query_pharmflow_expiry_inventory_v1'?new Promise(r=>release=r):rpc(name,p);const pending=h.refresh();await new Promise(r=>setImmediate(r));h.c.authIdentity='auth2';release({rows:[h.data[0]],count:999,units:999,groups:['Medicine'],has_unassigned_group:true,months:[]});await pending;assert.notEqual(h.e('expiryCurrentStateCount').textContent,'999');});
test('Filter sections and years reopen collapsed while applied values remain selected',async()=>{
 const h=harness();await h.click('btnOpenExpiryInventory');await h.click('expiryFilter');
 assert.equal(h.e('expirySectionmonths').getAttribute('aria-expanded'),'false');assert.equal(h.e('expirySectiongroups').getAttribute('aria-expanded'),'false');
 h.e('expirySectionmonths').onclick();const yearToggle=h.e('expiryMonths').querySelector('[data-year-toggle]');assert.ok(yearToggle);yearToggle.onclick();
 const month=h.e('expiryMonths').querySelector('[data-month]');assert.ok(month);month.onclick();
 h.e('expirySectiongroups').onclick();const group=h.e('expiryGroups').querySelector('[data-group]');assert.ok(group);const selectedGroup=group.dataset.group;group.onclick();
 await h.e('expiryApplyFilters').onclick();await h.click('expiryFilter');
 assert.equal(h.e('expirySectionmonths').getAttribute('aria-expanded'),'false');assert.equal(h.e('expirySectiongroups').getAttribute('aria-expanded'),'false');
 assert.equal(h.e('expiryGroups').querySelector('[data-group="'+selectedGroup+'"]').getAttribute('aria-checked'),'true');
 h.e('expirySectionmonths').onclick();h.e('expiryMonths').querySelector('[data-year-toggle]').onclick();h.e('expirySectiongroups').onclick();
 await h.click('expiryFilter');await h.click('expiryFilter');
 assert.equal(h.e('expirySectionmonths').getAttribute('aria-expanded'),'false');assert.equal(h.e('expirySectiongroups').getAttribute('aria-expanded'),'false');
 assert.equal(h.e('expiryMonths').querySelector('[data-year-toggle]').getAttribute('aria-expanded'),'false');
 assert.equal(h.e('expiryGroups').querySelector('[data-group="'+selectedGroup+'"]').getAttribute('aria-checked'),'true');
 assert.equal(h.e('expiryMonths').querySelector('[data-month="2027-01"]').getAttribute('aria-checked'),'true');
});
test('Filter popover keeps header, resolved controls and actions fixed around an internal scroll area',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../css/dashboard.css'),'utf8'),block=css.slice(css.lastIndexOf('/* Keep filter actions fixed while only the filter options area scrolls. */'));
 assert.match(block,/max-height:min\(560px,calc\(100vh - 140px\)\)/);assert.match(block,/max-height:min\(560px,calc\(100dvh - 140px\)\)/);
 assert.match(block,/\.expiryFilterPanel>header,[\s\S]*?\.expiryFilterContext,[\s\S]*?\.expiryFilterPanel>footer\{flex:0 0 auto\}/);
 assert.match(block,/\.expiryFilterScroll\{flex:1 1 auto;min-height:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable\}/);
 assert.ok(block.split('\n').filter(line=>line.startsWith('body:not(.zebraDevice)')).every(line=>line.includes('#zebraExpiryShell')));
 const maxHeight=v=>Math.min(560,v-140);for(const viewportHeight of [768,960,1024])assert.equal(maxHeight(viewportHeight),560);
});
test('Expired KPI keeps the inclusive Through Oct 2026 label and boundary',async()=>{
 const h=harness();h.data[0].expiry_year=2026;h.data[0].expiry_month=10;h.data[1].expiry_year=2026;h.data[1].expiry_month=11;
 await h.click('btnOpenExpiryInventory');h.document.querySelector('[data-period="EXPIRED"]').onclick();await h.refresh();
 const query=h.calls.filter(x=>x.name==='query_pharmflow_expiry_inventory_v1').at(-1);
 assert.equal(query.p.p_filters.to,2026*12+10);assert.equal(query.p.p_filters.from,undefined);assert.equal(h.e('expiryCurrentStateCount').textContent,'1');
 await h.click('expiryFilter');assert.match(h.e('expiryExpiredChoice').textContent,/Through Oct 2026/);
});
