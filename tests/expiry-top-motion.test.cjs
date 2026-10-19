const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {harness}=require('./expiry-desktop-harness.cjs');
test('KPI refresh preserves DOM identity, authoritative Records/Units and filter behavior',async()=>{
 const h=harness();await h.refresh();await h.click('btnOpenExpiryInventory');
 const root=h.document.querySelector('.expiryKpiRow'),cards=[...root.querySelectorAll('[data-period]')];
 assert.equal(cards.length,4);
 const before=cards.map(c=>({period:c.dataset.period,text:c.textContent}));
 await h.refresh();assert.deepEqual([...root.querySelectorAll('[data-period]')],cards);
 assert.deepEqual(cards.map(c=>({period:c.dataset.period,text:c.textContent})),before);
 for(const card of cards){assert.equal(card.querySelectorAll('[data-kpi-number]').length,2);assert.match(card.textContent,/Records/);assert.match(card.textContent,/Units/);}
 cards[1].onclick();await h.flush();assert.ok(h.calls.some(c=>c.name==='query_pharmflow_expiry_inventory_v1'&&c.p.p_filters.months?.length));
 await h.click('btnExpirySessionView');assert.equal(root.hidden,true);await h.click('btnOpenExpiryInventory');assert.equal(root.querySelector('[data-period]'),cards[0]);
});
test('GSAP is lazy, bounded to Desktop, uses current values and owns cleanup',()=>{
 const source=fs.readFileSync('js/expiry-top-motion.js','utf8'),css=fs.readFileSync('css/dashboard.css','utf8');
 assert.match(source,/import\('gsap'\)/);assert.match(source,/prefers-reduced-motion: reduce/);assert.match(source,/s\.observer\.disconnect\(\)/);assert.match(source,/s\.resize\?\.disconnect\(\)/);assert.match(source,/s\.tweens\.delete\(tween\)/);
 assert.doesNotMatch(source,/setInterval|textContent\s*=|authRpc|fetch\(/);
 assert.equal((css.match(/\.expiryKpiCard\.is-active\{/g)||[]).length,1);
 assert.equal((css.match(/\.expiryKpiCard\.is-partial\{/g)||[]).length,1);
 assert.doesNotMatch(css,/#btnExpiryNeedsReview:has\(/);
 assert.match(css,/\.expiryKpiCard\{[^}]*height:68px/);
});
test('Session counters format complete large values and update their existing nodes',()=>{
 const vm=require('node:vm'),h=harness(),source=fs.readFileSync('js/expiry-desktop-v2.js','utf8');
 const start=source.indexOf('    const rows = currentRows(), summary = el("expirySessionSummary");'),end=source.indexOf('\n  function sessionGroups()',start);
 const c={currentRows:()=>Array.from({length:c.n},(_,i)=>({item_code:String(i),quantity:1})),el:h.e,qty:r=>r.quantity,sessionHydrated:true,kpiNumber:new Intl.NumberFormat('en-US'),window:{ExpiryTopMotion:{sync(){}}},n:0};
 vm.createContext(c);vm.runInContext('function renderSummary(){'+source.slice(start,end)+';globalThis.renderSummary=renderSummary;',c);
 let node;
 for(const n of [0,5,350,1250,12500]){
  c.n=n;c.renderSummary();const current=h.e('expirySessionSummary').querySelector('[data-session-total="items"]');
  if(node)assert.equal(current,node);node=current;
  assert.equal(current.textContent,n.toLocaleString('en-US'));assert.equal(h.e('expirySessionSummary').querySelector('[data-session-total="quantity"]').textContent,n.toLocaleString('en-US'));
 }
});
