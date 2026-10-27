// Real browser/Worker + existing importer/Active Orders renderer. Persistence
// endpoints are mocked; this is not a signed-in Supabase acceptance test.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const manifest=JSON.parse(read('js/vendor/sheetjs-0.20.3/manifest.json'));
const ui=read('ui.js'),start=ui.indexOf('function renderFileList('),renderer=ui.slice(start,ui.indexOf('\n\n/*',start));
const scripts=['js/excel-security.js','js/config.js','js/utils.js','js/state.js','js/excel.js','js/orders.js','js/master-gtin.js'];
const app=read('js/app.js'),bindingStart=app.indexOf('function bindCoreFileInputs('),binding=app.slice(bindingStart,app.indexOf('\n\n/*',bindingStart));
const html=`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="connect-src 'self'">
<h1>Isolated import fixture</h1><input id="orderFileInput" type="file" multiple><div id="orderFilesList"></div><div id="message"></div>
<script src="js/vendor/sheetjs-0.20.3/xlsx.full.min.js" integrity="${manifest.integrity}"></script>
${scripts.map(p=>'<script src="'+p+'"></script>').join('')}
<script>window.AuthState={identityEpoch:0,user:{id:'fixture-user'},session:{access_token:'fixture-token'},context:{user_id:'fixture-user',pharmacy_id:'fixture-pharmacy',member_role:'admin'},mustChangePassword:false};window.permissionRow={pharmacy_id:'fixture-pharmacy',receiving:'FULL',expiry:'FULL',data_access:'PHARMACY_ONLY',system_administrator:false};window.permissionWaiters=[];window.holdPermissions=false;window.authRpc=async name=>{if(name!=='get_my_pharmflow_permissions_v1')throw Error('Unexpected fixture RPC '+name);if(holdPermissions)return new Promise((resolve,reject)=>permissionWaiters.push({resolve,reject}));return permissionRow;};window.AppRouter={currentRoute:'receiving'};window.navigateTo=()=>{};</script>
<script src="js/permissions.js"></script>
<script>
window.UI={elements:{orderFilesList:document.getElementById('orderFilesList')}};
${renderer}
window.toasts=[];window.registry=new Map();window.registryWrites=0;window.manifestWaiters=[];window.PharmFlowCloudWorkspace={activeManifestBusy:false};
window.showToast=(message,type)=>{toasts.push({message,type});document.getElementById('message').textContent=message;};
window.showLoading=window.hideLoading=window.focusScannerInput=window.recalculateStatistics=window.saveWorkspaceSnapshot=()=>{};
window.refreshEntireUI=()=>renderFileList(UI.elements.orderFilesList,AppState.workspace.orderFiles,'No orders');
window.hasMasterGTIN=()=>false;
window.getOrderLifecycleRecord=async number=>registry.get(number)||null;
window.registerUploadedOrder=async meta=>{registryWrites++;return registry.set(meta.orderNumber,meta);};
window.saveOriginalUploadedOrderSnapshot=async()=>{};
window.saveActiveOrderManifest=async()=>true;
window.workerStarts=0;const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{constructor(...args){super(...args);window.workerStarts++;}};
window.handlerCalls=0;const originalImport=window.handleOrderFileSelection;window.handleOrderFileSelection=event=>{window.handlerCalls++;window.importDone=originalImport(event);return window.importDone;};
${binding}
bindCoreFileInputs();
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
        await page.evaluate(()=>PharmFlowPermissions.load());
        assert.equal(await page.evaluate(()=>PharmFlowPermissions.state()),'ready');
        await page.waitForTimeout(1600); // Exceed the existing focus debounce; exercise its real listener.
        await page.evaluate(()=>{holdPermissions=true;window.dispatchEvent(new Event('focus'));window.recheck=PharmFlowPermissions.whenReady();});
        assert.equal(await page.evaluate(()=>PharmFlowPermissions.state()),'loading');
        const files=['TO-000529235.xlsx','TO-000528294.xlsx'].map(n=>path.join(process.env.PHARMFLOW_SUPPLIER_DIR,n));
        await page.locator('#orderFileInput').setInputFiles(files);
        const before=await page.evaluate(()=>({handlers:handlerCalls,workers:workerStarts,orders:AppState.workspace.orderFiles.length,toasts}));
        await page.evaluate(()=>{holdPermissions=false;permissionWaiters.splice(0).forEach(w=>w.resolve(permissionRow));});
        await page.evaluate(()=>recheck);
        if(process.env.EXPECT_IMPORT_BLOCKED==='1'){
            assert.equal(before.handlers,0);assert.equal(before.workers,0);assert.equal(before.orders,0);assert.deepEqual(before.toasts,[]);
            assert.equal(await page.locator('#orderFilesList .fileItem').count(),0);
            console.log('REPRODUCED: real permission capture guard suppresses input/change while revalidating; actual file handler0, Worker0, orders0, no toast; later permission recovery does not replay selection');
        }else{
            assert.equal(before.handlers,1);assert.equal(before.workers,0);assert.equal(before.orders,0);
            await page.evaluate(()=>importDone);
            assert.equal(await page.locator('#orderFilesList .fileItem').count(),2);
            const rows=await page.evaluate(()=>AppState.workspace.orderFiles.map(f=>({id:f.documentId,lines:f.sourceRows.length,total:f.sourceRows.reduce((n,r)=>n+r.orderedQty,0)})));
            assert.deepEqual(rows,[{id:'TO-000529235',lines:2,total:12},{id:'TO-000528294',lines:2,total:62}]);

            // Existing identity/authorization checks remain mandatory when the
            // permission response rejects, restricts, or belongs to an old user.
            for(const mode of ['readonly','denied','identity']){
                await page.goto(origin+'/fixture.html');await page.evaluate(()=>PharmFlowPermissions.load());
                await page.evaluate(()=>{holdPermissions=true;window.recheck=PharmFlowPermissions.load().catch(()=>null);});
                await page.locator('#orderFileInput').setInputFiles(files);
                await page.evaluate(mode=>{
                    holdPermissions=false;
                    if(mode==='identity'){AuthState.identityEpoch++;AuthState.user.id='different-user';}
                    for(const w of permissionWaiters.splice(0)){
                        if(mode==='denied')w.reject(Object.assign(new Error('Staging fixture access denied'),{serverRejected:true,httpStatus:403}));
                        else w.resolve({...permissionRow,receiving:mode==='readonly'?'READ_ONLY':'FULL'});
                    }
                },mode);
                await page.evaluate(()=>importDone);
                const denied=await page.evaluate(()=>({workers:workerStarts,files:AppState.workspace.orderFiles.length,registry:registryWrites,toasts}));
                assert.equal(denied.workers,0);assert.equal(denied.files,0);assert.equal(denied.registry,0);
                assert(denied.toasts.some(t=>t.type==='error'));
                if(mode==='identity')assert.match(await page.locator('#message').textContent(),/Sign-in or pharmacy changed/);
            }
            // A new permission flight during a pending manifest save must pause
            // downstream registry/source writes, rather than cancel the import.
            await page.goto(origin+'/fixture.html');await page.evaluate(()=>PharmFlowPermissions.load());
            await page.evaluate(()=>{window.saveActiveOrderManifest=()=>new Promise(resolve=>manifestWaiters.push(resolve));});
            await page.locator('#orderFileInput').setInputFiles(files);
            await page.waitForFunction(()=>manifestWaiters.length===1);
            await page.evaluate(()=>{holdPermissions=true;window.recheck=PharmFlowPermissions.load();manifestWaiters.shift()(true);});
            await page.waitForFunction(()=>PharmFlowPermissions.state()==='loading');
            assert.equal(await page.evaluate(()=>registryWrites),0);
            await page.evaluate(()=>{holdPermissions=false;permissionWaiters.splice(0).forEach(w=>w.resolve(permissionRow));});
            await page.evaluate(()=>importDone);
            assert.equal(await page.locator('#orderFilesList .fileItem').count(),2);
            assert.equal(await page.evaluate(()=>registryWrites),2);
            // Duplicate and invalid inputs still provide visible feedback.
            await page.locator('#orderFileInput').setInputFiles(files[0]);await page.evaluate(()=>importDone);
            assert.match(await page.locator('#message').textContent(),/already active/);
            await page.locator('#orderFileInput').setInputFiles({name:'invalid.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('not a workbook')});await page.evaluate(()=>importDone);
            assert.match(await page.locator('#message').textContent(),/not a valid Excel/);
            assert.equal(await page.evaluate(()=>registryWrites),2);
            console.log('PASS Chromium: real focus race, selection retained, original files/source totals12/62, no early Worker/write, readonly+403+identity fencing, mid-manifest permission recheck, duplicate/invalid feedback. Persistence mocked; no live Supabase PASS.');
        }
        assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
