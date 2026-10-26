// Real browser/Worker + existing importer/Active Orders renderer. Persistence
// endpoints are mocked; this is not a signed-in Supabase acceptance test.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const manifest=JSON.parse(read('js/vendor/sheetjs-0.20.3/manifest.json'));
const ui=read('ui.js'),start=ui.indexOf('function renderFileList('),renderer=ui.slice(start,ui.indexOf('\n\n/*',start));
const scripts=['js/excel-security.js','js/config.js','js/utils.js','js/state.js','js/excel.js','js/orders.js','js/master-gtin.js'];
const html=`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="connect-src 'self'">
<h1>Isolated import fixture</h1><input id="files" type="file" multiple><div id="orderFilesList"></div><div id="message"></div>
<script src="js/vendor/sheetjs-0.20.3/xlsx.full.min.js" integrity="${manifest.integrity}"></script>
${scripts.map(p=>'<script src="'+p+'"></script>').join('')}
<script>
window.UI={elements:{orderFilesList:document.getElementById('orderFilesList')}};
${renderer}
window.toasts=[];window.registry=new Map();window.PharmFlowCloudWorkspace={activeManifestBusy:false};
window.showToast=(message,type)=>{toasts.push({message,type});document.getElementById('message').textContent=message;};
window.showLoading=window.hideLoading=window.focusScannerInput=window.recalculateStatistics=window.saveWorkspaceSnapshot=()=>{};
window.refreshEntireUI=()=>renderFileList(UI.elements.orderFilesList,AppState.workspace.orderFiles,'No orders');
window.hasMasterGTIN=()=>false;
window.getOrderLifecycleRecord=async number=>registry.get(number)||null;
window.registerUploadedOrder=async meta=>registry.set(meta.orderNumber,meta);
window.saveOriginalUploadedOrderSnapshot=async()=>{};
window.saveActiveOrderManifest=async()=>true;
window.document.getElementById('files').addEventListener('change',event=>{window.importDone=handleOrderFileSelection(event);});
</script>`;
const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/fixture.html'){res.setHeader('Content-Type','text/html');return res.end(html);}
    const target=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!target.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    try{res.setHeader('Content-Type',target.endsWith('.js')?'application/javascript':'application/octet-stream');res.end(fs.readFileSync(target));}
    catch(_){res.writeHead(404);res.end();}
});
(async()=>{
    assert.ok(process.env.PHARMFLOW_SUPPLIER_DIR,'Supply original files via PHARMFLOW_SUPPLIER_DIR');
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin='http://127.0.0.1:'+server.address().port;
    const browser=await chromium.launch({executablePath:process.env.TC26_CHROMIUM_EXECUTABLE,headless:true,args:['--no-sandbox','--no-zygote','--single-process','--disable-gpu']});
    try{
        const page=await browser.newPage();const errors=[],external=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.route('**/*',route=>{if(route.request().url().startsWith(origin+'/'))return route.continue();external.push(route.request().url());return route.abort();});
        await page.goto(origin+'/fixture.html');
        assert.equal(await page.evaluate(()=>XLSX.version),'0.20.3');
        const files=['TO-000529235.xlsx','TO-000528294.xlsx'].map(n=>path.join(process.env.PHARMFLOW_SUPPLIER_DIR,n));
        await page.locator('#files').setInputFiles(files);await page.evaluate(()=>importDone);
        assert.equal(await page.locator('#orderFilesList .fileItem').count(),2);
        const values=await page.evaluate(()=>({orders:AppState.workspace.orderFiles.map(f=>({id:f.documentId,date:f.orderDate,sourceRows:f.sourceRows.length,total:f.sourceRows.reduce((sum,r)=>sum+r.orderedQty,0)})),items:AppState.workspace.orderData.map(i=>({qty:i.orderedQty,received:i.receivedQty})),toasts}));
        assert.deepEqual(values.orders,[{id:'TO-000529235',date:'2026-10-26',sourceRows:2,total:12},{id:'TO-000528294',date:'2026-10-26',sourceRows:2,total:62}]);
        assert.deepEqual(values.items.map(i=>i.qty),[6,6,62]);assert(values.items.every(i=>i.received===0));
        assert(values.toasts.some(t=>t.type==='success'));
        await page.locator('#files').setInputFiles(files[0]);await page.evaluate(()=>importDone);
        assert.match(await page.locator('#message').textContent(),/already active/);
        assert.equal(await page.locator('#orderFilesList .fileItem').count(),2);
        await page.locator('#files').setInputFiles({name:'invalid.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('not a workbook')});await page.evaluate(()=>importDone);
        assert.match(await page.locator('#message').textContent(),/not a valid Excel/);
        assert.equal(await page.locator('#orderFilesList .fileItem').count(),2);
        assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
        console.log('PASS Chromium: SRI/version, real Worker, both original workbooks, real Active Orders renderer, 2+2 source rows, totals12/62, received0, duplicate and invalid-file feedback; mocked persistence; no external network');
    }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
