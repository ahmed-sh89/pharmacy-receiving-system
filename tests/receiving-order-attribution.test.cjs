const assert=require("node:assert/strict");
const fs=require("node:fs");
const test=require("node:test");
const vm=require("node:vm");

function extractFunction(source,name){
    const start=source.indexOf(`function ${name}(`);
    assert.notEqual(start,-1,`${name} must exist`);
    const bodyStart=source.indexOf("{",start);
    let depth=0;
    let quote="";
    let escaped=false;
    for(let index=bodyStart;index<source.length;index+=1){
        const character=source[index];
        if(quote){
            if(escaped) escaped=false;
            else if(character==="\\") escaped=true;
            else if(character===quote) quote="";
            continue;
        }
        if(character==='"'||character==="'"||character==='`'){
            quote=character;
            continue;
        }
        if(character==="{") depth+=1;
        if(character==="}"){
            depth-=1;
            if(depth===0) return source.slice(start,index+1);
        }
    }
    throw new Error(`${name} has no closing brace`);
}

test("explicit historical receiving is never allocated to the active order",()=>{
    const activeOrder="TO-000482432";
    const history=[
        {itemCode:"1012140",orderNumber:"TO-000478674",quantity:27},
        {itemCode:"1012140",orderNumber:activeOrder,quantity:24}
    ];
    const item={itemCode:"1012140",receivedQty:51,orderNumbers:[activeOrder]};
    const context={
        AppState:{workspace:{receivingHistory:history,orderData:[item]}},
        normalizeOrderNumber:value=>String(value||"").trim().toUpperCase(),
        normalizeItemCode:value=>String(value||"").trim(),
        toNumber:(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback,
        getActiveReceivingOrderNumbers:()=>[activeOrder],
        getItemByCode:code=>code==="1012140"?item:null,
        getWorkspaceOrderSourceRows:order=>order===activeOrder?[{itemCode:"1012140",orderedQty:24}]:[],
        getSelectedReceivingOrderNumber:()=>activeOrder
    };
    const source=fs.readFileSync("js/reports.js","utf8");
    vm.runInNewContext(extractFunction(source,"buildReceivedQuantityByOrder"),context);
    const received=context.buildReceivedQuantityByOrder();
    assert.equal(received.get(`${activeOrder}||1012140`),24);
});
