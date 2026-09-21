const assert=require("node:assert/strict");
const fs=require("node:fs");
const test=require("node:test");
const vm=require("node:vm");

function extractFunction(source,name){
    const start=source.indexOf(`function ${name}(`);
    assert.notEqual(start,-1,`${name} must exist`);
    const bodyStart=source.indexOf("{",start);
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
    assert.match(shell,/AppEvents\.on\('files:updated',event=>\{if\(event\?\.source==='order-upload-confirmed'\)refreshOpenManageOrders\(\);\}\)/);
    assert.match(shell,/function refreshOpenManageOrders\(\)/);
    assert.doesNotMatch(shell,/setInterval\([^\n]*order-upload-confirmed/);
});

test("empty active-order scope removes its control but an active order still renders it",()=>{
    const source=fs.readFileSync("ui.js","utf8");
    assert.match(source,/if\(!orders\.length\)\{\s*wrap\?\.remove\(\);\s*return;/);
    assert.match(source,/wrap\.innerHTML=`<label>Order View<\/label><select/);
});

test("fresh startup can parse the complete production ui script",()=>{
    const index=fs.readFileSync("index.html","utf8");
    const source=fs.readFileSync("ui.js","utf8");
    assert.match(index,/<script src="ui\.js\?v=B21SCOPEFEEDBACK2"/);
    assert.doesNotThrow(()=>new vm.Script(source),"the uncached startup script must be complete JavaScript");
    assert.match(source,/function refreshOrderScopeControl\(\)/);
});

test("desktop receiving polish keeps toasts above modals and scopes hover UI to fine pointers",()=>{
    const css=fs.readFileSync("css/pharmflow-next.css","utf8");
    assert.match(css,/--pfn-toast-layer:200000/);
    assert.match(css,/\.toastContainer\{z-index:var\(--pfn-toast-layer\)!important/);
    assert.match(css,/@media \(min-width:901px\) and \(hover:hover\) and \(pointer:fine\)/);
    assert.match(css,/#barcodeInput\{font-size:20px!important/);
    assert.match(css,/\.smartScanResults:not\(:empty\)/);
    assert.match(css,/\.smartSearchResult:hover\{/);
    const shell=fs.readFileSync("js/pharmflow-next.js","utf8");
    assert.match(shell,/window\.matchMedia\?\.\('\(hover:hover\) and \(pointer:fine\)'\)/);
    assert.match(shell,/setTimeout\(\(\)=>setCollapsed\(true\),140\)/);
});
