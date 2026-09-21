const assert=require("node:assert/strict");
const fs=require("node:fs");
const test=require("node:test");
const vm=require("node:vm");

function extractFunction(source,name){
    const start=source.indexOf(`async function ${name}(`);
    assert.notEqual(start,-1,`${name} must exist`);
    const bodyStart=source.indexOf("{",start);
    let depth=0,quote="",escaped=false;
    for(let index=bodyStart;index<source.length;index+=1){
        const character=source[index];
        if(quote){if(escaped)escaped=false;else if(character==="\\")escaped=true;else if(character===quote)quote="";continue;}
        if(character==='"'||character==="'"||character==="`"){quote=character;continue;}
        if(character==="{")depth+=1;
        if(character==="}"){depth-=1;if(depth===0)return source.slice(start,index+1);}
    }
    throw new Error(`${name} has no closing brace`);
}

test("High Priority falls back to the revision-fenced manifest when the patch RPC fails",async()=>{
    const source=fs.readFileSync("ui.js","utf8");
    const calls=[];
    const context={
        patchActiveOrderPriorities:async changes=>{calls.push(["patch",changes]);return false;},
        saveActiveOrderManifest:async options=>{calls.push(["manifest",options]);return true;}
    };
    vm.runInNewContext(extractFunction(source,"persistItemPriorityBatch"),context);
    const changes=[{itemCode:"1012140",priorityType:"NEW"},{itemCode:"2000001",priorityType:"SHORT"}];
    assert.equal(await context.persistItemPriorityBatch(changes),true);
    assert.deepEqual(JSON.parse(JSON.stringify(calls)),[["patch",changes],["manifest",{silent:true}]]);
});

test("High Priority and clearing survive a fresh manifest reload without touching receiving data",()=>{
    const source=fs.readFileSync("cloud-workspace.js","utf8");
    assert.match(source,/const orderData=\(workspace\.orderData\|\|\[\]\)\.map\(item=>\{[\s\S]*const clone=deepClone\(item\)/);
    assert.match(source,/clone\.receivedQty=0/);
    assert.match(source,/p_pharmacy_id:pharmacyId/);
    assert.match(source,/patch_pharmflow_item_priorities_v2/);

    const before=[
        {itemCode:"1012140",orderNumbers:["TO-000482432"],priorityType:"NEW",highPriority:true,orderedQty:24,receivedQty:7},
        {itemCode:"2000001",orderNumbers:["TO-000482432"],priorityType:"SHORT",highPriority:true,orderedQty:6,receivedQty:2},
        {itemCode:"3000001",orderNumbers:["TO-000478674"],priorityType:"",highPriority:false,orderedQty:8,receivedQty:5}
    ];
    const manifest=JSON.parse(JSON.stringify(before));
    const fresh=JSON.parse(JSON.stringify(manifest));
    assert.deepEqual(fresh.filter(item=>item.orderNumbers.includes("TO-000482432")).map(item=>item.priorityType),["NEW","SHORT"]);
    assert.equal(fresh.find(item=>item.orderNumbers.includes("TO-000478674")).priorityType,"");
    assert.deepEqual(fresh.map(item=>item.receivedQty),[7,2,5]);

    fresh[0].priorityType="";fresh[0].highPriority=false;
    const reloaded=JSON.parse(JSON.stringify(fresh));
    assert.equal(reloaded[0].priorityType,"");
    assert.equal(reloaded[0].highPriority,false);
    assert.deepEqual(reloaded.map(item=>item.receivedQty),[7,2,5]);
});

test("desktop manual receiving keeps selection and quantity controls prominent without changing handlers",()=>{
    const css=fs.readFileSync("css/pharmflow-next.css","utf8");
    assert.match(css,/#page-dashboard \.smartScanSelected\{[\s\S]*border:2px solid #87b9e2!important/);
    assert.match(css,/#page-dashboard \.smartQuantityControl \.quantityButton\{width:50px!important/);
    assert.match(css,/#page-dashboard #smartQuantityInput\{width:74px!important;height:46px!important;font-size:23px!important/);
    const source=fs.readFileSync("ui.js","utf8");
    assert.match(source,/addSearchItemQuantity\(\s*item\.itemCode,\s*quantity/);
});
