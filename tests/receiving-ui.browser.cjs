// Offline DOM/layout regression: no application bootstrap or backend is loaded.
// Run: node --test tests/receiving-ui.browser.cjs (Playwright + Chromium/Edge required).
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {test,before,after}=require('node:test');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const read=p=>fs.readFileSync(p,'utf8');
const ui=read('ui.js');
const index=read('index.html');
const styles=[...index.matchAll(/href="(css\/[^"?]+\.css)(?:\?[^"]*)?"/g)].map(m=>`<style>${read(m[1])}</style>`).join('');
let browser,page;
const screenshots=process.env.UI_SCREENSHOT_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'pharmflow-ui-'));
before(async()=>{browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});page=await browser.newPage();await page.route('**/*',r=>r.abort());});
after(async()=>browser?.close());
async function reviewFixture(handheld=false){
 await page.setViewportSize({width:handheld?390:1440,height:handheld?740:900});
 await page.setContent(`<body class="pfNextMode pfnCleanReceiving ${handheld?'zebraDevice':''}">${styles}`);
 await page.evaluate(handheld=>{
  window.isLikelyZebraDevice=()=>handheld;window.closeNeedsReviewPhotoViewer=()=>{};
  window.loadNeedsReviewRows=async()=>Array.from({length:17},(_,i)=>({identifier_display:'062812345678'+i,order_number:'PO-100'+i,pending_quantity:i?2:10,source:'Handheld'}));
  window.toSafeString=x=>String(x??'');window.escapeHTML=x=>x.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.isPharmacyAdmin=()=>false;window.renderV2IdentifierAdministration=()=>{};
  window.showToast=()=>{};window.nrV3ListHistory=async()=>[];window.focusScannerInput=()=>{};
 },handheld);
 await page.addScriptTag({content:ui.slice(ui.indexOf('function groupNeedsReviewRows('),ui.indexOf('function nrV2GroupTransactionId('))});
 const start=ui.indexOf('async function openNeedsReviewPanel(');
 await page.addScriptTag({content:ui.slice(start,ui.indexOf('window.refreshNeedsReviewCounters=refreshNeedsReviewCounters;',start))});
 await page.evaluate(()=>openNeedsReviewPanel());
}
test('17 cases / 42 quantity retain visible summaries and expandable details',async()=>{
 await reviewFixture();
 assert.equal(await page.locator('.needsReviewRow').count(),17);
 for(let i=0;i<17;i++){
  const row=page.locator('.needsReviewRow').nth(i);
  await row.scrollIntoViewIfNeeded();
  const summary=row.locator('.needsReviewRowSummary');
  assert.match(await summary.innerText(),new RegExp(`062812345678${i}.*Order PO-100${i}.*Qty ${i?2:10}.*Pending`,'s'));
  assert.equal(await summary.evaluate(el=>{
   const parent=el.parentElement.getBoundingClientRect();
   return [...el.children].every(child=>{const r=child.getBoundingClientRect(),s=getComputedStyle(child);return r.width>0&&r.height>0&&r.top>=parent.top&&r.bottom<=parent.bottom&&s.visibility==='visible'&&s.display!=='none'&&s.opacity!=='0';});
  }),true,'summary text must fit inside its row, not merely exist in the DOM');
 }
 const first=page.locator('.needsReviewRowSummary').first();
 await first.click();
 assert.equal(await first.getAttribute('aria-expanded'),'true');
 assert.equal(await page.locator('[data-search="0"]').isVisible(),true);
 assert.equal(await page.locator('[data-review-case-detail="0"]').getAttribute('hidden'),null);
 await first.click();
 assert.equal(await page.locator('[data-search="0"]').isVisible(),false);
 await first.focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('[data-search="0"]').isVisible(),true);
 await page.screenshot({path:path.join(screenshots,'needs-review.png')});
 await page.locator('[data-review-history]').click();
 assert.match(await page.locator('[data-review-list]').innerText(),/No Needs Review history/);
});
test('Handheld preserves hidden History and usable case expansion',async()=>{
 await reviewFixture(true);
 assert.equal(await page.locator('[data-review-history]').isVisible(),false);
 await page.locator('.needsReviewRowSummary').first().click();
 assert.equal(await page.locator('.capturedIdentifier').first().isVisible(),true);
 assert.equal(await page.locator('.needsReviewRow').first().evaluate(el=>el.scrollWidth<=el.clientWidth),true);
});
test('desktop shell keeps centered identity, aligned statuses, compact picker and visible footer code',async()=>{
 const html=index.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
 await page.setContent(html);
 await page.addStyleTag({content:styles.replace(/<\/?style>/g,'')});
 await page.evaluate(()=>{
  document.body.className='pfNextMode pfnCleanReceiving';
  document.querySelector('.authGate')?.remove();
  document.getElementById('headerMasterGTINStatus').textContent='ACTIVE 52,792';
  document.getElementById('cloudWorkspaceStatus').textContent='● SYNCED';
  window.AuthState={context:{pharmacy_name:'Health House Pharmacy 84',pharmacy_code:'HHP084'}};
  window.AppState={workspace:{active:false},session:{}};
  window.UI={elements:{pageTitle:document.getElementById('pageTitle'),pageSubtitle:document.getElementById('pageSubtitle'),headerOrderId:document.getElementById('headerOrderId'),headerSessionId:document.getElementById('headerSessionId')}};
  window.setElementText=(node,text)=>{if(node)node.textContent=text;};
 });
 await page.addScriptTag({content:ui.slice(ui.indexOf('function refreshHeader('),ui.indexOf('function getSelectedOrderDashboardMetrics('))});
 await page.evaluate(()=>refreshHeader());
 assert.equal(await page.locator('#accountPharmacyCode').innerText(),'HHP084');
 assert.equal(await page.locator('#topBarPharmacyName').innerText(),'Health House Pharmacy 84');
 assert.equal(await page.locator('#topBarPharmacyCode').innerText(),'HHP084');
 for(const width of [1920,1440,1280,1100,1024]){
  await page.setViewportSize({width,height:900});
  const geometry=await page.evaluate(()=>{
   const rect=x=>x.getBoundingClientRect();const header=rect(document.querySelector('.topBar')),hero=rect(document.querySelector('.pfnPharmacyNameHero'));
   const statuses=[...document.querySelector('.pfnContextBar').children].map(x=>rect(x).toJSON());
   return {header:header.toJSON(),hero:hero.toJSON(),statuses,kpi:rect(document.querySelector('.statisticsGrid')).toJSON(),footer:document.getElementById('accountPharmacyCode').checkVisibility()};
  });
  assert.equal(geometry.statuses.length,4);
  assert.ok(geometry.statuses.every(r=>r.height===32&&r.y===geometry.statuses[0].y),`status alignment at ${width}`);
  assert.ok(geometry.header.height<=75,`compact header at ${width}`);
  assert.ok(geometry.statuses[0].left>=geometry.hero.right,`no identity overlap at ${width}`);
  assert.ok(geometry.statuses.at(-1).right<=width,`no page overflow at ${width}`);
  if(width>1100)assert.ok(Math.abs((geometry.hero.left+geometry.hero.right)/2-(geometry.header.left+geometry.header.right)/2)<2,`centered name at ${width}`);
  assert.ok(geometry.kpi.top>=geometry.header.bottom,`no KPI overlap at ${width}`);
  assert.ok(geometry.footer);
 }
 await page.setViewportSize({width:1440,height:900});
 await page.screenshot({path:path.join(screenshots,'receiving-header.png')});
 // Use the actual production picker template; its behavior is tested by work-orders-scope.
 const template=ui.slice(ui.indexOf('pickerMenu.innerHTML=`')+'pickerMenu.innerHTML=`'.length,ui.indexOf('`;',ui.indexOf('pickerMenu.innerHTML=`')));
 const menu=new Function('activeOrders','selectedOrders','escapeHTML','return `'+template+'`;')(['PO-1000','PO-1001'],['PO-1000'],x=>x);
 await page.evaluate(menu=>{const picker=document.getElementById('headerOrderPicker');picker.hidden=false;const el=document.getElementById('headerOrderPickerMenu');el.innerHTML=menu;el.hidden=false;},menu);
 const sizes=await page.locator('.headerOrderPickerActions button').evaluateAll(nodes=>nodes.map(x=>x.getBoundingClientRect().toJSON()));
 assert.equal(sizes.length,3);
 assert.ok(sizes.every(r=>r.width<110&&r.height<=34&&r.y===sizes[0].y));
});
