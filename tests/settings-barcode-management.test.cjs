"use strict";
const fs=require("fs");
const assert=require("assert");
const {test}=require("node:test");

const html=fs.readFileSync("index.html","utf8");
const ui=fs.readFileSync("ui.js","utf8");
const css=fs.readFileSync("css/style.css","utf8");
const service=fs.readFileSync("js/identifier-service.js","utf8");
const readSql=fs.readFileSync("PHASE2C1168_SETTINGS_BARCODE_MANAGEMENT_READ.sql","utf8");
const removeSql=fs.readFileSync("PHASE2C1169_SETTINGS_IDENTIFIER_REMOVE.sql","utf8");

const start=ui.indexOf("function renderV2IdentifierAdministration");
const end=ui.indexOf("\nsetTimeout(()=>{",start);
assert(start>=0&&end>start,"Settings identifier administration renderer is missing");
const settings=ui.slice(start,end);

assert(!html.includes('id="btnOpenBarcodeControl"'),"Inline search must not require a launcher");
assert(!html.includes('id="barcodeControlOverlay"'),"Inline Settings must not retain the old modal");
assert(html.includes('id="settingsItemsPanel"'),"Items Control panel must exist");
assert(settings.includes('renderDefault();'),"Inline workspace must initialize immediately");
assert(require('linkedom').parseHTML(html).document.querySelector('[data-admin-search][type="search"]'),"Unified Settings search input is missing");
assert(!html.includes('class="globalIdentifierMasterLookupGrid barcodeManagementLookup barcodeManagementUnifiedLookup"'),"Legacy inline barcode lookup must be removed");
assert(!html.includes('id="btnGlobalIdentifierMasterClear"'),"Legacy full-size Clear button must be removed");
assert(!html.includes("globalIdentifierMasterItemSearch"),"Legacy second item-search field must be removed");
assert(settings.includes("IdentifierService.resolve(search.query)"),"Unified search must resolve exact barcodes");
assert(settings.includes("IdentifierService.searchItems(search.query,12)"),"Unified search must search Item Code / Item Name");
assert(settings.includes("+ Add Barcode"),"Add Barcode action is missing");
assert(settings.includes("Remove Barcode"),"Remove Barcode action is missing");
assert(settings.includes("Delete Item"),"Delete Item action is missing");
assert(settings.includes("+ Add New Item"),"Add New Item action is missing");
assert(settings.includes("IdentifierService.createItem"),"New Item must use the authoritative Global item creation service");
assert(settings.includes("Item Code, Item Name and Barcode are required"),"New item path must validate its identity fields before creation");
assert.match(settings,/workspace\.innerHTML=`[\s\S]*<label class="barcodeNewItemGroup"><span>Group <b>\*<\/b><\/span><select data-new-item-group required>/,"Add New Item must render its required Group selector immediately");
assert(settings.includes('value="HomeHealth">Home Health</option>'),"New Global Item must use the controlled six-Group selector");
assert(!settings.includes('if(!groupField)'),"Group must not be deferred until the first Add Item attempt");
assert(settings.includes("findGlobalItemByCode(itemCode)")&&settings.includes("if(existingGlobal){")&&settings.includes("No duplicate was created"),"Existing Global Item must be detected before create and never duplicated");
assert(settings.indexOf("if(existingGlobal){")<settings.indexOf("const groupField=workspace.querySelector"),"Existing-item protection must run before Group validation");
assert(settings.includes('auditReason("ADD_ITEM")'),"New Item must retain automatic audit reason");
assert(!settings.includes("ActiveOrder"),"Settings barcode management must not depend on Active Order state");
assert(!settings.includes("activeOrder"),"Settings barcode management must not depend on Active Order state");
assert(settings.includes("parseGS1Barcode"),"Settings scanner input must reuse the Receiving GS1 parser");
assert(settings.includes("searchInput.addEventListener(\"input\",event=>"),"Manual typing must provide item suggestions");
assert(settings.includes("searchInput.addEventListener(\"keydown\""),"Enter search support is missing");
assert(!settings.includes("setInterval"),"Barcode Management must not auto-reset on a timer");
assert(settings.includes("data-correct-barcode"),"Authorized barcode mappings must expose the explicit correction action");
assert(!settings.includes("data-reason"),"Manual reason input must not appear in the Settings workflow");
assert(settings.includes('auditReason("ADD_BARCODE")'),"Add must retain automatic audit reason");
assert(settings.includes('auditReason("REMOVE_BARCODE")'),"Remove must retain automatic audit reason");
assert(settings.includes('auditReason("DELETE_ITEM")'),"Delete must retain automatic audit reason");
assert(settings.includes("the item itself will remain."),"Remove must clearly preserve the item");
assert(service.includes("listPharmflow")===false,"Service naming guard");
assert(service.includes("listPharmacyItemIdentifiers"),"Pharmacy barcode list service is missing");
assert(service.includes("removeSettingsIdentifier"),"Coordinated HHP084 remove service is missing");
assert(service.includes("deleteUnusedItem"),"Safe Delete Item service is missing");
assert(readSql.includes("is_pharmacy_member(p_pharmacy_id)"),"Pharmacy barcode read RPC must enforce membership");
assert(readSql.includes("revoke all")&&readSql.includes("to authenticated"),"Read RPC grants are not restricted");
assert(removeSql.includes("HHP084")&&removeSql.includes("lower(coalesce(pm.role,''))='admin'"),"Coordinated remove must enforce HHP084 ADMIN");
assert(removeSql.includes("remove_pharmflow_pharmacy_identifier_v2")&&removeSql.includes("remove_pharmflow_global_identifier_v2"),"HHP084 removal must coordinate Pharmacy + Global mappings");
assert(!html.includes('id="masterGTINStatus"'),"Settings must not duplicate Global Master status");
assert(!html.includes('id="masterGTINItemCount"'),"Settings must not duplicate Global Master item count");
assert(!html.includes('id="masterGTINUpdatedAt"'),"Settings must not duplicate Global Master last-updated metric");
assert(!html.includes('Order Data Check &amp; Recovery'),"Redundant recovery panel must not be rendered");
assert(!html.includes('id="btnUpdateMasterGTIN"'),"Obsolete Global GTIN import recovery action must not be rendered");
assert(!html.includes('id="masterGTINFileInput"'),"Obsolete Global GTIN import recovery input must not be rendered");
assert(html.includes("settingsModuleTitleChip settingsAccountTitleChip"),"Account must use the compact KPI title chip");
assert(html.includes('class="expiryWorkspaceNav"'),"Settings must reuse the Expiry navigation design");
assert(css.includes(".settingsModuleTitleChip"),"Settings modules must use the shared compact KPI title system");
assert(!css.includes(".settingsModuleCard > .settingsIdentityMain{"),"Legacy full-width layered account header must stay removed");
assert(!html.includes('id="btnLoadMappings"'),"Legacy Mapping File action must be removed");
assert(!html.includes('id="mappingFileInput"'),"Legacy Mapping File input must be removed");
assert(!html.includes('id="mappingFilesList"'),"Legacy Mapping File list must be removed");
assert(!html.includes("Order &amp; Mapping Compatibility"),"Legacy Mapping File terminology must be removed from Manage Orders");
console.log("PASS settings barcode management regression");

assert(settings.includes("const button=event.currentTarget"),"Delete Item must preserve the clicked button across async confirmation");
assert(settings.includes("const isPlainGtin=/^\\d{8,14}$/"),"GTIN parsing must be limited to plain GTIN or strong GS1 input");
assert(settings.includes("isStrongGs1"),"Strong GS1 detection is required before parser normalization");
assert(settings.includes("barcodeSuggestionCode"),"Suggestion results must show Item Code");
assert(settings.includes("barcodeSuggestionName"),"Suggestion results must show Item Name alongside the code");
assert(settings.indexOf("barcodeSuggestionCode")<settings.indexOf("barcodeSuggestionName"),"Suggestion identity must render Item Code before Item Name");
assert(html.includes('class="secondaryButton barcodeControlClearButton"'),"Barcode Control must expose a clear action");
assert(html.includes('class="primaryButton barcodeControlSearchButton"'),"Barcode Control search must use the PharmFlow button system");
assert(settings.includes("barcodeSearchResults"),"Search results must use the dedicated Barcode Control result component");
assert(settings.includes("barcodeItemCard"),"Selected items must use the dedicated Barcode Control item card");
assert.match(settings,/Item Code<\/span><strong>\$\{esc\(itemCodeOf\(item\)/,"Selected Item card must label Item Code separately");
assert.match(settings,/Item Name<\/span><b>\$\{esc\(itemNameOf\(item\)/,"Selected Item card must label Item Name separately");
assert.match(settings,/Group<\/span><strong>\$\{esc\(group\)/,"Selected Item card must display Group separately");
assert(!settings.includes("needsReviewMappingCurrent"),"Barcode Control must not retain legacy Needs Review item markup");
assert(!settings.includes("needsReviewMappingCompare"),"Barcode Control must not retain legacy Needs Review barcode-list markup");

test("Selected Item card presents Item Code, Item Name, and effective Group separately",()=>{
  const summaryMatch=settings.match(/const itemSummary=item=>\{([\s\S]*?)\n    \};/);
  assert(summaryMatch,"Selected Item summary renderer must be available for focused regression coverage");
  const render=new Function("item","esc","itemCodeOf","itemNameOf","window",`return (()=>{${summaryMatch[1]}})();`);
  const output=render({item_code:"I100",item_name:"Sample Product",group_name:"HomeHealth",category:"Hair Care"},String,value=>value.item_code,value=>value.item_name,{
    PharmFlowClassificationFilters:{normalizeReceiving:item=>({group:item.group_name}),displayGroup:value=>value==="HomeHealth"?"Home Health":value}
  });
  assert.match(output,/Item Code[\s\S]*I100/);
  assert.match(output,/Item Name[\s\S]*Sample Product/);
  assert.match(output,/Group[\s\S]*Home Health/);
  assert(!output.includes("Hair Care"),"A subordinate category must not be presented as the main Group");
});

test("Unknown barcode prefill preserves ambiguous numeric Item Code searches",()=>{
  const parseMatch=settings.match(/const parseSearch=value=>\{([\s\S]*?)\n    \};/);
  const prefillMatch=settings.match(/const newItemPrefillForNoResult=\(search,\{barcodeConfirmed=false\}=\{\}\)=>\{([\s\S]*?)\n    \};/);
  assert(parseMatch,"Settings search parser must be available for focused regression coverage");
  assert(prefillMatch,"No-result Add New Item prefill helper must be available for focused regression coverage");
  assert.match(settings,/data-new-item-code[^>]*value="\$\{esc\(prefill\.itemCode\|\|""\)\}"/);
  assert.match(settings,/data-new-item-barcode[^>]*value="\$\{esc\(prefill\.barcode\|\|""\)\}"/);
  assert(settings.includes("renderNoResults(search,{barcodeConfirmed:scanned})"),"Only scanner-confirmed values inherit barcode intent from ambiguous numeric input");
  const prefill=new Function(`return (search,{barcodeConfirmed=false}={})=>{${prefillMatch[1]}}`)();
  const parse=new Function("toSafeString","looksLikeStrongBarcode","parseGS1Barcode","cleanScannerInput",`return value=>{${parseMatch[1]}}`)(
    value=>String(value??""),
    value=>/^\](?:C1|d2|Q3)/i.test(value)||value.length>=18&&/\d{8,}/.test(value),
    value=>{
      const raw=String(value??"").replace(/^\](?:C1|d2|Q3)/i,"");
      if(/^\d{8,14}$/.test(raw))return {gtin:raw,parsed:true,format:"LINEAR"};
      const gs1=raw.match(/^01(\d{14})/);
      if(gs1)return {gtin:gs1[1],parsed:true,format:"GS1"};
      const fallback=raw.match(/(?:^|\D)(\d{8,13})(?:\D|$)/);
      return fallback?{gtin:fallback[1],parsed:true,format:"FALLBACK"}:{gtin:"",parsed:false,format:"UNKNOWN"};
    },
    value=>String(value??"").replace(/^\](?:C1|d2|Q3)/i,"")
  );
  for(const identifier of ["TESTPFPREFILL20261017","TESTPFGROUP2701"]){
    const parsed=parse(identifier);
    assert.strictEqual(parsed.query,identifier,`${identifier} must not be reduced to a numeric substring`);
    const confirmedScan={...parsed,isBarcode:true};
    assert.deepStrictEqual(prefill(confirmedScan,{barcodeConfirmed:true}),{barcode:identifier},`${identifier} must retain its complete identifier in Barcode`);
  }
  const numericGtin=parse("06281086107829");
  assert.deepStrictEqual(numericGtin,{raw:"06281086107829",query:"06281086107829",isBarcode:true,isPlainGtin:true,isStrongGs1:false});
  assert.deepStrictEqual(prefill(numericGtin,{barcodeConfirmed:true}),{barcode:"06281086107829"},"A confirmed GTIN must remain unchanged in Barcode");
  assert.deepStrictEqual(prefill(numericGtin),{itemCode:"06281086107829"},"A manually entered numeric value must preserve Item Code search behavior");
  const gs1=parse("]C10100840164519373");
  assert.deepStrictEqual(gs1,{raw:"]C10100840164519373",query:"00840164519373",isBarcode:true,isPlainGtin:false,isStrongGs1:true});
  assert.deepStrictEqual(prefill(gs1),{barcode:"00840164519373"},"Valid GS1 must extract AI 01 GTIN and preserve leading zeroes");
  assert.deepStrictEqual(prefill({raw:"PF-NEW-01",query:"PF-NEW-01",isBarcode:false}),{itemCode:"PF-NEW-01"});
});

test("Settings new Global Item creation separates committed save from optional detail refresh",async t=>{
  const handlerMatch=settings.match(/workspace\.querySelector\("\[data-create-item\]"\)\?\.addEventListener\("click",async event=>\{([\s\S]*?)\n        \}\);/);
  assert(handlerMatch,"Settings new-item click handler must be available for behavioral regression coverage");
  const scenarios=[
    {name:"successful create despite refresh failure",result:{success:true},refreshError:new Error("optional detail refresh failed"),expectedMessage:["Item added to Database","success"],expectedDisabled:true,expectedClosed:true},
    {name:"genuine create rejection",error:new Error("RPC rejected test creation"),expectedMessage:["RPC rejected test creation","error"],expectedDisabled:false,expectedClosed:false}
  ];
  for(const scenario of scenarios){
    await t.test(scenario.name,async()=>{
      const calls=[];
      const button={disabled:false};
      const fields={
        "[data-new-item-code]":{value:"PFTESTGROUP01"},
        "[data-new-item-name]":{value:"PHARMFLOW GROUP TEST ITEM"},
        "[data-new-item-barcode]":{value:"TESTPFGROUP2701"},
        "[data-new-item-group]":{value:"Medicine",focus(){calls.push("group-focus");}}
      };
      const workspace={querySelector(selector){return selector==="[data-create-item]"?button:fields[selector]||null;}};
      const IdentifierService={
        findGlobalItemByCode:async code=>{calls.push(["lookup",code]);return null;},
        resolve:async value=>{calls.push(["resolve",value]);return {found:false};},
        createItem:async(operationId,payload)=>{calls.push(["create",operationId,payload]);if(scenario.error)throw scenario.error;return scenario.result;}
      };
      const messages=[],logs=[];
      let closed=false,currentTarget=button;
      const callback=new Function("event","workspace","toSafeString","IdentifierService","searchInput","showItem","showToast","nrV2OperationId","auditReason","closeControl","Logger",`return (async()=>{${handlerMatch[1]}})();`);
      const work=callback({get currentTarget(){return currentTarget;}},workspace,value=>String(value??""),IdentifierService,{value:""},
        async item=>{calls.push(["show",item]);if(scenario.refreshError)throw scenario.refreshError;},
        (message,kind)=>messages.push([message,kind]),()=>"isolated-op",reason=>reason,
        ()=>{closed=true;calls.push("close");},{warn:(...args)=>logs.push(args)});
      currentTarget=null;
      await work;
      assert.deepStrictEqual(calls[0],["lookup","PFTESTGROUP01"]);
      assert.deepStrictEqual(calls[1],["resolve","TESTPFGROUP2701"]);
      if(scenario.error){
        assert.deepStrictEqual(calls[2],["create","isolated-op",{
          itemCode:"PFTESTGROUP01",itemName:"PHARMFLOW GROUP TEST ITEM",groupName:"Medicine",
          identifierDisplay:"TESTPFGROUP2701",reason:"ADD_ITEM"
        }],"Creation must retain the selected canonical Group and submitted identity");
      }
      assert.strictEqual(button.disabled,scenario.expectedDisabled);
      assert.strictEqual(closed,scenario.expectedClosed);
      assert.deepStrictEqual(messages,[scenario.expectedMessage]);
      assert.strictEqual(logs.length,scenario.refreshError?1:0);
    });
  }
});
