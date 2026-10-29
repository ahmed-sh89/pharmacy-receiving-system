const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const receiving=fs.readFileSync('js/receiving.js','utf8'),reports=fs.readFileSync('js/reports.js','utf8'),ui=fs.readFileSync('ui.js','utf8');
function fn(src,name){const at=src.indexOf('function '+name+'(');assert(at>=0,name);return src.slice(at,src.indexOf('\n}',at)+2);}
const plain=x=>JSON.parse(JSON.stringify(x));
function harness(){
 const orders=['TO-000535106','TO-000532448'],item={itemCode:'1019577',itemName:'Meligamet',orderedQty:134,receivedQty:0,orderNumbers:orders};
 const source={ [orders[0]]:[{...item,orderedQty:60},{...item,orderedQty:40}], [orders[1]]:[{...item,orderedQty:34}] };
 let handheld=false,selected=orders.slice(),lastScan;
 const c={Map,Set,window:{},AppState:{settings:{allowOverReceiving:false},session:{deviceId:'TEST'},workspace:{orderData:[item],receivingHistory:[]}},
 normalizeOrderNumber:v=>String(v||'').trim().toUpperCase(),normalizeItemCode:v=>String(v||'').trim(),toSafeString:v=>String(v??''),toNumber:(v,d=0)=>Number.isFinite(Number(v))?Number(v):d,
 getValidReceivingQuantity:Number,getActiveReceivingOrderNumbers:()=>orders,getSelectedReceivingOrderNumbers:()=>selected,getSelectedReceivingOrderNumber:()=> 'ALL',getWorkspaceOrderSourceRows:o=>source[o],getItemByCode:()=>item,isLikelyZebraDevice:()=>handheld,
 createTransactionId:()=> 'TX-'+c.AppState.workspace.receivingHistory.length,nowISO:()=> 'now',getReceivingRuntimeDeviceType:()=> 'PC',updateItemCalculatedFields:i=>{i.remainingQty=Math.max(0,i.orderedQty-i.receivedQty);},
 handleReceivingFailure:m=>{c.error=m;},showToast:()=>{},finishReceivingChange:()=>{},setLastScan:s=>{lastScan=s;},APP_CONFIG:{transactionSources:{scanner:'SCAN'}},ReceivingEngine:{recentScans:[],adjustmentSources:{increase:'MANUAL_INCREASE',decrease:'MANUAL_DECREASE',search:'SEARCH'}},
 getReceivingOrderMetadata:()=>orders.map(orderNumber=>({orderNumber})),setTimeout:()=>{},document:{body:{classList:{add(){},remove(){}}}}};
 c.addReceivingTransaction=t=>{c.AppState.workspace.receivingHistory.push(t);return t;};
 vm.createContext(c);
 for(const n of ['buildReceivedQuantityByOrder','getPerOrderReceivingRows','buildMultiOrderReceivingReport'])vm.runInContext(fn(reports,n),c);
 for(const n of ['getReceivingEligibleOrders','getReceivingOrderRow','chooseDeterministicReceivingOrder','resolveReceivingTransactionOrder','getReceivingDisplayMetrics','getReceivingOperationalItems','getReceivingAutoAllocationCandidates','buildReceivingAutoAllocationPlan','receiveAutoAllocatedItem','receiveOperationalItem','receiveOrderItem','createReceivingTransaction','addItemReceivedQuantity','receiveItemBySearch','applyQuantityAdjustment','increaseItemQuantity','decreaseItemQuantity','updateLastScanFromReceiving','undoRecentScannerTransaction'])vm.runInContext(fn(receiving,n),c);
 // Core transaction side effects are isolated; allocation/validation/ledger projection use actual code.
 c.ReceivingEngine.currentLocalBatch={};c.rememberReceivingTransaction=()=>{};
 for(const n of ['getReceivingSearchProjection','getSelectedOrderDashboardMetrics'])vm.runInContext(fn(ui,n),c);
 return {c,item,orders,source,scope:v=>{selected=v;},handheld:v=>{handheld=v;},scan:()=>lastScan};
}
function totals(h){return h.orders.map(o=>h.c.getPerOrderReceivingRows(o)[0]['Received Qty']);}
test('100 + 34 / received 131: plan and reports retain source provenance and separate Orders',()=>{
 const h=harness(),before=JSON.stringify(h.source);assert.deepEqual(plain(h.c.buildReceivingAutoAllocationPlan(h.item,131)),h.orders.map((orderNumber,i)=>({orderNumber,quantity:i?31:100})));
 h.c.AppState.workspace.receivingHistory=h.orders.map((orderId,i)=>({itemCode:'1019577',orderId,quantity:i?31:100}));
 const rows=h.c.buildMultiOrderReceivingReport().rows;assert.equal(rows.length,2);assert.deepEqual(Array.from(rows,r=>r['Ordered Qty']),[100,34]);assert.deepEqual(Array.from(rows,r=>r['Received Qty']),[100,31]);assert.equal(JSON.stringify(h.source),before);
 const search=h.c.getReceivingSearchProjection();assert.equal(search.length,1);assert.equal(search[0].orderedQty,134);assert.equal(search[0].receivedQty,131);assert.equal(search[0].remainingQty,3);
 const metrics=h.c.getSelectedOrderDashboardMetrics();assert.equal(metrics.totalItems,1);assert.equal(metrics.remainingUnits,3);
 h.c.updateLastScanFromReceiving(h.item,{orderId:h.orders[0],quantity:1});assert.equal(h.scan().orderedQty,134);assert.equal(h.scan().receivedQty,131);
});
test('real scan + manual add path fills first Order then second; overage starts only after 134',()=>{
 const h=harness();
 // Preserve real core receive function; provide only external UI hooks after ledger save.
 h.c.finishReceivingChange=()=>{};
 assert(h.c.addItemReceivedQuantity('1019577',131),h.c.error);assert.deepEqual(totals(h),[100,31]);
 assert.equal(h.c.addItemReceivedQuantity('1019577',4),false);assert.deepEqual(totals(h),[100,31]);
 h.c.AppState.settings.allowOverReceiving=true;assert(h.c.addItemReceivedQuantity('1019577',4));assert.deepEqual(totals(h),[100,35]);
});
test('search and positive adjustment use allocation; explicit report correction stays on its Order',()=>{
 for(const method of ['search','adjust']){const h=harness();const result=method==='search'?h.c.receiveItemBySearch('1019577',131):h.c.increaseItemQuantity('1019577',131);assert(result,h.c.error);assert.deepEqual(totals(h),[100,31]);
 h.c.decreaseItemQuantity('1019577',32);assert.deepEqual(totals(h),[99,0]);}
 const h=harness();h.c.AppState.settings.allowOverReceiving=true;h.c.increaseItemQuantity('1019577',131,h.orders[0]);assert.deepEqual(totals(h),[131,0]);
});
test('existing 131/0 remains unchanged by rendering, aggregation, refresh or new allocation planning',()=>{
 const h=harness();h.c.AppState.workspace.receivingHistory=[{transactionId:'EXISTING',itemCode:'1019577',orderId:h.orders[0],quantity:131}];const before=JSON.stringify(h.c.AppState.workspace);
 h.c.getReceivingOperationalItems();h.c.getReceivingSearchProjection();h.c.getSelectedOrderDashboardMetrics();h.c.buildMultiOrderReceivingReport();h.c.buildReceivingAutoAllocationPlan(h.item,1);
 assert.equal(JSON.stringify(h.c.AppState.workspace),before);assert.deepEqual(totals(h),[131,0]);
});
test('selected/handheld scopes and pharmacy-local ledger stay isolated',()=>{
 const h=harness();h.scope([h.orders[1]]);assert.equal(h.c.getReceivingSearchProjection()[0].orderedQty,34);assert.deepEqual(plain(h.c.buildReceivingAutoAllocationPlan(h.item,31)),[{orderNumber:h.orders[1],quantity:31}]);
 h.scope([]);h.handheld(true);assert.equal(h.c.getReceivingOperationalItems().length,0);assert.throws(()=>h.c.buildReceivingAutoAllocationPlan(h.item,1),/not found/);
 const other=harness();assert.deepEqual(totals(other),[0,0]);
});

test('actual incident entry sequence 4 then +127 allocates 96 and 31',()=>{
 const h=harness();assert(h.c.addItemReceivedQuantity('1019577',4));assert(h.c.addItemReceivedQuantity('1019577',127));assert.deepEqual(totals(h),[100,31]);
 assert.deepEqual(Array.from(h.c.AppState.workspace.receivingHistory,t=>t.quantity),[4,96,31]);
});
test('Undo stays attached to its original scan when another Order has receipts',()=>{
 const h=harness();h.c.AppState.workspace.receivingHistory=[{transactionId:'SCAN-A',itemCode:'1019577',orderId:h.orders[0],quantity:1},{transactionId:'SCAN-B',itemCode:'1019577',orderId:h.orders[1],quantity:2}];
 h.item.receivedQty=3;h.c.ReceivingEngine.recentScans=[{transactionId:'SCAN-A',itemCode:'1019577',quantity:1}];assert(h.c.undoRecentScannerTransaction('SCAN-A'));assert.deepEqual(totals(h),[0,2]);
 assert.equal(h.c.AppState.workspace.receivingHistory.at(-1).correctsTransactionId,'SCAN-A');
});
test('actual card refresh replaces stale single-Order snapshot without mutating saved data',()=>{
 const h=harness();h.c.AppState.workspace.receivingHistory=[{itemCode:'1019577',orderId:h.orders[0],quantity:100},{itemCode:'1019577',orderId:h.orders[1],quantity:31}];
 h.c.AppState.workspace.lastScan={itemCode:'1019577',orderedQty:100,receivedQty:131,remainingQty:0};const before=JSON.stringify(h.c.AppState.workspace.lastScan);
 h.c.UI={elements:{}};for(const key of ['lastItemName','lastItemCode','lastGTIN','lastOrderedQty','lastReceivedQty','lastRemainingQty','lastItemStatus','lastScanTime'])h.c.UI.elements[key]={};
 h.c.setElementText=(element,value)=>{if(element)element.textContent=String(value);};h.c.formatDateTime=()=> 'time';h.c.scheduleReceivingAutoClear=()=>{};h.c.refreshLastScanQuantityControl=()=>{};
 let rendered;h.c.refreshProfessionalLastScan=scan=>{rendered=scan;};vm.runInContext(fn(ui,'refreshLastScan'),h.c);h.c.refreshLastScan();
 assert.equal(h.c.UI.elements.lastOrderedQty.textContent,'134');assert.equal(rendered.receivedQty,131);assert.equal(rendered.remainingQty,3);assert.equal(JSON.stringify(h.c.AppState.workspace.lastScan),before);
});
