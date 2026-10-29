const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const report=fs.readFileSync('js/reports.js','utf8'),receiving=fs.readFileSync('js/receiving.js','utf8'),ui=fs.readFileSync('ui.js','utf8');
function fn(source,name){const at=source.indexOf(`function ${name}(`),start=source.slice(at-6,at)==='async '?at-6:at;assert(at>=0,name);return source.slice(start,source.indexOf('\n}',at)+2);}
function harness(){
 const item={itemCode:'1012562',itemName:'Daroxime 500 Mg 10 Tab',orderNumbers:['A','B','C'],receivedQty:0};
 const source={A:[{...item,orderedQty:27,lot:'1',expiry:'2027-01'},{...item,orderedQty:35,lot:'2',expiry:'2028-01'}],B:[{...item,orderedQty:40}],C:[{...item,orderedQty:10}]};
 const c={Map,Set,JSON,AppState:{workspace:{orderData:[item],receivingHistory:[]},settings:{allowOverReceiving:false}},window:{},
 normalizeOrderNumber:v=>String(v||'').trim().toUpperCase(),normalizeItemCode:v=>String(v||'').trim(),toSafeString:v=>String(v??''),toNumber:(v,f=0)=>Number.isFinite(Number(v))?Number(v):f,
 getValidReceivingQuantity:Number,getActiveReceivingOrderNumbers:()=>Object.keys(source),getWorkspaceOrderSourceRows:o=>source[o],getItemByCode:()=>item,getSelectedReceivingOrderNumbers:()=>['A','B','C'],
 getReceivingOrderMetadata:()=>Object.keys(source).map(orderNumber=>({orderNumber})),IdentifierService:{pharmacyId:()=> 'P'},sessionStorage:{getItem:k=>c.saved.get(k)||null,setItem:(k,v)=>c.saved.set(k,v)},saved:new Map()};
 vm.createContext(c);
 for(const n of ['buildReceivedQuantityByOrder','getPerOrderReceivingRows','buildMultiOrderReceivingReport'])vm.runInContext(fn(report,n),c);
 for(const n of ['getReceivingOperationalItems','getReceivingEligibleOrders','getReceivingOrderRow','getReceivingAutoAllocationCandidates','buildReceivingAutoAllocationPlan','receiveAutoAllocatedItem','resolveReceivingTransactionOrder'])vm.runInContext(fn(receiving,n),c);
 for(const n of ['groupNeedsReviewRows','nrV2AllocationScope','nrV2ResolutionScope','nrV2ResolveGroupToOrderItem'])vm.runInContext(fn(ui,n),c);
 return {c,item,source};
}
const tx=(order,quantity,id='tx')=>({itemCode:'1012562',orderId:order,quantity,transactionId:id,gtin:'CODE'});
const plain=v=>JSON.parse(JSON.stringify(v));
test('Daroxime 27+35 becomes one 62/62 Completed operational row; original lines/batches unchanged',()=>{
 const {c,source}=harness(),before=JSON.stringify(source);c.AppState.workspace.receivingHistory=[tx('A',27,'x'),tx('A',35,'y')];
 const rows=c.getPerOrderReceivingRows('A');assert.equal(rows.length,1);assert.equal(rows[0]['Ordered Qty'],62);assert.equal(rows[0]['Received Qty'],62);assert.equal(rows[0].Difference,0);assert.equal(rows[0]['Issue Type'],'Received');assert.equal(JSON.stringify(source),before);
});
test('three Orders remain independent; ledger corrections, undo and scoped totals never duplicate',()=>{
 const {c}=harness();c.AppState.workspace.receivingHistory=[tx('A',70),tx('A',-8,'correction'),tx('B',10,'b'),{...tx('C',4,'undo'),undone:true}];
 const report=c.buildMultiOrderReceivingReport();assert.deepEqual(Array.from(report.orderGroups,g=>g.orderNumber),['A','B','C']);assert.deepEqual(Array.from(report.rows,r=>r['Received Qty']),[62,10,0]);assert.deepEqual(Array.from(report.rows,r=>r['Ordered Qty']),[62,40,10]);
});
test('allocation uses whole aggregate capacity, respects priority, and over-receiving boundaries',()=>{
 const {c,item,source}=harness();source.A[0].orderedQty=25;source.A[1].orderedQty=35;
 assert.deepEqual(plain(c.buildReceivingAutoAllocationPlan(item,70,['A','B'])),[{orderNumber:'A',quantity:60},{orderNumber:'B',quantity:10}]);
 assert.throws(()=>c.buildReceivingAutoAllocationPlan(item,101,['A','B']),/exceeds/);c.AppState.settings.allowOverReceiving=true;
 assert.deepEqual(plain(c.buildReceivingAutoAllocationPlan(item,101,['A','B'])),[{orderNumber:'A',quantity:60},{orderNumber:'B',quantity:41}]);
 assert.deepEqual(plain(c.buildReceivingAutoAllocationPlan(item,45,['B','A'])),[{orderNumber:'B',quantity:40},{orderNumber:'A',quantity:5}]);
});
test('unique original candidate resolves without selecting unrelated captured Orders; multiple candidates require relevant selection',()=>{
 const {c,item}=harness(),group={rows:[{work_scope_order_numbers:['A','B','C']}]};item.orderNumbers=['A'];c.getSelectedReceivingOrderNumbers=()=>['B'];
 assert.deepEqual(Array.from(c.nrV2ResolutionScope(group,item)),['A']);
 item.orderNumbers=['A','B'];assert.throws(()=>c.nrV2ResolutionScope(group,item),/Select the original/);
 c.getSelectedReceivingOrderNumbers=()=>['A','B'];assert.deepEqual(Array.from(c.nrV2ResolutionScope(group,item)),['A','B']);
});
test('missing, conflicting, inactive and mixed provenance fail safely; legacy recorded single Order remains valid',()=>{
 const {c,item}=harness();assert.throws(()=>c.nrV2ResolutionScope({rows:[{}]},item),/unavailable/);
 assert.throws(()=>c.nrV2ResolutionScope({rows:[{order_number:'B',work_scope_order_numbers:['A']}]},item),/Conflicting/);
 assert.throws(()=>c.nrV2ResolutionScope({rows:[{order_number:'X'}]},item),/active original captured/);
 assert.throws(()=>c.nrV2AllocationScope({rows:[{order_number:'A'},{order_number:'B'}]}),/different original/);
 assert.deepEqual(Array.from(c.nrV2ResolutionScope({rows:[{order_number:'A'}]},item)),['A']);
});
test('normal scanning retains current selection guard; server-accepted unique review scope is explicit and active',()=>{
 const {c,item}=harness();c.getSelectedReceivingOrderNumbers=()=>['B'];
 assert.throws(()=>c.resolveReceivingTransactionOrder(item,'A'),/no longer selected/);
 assert.equal(c.resolveReceivingTransactionOrder(item,'A',['A']),'A');
 assert.throws(()=>c.resolveReceivingTransactionOrder(item,'A',['A','B']),/no longer selected/);
 assert.throws(()=>c.resolveReceivingTransactionOrder(item,'X',['X']),/no longer selected/);
});
test('retrying allocations returns existing receipts without incrementing; mismatches block',()=>{
 const {c,item}=harness();c.APP_CONFIG={transactionSources:{scanner:'SCAN'}};let writes=0;
 c.receiveOrderItem=o=>{writes++;const t=tx(o.targetOrder,o.quantity,o.transactionId);c.AppState.workspace.receivingHistory.push(t);return t;};
 const options={item,quantity:70,gtin:'CODE',transactionId:'review',plan:[{orderNumber:'A',quantity:60},{orderNumber:'B',quantity:10}]};
 c.receiveAutoAllocatedItem(options);c.receiveAutoAllocatedItem(options);assert.equal(writes,2);
 options.plan[0].quantity=59;assert.throws(()=>c.receiveAutoAllocatedItem(options),/differs/);assert.equal(writes,2);
});
test('server-resolved review never replays receipt; blocked intent and cross-pharmacy rows cannot write',async()=>{
 const {c,item}=harness();item.orderNumbers=['A'];c.getSelectedReceivingOrderNumbers=()=>['B'];let writes=0;
 c.IdentifierService.findGlobalItemByCode=async()=>item;c.isPharmacyAdmin=()=>false;c.nrV2RequestResolution=async()=>({status:'RESOLVED'});c.nrV2GroupTransactionId=()=> 'group';c.APP_CONFIG={transactionSources:{scanner:'SCAN'}};c.receiveAutoAllocatedItem=()=>writes++;
 const group={total_quantity:2,gtin:'CODE',rows:[{review_id:'r',pharmacy_id:'P',pending_quantity:2,work_scope_order_numbers:['A','B','C']}]};
 await c.nrV2ResolveGroupToOrderItem(group,item);c.AppState.workspace.receivingHistory=[tx('A',62)];
 await c.nrV2ResolveGroupToOrderItem(group,item);assert.equal(writes,0);
 c.nrV2RequestResolution=async()=>({status:'BLOCKED',code:'CONFLICT'});await assert.rejects(c.nrV2ResolveGroupToOrderItem(group,item),/CONFLICT/);assert.equal(writes,0);
 group.rows[0].pharmacy_id='Q';await assert.rejects(c.nrV2ResolveGroupToOrderItem(group,item),/different pharmacy/);
});
test('separate original Orders never share a review group',()=>{
 const {c}=harness();const groups=c.groupNeedsReviewRows(['A','B'].map(order_number=>({identifier_display:'CODE',order_number,work_scope_order_numbers:['A','B'],pending_quantity:1})));
 assert.equal(groups.length,2);
});
test('real scan entry and Search plan use the same aggregate capacities; queued IDs persist before receiving',async()=>{
 const {c,item,source}=harness();source.A[0].orderedQty=25;source.A[1].orderedQty=35;c.normalizeIdentifier=String;
 c.IdentifierService.resolve=async()=>({found:true,itemCode:item.itemCode});c.getReceivingItemByItemCode=()=>item;c.isKnownItemOutsideHandheldScope=()=>false;c.APP_CONFIG={transactionSources:{scanner:'SCAN'}};
 const events=[];c.receiveAutoAllocatedItem=options=>{events.push('receive');return options.plan;};
 vm.runInContext(fn(receiving,'receiveParsedBarcode'),c);
 const result=await c.receiveParsedBarcode({gtin:'CODE',quantity:70},{transactionId:'q',beforeReceive:async()=>events.push('persist')});
 assert.deepEqual(plain(result),[{orderNumber:'A',quantity:60},{orderNumber:'B',quantity:10}]);assert.deepEqual(events,['persist','receive']);
});
test('Dashboard counts unique items while live report, Excel and PDF retain separate Order rows',()=>{
 const {c}=harness();c.AppState.workspace.receivingHistory=[tx('A',62),tx('B',10,'b')];c.document={getElementById:()=>null};
 c.UI={elements:{receivingTableBody:{innerHTML:'',appendChild(){}}},receivingFilters:{issues:new Set(['not_received','partial','received_any','over','manual']),search:'Daroxime 500'}};
 c.refreshReceivingCategoryFilter=()=>{};c.refreshReceivingIssueCards=()=>{};c.createReceivingTableRow=()=>({dataset:{}});
 for(const n of ['normalizeReceivingSearchText','matchesReceivingSearch','refreshReceivingTable','getSelectedOrderDashboardMetrics'])vm.runInContext(fn(ui,n),c);
 c.refreshReceivingTable();assert.equal(c.UI.receivingVisibleItems.length,3);assert.equal(c.UI.receivingVisibleItems[0].remainingQty,0);assert.equal(c.UI.receivingVisibleItems[0].status,'Completed');
 c.getSelectedReceivingOrderNumber=()=> 'ALL';c.AppState.session={};const metrics=c.getSelectedOrderDashboardMetrics();assert.equal(metrics.totalItems,1);assert.equal(metrics.completedItems,0);
 for(const n of ['getLiveReceivingItemStatus','buildLiveReceivingReport','exportReceivingSummaryExcel','exportReceivingSummaryPDF'])vm.runInContext(fn(report,n),c);
 const live=c.buildLiveReceivingReport();assert.deepEqual(Array.from(live.rows,r=>r.orderNumber),['C','B','A']);assert.equal(live.counts.total,3);
 c.buildReceivingDiscrepancyReport=()=>c.buildMultiOrderReceivingReport();c.getReceivingReportFileBase=()=> 'test';c.showToast=()=>{};
 let excel;const pdf=[];c.XLSX={utils:{aoa_to_sheet:rows=>(excel=rows,{}),book_new:()=>({}),book_append_sheet(){}},writeFile(){}};
 c.window.jspdf={jsPDF:class{constructor(){this.internal={pageSize:{getWidth:()=>842,getHeight:()=>595}};}setFont(){}setFontSize(){}setDrawColor(){}line(){}save(){}addPage(){}splitTextToSize(s){return [s];}text(s,x,y){pdf.push({s,x,y});}}};
 c.exportReceivingSummaryExcel();c.exportReceivingSummaryPDF();
 const excelRows=excel.filter(r=>r[1]==='1012562');assert.deepEqual(Array.from(excelRows,r=>r[0]),['A','B','C']);assert.deepEqual(Array.from(excelRows,r=>r[3]),[62,40,10]);
 const rowYs=new Set(pdf.filter(r=>r.x===122&&r.s==='1012562').map(r=>r.y));assert.deepEqual(pdf.filter(r=>r.x===32&&rowYs.has(r.y)).map(r=>r.s),['A','B','C']);assert.equal(pdf.filter(r=>r.x===122&&r.s==='1012562').length,3);
 const saved=JSON.parse(JSON.stringify(live));assert.equal(saved.rows.find(r=>r.orderNumber==='A')['Ordered Qty'],62);assert.equal(saved.rows.find(r=>r.orderNumber==='A')['Received Qty'],62);
});
test('two PC hydration/repeated ledger delivery converges on the same per-Order quantities',()=>{
 const cloud=fs.readFileSync('cloud-workspace.js','utf8'),one=harness(),two=harness();
 const ledger=[{transaction_id:'a',item_code:'1012562',order_number:'A',quantity:62},{transaction_id:'b',item_code:'1012562',order_number:'B',quantity:10}];
 for(const {c} of [one,two]){
  c.getActiveReceivingOrderSetForCloud=()=>new Set(['A','B','C']);c.nowISO=()=> 'now';c.updateItemCalculatedFields=()=>{};
  c.addReceivingTransaction=tx=>{c.AppState.workspace.receivingHistory.push(tx);return tx;};
  for(const n of ['normalizeCloudReceivingTransaction','rebuildReceivingQuantitiesFromLedger','mergeCloudReceivingLedger'])vm.runInContext(fn(cloud,n),c);
  c.mergeCloudReceivingLedger(ledger);c.mergeCloudReceivingLedger(ledger);
  assert.equal(c.AppState.workspace.receivingHistory.length,2);assert.equal(c.AppState.workspace.orderData[0].receivedQty,72);
 }
 assert.deepEqual(plain(one.c.buildMultiOrderReceivingReport().rows),plain(two.c.buildMultiOrderReceivingReport().rows));
});
