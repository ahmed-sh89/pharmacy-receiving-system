"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const read=file=>fs.readFileSync(file,"utf8");
const approved=["Beauty","FMCG","HomeHealth","Medicine","Mom & Baby","Supplement"];
const release=read("js/receiving-release.js");
const start=release.indexOf("window.PharmFlowClassificationFilters=");
const end=release.indexOf("\n\n\n/* Retired device-local",start);
assert(start>=0&&end>start,"classification filter utility must be available for testing");
const context={window:{}};
vm.runInNewContext(release.slice(start,end),context);
const groups=context.window.PharmFlowClassificationFilters;

test("six approved Groups normalize case and whitespace, with Home Health display alias",()=>{
  assert.deepEqual(Array.from(groups.approvedGroups),approved);
  for(const group of approved){
    assert.equal(groups.normalizeGroup(`  ${group.toLowerCase()}  `),group);
  }
  assert.equal(groups.normalizeGroup("  hOmE HeAlTh "),"HomeHealth");
  assert.equal(groups.displayGroup("HomeHealth"),"Home Health");
  assert.equal(groups.normalizeGroup("Home  Health"),"");
  assert.equal(groups.normalizeGroup("Hair Care"),"");
  assert.equal(groups.normalizeGroup("Skin Care"),"");
  assert.equal(groups.normalizeGroup("Makeup & Accessories"),"");
});

test("effective Group prefers canonical Group and only validates legacy category fallback",()=>{
  assert.equal(groups.normalize({group_name:"  medicine ",category:"Beauty"}).group,"Medicine");
  assert.equal(groups.normalize({group_name:"",category:"  MOM & BABY  "}).group,"Mom & Baby");
  assert.equal(groups.normalize({group_name:"Hair Care",category:"Beauty"}).group,"Beauty");
  assert.equal(groups.normalize({group_name:"",category:"Hair Care"}).group,"");
  assert.equal(groups.normalize({group_name:"",category:"Skin Care"}).group,"");
});

test("Receiving Group choices contain only six approved values and filters use effective Group",()=>{
  const rows=[
    {item_code:"1",group_name:"",category:"Hair Care"},
    {item_code:"2",group_name:"",category:"Beauty"},
    {item_code:"3",group_name:"Medicine",category:"Beauty"},
    {item_code:"4",group_name:"",category:""}
  ];
  const choices=groups.choices(rows).groups;
  assert.deepEqual(Array.from(choices),approved);
  assert.deepEqual(Array.from(groups.filter(rows,{groups:["Beauty"]})),[rows[1]]);
  assert.equal(groups.filter(rows,{groups:approved}).length,rows.length,"Select All remains an unfiltered view, including unresolved rows");
  assert.equal(groups.choices(rows).categories.includes("Hair Care"),true,"subordinate values remain subordinate category choices");
});

test("Settings and Receiving expose a controlled Group selector only on Global creation",()=>{
  const ui=read("ui.js"),receiving=read("js/receiving.js"),service=read("js/identifier-service.js"),index=read("index.html");
  const settingsStart=ui.indexOf("const renderNewItemForm=");
  const settingsEnd=ui.indexOf("const renderNoResults=",settingsStart);
  const settings=ui.slice(settingsStart,settingsEnd);
  assert.match(settings,/Group <b>\*<\/b><\/span><select data-new-item-group required>/);
  for(const [index,group] of approved.entries()) assert.ok(settings.includes(`value="${group.replaceAll("&","&amp;")}"`),`Settings selector is missing ${group}`);
  assert.match(settings,/includes\(groupName\)/);
  assert.match(settings,/groupName,identifierDisplay/);
  assert.match(receiving,/Group <b>\*<\/b><\/span><select data-quick-group>/);
  assert.match(receiving,/findGlobalItemByCode\(resolvingItem.itemCode/);
  assert.match(receiving,/if\(!globalItem\) throw new Error/);
  assert.ok(!receiving.includes("data-link-group"),"existing-item linking must never create an order-row Master item");
  assert.match(receiving,/learnExistingIdentifier\(globalThis\.crypto\.randomUUID\(\),gtin,globalItem,"Receiving barcode resolution"\)/);
  assert.match(receiving,/IdentifierService\.quickAddOrderItem\(quickCapture\)/);
  assert.match(service,/learn_pharmflow_identifier_v2/);
  assert.match(service,/p_group_name:toSafeString\(groupName\)/);
  assert.match(index,/id="receivingGroupFilterLabel">Group/);
  assert.match(index,/<th>\s*Group\s*<\/th>/);
  assert.match(ui,/data-label="Group"/);
  assert.match(receiving,/data-review[\s\S]*nrV2CreateDraft/);
});

test("server migration validates creation, preserves legacy linking RPC, and avoids global NOT NULL",()=>{
  const sql=read("PHASE2C1173_GLOBAL_MASTER_GROUP_INTEGRITY.sql");
  assert.match(sql,/pharmflow_normalize_main_group_v1/);
  assert.match(sql,/A valid approved Group is required to create a Global Item/);
  assert.match(sql,/create or replace function public\.learn_pharmflow_identifier_v2/);
  assert.match(sql,/if v_item_exists then[\s\S]*add_pharmflow_global_identifier_v2/);
  assert.match(sql,/create_pharmflow_global_item_and_learn_v1\([\s\S]*p_group_name/);
  assert.match(sql,/create or replace function public\.learn_pharmflow_identifier_v1/);
  assert.match(sql,/p_item_code,p_item_name,null,p_reason/);
  assert.doesNotMatch(sql,/alter table public\.pharmflow_global_items_v2[\s\S]*group_name set not null/i);
  assert.match(sql,/revoke all on function public\.learn_pharmflow_identifier_v2/);
  assert.match(sql,/grant execute on function public\.learn_pharmflow_identifier_v2[\s\S]*to authenticated/);
  assert.match(sql,/create_pharmflow_global_item_and_learn_v1[\s\S]*create_pharmflow_global_item_v2/);
  assert.match(sql,/A valid approved Group is required to create a Global Item/);
});

test("Production baseline is pinned and legacy Beauty casing normalizes without changing category",()=>{
  const sql=read("PHASE2C1173_GLOBAL_MASTER_GROUP_INTEGRITY.sql");
  for(const count of ["total_items=56575","valid_group_items=3720","blank_group_items=52855","legacy_category_items=52792","canonical_legacy_category_items=52766","normalized_legacy_category_items=26","unresolved_items=63","invalid_nonblank_group_items=0"]){
    assert.ok(sql.includes(count),`Migration preflight is missing ${count}`);
  }
  assert.match(sql,/count\(\*\) filter \(where group_name in \('Beauty','FMCG','HomeHealth','Medicine','Mom & Baby','Supplement'\)\)[\s\S]*<> 56573/);
  assert.match(sql,/count\(\*\) filter \(where nullif\(btrim\(group_name\),''\) is null\)[\s\S]*<> 2/);
  assert.doesNotMatch(sql,/set category\s*=/i);
});

test("approved workbook migration is deterministic and preserves subordinate classification fields",()=>{
  const sql=read("PHASE2C1173_GLOBAL_MASTER_GROUP_INTEGRITY.sql");
  const tupleRows=sql.match(/^  \('[^\n]+',\s*'[^\n]+',\s*'(?:Beauty|FMCG|HomeHealth|Medicine|Mom & Baby|Supplement)'\)[,;]?$/gm)||[];
  assert.equal(tupleRows.length,61);
  assert.match(sql,/PHARMFLOW_GLOBAL_MASTER_UNRESOLVED_GROUP_REVIEW_20261017\(3\)\.xlsx/);
  assert.match(sql,/for update/);
  assert.match(sql,/previous_category/);
  assert.match(sql,/previous_sub_category/);
  assert.match(sql,/i\.category is distinct from h\.previous_category/);
  assert.match(sql,/i\.sub_category is distinct from h\.previous_sub_category/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on public\.pharmflow_global_group_change_audit_v1 from public, anon, authenticated/);
  assert.doesNotMatch(sql,/set category\s*=/i);
  assert.doesNotMatch(sql,/set sub_category\s*=/i);
});

test("Expiry sources remain unchanged and required compatibility is documented only",()=>{
  const cp=read("PHARMFLOW_GLOBAL_GROUP_GATE_B_CHECKPOINT.md");
  assert.match(cp,/Expiry remains untouched/);
  assert.match(cp,/canonical `group_name`/);
  assert.match(cp,/Needs Review/);
});
