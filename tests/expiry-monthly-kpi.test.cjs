const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {harness}=require('./expiry-desktop-harness.cjs');
async function inventory(){const h=harness(),base=h.c.authRpc;
 h.data.forEach((r,i)=>{const n=2026*12+10+(i%9-1);r.expiry_year=Math.floor((n-1)/12);r.expiry_month=(n-1)%12+1;r.quantity=i+1;});
 h.c.authRpc=async(name,p)=>{if(name==='summary_pharmflow_expiry_inventory_v1'){const ref=2026*12+10;return [{key:'EXPIRED',from:null,to:ref},{key:'NEXT1',from:ref+1,to:ref+1},{key:'NEXT2',from:ref+1,to:ref+2},{key:'NEXT6',from:ref+1,to:ref+6}].map(b=>({...b,count:h.data.filter(r=>(b.from==null||r.expiry_year*12+r.expiry_month>=b.from)&&r.expiry_year*12+r.expiry_month<=b.to).length,units:h.data.filter(r=>(b.from==null||r.expiry_year*12+r.expiry_month>=b.from)&&r.expiry_year*12+r.expiry_month<=b.to).reduce((n,r)=>n+r.quantity,0)}));}return base(name,p);};
 await h.refresh();await h.click('btnOpenExpiryInventory');return h;
}
async function period(h,key){const b=h.document.querySelector('[data-period="'+key+'"]');b.onclick({detail:1});await new Promise(r=>setImmediate(r));}
test('seven exclusive month buckets include current and earlier, with October and year rollover',()=>{
 const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync('js/expiry-inventory-filters.js','utf8'),c);const f=c.window.ExpiryInventoryFilters;
 for(const ref of [2026*12+10,2026*12+12,2027*12+1]){const b=f.buckets(ref);assert.equal(b.length,7);assert.equal(b[0].to,ref);assert.equal(b[0].from,null);for(let i=1;i<7;i++){assert.equal(b[i].from,ref+i);assert.equal(b[i].to,ref+i);}}
 assert.deepEqual(Array.from(f.buckets(2026*12+10).slice(1),p=>f.code(p.to)),['2026-11','2026-12','2027-01','2027-02','2027-03','2027-04']);
});
test('eight cards default to All Items, full totals include out-of-range dates and local projection is complete',async()=>{
 const h=await inventory();assert.equal(h.document.querySelectorAll('[data-period]').length,8);assert.equal(h.document.querySelector('[data-period="ALL"]').getAttribute('aria-pressed'),'true');assert.equal(h.e('expiryCurrentStateCount').textContent,String(h.data.length));const all=h.document.querySelector('[data-period="ALL"]');assert.equal(Number(all.querySelector('[data-kpi-number="records"]').textContent),h.data.length);assert.equal(Number(all.querySelector('[data-kpi-number="units"]').textContent.replaceAll(',','')),h.data.reduce((n,r)=>n+r.quantity,0));assert(h.e('expiryCurrentStateBody').querySelector('.expiryDateBadge.neutral'));
});
async function choose(h,key,double=false){const b=h.document.querySelector('[data-period="'+key+'"]');b.onclick({detail:1});if(double)b.onclick({detail:2});else await h.flush();await new Promise(r=>setImmediate(r));}
const selected=h=>Array.from(h.document.querySelectorAll('[data-period][aria-pressed="true"]'),b=>b.dataset.period);
test('single replaces, double unions all seven date KPIs without duplicates or an intermediate reset',async()=>{
 const h=await inventory();const reads=h.calls.length;await choose(h,'NEXT1');assert.deepEqual(selected(h),['NEXT1']);await choose(h,'NEXT2');assert.deepEqual(selected(h),['NEXT2']);
 for(const key of ['EXPIRED','NEXT1','NEXT3','NEXT4','NEXT5','NEXT6']){const before=Number(h.e('expiryCurrentStateCount').textContent);await choose(h,key,true);assert(Number(h.e('expiryCurrentStateCount').textContent)>=before);}
 assert.equal(selected(h).length,7);assert.equal(new Set(h.engine.currentRows.map(r=>r.row_id)).size,h.engine.currentRows.length);assert.equal(h.calls.length,reads,'cached complete dataset needs no KPI click reads');await choose(h,'NEXT2',true);assert.equal(selected(h).length,7);
 await choose(h,'ALL');assert.deepEqual(selected(h),['ALL']);assert.equal(h.e('expiryCurrentStateCount').textContent,String(h.data.length));
});
test('single feedback precedes its centralized gesture decision; rapid gestures preserve independent search and Group filters',async()=>{
 const h=await inventory();const first=h.document.querySelector('[data-period="NEXT1"]');first.onclick({detail:1});assert.deepEqual(selected(h),['NEXT1']);assert.equal(h.e('expiryCurrentStateCount').textContent,String(h.data.length),'first click must not commit a potentially additive gesture');
 first.onclick({detail:2});await new Promise(r=>setImmediate(r));assert.deepEqual(selected(h),['NEXT1']);
 h.e('expiryCurrentSearch').oninput({target:{value:'Product 2'}});await h.flush();await choose(h,'NEXT2',true);const exportCalls=[];h.c.ExpiryInventoryReport.pdf=async rows=>exportCalls.push(rows);await h.click('expiryPdf');const args=h.calls.filter(x=>x.name==='export_pharmflow_expiry_inventory_v1').at(-1).p;assert.equal(args.p_filters.search,'Product 2');assert.deepEqual(Array.from(args.p_filters.months).sort(),['2026-11','2026-12']);
 await h.click('expiryQuickClearKpi');assert.deepEqual(selected(h),['ALL']);await h.click('expiryPdf');assert.equal(h.calls.filter(x=>x.name==='export_pharmflow_expiry_inventory_v1').at(-1).p.p_filters.search,'Product 2');
});
test('canonical local predicate and server wire filters share month/search/Group/Operator intersections',async()=>{
 const h=await inventory(),f=h.c.ExpiryInventoryFilters;
 const selection={search:'product',months:[],groups:['Medicine'],operators:['Handheld'],includeUnassigned:false};f.selectKpi(selection,'EXPIRED',false,2026*12+10);f.selectKpi(selection,'NEXT2',true,2026*12+10);
 const wire=f.wire(selection,[...new Set(h.data.map(r=>r.expiry_year+'-'+String(r.expiry_month).padStart(2,'0')))]);assert(wire.months.includes('2026-09'));assert(wire.months.includes('2026-12'));assert(!wire.months.includes('2026-11'));const rows=h.data.filter(r=>f.matches(r,wire));assert(rows.every(r=>r.group_name==='Medicine'&&r.first_operator_name==='Handheld'));
});
test('Excel, PDF and Print use identical filtered server membership across pages',async()=>{
 const h=await inventory();await choose(h,'EXPIRED');await choose(h,'NEXT1',true);await choose(h,'NEXT2',true);await choose(h,'NEXT3',true);await choose(h,'NEXT4',true);const exported=[],base=h.c.authRpc;
 h.c.authRpc=async(name,p)=>{const result=await base(name,p);if(name==='export_pharmflow_expiry_inventory_v1')exported.push(Array.from(result,r=>r.row_id));return result;};
 h.c.XLSX={utils:{json_to_sheet:()=>({'!ref':'A1:J100'}),book_new:()=>({}),book_append_sheet(){}}};h.c.ExpiryInventoryReport.saveWorkbook=()=>{};h.c.ExpiryInventoryReport.pdf=async()=>{};h.c.ExpiryInventoryReport.printMarkup=()=>'';h.c.requestAnimationFrame=fn=>fn();h.c.print=()=>{};
 for(const id of ['btnExportExpiryInventory','expiryPdf','expiryPrint'])await h.click(id);assert.deepEqual(exported[0],exported[1]);assert.deepEqual(exported[1],exported[2]);assert(exported[0].length>40);const calls=h.calls.filter(x=>x.name==='export_pharmflow_expiry_inventory_v1');assert(calls.every(x=>JSON.stringify(x.p.p_filters)===JSON.stringify(calls[0].p.p_filters)));
 await choose(h,'ALL');await h.click('btnExportExpiryInventory');assert.equal(exported.at(-1).length,h.data.length);
});
test('partial dataset never masquerades as complete; later KPI selection and export still use server filtering',async()=>{
 const h=harness(),base=h.c.authRpc;h.c.authRpc=async(name,p)=>{const result=await base(name,p);if(name==='query_pharmflow_expiry_inventory_v1')return {...result,count:10000};return result;};await h.refresh();await h.click('btnOpenExpiryInventory');const before=h.calls.length;await choose(h,'NEXT1');assert(h.calls.length>before);assert.equal(h.e('expiryCurrentStateCount').textContent,'10000');
});
test('KPI Production release retains Production backend and build guard',()=>{
 assert.match(fs.readFileSync('js/supabase.js','utf8'),/zznoshzcyxmtwfbznjyr/);assert.doesNotMatch(fs.readFileSync('js/supabase.js','utf8'),/tovkcakucyagvbzvlnks/);assert.match(fs.readFileSync('vite.config.js','utf8'),/VERCEL_ENV!=='production'/);assert.match(fs.readFileSync('index.html','utf8'),/connect-src 'self' https:\/\/zznoshzcyxmtwfbznjyr.supabase.co/);
});
module.exports={inventory,choose};
test('out-of-order server responses cannot overwrite a newer KPI selection on partial datasets',async()=>{
 const h=harness();while(h.data.length<300){const i=h.data.length;h.data.push({...h.data[i%73],row_id:'r'+i,state_id:'s'+i});}const base=h.c.authRpc;await h.refresh();await h.click('btnOpenExpiryInventory');const releases={};h.c.authRpc=(name,p)=>name==='query_pharmflow_expiry_inventory_v1'&&p.p_filters.months?.length?new Promise(resolve=>{releases[p.p_filters.months[0]]=async()=>resolve(await base(name,p));}):base(name,p);
 h.document.querySelector('[data-period="NEXT3"]').onclick({detail:0});await new Promise(r=>setImmediate(r));h.document.querySelector('[data-period="NEXT4"]').onclick({detail:0});await new Promise(r=>setImmediate(r));await releases['2027-02']();await new Promise(r=>setImmediate(r));await releases['2027-01']();await new Promise(r=>setImmediate(r));assert.deepEqual(selected(h),['NEXT4']);assert(h.engine.currentRows.every(r=>r.expiry_year===2027&&r.expiry_month===2));
});
test('All Items clears only KPI state while preserving independent month, Search and Group filters',async()=>{
 const h=await inventory(),f=h.c.ExpiryInventoryFilters,s={search:'example',groups:['Medicine'],includeUnassigned:false,operators:[],months:['2026-12']};f.selectKpi(s,'NEXT2',false,2026*12+10);f.selectKpi(s,'ALL',false,2026*12+10);assert.equal(s.search,'example');assert.deepEqual(Array.from(s.groups),['Medicine']);assert.deepEqual(Array.from(s.months),['2026-12']);assert.equal(f.kpiState(s,'ALL'),'true');
});
test('Reset All cancels an undecided KPI gesture rather than restoring it later',async()=>{
 const h=await inventory();h.document.querySelector('[data-period="NEXT1"]').onclick({detail:1});await h.click('btnClearExpiryFilters');await h.flush();assert.deepEqual(selected(h),['ALL']);assert.equal(h.e('expiryCurrentStateCount').textContent,String(h.data.length));
});
test('opening Filters settles a pending gesture once and preserves that selection in its draft',async()=>{
 const h=await inventory();h.document.querySelector('[data-period="NEXT1"]').onclick({detail:1});await h.click('expiryFilter');assert.equal(h.e('expiryFilterPanel').hidden,false);await h.e('expiryApplyFilters').onclick();await h.refresh();assert.deepEqual(selected(h),['NEXT1']);assert.equal(h.e('expiryCurrentStateCount').textContent,'8');
});
