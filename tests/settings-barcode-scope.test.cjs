"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const ui=fs.readFileSync("ui.js","utf8");
const service=fs.readFileSync("js/identifier-service.js","utf8");
const start=ui.indexOf("    const loadBarcodeRows=async item=>{");
const end=ui.indexOf("\n    const renderBarcodeList",start);
assert(start>=0&&end>start,"Canonical barcode loader is missing");
const loaderSource=ui.slice(start,end);

async function loadRows({globalWriter=false,pharmacyAdmin=false,globalRows=[],pharmacyRows=[]}={}){
  const calls=[];
  const context={
    IdentifierService:{
      listItemIdentifiers:async code=>{calls.push(["global",code]);return globalRows;},
      listPharmacyItemIdentifiers:async code=>{calls.push(["pharmacy",code]);return pharmacyRows;}
    },
    itemCodeOf:item=>String(item.item_code||item.itemCode||"").trim(),
    toSafeString:value=>String(value??""),
    canWriteGlobal:()=>globalWriter,
    isPharmacyMappingAdmin:()=>pharmacyAdmin
  };
  vm.runInNewContext(`${loaderSource};globalThis.loadBarcodeRows=loadBarcodeRows;`,context);
  return {rows:await context.loadBarcodeRows({item_code:"1014298"}),calls};
}

test("Global writers, pharmacy admins, and read-only users load both authorized scopes",async()=>{
  const pharmacyRows=[{identifier_id:"local-id",identifier_display:"04065272072977",identifier_key:"04065272072977",mapping_revision:1}];
  for(const permissions of [{globalWriter:true},{pharmacyAdmin:true},{}]){
    const {rows,calls}=await loadRows({...permissions,pharmacyRows});
    assert.equal(JSON.stringify(calls.sort()),JSON.stringify([["global","1014298"],["pharmacy","1014298"]]));
    assert.equal(JSON.stringify(rows.map(row=>row.mappingScope)),JSON.stringify(["PHARMACY"]));
    assert.equal(rows[0].removable,!!permissions.pharmacyAdmin);
    assert.equal(rows[0].correctable,!!permissions.pharmacyAdmin);
    assert.equal(rows[0].resolutionPriority,"PHARMACY");
  }
});

test("same identifier in both scopes remains separately addressable with pharmacy priority",async()=>{
  const identifier="04065272072977";
  const {rows}=await loadRows({
    globalWriter:true,
    pharmacyAdmin:true,
    pharmacyRows:[{identifier_id:"pharmacy-id",identifier_display:identifier,identifier_key:identifier,mapping_revision:3}],
    globalRows:[{identifier_id:"global-id",identifier_display:identifier,identifier_key:identifier,mapping_revision:7}]
  });
  assert.equal(rows.length,2);
  assert.equal(JSON.stringify(rows.map(row=>[row.mappingScope,row.identifier_id,row.mapping_revision,row.resolutionPriority])),JSON.stringify([
    ["PHARMACY","pharmacy-id",3,"PHARMACY"],
    ["GLOBAL","global-id",7,"FALLBACK"]
  ]));
  assert(rows.every(row=>row.removable&&row.correctable));
});

test("identifier display stays exact and separate mappings remain scoped to current pharmacy",async()=>{
  const identifiers=["04065272072977","SKU-A01","00012345"];
  const pharmacyRows=identifiers.map((identifier,index)=>({identifier_id:`p-${index}`,identifier_display:identifier,identifier_key:identifier.toUpperCase(),mapping_revision:index+1}));
  const {rows}=await loadRows({pharmacyRows});
  assert.equal(JSON.stringify(rows.map(row=>row.identifier_display)),JSON.stringify(identifiers));
  assert.match(service,/p_pharmacy_id:pharmacyId,p_item_code:toSafeString\(itemCode\)/);
});

test("correction and removal stay mapping-ID/revision scoped through official audited service contracts",()=>{
  const renderer=ui.slice(ui.indexOf("function renderV2IdentifierAdministration"),ui.indexOf("\nsetTimeout(()=>{",ui.indexOf("function renderV2IdentifierAdministration")));
  assert.match(renderer,/Correct Mapping/);
  assert.match(renderer,/Confirm Barcode Correction/);
  assert.match(renderer,/Confirm the physical package identifier before continuing/);
  assert.match(renderer,/correctPharmacyIdentifier\(nrV2OperationId\(\),row\.identifier_id,row\.mapping_revision,target,auditReason\("CORRECT_BARCODE"\)\)/);
  assert.match(renderer,/correctIdentifier\(nrV2OperationId\(\),row\.identifier_id,row\.mapping_revision,targetCode,auditReason\("CORRECT_BARCODE"\)\)/);
  assert.match(renderer,/removePharmacyIdentifier\(nrV2OperationId\(\),row\.identifier_id,row\.mapping_revision/);
  assert.match(renderer,/removeIdentifier\(nrV2OperationId\(\),row\.identifier_id,row\.mapping_revision/);
  assert.match(renderer,/Only this mapping will change/);
  assert.match(renderer,/catch\(error\)\{targetButton\.disabled=false;showToast/);
  assert.match(renderer,/catch\(error\)\{button\.disabled=false;showToast/);
  assert.match(renderer,/IdentifierService\.deleteUnusedItem/);
  assert.match(renderer,/deleteUnusedItem/);
  assert.doesNotMatch(renderer,/removeSettingsIdentifier\(/);
});
