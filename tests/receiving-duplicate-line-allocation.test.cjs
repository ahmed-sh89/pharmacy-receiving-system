const assert=require("node:assert/strict");
const fs=require("node:fs");
const test=require("node:test");
const vm=require("node:vm");

function extractFunction(source,name){
    const start=source.indexOf(`function ${name}(`);
    assert.notEqual(start,-1,`${name} must exist`);
    const bodyStart=source.indexOf("{",source.indexOf(")",start));
    let depth=0,quote="",escaped=false;
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
        if(character==="}"&&--depth===0) return source.slice(start,index+1);
    }
    throw new Error(`${name} has no closing brace`);
}

const reportSource=fs.readFileSync("js/reports.js","utf8");
const receivingSource=fs.readFileSync("js/receiving.js","utf8");
const indexSource=fs.readFileSync("index.html","utf8");

function reportContext({orders,totals,history=[]}){
    const orderRows=new Map(Object.entries(orders));
    return {
        Map,
        AppState:{workspace:{orderData:[],receivingHistory:history}},
        normalizeOrderNumber:value=>String(value||"").trim().toUpperCase(),
        normalizeItemCode:value=>String(value||"").trim(),
        toSafeString:value=>String(value??""),
        toNumber:(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback,
        getActiveReceivingOrderNumbers:()=>Object.keys(orders),
        getWorkspaceOrderSourceRows:order=>orderRows.get(order)||[],
        getItemByCode:()=>null,
        buildReceivedQuantityByOrder:()=>new Map(Object.entries(totals))
    };
}

function projectRows({orders,totals,history=[]},order){
    const context=reportContext({orders,totals,history});
    vm.runInNewContext(extractFunction(reportSource,"allocateReceivedQuantityAcrossOrderLines"),context);
    vm.runInNewContext(extractFunction(reportSource,"getPerOrderReceivingRows"),context);
    return context.getPerOrderReceivingRows(order,{receivedMap:new Map(Object.entries(totals))});
}

const order="TO-000514312";
const key=(code,number=order)=>`${number}||${code}`;

test("original uploaded lines retain source order and quantities while allocating once",()=>{
    const source=[
        {itemCode:"1013429",itemName:"Maxim 400 Mg 7 Tab",orderedQty:120},
        {itemCode:"1013428",itemName:"Maxim 400 Mg 5 Tab",orderedQty:30},
        {itemCode:"1013429",itemName:"Maxim 400 Mg 7 Tab",orderedQty:84},
        {itemCode:"1013428",itemName:"Maxim 400 Mg 5 Tab",orderedQty:21}
    ];
    const rows=projectRows({orders:{[order]:source},totals:{[key("1013429")]:144,[key("1013428")]:40}},order);
    assert.deepEqual(rows.map(row=>row["Item Number"]),source.map(row=>row.itemCode));
    assert.deepEqual(rows.map(row=>row["Ordered Qty"]),[120,30,84,21]);
    assert.deepEqual(rows.map(row=>row["Received Qty"]),[120,30,24,10]);
    assert.equal(rows.filter(row=>row["Item Number"]==="1013429").reduce((sum,row)=>sum+row["Received Qty"],0),144);
});

test("receiving report builder returns the allocated source-line totals",()=>{
    const source=[{itemCode:"1013429",orderedQty:120},{itemCode:"1013429",orderedQty:84}];
    const context=reportContext({orders:{[order]:source},totals:{[key("1013429")]:204}});
    context.getSelectedReceivingOrderNumbers=()=>[order];
    context.getReceivingOrderMetadata=()=>[{orderNumber:order,orderDate:"2026-10-12"}];
    vm.runInNewContext(extractFunction(reportSource,"allocateReceivedQuantityAcrossOrderLines"),context);
    vm.runInNewContext(extractFunction(reportSource,"getPerOrderReceivingRows"),context);
    vm.runInNewContext(extractFunction(reportSource,"buildMultiOrderReceivingReport"),context);
    const report=context.buildMultiOrderReceivingReport();
    assert.deepEqual(Array.from(report.rows,row=>row["Received Qty"]),[120,84]);
    assert.equal(report.rows.reduce((sum,row)=>sum+row["Received Qty"],0),204);
    assert.deepEqual(Array.from(report.orderGroups,group=>group.orderNumber),[order]);
});

test("one, two, and three duplicate lines receive only the single order total",()=>{
    for(const source of [
        [{itemCode:"A",orderedQty:5}],
        [{itemCode:"A",orderedQty:5},{itemCode:"A",orderedQty:7}],
        [{itemCode:"A",orderedQty:5},{itemCode:"A",orderedQty:7},{itemCode:"A",orderedQty:9}]
    ]){
        const total=source.length===1?3:8;
        const rows=projectRows({orders:{[order]:source},totals:{[key("A")]:total}},order);
        assert.equal(rows.reduce((sum,row)=>sum+row["Received Qty"],0),total);
        const expected=source.length===1?[3]:source.length===2?[5,3]:[5,3,0];
        assert.deepEqual(rows.map(row=>row["Received Qty"]),expected);
    }
});

test("identical item codes in different Orders remain separately attributed",()=>{
    const other="TO-OTHER";
    const data={
        orders:{
            [order]:[{itemCode:"A",orderedQty:3},{itemCode:"A",orderedQty:5}],
            [other]:[{itemCode:"A",orderedQty:9}]
        },
        totals:{[key("A",order)]:6,[key("A",other)]:4}
    };
    const first=projectRows(data,order);
    const second=projectRows(data,other);
    assert.deepEqual(first.map(row=>row["Received Qty"]),[3,3]);
    assert.deepEqual(second.map(row=>row["Received Qty"]),[4]);
    assert.equal(first.reduce((sum,row)=>sum+row["Received Qty"],0),6);
    assert.equal(second.reduce((sum,row)=>sum+row["Received Qty"],0),4);
});

test("120 + 84 allocations reconcile at each boundary, correction, and overage",()=>{
    const source=[{itemCode:"1013429",orderedQty:120},{itemCode:"1013429",orderedQty:84}];
    const context={toNumber:(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback};
    vm.runInNewContext(extractFunction(reportSource,"allocateReceivedQuantityAcrossOrderLines"),context);
    const cases=[
        [0,[0,0]],[72,[72,0]],[120,[120,0]],[144,[120,24]],
        [204,[120,84]],[209,[120,89]],[203,[120,83]],[119,[119,0]],[-3,[0,0]]
    ];
    for(const [total,expected] of cases){
        const actual=Array.from(context.allocateReceivedQuantityAcrossOrderLines(source,total));
        assert.deepEqual(actual,expected,`received ${total}`);
        assert.equal(actual.reduce((sum,value)=>sum+value,0),Math.max(0,total));
        assert(actual.every(value=>value>=0));
        assert.equal(Math.max(0,actual[0]+actual[1]-204),Math.max(0,total-204));
    }
    const completed=projectRows({orders:{[order]:source},totals:{[key("1013429")]:204}},order);
    assert.deepEqual(completed.map(row=>row["Issue Type"]),["Received","Received"]);
});

test("adjustment handlers emit exactly one signed delta for a duplicated item group",()=>{
    const item={itemCode:"1013429",itemName:"Maxim 400 Mg 7 Tab",orderedQty:204,receivedQty:144,orderNumbers:[order]};
    const transactions=[];
    const context={
        window:{},
        AppState:{settings:{allowOverReceiving:true},session:{deviceId:"test-device"}},
        ReceivingEngine:{adjustmentSources:{increase:"MANUAL_INCREASE",decrease:"MANUAL_DECREASE"}},
        toNumber:(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback,
        toSafeString:value=>String(value??""),
        getItemByCode:code=>code===item.itemCode?item:null,
        resolveReceivingTransactionOrder:()=>order,
        getReceivingDisplayMetrics:()=>({orderedQty:204,receivedQty:item.receivedQty,remainingQty:204-item.receivedQty}),
        updateItemCalculatedFields:()=>{},
        addReceivingTransaction:transaction=>{transactions.push(transaction);return transaction;},
        finishReceivingChange:()=>{},
        createTransactionId:()=>`tx-${transactions.length+1}`,
        nowISO:()=>"2026-10-12T00:00:00.000Z",
        getReceivingRuntimeDeviceType:()=>"PC",
        showToast:()=>{},
        document:{body:{classList:{add(){},remove(){}}}},
        setTimeout:()=>{}
    };
    for(const name of ["applyQuantityAdjustment","increaseItemQuantity","decreaseItemQuantity"]){
        vm.runInNewContext(extractFunction(receivingSource,name),context);
    }
    context.increaseItemQuantity("1013429",1);
    assert.equal(item.receivedQty,145);
    context.decreaseItemQuantity("1013429",1);
    assert.equal(item.receivedQty,144);
    assert.deepEqual(transactions.map(row=>row.quantity),[1,-1]);
    assert.equal(transactions.length,2);
    assert(transactions.every(row=>row.orderId===order));
});

test("the active HTML entry cache-busts the corrected report source",()=>{
    assert.match(indexSource,/<script src="js\/reports\.js\?v=[^"\s]*GROUP_INTEGRITY_20261017_1"><\/script>/);
});
