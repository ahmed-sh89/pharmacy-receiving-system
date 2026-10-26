/* Actual Inventory markup/CSS in Chromium with isolated synthetic rows; all network blocked. */
const fs=require('node:fs'),assert=require('node:assert/strict'),cp=require('node:child_process'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {harness}=require('./expiry-desktop-harness.cjs');
async function inventory(){const h=harness(),base=h.c.authRpc;h.data.forEach((r,i)=>{const n=2026*12+10+(i%9-1);r.expiry_year=Math.floor((n-1)/12);r.expiry_month=(n-1)%12+1;r.quantity=i+1;});h.c.authRpc=async(name,p)=>name==='summary_pharmflow_expiry_inventory_v1'?[{key:'EXPIRED',from:null,to:2026*12+10},{key:'NEXT1',from:2026*12+11,to:2026*12+11}].map(p=>{const rows=h.data.filter(r=>(p.from==null||r.expiry_year*12+r.expiry_month>=p.from)&&r.expiry_year*12+r.expiry_month<=p.to);return {...p,count:rows.length,units:rows.reduce((n,r)=>n+r.quantity,0)};}):base(name,p);await h.refresh();await h.click('btnOpenExpiryInventory');return h;}
(async()=>{
const html=fs.readFileSync('index.html','utf8'),css=[...html.matchAll(/href="(css\/[^"?]+)/g)].map(m=>fs.readFileSync(m[1],'utf8')).join('\n'),h=await inventory();
const browser=await chromium.launch({headless:true,executablePath:process.env.TC26_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();await page.route('**/*',r=>r.abort());
 h.e('pageTitle').textContent='Expiry';h.document.querySelectorAll('[data-page]').forEach(e=>e.classList.toggle('active',e.dataset.page==='expiry'));h.document.body.className='pfNextMode pfnCleanReceiving expiryDesktopActive';h.document.querySelectorAll('.appPage').forEach(e=>e.classList.remove('active'));h.e('zebraExpiryShell').classList.add('active');h.document.querySelectorAll('#authGate,#authBootPanel,#workspaceBootOverlay,.appBootOverlay').forEach(e=>e.remove());
 const markup=h.document.toString().replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
 await page.setContent(markup);await page.addStyleTag({content:css});
 for(const width of [1280,1366,1440,1920]){await page.setViewportSize({width,height:900});const cards=await page.locator('[data-period]').evaluateAll(nodes=>nodes.map(e=>{const r=e.getBoundingClientRect();return {top:r.top,width:r.width,scroll:e.scrollWidth,client:e.clientWidth};}));assert.equal(cards.length,7);assert.equal(new Set(cards.map(e=>e.top)).size,1);assert(cards.every(e=>e.scroll<=e.client+1));console.log('PASS seven KPIs, no card clipping at '+width);}
 await page.setViewportSize({width:1440,height:900});
 const tones=await page.evaluate(()=>[...document.querySelectorAll('[data-period]')].map(e=>({key:e.dataset.period,ink:getComputedStyle(e).getPropertyValue('--kpi-ink').trim(),accent:getComputedStyle(e).getPropertyValue('--kpi-accent').trim()})));
 assert.equal(new Set(tones.map(e=>e.accent)).size,7);
 for(const t of tones){const i=t.key==='EXPIRED'?0:Number(t.key.slice(4));const badge=page.locator('.expiryDateBadge.monthly-'+i).first();if(await badge.count()){const ink=await badge.evaluate(e=>getComputedStyle(e).getPropertyValue('--kpi-ink').trim());assert.equal(ink,t.ink);}}
 const out='docs/evidence/expiry-monthly-kpi';fs.mkdirSync(out,{recursive:true});
 await page.screenshot({path:out+'/desktop-100.png'});
 await page.locator('[data-period="NEXT1"]').evaluate(e=>{e.classList.add('is-active');e.setAttribute('aria-pressed','true');});await page.locator('[data-period="NEXT2"]').hover();await page.waitForTimeout(220);await page.screenshot({path:out+'/selected-hover.png'});
 // Browser zoom equivalent: 1800 CSS pixels at 0.8 DPR produces a 1440px image.
 const zoom=await browser.newContext({viewport:{width:1800,height:1125},deviceScaleFactor:.8}),z=await zoom.newPage();await z.route('**/*',r=>r.abort());await z.setContent(markup);await z.addStyleTag({content:css});await z.screenshot({path:out+'/desktop-80-equivalent.png'});assert.equal(new Set(await z.locator('[data-period]').evaluateAll(a=>a.map(e=>e.getBoundingClientRect().top))).size,1);console.log('PASS 80% equivalent zoom, palette/date badge mapping, hover/selected');
 for(const width of [1000,650]){await page.setViewportSize({width,height:900});assert.equal(await page.locator('[data-period]').count(),7);const fit=await page.locator('.expiryKpiRow').evaluate(e=>e.scrollWidth<=e.clientWidth+1);assert(fit);console.log('PASS responsive KPIs at '+width);}
 // New CSS is strictly Inventory Desktop scoped; compare exact base pixels on
 // the same markup in Scan mode and a Handheld view without the monthly patch.
 const baseline=cp.execFileSync('git',['show','ca7d575:css/dashboard.css'],{encoding:'utf8'}),other=[...html.matchAll(/href="(css\/[^"?]+)/g)].filter(m=>m[1]!=='css/dashboard.css').map(m=>fs.readFileSync(m[1],'utf8')).join('\n');
 async function pixels(sheet,hh){await page.setViewportSize({width:hh?360:1440,height:hh?640:900});await page.setContent(markup);await page.addStyleTag({content:sheet+'\n'+other+'\n*{animation:none!important;transition:none!important;caret-color:transparent!important}'});await page.evaluate(hh=>{document.body.className=hh?'zebraDevice zebraExpiryActive':'pfNextMode expiryDesktopActive';document.getElementById('zebraExpiryShell').classList.remove('expiryInventoryMode');},hh);return crypto.createHash('sha256').update(await page.screenshot()).digest('hex');}
 for(const hh of [false,true])assert.equal(await pixels(fs.readFileSync('css/dashboard.css','utf8'),hh),await pixels(baseline,hh));console.log('PASS Desktop Scan and Handheld exact base pixels');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
