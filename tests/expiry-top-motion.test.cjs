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
 assert.match(source,/import\('gsap'\)/);assert.match(source,/prefers-reduced-motion: reduce/);assert.match(source,/s\.abort\.abort\(\)/);assert.match(source,/s\.observer\.disconnect\(\)/);assert.match(source,/s\.resize\?\.disconnect\(\)/);assert.match(source,/s\.tweens\.delete\(tween\)/);
 assert.doesNotMatch(source,/setInterval|textContent\s*=|authRpc|fetch\(/);
 assert.equal((css.match(/\.expiryKpiCard\.is-active\{/g)||[]).length,1);
 assert.equal((css.match(/\.expiryKpiCard\.is-partial\{/g)||[]).length,1);
 assert.doesNotMatch(css,/#btnExpiryNeedsReview:has\(/);
 assert.match(css,/\.expiryKpiCard\{[^}]*height:68px/);
});
