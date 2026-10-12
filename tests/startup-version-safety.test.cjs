"use strict";
const fs=require("fs");
const vm=require("vm");
const assert=require("assert");
const test=require("node:test");

const index=fs.readFileSync("index.html","utf8");
const app=fs.readFileSync("js/app.js","utf8");
const versionSource=fs.readFileSync("js/app-version.js","utf8");
const queueSource=fs.readFileSync("js/receiving-release.js","utf8");
const workflow=fs.readFileSync(".github/workflows/deploy.yml","utf8");

function extractFunction(source,signature){
    const start=source.indexOf(signature);
    assert.notEqual(start,-1,`missing ${signature}`);
    const brace=source.indexOf("{",start);
    let depth=0;
    for(let i=brace;i<source.length;i++){
        if(source[i]==="{") depth++;
        else if(source[i]==="}" && --depth===0) return source.slice(start,i+1);
    }
    throw new Error(`unterminated ${signature}`);
}

test("the deployed entry reveals authoritative Receiving without waiting for Global GTIN",async()=>{
    assert.match(index,/<script src="js\/app\.js\?v=/,"index.html must load js/app.js as its runtime entry");
    assert.match(index,/<script src="js\/app-version\.js\?v=/,"the version check must be in the deployed asset list");

    const events=[];
    let finishMaster;
    const masterPromise=new Promise(resolve=>{finishMaster=resolve;});
    const start=extractFunction(app,"async function startApplication()");
    const sandbox={
        document:{body:{classList:{add:value=>events.push("class+"+value),remove:value=>events.push("class-"+value)}}},
        window:{initializePharmFlowVersionCheck:()=>events.push("version-check")},
        PharmacyApp:{initialized:false,modules:{}},
        APP_CONFIG:{appName:"PharmFlow",version:"test"},
        Logger:{info:()=>{},warn:()=>{}},
        setInitialSystemStatus:()=>{},initializeState:()=>events.push("state"),
        ensureStartupCloudAuthority:async()=>{events.push("authority");return true;},
        startRouter:()=>events.push("router"),initializeUI:()=>events.push("ui"),
        initializeOptionalModules:()=>events.push("modules"),
        ensureGlobalMasterGTINReady:()=>{events.push("master-start");return masterPromise;},
        refreshSafeAccountIdentity:async()=>events.push("identity"),startAutosaveEngine:()=>{},
        bindApplicationLifecycleEvents:()=>{},refreshEntireUI:()=>events.push("render"),
        focusScannerInput:()=>events.push("scanner-ready"),setSystemStatus:()=>events.push("ready"),
        showWorkspaceStartupAuthorityFailure:()=>events.push("authority-failed"),
        handleFatalStartupError:error=>{throw error;},Promise
    };
    vm.runInNewContext(start,sandbox);
    await sandbox.startApplication();

    assert.ok(events.includes("class+workspaceBooting"),"initial render stays covered while server authority is loading");
    assert.ok(events.indexOf("authority")<events.indexOf("router"),"server order/ledger authority must precede UI startup");
    assert.ok(events.indexOf("render")<events.indexOf("ready"),"first KPI render must follow authoritative hydration");
    assert.ok(events.includes("scanner-ready"),"Receiving scanner should be ready while optional Global GTIN refresh continues");
    assert.ok(events.includes("ready"),"the app must not wait for the unresolved Global GTIN promise");
    assert.ok(events.indexOf("scanner-ready")<events.indexOf("ready"),"scanner focus is restored before READY status");
    assert.ok(events.indexOf("class-workspaceBooting")>events.indexOf("scanner-ready") && events.indexOf("class-workspaceBooting")<events.indexOf("ready"),"workspace loading surface closes between scanner readiness and READY status");
    assert.ok(events.includes("version-check"),"version detection starts only after app ready");
    finishMaster(true);
});

test("incomplete server authority keeps KPI and scanner behind the retry surface",async()=>{
    const events=[];
    const start=extractFunction(app,"async function startApplication()");
    const sandbox={
        document:{body:{classList:{add:value=>events.push("class+"+value),remove:value=>events.push("class-"+value)}}},
        window:{},PharmacyApp:{initialized:false,modules:{}},APP_CONFIG:{appName:"PharmFlow",version:"test"},
        Logger:{info:()=>{},warn:()=>{}},setInitialSystemStatus:()=>{},initializeState:()=>{},
        ensureStartupCloudAuthority:async()=>false,
        startRouter:()=>events.push("router"),initializeUI:()=>events.push("ui"),
        initializeOptionalModules:()=>{},ensureGlobalMasterGTINReady:()=>Promise.resolve(),
        refreshSafeAccountIdentity:async()=>{},startAutosaveEngine:()=>{},bindApplicationLifecycleEvents:()=>{},
        refreshEntireUI:()=>events.push("render"),focusScannerInput:()=>events.push("scanner-ready"),
        setSystemStatus:()=>{},showWorkspaceStartupAuthorityFailure:()=>events.push("retry-surface"),
        handleFatalStartupError:error=>{throw error;},Promise
    };
    vm.runInNewContext(start,sandbox);
    await sandbox.startApplication();
    assert.ok(events.includes("retry-surface"));
    assert.ok(events.includes("class+workspaceBooting"));
    assert.ok(!events.some(value=>["router","ui","render","scanner-ready"].includes(value)),"incomplete authority must not initialize dashboard or scanner");
    assert.ok(!events.includes("class-workspaceBooting"),"loading cover remains in place until authority succeeds");
});

test("Pages stamps the same commit into the document and lightweight version endpoint",()=>{
    assert.match(index,/name="pharmflow-build-sha" content="__PHARMFLOW_BUILD_SHA__"/);
    assert.match(workflow,/os\.environ\["GITHUB_SHA"\]/);
    assert.match(workflow,/version\.json/);
});

function createVersionHarness({local="commit-a",server="commit-a",fields=[],pendingScans=0,idle=false}={}){
    let now=100000;
    let reloads=0;
    let fetching=0;
    let transition=false;
    const listeners={};
    const button={disabled:false,handler:null,addEventListener(_type,handler){this.handler=handler;}};
    const message={textContent:""};
    const notice={hidden:true,id:"",className:"",attrs:{},innerHTML:"",setAttribute(k,v){this.attrs[k]=v;},querySelector(selector){return selector==="[data-refresh]"?button:message;}};
    const body={appendChild(el){this.child=el;},classList:{contains(name){return transition&&name==="authLocked";}}};
    const document={
        visibilityState:"visible",body,baseURI:"https://example.test/pharmacy/",
        querySelector(selector){return selector==='meta[name="pharmflow-build-sha"]'?{content:local}:null;},
        querySelectorAll(selector){return selector.startsWith("input,")?fields:[];},
        createElement(){return notice;},getElementById(){return null;},
        addEventListener(type,handler){listeners["document:"+type]=handler;}
    };
    const window={
        PharmFlowIdleSleep:{active:idle},location:{reload(){reloads++;}},
        PharmFlowReceivingScanQueue:{pending:async()=>Array.from({length:pendingScans},()=>({state:"accepted"}))},
        addEventListener(type,handler){listeners["window:"+type]=handler;}
    };
    const sandbox={
        window,document,AuthState:{busy:false,contextLoading:false,recoveryActive:false},
        URL,Promise,JSON,WeakMap,Array,String,Date:{now:()=>now},
        getComputedStyle:()=>({visibility:"visible"}),
        fetch:async()=>{fetching++;return {ok:true,json:async()=>({sha:server})};},
        setTimeout
    };
    vm.runInNewContext(versionSource,sandbox);
    return {
        api:window.PharmFlowVersionCheck,notice,button,message,fields,listeners,
        get reloads(){return reloads;},get fetching(){return fetching;},
        advance(ms){now+=ms;},setServer(value){server=value;},setTransition(value){transition=value;}
    };
}

test("an unchanged deployment stays quiet and a newer deployment shows the refresh notice",async()=>{
    const same=createVersionHarness();
    same.api.initialize();
    await new Promise(setImmediate);
    assert.equal(same.notice.hidden,true);

    const newer=createVersionHarness({server:"commit-b"});
    newer.api.initialize();
    await new Promise(setImmediate);
    assert.equal(newer.notice.hidden,false);
    assert.match(newer.notice.innerHTML,/New PharmFlow version available — Refresh to update/);
});

test("version refresh is blocked during auth transitions, pending scans, and unsaved edits",async t=>{
    const dirty={tagName:"INPUT",type:"text",value:"saved",disabled:false,closest:()=>null,isContentEditable:false};
    const harness=createVersionHarness({server:"commit-b",fields:[dirty]});
    harness.api.initialize();
    await new Promise(setImmediate);
    dirty.value="unsaved";
    assert.equal(await harness.api.isSafeToRefresh(),false,"changed form values must prevent reload");
    assert.equal(await harness.api.refreshWhenSafe(),false);
    assert.equal(harness.reloads,0);

    dirty.value="saved";
    harness.setTransition(true);
    assert.equal(await harness.api.isSafeToRefresh(),false,"authentication transition must prevent reload");
    harness.setTransition(false);

    const pending=createVersionHarness({server:"commit-b",pendingScans:1});
    pending.api.initialize();
    await new Promise(setImmediate);
    assert.equal(await pending.api.refreshWhenSafe(),false);
    assert.equal(pending.reloads,0);
});

test("durable receiving scan queue exposes pending rows for the refresh safety gate",()=>{
    assert.match(queueSource,/window\.PharmFlowReceivingScanQueue=\{enqueue,resume:run,pending\}/);
    assert.match(versionSource,/await scanQueue\.pending\(\)/);
    assert.match(versionSource,/getElementById\("barcodeInput"\)/,"in-progress scanner text must block refresh");
    assert.match(versionSource,/window\.PharmFlowIdleSleep\?\.active/);
    assert.doesNotMatch(versionSource,/setInterval\s*\(/,"version checks must not add a background polling loop");
    assert.match(versionSource,/version\.json/,"version checks use only the tiny same-origin build manifest");
    assert.doesNotMatch(versionSource,/authRpc|CLOUD_CONFIG|supabase\.co|\/rest\/v1/i,"version check must not add Supabase requests");
});

test("idle sleep remains free of version network requests and refresh attempts",async()=>{
    const harness=createVersionHarness({server:"commit-b",idle:true});
    harness.api.initialize();
    await new Promise(setImmediate);
    assert.equal(harness.fetching,0);
    assert.equal(await harness.api.isSafeToRefresh(),false);
    assert.equal(harness.reloads,0);
});
