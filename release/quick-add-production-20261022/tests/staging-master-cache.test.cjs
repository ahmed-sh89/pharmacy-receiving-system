const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const {indexedDB}=require('fake-indexeddb');
function context(rows,meta,order){
 const s={indexedDB,window:{indexedDB},console,Logger:{warn(){},info(){}},localStorage:{getItem(){return null},setItem(){},removeItem(){}},AuthState:{context:{pharmacy_id:'QA'}},AppState:{workspace:{orderData:order,orderFiles:[{sourceRows:order.map(x=>({...x}))}],mappingData:[]},indexes:{itemByCode:new Map(order.map(x=>[x.itemCode,x]))}},AppEvents:{emit(){}},normalizeItemCode:x=>String(x||''),normalizeGTIN:x=>String(x||'').replace(/[^\d]/g,''),toSafeString:x=>String(x||''),nowISO:()=>new Date().toISOString(),saveWorkspace(){},rebuildStateIndexes(){},async authRpc(name){if(name==='get_pharmflow_master_cache_meta_v2')return [meta];if(name==='get_pharmflow_master_cache_page_v2')return rows;throw Error('Unexpected legacy call '+name)}};
 vm.createContext(s);vm.runInContext(fs.readFileSync('js/master-gtin.js','utf8'),s);return s;
}
test('V2 cache separates Global item total from numeric identifier rows and preserves uploaded Group',async()=>{
 const order=[{itemCode:'A',group_name:'Beauty'},{itemCode:'B',group_name:''}];
 const s=context([{item_code:'A',gtin:'001234',group_name:'Medicine'},{item_code:'B',gtin:'005678',group_name:'HomeHealth'}],{item_count:2,global_item_count:12,identifier_count:14,version:'QA-V2',updated_at:'2026-10-22T00:00:00Z'},order);
 await vm.runInContext('performGlobalMasterGTINSync({silent:true})',s);
 const status=vm.runInContext('getMasterGTINStatus()',s);
 assert.equal(status.installed,true);assert.equal(status.itemCount,12);assert.equal(status.recordCount,2);assert.equal(status.identifierCount,14);
 assert.equal(order[0].group_name,'Beauty');assert.equal(order[1].group_name,'');assert.equal(s.AppState.workspace.orderFiles[0].sourceRows[1].group_name,'');
 assert.equal(status.currentOrder.matchedItems,2);
});
test('V2 item collection remains available when it has no numeric GTIN cache rows',async()=>{
 const s=context([],{item_count:0,global_item_count:1,identifier_count:1,version:'QA-ALPHA'},[]);
 await vm.runInContext('performGlobalMasterGTINSync({silent:true})',s);assert.equal(vm.runInContext('getMasterGTINStatus().installed',s),true);assert.equal(vm.runInContext('getMasterGTINStatus().itemCount',s),1);
});
