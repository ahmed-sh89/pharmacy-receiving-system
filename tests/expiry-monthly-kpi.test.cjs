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
test('default All Items includes records outside visible range; seven authoritative Records/Units remain populated',async()=>{
 const h=await inventory();assert.equal(h.document.querySelectorAll('[data-period]').length,7);assert.equal(h.document.querySelectorAll('[data-period][aria-pressed="true"]').length,0);assert.equal(h.e('expiryCurrentStateCount').textContent,String(h.data.length));
 for(const b of h.document.querySelectorAll('[data-period]')){const i=b.dataset.period==='EXPIRED'?0:Number(b.dataset.period.slice(4)),ref=2026*12+10;const rows=h.data.filter(r=>i===0?r.expiry_year*12+r.expiry_month<=ref:r.expiry_year*12+r.expiry_month===ref+i);assert.equal(Number(b.querySelector('[data-kpi-number="records"]').textContent),rows.length);assert.equal(Number(b.querySelector('[data-kpi-number="units"]').textContent.replaceAll(',','')),rows.reduce((n,r)=>n+r.quantity,0));}
 const queries=h.calls.filter(x=>x.name==='query_pharmflow_expiry_inventory_v1');assert(queries.some(x=>x.p.p_limit===1));assert(!queries.some(x=>x.p.p_limit>100));assert(h.e('expiryCurrentStateBody').querySelector('.expiryDateBadge.neutral'));
});
test('KPI single/multi OR selections toggle immediately and last deselection restores All Items',async()=>{
 const h=await inventory();await period(h,'NEXT1');assert.equal(h.e('expiryCurrentStateCount').textContent,'8');await period(h,'NEXT2');assert.equal(h.e('expiryCurrentStateCount').textContent,'16');assert.equal(h.document.querySelectorAll('[data-period][aria-pressed="true"]').length,2);await period(h,'NEXT1');assert.equal(h.e('expiryCurrentStateCount').textContent,'8');await period(h,'NEXT2');assert.equal(h.e('expiryCurrentStateCount').textContent,String(h.data.length));
 await period(h,'EXPIRED');await period(h,'NEXT6');const last=h.calls.filter(x=>x.name==='query_pharmflow_expiry_inventory_v1'&&x.p.p_limit===40).at(-1);assert(last.p.p_filters.months.includes('2027-04'));assert(last.p.p_filters.months.includes('2026-09'));assert(!last.p.p_filters.months.includes('2026-12'));
});
test('date badge uses exactly the matching KPI bucket and outside dates stay neutral',async()=>{
 const h=await inventory();for(const row of h.e('expiryCurrentStateBody').querySelectorAll('tr')){const badge=row.querySelector('.expiryDateBadge');const [m,y]=badge.textContent.split('/').map(Number),delta=y*12+m-(2026*12+10),expected=delta<=0?'monthly-0':delta<=6?'monthly-'+delta:'neutral';assert(badge.classList.contains(expected));}
});
test('Search + selected month + pagination share existing filter contract; PDF/Print use matching scope, Excel keeps approved full-active scope',async()=>{
 const h=await inventory();await period(h,'NEXT1');h.e('expiryCurrentSearch').oninput({target:{value:'Product 2'}});await h.flush();const p=h.calls.filter(x=>x.name==='query_pharmflow_expiry_inventory_v1'&&x.p.p_limit===40).at(-1).p;assert.equal(p.p_filters.search,'Product 2');assert.deepEqual(Array.from(p.p_filters.months),['2026-11']);
 h.c.ExpiryInventoryReport.html=()=>'';h.c.ExpiryInventoryReport.xlsx=()=>{};h.c.ExpiryInventoryReport.saveWorkbook=()=>{};h.c.ExpiryInventoryReport.pdf=async()=>{};await h.click('expiryPdf');await h.click('btnExportExpiryInventory');const ex=h.calls.filter(x=>x.name==='export_pharmflow_expiry_inventory_v1');assert.equal(ex[0].p.p_filters.search,'Product 2');assert.equal(JSON.stringify(ex.at(-1).p.p_filters),'{}');assert.equal(ex.at(-1).p.p_resolved,false);
});
test('KPI source and build are Staging-only; Production main/Receiving/Handheld implementation is not targeted',()=>{
 assert.match(fs.readFileSync('js/supabase.js','utf8'),/tovkcakucyagvbzvlnks/);assert.doesNotMatch(fs.readFileSync('js/supabase.js','utf8'),/zznoshzcyxmtwfbznjyr/);assert.doesNotMatch(fs.readFileSync('index.html','utf8'),/connect-src[^>]*zznoshzcyxmtwfbznjyr/);assert.match(fs.readFileSync('vite.config.js','utf8'),/VERCEL_ENV!=='preview'/);
});
module.exports={inventory};
