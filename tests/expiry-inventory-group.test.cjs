"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {harness}=require('./expiry-desktop-harness.cjs');
const source=fs.readFileSync('js/receiving-release.js','utf8');
const start=source.indexOf('window.PharmFlowClassificationFilters=');
const end=source.indexOf('\n\n\n/* Retired device-local',start);
assert(start>=0&&end>start);
function classification(){const c={window:{}};vm.createContext(c);vm.runInContext(source.slice(start,end),c);return c.window.PharmFlowClassificationFilters;}

test('Expiry Group display uses the Production canonical mapping and never falls back to Category',()=>{
  const c={window:{PharmFlowClassificationFilters:classification()}};vm.createContext(c);vm.runInContext(fs.readFileSync('js/expiry-inventory-filters.js','utf8'),c);
  const f=c.window.ExpiryInventoryFilters;
  assert.deepEqual(Array.from(c.window.PharmFlowClassificationFilters.approvedGroups),['Beauty','FMCG','HomeHealth','Medicine','Mom & Baby','Supplement']);
  assert.equal(f.rowGroup({group_name:'HomeHealth',category:'Beauty'}).label,'Home Health');
  assert.deepEqual(JSON.parse(JSON.stringify(f.rowGroup({group_name:null,category:'Medicine'}))),{group:'',label:'No canonical Group'});
  assert.equal(f.rowGroup({group_name:'Legacy Retail',category:'Medicine'}).label,'Unmapped Group');
});

test('Group, unassigned, search and month filters share one complete server filter contract',()=>{
  const c={window:{PharmFlowClassificationFilters:classification()}};vm.createContext(c);vm.runInContext(fs.readFileSync('js/expiry-inventory-filters.js','utf8'),c);
  const f=c.window.ExpiryInventoryFilters;
  const wire=f.wire({search:'00123',groups:['Medicine','HomeHealth','not approved'],includeUnassigned:true,months:['2027-08']});
  assert.deepEqual(JSON.parse(JSON.stringify(wire)),{search:'00123',groups:['Medicine','HomeHealth'],include_unassigned:true,months:['2027-08']});
  assert.equal(Object.hasOwn(wire,'departments'),false);
});

test('Old inventory response fails closed until canonical Group row and full-dataset facets are supplied',()=>{
  const c={window:{PharmFlowClassificationFilters:classification()}};vm.createContext(c);vm.runInContext(fs.readFileSync('js/expiry-inventory-filters.js','utf8'),c);
  const f=c.window.ExpiryInventoryFilters;
  assert.throws(()=>f.assertCanonicalGroupContract({rows:[{department:'Medicine'}],groups:[],months:[]}),/Canonical Group data is unavailable/);
  assert.throws(()=>f.assertCanonicalGroupContract({rows:[{group_name:null}],months:[]}),/Canonical Group data is unavailable/);
  assert.equal(f.assertCanonicalGroupContract({rows:[{group_name:'Medicine'}],groups:['Beauty','FMCG','HomeHealth','Medicine','Mom & Baby','Supplement'],has_unassigned_group:true,months:[]}).rows.length,1);
});

test('Group filter counts and paginates server matches across all authorized rows; search composes with it',async()=>{
  const h=harness();await h.click('btnOpenExpiryInventory');await h.click('expiryFilter');await h.e('expirySectiongroups').onclick();
  const medicine=h.e('expiryGroups').querySelector('[data-group="Medicine"]');medicine.onclick();await h.e('expiryApplyFilters').onclick();await h.refresh();await new Promise(r=>setImmediate(r));
  let q=h.calls.filter(x=>x.name==='query_pharmflow_expiry_inventory_v1').at(-1).p;
  assert.deepEqual(JSON.parse(JSON.stringify(q.p_filters.groups)),['Medicine']);assert.equal(h.e('expiryCurrentStateCount').textContent,'55');assert.equal(h.document.querySelectorAll('tbody tr').length,40);
  await h.e('expiryNext').onclick();await new Promise(r=>setImmediate(r));
  q=h.calls.filter(x=>x.name==='query_pharmflow_expiry_inventory_v1').at(-1).p;
  assert.equal(q.p_offset,40);assert.equal(h.document.querySelectorAll('tbody tr').length,15);
  h.e('expiryCurrentSearch').value='Product 5';h.e('expiryCurrentSearch').oninput({target:h.e('expiryCurrentSearch')});await h.flush();
  q=h.calls.filter(x=>x.name==='query_pharmflow_expiry_inventory_v1').at(-1).p;
  assert.equal(q.p_filters.search,'Product 5');assert.deepEqual(JSON.parse(JSON.stringify(q.p_filters.groups)),['Medicine']);assert.equal(Number(h.e('expiryCurrentStateCount').textContent),6);
  assert.match(h.document.querySelector('thead').textContent,/Group/);assert.doesNotMatch(h.document.querySelector('thead').textContent,/Category/);
});

test('Missing Group selection is explicit and reports retain exact identifiers and Group labels',async()=>{
  const h=harness();await h.click('btnOpenExpiryInventory');await h.click('expiryFilter');await h.e('expirySectiongroups').onclick();
  const missing=h.e('expiryGroups').querySelector('[data-unassigned]');assert.ok(missing);missing.onclick();await h.e('expiryApplyFilters').onclick();await h.refresh();await new Promise(r=>setImmediate(r));
  const q=h.calls.filter(x=>x.name==='query_pharmflow_expiry_inventory_v1').at(-1).p;
  assert.equal(q.p_filters.include_unassigned,true);assert.ok(h.document.querySelector('.expiryInventoryTable tbody').textContent.includes('No canonical Group'));
  const rows=h.data.filter(r=>!h.window.PharmFlowClassificationFilters.normalizeGroup(r.group_name));
  const report=h.c.ExpiryInventoryReport;
  assert.equal(report.excelHeaders[3],'Group');
  const output=report.rows(rows);
  assert.equal(output[0][1],rows[0].item_code);assert.equal(output[0][2],rows[0].identifier_display);assert.ok(output.some(row=>row[4]==='Unmapped Group'));assert.ok(output.some(row=>row[4]==='No canonical Group'));
  assert.equal(report.headers[4],'Group');
});

test('Excel, PDF and Print pass the same Group scope to the authoritative export RPC',async()=>{
  const h=harness();await h.click('btnOpenExpiryInventory');await h.click('expiryFilter');await h.e('expirySectiongroups').onclick();
  h.e('expiryGroups').querySelector('[data-group="Medicine"]').onclick();await h.e('expiryApplyFilters').onclick();await h.refresh();
  for(const id of ['btnExportExpiryInventory','expiryPdf','expiryPrint'])h.e(id).onclick();await new Promise(r=>setImmediate(r));
  const calls=h.calls.filter(x=>x.name==='export_pharmflow_expiry_inventory_v1');
  assert.equal(calls.length,3);for(const call of calls){assert.deepEqual(JSON.parse(JSON.stringify(call.p.p_filters.groups)),['Medicine']);assert.equal(call.p.p_pharmacy_id,'pharmacy1');}
  assert.deepEqual(calls.map(c=>JSON.stringify(c.p.p_filters)),[JSON.stringify(calls[0].p.p_filters),JSON.stringify(calls[0].p.p_filters),JSON.stringify(calls[0].p.p_filters)]);
});

test('Inventory Group reads stay inside the authorized pharmacy RPC boundary',async()=>{
  const h=harness();await h.click('btnOpenExpiryInventory');
  const query=h.calls.filter(x=>x.name==='query_pharmflow_expiry_inventory_v1').at(-1);
  assert.equal(query.p.p_pharmacy_id,'pharmacy1');
  const client=fs.readFileSync('js/expiry-desktop-v2.js','utf8');
  assert.doesNotMatch(client,/\.from\s*\(\s*['"]pharmflow_global_items_v2/);
});
