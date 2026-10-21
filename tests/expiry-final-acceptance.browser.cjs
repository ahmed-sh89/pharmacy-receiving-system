// Real Chromium source fixtures. Network blocked; not physical TC26 or signed-in deployment verification.
const fs=require('fs'),assert=require('assert/strict'),{harness}=require('./expiry-desktop-harness.cjs');
const {chromium}=require(process.env.PHARMFLOW_PLAYWRIGHT_CORE||'playwright-core');
const out='/tmp/expiry-final-acceptance';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const h=harness();await h.refresh();await h.click('btnOpenExpiryInventory');h.document.body.className='expiryDesktopActive';h.document.querySelectorAll('.appPage').forEach(e=>e.classList.remove('active'));h.e('zebraExpiryShell').classList.add('active');h.document.querySelectorAll('#authGate,#workspaceBootOverlay,.appBootOverlay').forEach(e=>e.remove());
 const html=fs.readFileSync('index.html','utf8'),styles=[...html.matchAll(/<link\b[^>]*href="([^"?]+\.css)[^>]*>/g)].map(m=>'<style>'+fs.readFileSync(m[1],'utf8')+'</style>').join('');
 const fixture=h.document.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'').replace('</head>',styles+'</head>');
 const browser=await chromium.launch({executablePath:'/tmp/chromium',headless:true,args:['--no-sandbox','--no-zygote','--disable-dev-shm-usage','--disable-gpu']});const page=await browser.newPage({viewport:{width:1366,height:768}});await page.route('**/*',r=>r.abort());await page.setContent(fixture);
 const table=await page.locator('#expiryCurrentHeader').evaluate(e=>e.getBoundingClientRect().top);assert.equal(table,242);
 h.document.querySelector('[data-row-actions]').onclick();const markup=h.e('expiryRowActionPanel').outerHTML;
 await page.evaluate(markup=>document.body.insertAdjacentHTML('beforeend',markup),markup);
 const source=fs.readFileSync('js/expiry-desktop-v2.js','utf8');const opening=source.slice(source.indexOf('  let floatingMenu=null'),source.indexOf('  async function copyInventoryIdentifier'));
 await page.addScriptTag({content:'const el=id=>document.getElementById(id);'+opening});
 const menus=[];
 for(const corner of ['top','bottom']){
  const box=await page.evaluate(corner=>{const trigger=document.querySelector('[data-row-actions]');trigger.style.position='fixed';trigger.style.left='1330px';trigger.style.top=corner==='top'?'10px':'730px';openFloatingMenu(document.getElementById('expiryRowActionPanel'),trigger);const p=document.getElementById('expiryRowActionPanel'),r=p.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom,display:getComputedStyle(p.querySelector('button')).display};},corner);
  assert.equal(box.width,142);assert(box.height<100);assert(box.left>=8&&box.right<=1358&&box.top>=8&&box.bottom<=760);assert.equal(box.display,'flex');menus.push(box);
  await page.screenshot({path:out+'/menu-'+corner+'.png'});await page.evaluate(()=>closeFloatingMenu());
 }
 h.e('expiryRowActionPanel').querySelector('[data-menu-edit]').click();const dialog=h.document.querySelector('dialog').outerHTML;
 await page.evaluate(markup=>{document.body.insertAdjacentHTML('beforeend',markup);const d=document.querySelector('dialog');d.removeAttribute('open');d.showModal();},dialog);
 const quantity=await page.locator('[data-total]').evaluate(e=>{const r=e.getBoundingClientRect(),d=e.closest('dialog').getBoundingClientRect();return {width:r.width,center:r.left+r.width/2,dialogCenter:d.left+d.width/2,align:getComputedStyle(e).textAlign};});assert.equal(quantity.width,150);assert(Math.abs(quantity.center-quantity.dialogCenter)<2);assert.equal(quantity.align,'center');await page.screenshot({path:out+'/quantity-edit.png'});
 await page.evaluate(()=>document.querySelector('dialog').remove());h.e('zebraExpiryShell').classList.remove('active');await h.click('btnExpirySessionView');
 await page.evaluate(()=>{document.getElementById('zebraExpiryShell').classList.remove('expiryInventoryMode');document.querySelector('.expiryCaptureCard').hidden=false;document.querySelector('#expiryWorkerSelect .pfSelectValue').textContent='Select operator';});
 const operator=await page.locator('#expiryWorkerSelect .pfSelectValue').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth,height:e.closest('.pfSelectTrigger').getBoundingClientRect().height}));await page.screenshot({path:out+'/operator.png'});console.log({operator});assert(operator.scroll<=operator.client);assert.equal(operator.height,42);await page.screenshot({path:out+'/operator.png'});
 console.log(JSON.stringify({tableTop:table,menus,quantity,operator}));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
