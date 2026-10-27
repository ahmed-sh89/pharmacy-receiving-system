const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const report=fs.readFileSync('js/reports.js','utf8'),ui=fs.readFileSync('ui.js','utf8');
function fn(source,name){const at=source.indexOf(`function ${name}(`),start=source.slice(at-6,at)==='async '?at-6:at;return source.slice(start,source.indexOf('\n}',at)+2);}
(async()=>{const browser=await chromium.launch({executablePath:process.env.TC26_CHROMIUM_EXECUTABLE,headless:true,args:['--no-sandbox','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader']});try{
 const page=await browser.newPage({viewport:{width:1366,height:768}});await page.route('**/*',r=>r.abort());await page.setContent('<table><tbody id="receiving"></tbody></table>');
 await page.evaluate(()=>{
 window.AppState={workspace:{orderData:[{itemCode:'1012562',itemName:'Daroxime 500 Mg 10 Tab',orderNumbers:['A','B']}],receivingHistory:[{transactionId:'a',itemCode:'1012562',orderNumber:'A',quantity:62},{transactionId:'b',itemCode:'1012562',orderNumber:'B',quantity:10}]},session:{}};
 window.normalizeItemCode=window.normalizeOrderNumber=v=>String(v||'').trim();window.toSafeString=v=>String(v??'');window.toNumber=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
 window.getActiveReceivingOrderNumbers=window.getSelectedReceivingOrderNumbers=()=>['A','B'];window.getSelectedReceivingOrderNumber=()=> 'ALL';window.getItemByCode=()=>AppState.workspace.orderData[0];window.getWorkspaceOrderSourceRows=o=>(o==='A'?[27,35]:[40]).map(orderedQty=>({itemCode:'1012562',itemName:'Daroxime 500 Mg 10 Tab',orderedQty}));window.getReceivingOrderMetadata=()=>['A','B'].map(orderNumber=>({orderNumber}));
 window.UI={elements:{receivingTableBody:document.getElementById('receiving')},receivingFilters:{issues:new Set(['not_received','partial','received_any','over','manual']),search:'Daroxime 500'}};
 window.escapeHTML=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));window.getReceivingRowClass=()=>'';window.renderReceivingDifference=(o,r)=>r-o;window.renderStatusBadge=v=>v;window.refreshReceivingCategoryFilter=window.refreshReceivingIssueCards=()=>{};
 });
 for(const name of ['buildReceivedQuantityByOrder','getPerOrderReceivingRows','getLiveReceivingItemStatus','buildLiveReceivingReport'])await page.addScriptTag({content:fn(report,name)});
 for(const name of ['normalizeReceivingSearchText','matchesReceivingSearch','createReceivingTableRow','refreshReceivingTable','getSelectedOrderDashboardMetrics','openOrderStatusReportFromSnapshot'])await page.addScriptTag({content:fn(ui,name)});
 await page.evaluate(()=>refreshReceivingTable());assert.equal(await page.locator('#receiving tr').count(),2);
 const a=await page.locator('#receiving tr').first().innerText();assert.match(a,/62\s*−\s*62\s*\+\s*0\s*Completed/);
 const metrics=await page.evaluate(()=>getSelectedOrderDashboardMetrics());assert.equal(metrics.totalItems,2);assert.equal(metrics.completedItems,1);
 await page.evaluate(()=>{window.saved=JSON.parse(JSON.stringify(buildLiveReceivingReport()));AppState.workspace.receivingHistory=[];openOrderStatusReportFromSnapshot(saved);});
 const rows=await page.locator('#archivedReceivingReportOverlay tbody tr').allTextContents();assert.equal(rows.length,2);assert(rows.some(s=>/A\s+1012562[\s\S]*62\s+62\s+0\s+COMPLETED/.test(s)));assert(rows.some(s=>/B\s+1012562/.test(s)));console.log('PASS Chromium actual Receiving Search rows, Dashboard and immutable saved report with per-Order identity; no network');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
