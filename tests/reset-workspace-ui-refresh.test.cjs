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
        if(quote){
            if(escaped) escaped=false;
            else if(character==="\\") escaped=true;
            else if(character===quote) quote="";
            continue;
        }
        if(character==='"'||character==="'"||character==='`'){quote=character;continue;}
        if(character==="{") depth+=1;
        if(character==="}"){
            depth-=1;
            if(depth===0) return source.slice(start,index+1);
        }
    }
    throw new Error(`${name} has no closing brace`);
}

test("successful reset immediately notifies the active-orders control of an empty workspace",async()=>{
    const deletedOrder="TO-000482432";
    const emitted=[];
    const context={
        AppState:{
            session:{cloud:false},
            workspace:{
                active:true,
                orderFiles:[{documentId:deletedOrder}],
                orderData:[{itemCode:"1012140"}],
                receivingHistory:[{orderNumber:deletedOrder}],
                selectedOrderNumbers:[deletedOrder],
                selectedOrderNumber:deletedOrder
            }
        },
        AuthState:{context:{pharmacy_id:"pharmacy-id"}},
        navigator:{onLine:true},
        AppEvents:{emit:(event,payload)=>emitted.push({event,payload,files:[...context.AppState.workspace.orderFiles]})},
        authRpc:async()=>({success:true,generation:22}),
        showLoading:()=>{},hideLoading:()=>{},showToast:()=>{},focusScannerInput:()=>{},
        clearCurrentWorkspace:()=>{},createEmptySession:()=>({}),ensureDeviceId:()=>"PC-A",
        deleteWorkspaceSnapshot:()=>{},stopCloudPolling:()=>{},resetStatistics:()=>{},
        refreshEntireUI:()=>{},navigateTo:()=>{},Logger:{warn:()=>{},error:()=>{}},
        PharmFlowCloudWorkspace:{},Promise,setTimeout:()=>0
    };
    const appSource=fs.readFileSync("js/app.js","utf8");
    vm.runInNewContext(extractFunction(appSource,"resetCurrentWorkspace"),context);
    await context.resetCurrentWorkspace();

    assert.equal(context.AppState.workspace.orderFiles.length,0);
    const refresh=emitted.find(entry=>entry.event==="receiving:updated"&&entry.payload?.source==="workspace-reset");
    assert.ok(refresh,"reset must publish the existing receiving UI refresh event");
    assert.equal(refresh.files.length,0,"the UI refresh must observe no deleted active order");

    const uiSource=fs.readFileSync("ui.js","utf8");
    assert.match(uiSource,/AppEvents\.on\('receiving:updated',\(\)=>setTimeout\(refreshOrderScopeControl,0\)\)/);
    assert.match(uiSource,/const files=Array\.isArray\(AppState\.workspace\?\.orderFiles\)\?AppState\.workspace\.orderFiles:\[\];/);
});
