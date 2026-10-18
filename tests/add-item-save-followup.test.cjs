"use strict";
const fs=require("node:fs");
const assert=require("node:assert/strict");
const {test}=require("node:test");

const ui=fs.readFileSync("ui.js","utf8");
const html=fs.readFileSync("index.html","utf8");
const expiry=fs.readFileSync("js/expiry.js","utf8");
const service=fs.readFileSync("js/identifier-service.js","utf8");
const start=ui.indexOf("function renderV2IdentifierAdministration");
const end=ui.indexOf("\nsetTimeout(()=>{",start);
assert(start>=0&&end>start,"Global Master administration source must be available");
const settings=ui.slice(start,end);
const handler=settings.match(/workspace\.querySelector\("\[data-create-item\]"\)\?\.addEventListener\("click",async event=>\{([\s\S]*?)\n        \}\);/);
assert(handler,"Add Item click handler must be available");

async function exercise({existingItem=null,barcodedItem=null,saveError=null,refreshError=null}={}){
  const calls=[],messages=[],logs=[];
  const button={disabled:false};
  const fields={
    "[data-new-item-code]":{value:"PFHOTFIX01"},
    "[data-new-item-name]":{value:"PHARMFLOW HOTFIX TEST"},
    "[data-new-item-barcode]":{value:"06291100080069"},
    "[data-new-item-group]":{value:"Medicine",focus(){calls.push("group-focus");}}
  };
  const workspace={querySelector(selector){return selector==="[data-create-item]"?button:fields[selector]||null;}};
  const searchInput={value:""};
  const IdentifierService={
    findGlobalItemByCode:async code=>{calls.push(["find-code",code]);return existingItem;},
    resolve:async value=>{calls.push(["resolve",value]);return barcodedItem;},
    createItem:async(operationId,payload)=>{calls.push(["create",operationId,payload]);if(saveError)throw saveError;return {success:true};}
  };
  let closed=false;
  const callback=new Function("event","workspace","toSafeString","IdentifierService","searchInput","showItem","showToast","nrV2OperationId","auditReason","closeControl","Logger",
    `return (async()=>{${handler[1]}})();`);
  const event={currentTarget:button};
  const work=callback(event,workspace,value=>String(value??""),IdentifierService,searchInput,
    async item=>{calls.push(["show",item]);if(refreshError)throw refreshError;},
    (message,kind)=>messages.push([message,kind]),()=>"operation-1",reason=>reason,
    ()=>{closed=true;calls.push("close");},{warn:(...args)=>logs.push(args)});
  await work;
  return {calls,messages,logs,button,closed,searchInput};
}

test("save succeeds even when optional item detail refresh fails; modal closes once",async()=>{
  const result=await exercise({refreshError:new Error("Could not find function list_pharmflow_pharmacy_item_identifiers_v1")});
  assert.equal(result.calls.filter(call=>Array.isArray(call)&&call[0]==="create").length,1);
  assert.equal(result.closed,true);
  assert.deepEqual(result.messages,[["Item added to Global Master","success"]]);
  assert.equal(result.button.disabled,true);
  assert.equal(result.logs.length,1);
});

test("genuine create RPC failure stays visible and safely retryable",async()=>{
  const result=await exercise({saveError:new Error("authoritative create rejected")});
  assert.equal(result.closed,false);
  assert.equal(result.button.disabled,false);
  assert.deepEqual(result.messages,[["authoritative create rejected","error"]]);
  assert.equal(result.calls.some(call=>Array.isArray(call)&&call[0]==="show"),false);
});

test("existing item retry never creates a duplicate item or mapping",async()=>{
  const result=await exercise({existingItem:{item_code:"PFHOTFIX01",item_name:"Already exists",group_name:"Medicine"}});
  assert.equal(result.calls.some(call=>Array.isArray(call)&&call[0]==="create"),false);
  assert.equal(result.calls.some(call=>Array.isArray(call)&&call[0]==="resolve"),false);
});

test("barcode already mapped to another item is rejected before create",async()=>{
  const result=await exercise({barcodedItem:{found:true,itemCode:"OTHER-CODE"}});
  assert.equal(result.calls.some(call=>Array.isArray(call)&&call[0]==="create"),false);
  assert.deepEqual(result.messages,[["Barcode is already linked to Item Code OTHER-CODE. No duplicate was created.","error"]]);
});

test("scan resolver retains exact identifier and authoritative RPC contract",async()=>{
  const resolveBody=service.match(/async resolve\(identifierDisplay\)\{([\s\S]*?)\n    \},/);
  assert(resolveBody,"Identifier resolver method must exist");
  const seen=[];
  const resolve=new Function("identifierDisplay","toSafeString","authRpc","pharmacyId",`return (async()=>{${resolveBody[1]}})();`);
  const resolved=await resolve("06291100080069",value=>String(value??""),async(name,args)=>{seen.push([name,args]);return [{found:true,itemCode:"1011923",itemName:"Adol 500 MG 24 Cap",groupName:"Medicine"}];},()=>"staging-pharmacy-id");
  assert.deepEqual(seen,[["resolve_pharmflow_identifier_v2",{p_pharmacy_id:"staging-pharmacy-id",p_identifier_display:"06291100080069"}]]);
  assert.equal(resolved[0].itemCode,"1011923");
});

test("Scan & Activity displays canonical Group without Category fallback",()=>{
  assert.match(html,/expiryActiveDatum"><span>Group<\/span><strong id="expiryActiveItemCategory">/);
  assert.match(expiry,/set\("expiryActiveItemCategory",item\.groupName\|\|"Uncategorized"\)/);
  assert.doesNotMatch(expiry,/set\("expiryActiveItemCategory",item\.category/);
});

test("Receiving and Expiry call paths are unchanged by Add Item patch",()=>{
  assert.match(ui,/refreshReceivingTable\(\)/);
  assert.match(expiry,/async function resolveExpiryScannedValue\(rawValue\)/);
  assert.match(expiry,/itemCode:record\.itemCode\|\|""/);
});
