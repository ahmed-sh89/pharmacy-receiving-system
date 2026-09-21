const assert=require("node:assert/strict");
const fs=require("node:fs");
const test=require("node:test");
const vm=require("node:vm");

function extractFunction(source,name){
    const asyncStart=source.indexOf(`async function ${name}(`);
    const start=asyncStart>=0
        ? asyncStart
        : source.indexOf(`function ${name}(`);
    assert.notEqual(start,-1,`${name} must exist`);
    const paramsStart=source.indexOf("(",start);
    let paramsDepth=0,paramsEnd=-1;
    for(let index=paramsStart;index<source.length;index+=1){
        if(source[index]==="(") paramsDepth+=1;
        if(source[index]===")"){
            paramsDepth-=1;
            if(paramsDepth===0){paramsEnd=index;break;}
        }
    }
    const bodyStart=source.indexOf("{",paramsEnd);
    let depth=0,quote="",escaped=false;
    for(let index=bodyStart;index<source.length;index+=1){
        const character=source[index];
        if(quote){
            if(escaped) escaped=false;
            else if(character==="\\") escaped=true;
            else if(character===quote) quote="";
            continue;
        }
        if(character==='"'||character==="'"||character==="`"){quote=character;continue;}
        if(character==="{") depth+=1;
        if(character==="}"){
            depth-=1;
            if(depth===0) return source.slice(start,index+1);
        }
    }
    throw new Error(`${name} has no closing brace`);
}

test("confirmed order upload refreshes an open Manage Orders view without polling",()=>{
    const source=fs.readFileSync("js/excel.js","utf8");
    const emitted=[];
    const context={
        AppEvents:{emit:(event,payload)=>emitted.push({event,payload})},
        refreshEntireUI:()=>emitted.push({event:"ui:refreshed"})
    };
    vm.runInNewContext(extractFunction(source,"publishConfirmedOrderUpload"),context);
    context.publishConfirmedOrderUpload();

    assert.deepEqual(JSON.parse(JSON.stringify(emitted)),[
        {event:"files:updated",payload:{source:"order-upload-confirmed"}},
        {event:"receiving:updated",payload:{source:"order-upload-confirmed"}},
        {event:"ui:refreshed"}
    ]);

    const shell=fs.readFileSync("js/pharmflow-next.js","utf8");
    assert.match(shell,/if\(typeof AppEvents!=="undefined"&&AppEvents\?\.on\)\{/);
    assert.match(shell,/AppEvents\.on\('files:updated',event=>\{if\(event\?\.source==='order-upload-confirmed'\)refreshOpenManageOrders\(\);\}\)/);
    assert.doesNotMatch(shell,/bindSidebar\(\);\s*if\(window\.AppEvents\?\.on\)/);
    assert.match(shell,/function refreshOpenManageOrders\(\)/);
    assert.doesNotMatch(shell,/setInterval\([^\n]*order-upload-confirmed/);
});

test("Reset applies an empty authoritative manifest to the active-order UI immediately",async()=>{
    const source=fs.readFileSync("cloud-workspace.js","utf8");
    const emitted=[];
    const context={
        PharmFlowCloudWorkspace:{lastManifestFullReadAt:0,activeManifestBusy:false,contextSwitching:false,activeManifestPresent:true,activeManifestRevision:4},
        AppState:{workspace:{orderFiles:[{documentId:"TO-000482432"}],orderData:[{itemCode:"1012140"}],handheldOrderNumbers:["TO-000482432"]}},
        navigator:{onLine:true},
        Date,
        cloudWorkspacePharmacyId:()=>"pharmacy-id",
        authRpc:async()=>({manifest:{orderFiles:[],orderData:[]},revision:5}),
        nowISO:()=>"2026-09-21T00:00:00.000Z",
        Logger:{warn:()=>{}},
        createEmptyWorkspace:()=>({orderFiles:[],orderData:[],handheldOrderNumbers:[],receivingHistory:[]}),
        resetStatistics:()=>{},rebuildStateIndexes:()=>{},deleteWorkspaceSnapshot:()=>{},
        AppEvents:{emit:(event,payload)=>emitted.push({event,payload})},
        refreshEntireUI:()=>emitted.push({event:"ui:refreshed"}),
        setCloudWorkspaceStatus:()=>{}
    };
    vm.runInNewContext(extractFunction(source,"applyAuthoritativeEmptyActiveOrders"),context);
    vm.runInNewContext(extractFunction(source,"pullActiveOrderManifest"),context);
    await context.pullActiveOrderManifest({clearIfMissing:true});

    assert.deepEqual(JSON.parse(JSON.stringify(context.AppState.workspace.orderFiles)),[]);
    assert.deepEqual(JSON.parse(JSON.stringify(context.AppState.workspace.handheldOrderNumbers)),[]);
    assert.ok(emitted.some(entry=>entry.event==="files:updated"&&entry.payload.source==="server-authority-empty-manifest"));
    assert.ok(emitted.some(entry=>entry.event==="receiving:updated"&&entry.payload.source==="server-authority-empty-manifest"));
});

test("fresh empty workspace removes the legacy All Active Orders control",()=>{
    const source=fs.readFileSync("ui.js","utf8");
    let removed=false;
    const scopeControl={remove:()=>{removed=true;}};
    const context={
        document:{
            querySelector:()=>({}),
            getElementById:id=>id==="orderScopeControl"?scopeControl:null
        },
        AppState:{workspace:{orderFiles:[]}}
    };
    vm.runInNewContext(extractFunction(source,"refreshOrderScopeControl"),context);
    context.refreshOrderScopeControl();
    assert.equal(removed,true);
});

test("empty active-order scope removes its control but an active order still renders it",()=>{
    const source=fs.readFileSync("ui.js","utf8");
    assert.match(source,/if\(!orders\.length\)\{\s*wrap\?\.remove\(\);\s*return;/);
    assert.match(source,/wrap\.innerHTML=`<label>Order View<\/label><select/);
});

test("fresh startup can parse the complete production ui script",()=>{
    const index=fs.readFileSync("index.html","utf8");
    const source=fs.readFileSync("ui.js","utf8");
    assert.match(index,/<script src="ui\.js\?v=B21SCOPEFEEDBACK4"/);
    assert.doesNotThrow(()=>new vm.Script(source),"the uncached startup script must be complete JavaScript");
    assert.match(source,/function refreshOrderScopeControl\(\)/);
});

test("desktop receiving polish keeps toasts above modals and uses click-only sidebar state",()=>{
    const css=fs.readFileSync("css/pharmflow-next.css","utf8");
    assert.match(css,/--pfn-toast-layer:200000/);
    assert.match(css,/\.toastContainer\{z-index:var\(--pfn-toast-layer\)!important/);
    assert.match(css,/@media \(min-width:901px\) and \(hover:hover\) and \(pointer:fine\)/);
    assert.match(css,/#barcodeInput\{font-size:20px!important/);
    assert.match(css,/\.smartScanResults:not\(:empty\)/);
    assert.match(css,/\.smartSearchResult:hover\{/);
    const shell=fs.readFileSync("js/pharmflow-next.js","utf8");
    assert.match(shell,/menu\.addEventListener\('click',e=>\{if\(window\.innerWidth>900\)/);
    assert.doesNotMatch(shell,/pointerenter.*openForPointer/);
    assert.doesNotMatch(shell,/pointerleave.*closeAfterPointerLeaves/);
});
