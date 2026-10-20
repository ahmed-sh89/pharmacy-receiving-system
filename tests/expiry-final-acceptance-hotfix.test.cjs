const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {harness}=require('./expiry-desktop-harness.cjs');
const tick=()=>new Promise(setImmediate);
async function inventory(){const h=harness();await h.refresh();await h.click('btnOpenExpiryInventory');return h;}
const clickPeriod=(h,key)=>h.document.querySelector('[data-period="'+key+'"]').onclick({detail:1});
const wire=h=>h.calls.filter(c=>c.name==='query_pharmflow_expiry_inventory_v1'&&c.p.p_limit!==1).at(-1).p.p_filters;
test('single KPI click replaces; double adds without an intermediate query; clear cancels queued clicks',async()=>{
 const h=await inventory();clickPeriod(h,'NEXT1');await h.flush();assert.deepEqual([...wire(h).months],['2026-11']);
 const before=h.calls.filter(c=>c.name==='query_pharmflow_expiry_inventory_v1').length;
 clickPeriod(h,'NEXT2');await tick();assert.equal(h.calls.filter(c=>c.name==='query_pharmflow_expiry_inventory_v1').length,before);
 clickPeriod(h,'NEXT2');await tick();assert.deepEqual([...wire(h).months],['2026-11','2026-12','2027-01']);
 clickPeriod(h,'NEXT6');clickPeriod(h,'NEXT6');await tick();assert.equal(wire(h).months.length,6);
 clickPeriod(h,'NEXT1');await h.flush();assert.deepEqual([...wire(h).months],['2026-11']);
 clickPeriod(h,'NEXT6');h.e('expiryQuickClearKpi').onclick();await h.flush();assert.equal(wire(h).months.length,0);
});
test('KPI expired interval remains unbounded and keyboard selection replaces',async()=>{
 const h=await inventory();h.document.querySelector('[data-period="EXPIRED"]').onclick({detail:0});await tick();assert.equal(wire(h).to,2026*12+10);
 h.document.querySelector('[data-period="NEXT1"]').onclick({detail:0});await tick();assert.equal(wire(h).to,undefined);assert.deepEqual([...wire(h).months],['2026-11']);
});
test('row popover has explicit scoped Edit and Remove and compact quantity input',async()=>{
 const h=await inventory(),r=h.document.querySelector('[data-row-actions]');r.onclick();const menu=h.e('expiryRowActionPanel');assert(menu.classList.contains('expiryRowActionMenu'));assert.equal(menu.querySelectorAll('svg path').length,2);assert.equal(menu.textContent,'EditRemove');
 menu.querySelector('[data-menu-edit]').click();assert(h.document.querySelector('[data-total]').closest('.expiryCompactQuantity'));
});
test('one Remove confirmation retains exact selected id/version and backend RESOLVE semantics',async()=>{
 const h=await inventory();h.document.querySelector('[data-row-actions]').onclick();h.e('expiryRowActionPanel').querySelector('[data-menu-resolve]').click();await tick();
 const d=h.document.querySelector('dialog');assert.match(d.textContent,/Remove this item\?/);assert.match(d.textContent,/kept in History/);assert.doesNotMatch(d.textContent,/Scope Review|Final Confirmation/);await h.submit();
 const m=h.calls.find(c=>c.name==='mutate_pharmflow_expiry_inventory_v1');assert.equal(m.p.p_action,'RESOLVE');assert.deepEqual(JSON.parse(JSON.stringify(m.p.p_selection)),[{id:'r0',version:'version-0'}]);
});
test('Restore All previews all matching pages and submits exact snapshot once',async()=>{
 const h=await inventory();h.e('expiryResolved').onclick();await tick();assert.equal(h.e('expiryAll').textContent,'Restore All');h.e('expiryAll').onclick();await tick();const d=h.document.querySelector('dialog');assert.match(d.textContent,/Restore 73 records/);await h.submit();assert.equal(h.calls.filter(c=>c.name==='mutate_pharmflow_expiry_inventory_v1').length,1);const m=h.calls.find(c=>c.name==='mutate_pharmflow_expiry_inventory_v1');assert.equal(m.p.p_action,'RESTORE');assert.equal(m.p.p_selection.length,73);
});
test('Excel uses all active pharmacy rows, exact text identifiers, Operator and local dates',async()=>{
 const h=await inventory();const source=h.c.ExpiryInventoryReport;let written;
 h.c.XLSX={utils:{json_to_sheet:data=>{written=data;return {'!ref':'A1:J74',A2:{},B2:{}}},book_new:()=>({}),book_append_sheet(){}}};
 source.saveWorkbook=()=>{};h.e('expiryCurrentSearch').value='Product 7';h.e('expiryCurrentSearch').oninput({target:h.e('expiryCurrentSearch')});await h.flush();h.e('btnExportExpiryInventory').onclick();await tick();
 const c=h.calls.filter(c=>c.name==='export_pharmflow_expiry_inventory_v1').at(-1);assert.deepEqual(Object.keys(c.p.p_filters),[]);assert.equal(c.p.p_resolved,false);assert.equal(written.length,73);assert.equal(written[0]['Item Code'],'000');assert.equal(written[0].GTIN,'0000');assert.equal(written[0].Operator,h.data[0].first_operator_name);assert.doesNotMatch(written[0]['Last Updated'],/T12:30:00Z/);assert('Group' in written[0]);assert(!('Category' in written[0]));
});
test('export errors have close control, timeout and are cleared by switching tabs',async()=>{
 const h=await inventory();h.c.ExpiryInventoryReport.pdf=async()=>{throw Error('Fixture PDF failure')};h.e('expiryPrint').onclick();await tick();
 // Print fixture has no canvas: genuine rendering error still needs dismiss/retry feedback.
 const n=h.e('expiryExportStatus');assert.equal(n.getAttribute('role'),'alert');assert(n.querySelector('[aria-label="Dismiss export notification"]'));await h.click('btnExpirySessionView');assert.equal(n.hidden,true);assert.equal(h.c.status,undefined);
});
test('Operator defaults follow device; manual choice survives reload and no selection change replays saves',async()=>{
 const source=fs.readFileSync('js/expiry.js','utf8');const start=source.indexOf('async function loadExpiryWorkers(){'),end=source.indexOf('\nfunction renderExpiryWorkerSelects',start);
 for(const handheld of [false,true]){
  const storage=new Map(),engine={workers:[],selectedWorkerId:'',storageKey:()=> 'scope'};
  const c={ExpiryCaptureEngine:engine,expiryPharmacyId:()=> 'pa',expiryIsHandheld:()=>handheld,authRpc:async()=>[{worker_id:'desktop',worker_name:'Desktop'},{worker_id:'handheld',worker_name:'Handheld'},{worker_id:'human',worker_name:'Actual Operator'}],localStorage:{getItem:k=>storage.get(k)},sessionStorage:{getItem:k=>storage.get(k)},renderExpiryWorkerSelects(){},renderExpiryWorkerSettingsList(){}};vm.createContext(c);vm.runInContext(source.slice(start,end),c);
  await c.loadExpiryWorkers();assert.equal(engine.selectedWorkerId,handheld?'handheld':'desktop');engine.selectedWorkerId='human';await c.loadExpiryWorkers();assert.equal(engine.selectedWorkerId,'human');engine.selectedWorkerId='';storage.set('scope','human');await c.loadExpiryWorkers();assert.equal(engine.selectedWorkerId,'human');
 }
 const select=source.slice(source.indexOf('function selectExpiryWorker('),source.indexOf('\nfunction setExpiryStatus'));
 assert.doesNotMatch(select,/saveExpiryCapture\(|save_pharmflow/);assert.match(source,/Select an Operator before saving\. Your capture has been retained/);
});
const {harness:captureHarness}=require('./expiry-capture-review.test.cjs');
for(const handheld of [false,true])test(`${handheld?'Handheld':'Desktop'} default permits immediate explicit Save and stays selected after Save & Next`,async()=>{
 const h=captureHarness(handheld),rpc=h.c.authRpc;h.c.engine.selectedWorkerId='';h.c.engine.workers=[];
 h.c.authRpc=(name,p)=>name==='list_pharmacy_expiry_workers'?Promise.resolve([{worker_id:'desktop',worker_name:'Desktop'},{worker_id:'handheld',worker_name:'Handheld'}]):rpc(name,p);
 await h.c.loadExpiryWorkers();assert.equal(h.c.engine.selectedWorkerId,handheld?'handheld':'desktop');
 await h.c.resolveExpiryScannedValue('5000167019391');h.c.setExpiryControlValue(h.e('expiryMonth'),'2');h.c.setExpiryControlValue(h.e('expiryYear'),'2027');h.e('expiryQuantity').value='2';h.e('expiryBatchInput').value='Ab12cD45';
 await h.c.saveExpiryCapture();assert.equal(h.receipts.size,1);assert.equal([...h.receipts.values()][0].worker_id,handheld?'handheld':'desktop');assert.equal(h.c.engine.selectedWorkerId,handheld?'handheld':'desktop');
});
test('export failure can be dismissed and times out without leaking late async errors',async()=>{
 const h=await inventory();h.c.ExpiryInventoryReport.pdf=async()=>{throw Error('Report fixture error')};h.e('expiryPdf').onclick();await tick();const n=h.e('expiryExportStatus');assert.equal(n.hidden,false);n.querySelector('button').onclick();assert.equal(n.hidden,true);
 h.e('expiryPdf').onclick();await tick();await h.flush();assert.equal(n.hidden,true);
 let reject;h.c.ExpiryInventoryReport.pdf=()=>new Promise((_,r)=>reject=r);h.e('expiryPdf').onclick();await tick();await h.click('btnExpirySessionView');reject(Error('Late export fixture error'));await tick();assert.equal(n.hidden,true);
});
test('row popover closes outside and on Escape with focus restored',async()=>{
 const h=await inventory(),trigger=h.document.querySelector('[data-row-actions]');trigger.onclick();const menu=h.e('expiryRowActionPanel');h.e('expiryCurrentSearch').dispatchEvent(new h.window.Event('click',{bubbles:true}));assert.equal(menu.hidden,true);
 trigger.onclick();const event=new h.window.Event('keydown',{bubbles:true,cancelable:true});event.key='Escape';h.document.dispatchEvent(event);assert.equal(menu.hidden,true);assert.equal(h.document.activeElement,trigger);
});
