import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
const baseline=process.argv.includes('--before');
// Reuse only the offline VM fixture, not the extended scenarios.
let fixture=fs.readFileSync(new URL('receiving-authority-postfix.mjs',import.meta.url),'utf8').split('const passed=[];')[0];
fixture=fixture.replace("new URL('../',import.meta.url)",`new URL(${JSON.stringify(root.href)})`);
if(baseline){
    fixture="import {execFileSync} from 'node:child_process';\n"+fixture;
    fixture=fixture.replace("fs.readFileSync(new URL(file,root),'utf8')",
        "execFileSync('git',['show','e3c456e9a500a40babee0dfa8f0f6857c320e567:'+file],{encoding:'utf8'})");
}
const {client}=await import('data:text/javascript;base64,'+Buffer.from(fixture+'\nexport {client};\n//# sourceURL=offline-startup-fixture.mjs').toString('base64'));
function element(page){
    const classes=new Set(),events={};
    return {dataset:{page},classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k)},
        addEventListener:(name,fn)=>{events[name]=fn;},click(){events.click?.call(this);}};
}
function shell(){
    const c=client();c.seed();
    const orders=element('files'),dashboard=element('dashboard');
    const pages={'page-files':element(),'page-dashboard':element()};
    c.ctx.document.querySelectorAll=selector=>selector==='.sidebarItem'?[orders,dashboard]:selector==='.appPage'?Object.values(pages):[];
    c.ctx.document.getElementById=id=>pages[id]||null;
    c.ctx.document.body=element();
    c.run(fs.readFileSync(new URL('js/router.js',root),'utf8'));
    c.run(`initializeState=()=>{};initializeUI=()=>{};initializeOptionalModules=()=>{};setSystemStatus=()=>{};
        refreshSafeAccountIdentity=async()=>{};startAutosaveEngine=()=>{};
        bindApplicationLifecycleEvents=()=>{};focusScannerInput=()=>{};
        handleFatalStartupError=error=>{throw error;};
        AppState.workspace=createEmptyWorkspace();rebuildStateIndexes();navigator.onLine=true;
        PharmFlowCloudWorkspace.hydratedPharmacyId=null;`);
    return {c,orders,dashboard,pages};
}
for(const manifest of [null,{orderFiles:[],orderData:[]}]){
    const {c,orders,dashboard,pages}=shell();
    c.setRpc(async name=>{
        if(name==='get_pharmflow_workspace_generation')return 7;
        if(name==='get_pharmflow_active_order_manifest_v3')return manifest?{manifest}:[];
        throw Error('Unexpected RPC '+name);
    });
    await c.run('startApplication()');orders.click();
    if(baseline){
        assert.equal(c.run('PharmacyApp.initialized'),false);
        assert.equal(c.run('AppRouter.initialized'),false);
        assert.equal(pages['page-files'].classList.contains('active'),false);
        continue;
    }
    assert.equal(c.run('PharmacyApp.initialized'),true);
    assert.equal(c.run('AppRouter.currentRoute'),'files');
    assert.equal(pages['page-files'].classList.contains('active'),true);
    dashboard.click();assert.equal(c.run('AppRouter.currentRoute'),'dashboard');
    assert.equal(c.run('AppState.workspace.orderData.length'),0);
    assert.equal(c.calls.length,2); // generation + manifest; no ledger or writes
    c.run('PharmFlowCloudWorkspace.idleSleeping=true;');
    const count=c.calls.length;
    assert.equal(await c.run('restoreCloudWorkspaceOnLogin()'),false);
    assert.equal(c.calls.length,count);
    c.run('renderIdleSleepNotice=()=>{};');
    let blocked=false;c.ctx.idleEvent={type:'click',preventDefault(){blocked=true;}};
    c.run('blockInteractionDuringIdle(idleEvent)');assert.equal(blocked,true);
    c.run("AuthState.context.user_id='OTHER';ensureCloudAccountContextIsolation();");
    assert.equal(c.run('PharmFlowCloudWorkspace.emptyManifestScope'),'');
    assert.equal(c.run('PharmFlowCloudWorkspace.hydratedPharmacyId'),null);
}
if(!baseline){
    const shared=shell();shared.c.seed();let resolveManifest;
    shared.c.run('PharmFlowCloudWorkspace.hydratedPharmacyId=null;');
    shared.c.setRpc(async name=>name==='get_pharmflow_workspace_generation'?7:await new Promise(r=>resolveManifest=r));
    const manifestFlight=shared.c.run('pullActiveOrderManifest()');
    const startupFlight=shared.c.run('startApplication()');
    resolveManifest([]);await manifestFlight;await startupFlight;shared.orders.click();
    assert.equal(shared.c.run('AppRouter.currentRoute'),'files');
    assert.equal(shared.c.run('AppState.workspace.orderData.length'),0);
    assert.equal(shared.c.calls.length,2);
    const active=shell();active.c.seed();
    const manifest=JSON.parse(active.c.run('JSON.stringify(serializeActiveOrderManifest())'));
    active.c.run('PharmFlowCloudWorkspace.hydratedPharmacyId=null;');
    active.c.setRpc(async name=>{
        if(name==='get_pharmflow_workspace_generation')return 7;
        if(name==='get_pharmflow_active_order_manifest_v3')return {manifest,revision:10};
        if(name==='list_pharmflow_cloud_transactions_v2')return [];
        throw Error(name);
    });
    await active.c.run('startApplication()');active.orders.click();
    assert.equal(active.c.run('PharmacyApp.initialized'),true);
    assert.equal(active.c.run('AppRouter.currentRoute'),'files');
    assert.equal(active.c.calls.length,3);
    for(const response of ['error','busy',{manifest:{orderFiles:[{documentId:'A'}],orderData:[]}}]){
        const {c}=shell();
        c.run('PharmFlowCloudWorkspace.emptyManifestScope=currentCloudAccountScope();');
        if(response==='busy')c.run('PharmFlowCloudWorkspace.activeManifestBusy=true;');
        c.setRpc(async name=>{
            if(name==='get_pharmflow_workspace_generation')return 7;
            if(response==='error')throw Error('Mock unavailable');
            return response;
        });
        assert.equal(await c.run('restoreCloudWorkspaceOnLogin()'),false);
        assert.equal(c.run('PharmFlowCloudWorkspace.hydratedPharmacyId'),null);
    }
    const {c}=shell();let release;
    c.setRpc(async name=>name==='get_pharmflow_workspace_generation'?7:await new Promise(r=>release=r));
    const flight=c.run('restoreCloudWorkspaceOnLogin()');
    for(let i=0;i<10&&!release;i++)await Promise.resolve();
    assert.ok(release);
    c.run("AuthState.context.user_id='OTHER';ensureCloudAccountContextIsolation();");
    release([]);assert.equal(await flight,false);
    assert.equal(c.run('PharmFlowCloudWorkspace.emptyManifestScope'),'');
    // The change does not alter any idle guard or scheduler function.
    const old=execFileSync('git',['show','e3c456e:cloud-workspace.js'],{encoding:'utf8'}).replaceAll('\r','');
    const current=fs.readFileSync(new URL('cloud-workspace.js',root),'utf8').replaceAll('\r','');
    for(const name of ['enterIdleNetworkSleep','armIdleNetworkSleep','blockInteractionDuringIdle','initializePharmFlowCloudWorkspace']){
        const re=new RegExp('(?:async )?function '+name+'\\([^]*?^}', 'm');
        assert.equal(current.match(re)[0],old.match(re)[0]);
    }
}
console.log(baseline?'PASS: exact release reproduces empty-workspace startup/navigation lock':'PASS: empty workspace, Orders/navigation, failure readiness, idle lock, account isolation, unchanged schedulers');
