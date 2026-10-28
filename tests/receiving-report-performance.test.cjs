const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process'),{performance}=require('node:perf_hooks');
function fn(source,name){const at=source.indexOf('function '+name+'(');return source.slice(at,source.indexOf('\n}',at)+2);}
function harness(baseline=false,count=400){
 const src=baseline?cp.execFileSync('git',['show','08843e4:js/reports.js'],{encoding:'utf8'}):fs.readFileSync('js/reports.js','utf8');const rows=Array.from({length:count},(_,i)=>({itemCode:String(i),itemName:'Product '+i,orderedQty:10,group_name:i%2?'Medicine':'FMCG',category:'Category',orderNumbers:['A','B']}));let choices=0,aggregates=0;
 const c={Map,Set,window:{},AppState:{workspace:{orderData:rows,receivingHistory:rows.flatMap((r,i)=>[{...r,orderId:'A',quantity:i%14},{...r,orderId:'B',quantity:1}])}},UI:{receivingFilters:{classification:{groups:['Medicine']},search:'Product 1',issues:new Set(['not_received','partial','received_any','over','manual'])}},getActiveReceivingOrderNumbers:()=>['A','B'],getSelectedReceivingOrderNumbers:()=>['A','B'],getReceivingOrderMetadata:()=>[{orderNumber:'A'},{orderNumber:'B'}],getWorkspaceOrderSourceRows:()=>rows,toSafeString:x=>String(x??''),toNumber:(x,d=0)=>Number.isFinite(Number(x))?Number(x):d,normalizeOrderNumber:x=>String(x??''),normalizeItemCode:x=>String(x??''),getValidReceivingQuantity:Number};
 vm.createContext(c);const cl=fs.readFileSync('js/receiving-release.js','utf8');vm.runInContext(cl.slice(cl.indexOf('window.PharmFlowClassificationFilters='),cl.indexOf('// Display projection only.')),c);
 const original=c.window.PharmFlowClassificationFilters.choices;c.window.PharmFlowClassificationFilters.choices=function(...args){choices++;return original.apply(this,args);};
 for(const n of ['buildReceivedQuantityByOrder','getPerOrderReceivingRows','getCurrentReceivingFilterKeys','buildMultiOrderReceivingReport'])vm.runInContext(fn(src,n),c);
 const build=c.buildReceivedQuantityByOrder;c.buildReceivedQuantityByOrder=()=>{aggregates++;return build();};
 const ui=fs.readFileSync('ui.js','utf8');for(const n of ['normalizeReceivingSearchText','matchesReceivingSearch'])vm.runInContext(fn(ui,n),c);
 return {c,get choices(){return choices;},get aggregates(){return aggregates;}};
}
test('Receiving report keeps selected orders, classifications, search, quantities and export output equivalent',()=>{
 for(const visibleOnly of [true,false])for(const groups of [[],['Medicine'],['Beauty','FMCG','HomeHealth','Medicine','Mom & Baby','Supplement']]){
  const a=harness(true,70),b=harness(false,70);for(const h of [a,b]){h.c.UI.receivingFilters.classification.groups=groups;h.c.AppState.workspace.receivingHistory.push({itemCode:'EXTRA',itemName:'Product 100',quantity:3,orderId:'A'});}
  const plain=x=>{x.generatedAt='SAME';return JSON.parse(JSON.stringify(x));};assert.deepEqual(plain(b.c.buildMultiOrderReceivingReport({visibleOnly})),plain(a.c.buildMultiOrderReceivingReport({visibleOnly})));
 }
});
test('Measured Receiving Report search path computes classification once per report and shares ledger aggregate',()=>{
 const out=[];for(const baseline of [true,false]){const h=harness(baseline),samples=[];let report;for(let n=0;n<5;n++){const start=performance.now();report=h.c.buildMultiOrderReceivingReport({visibleOnly:true});samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);out.push({variant:baseline?'baseline':'candidate',medianMs:Number(samples[2].toFixed(2)),choicesPerReport:h.choices/5,ledgerAggregatesPerReport:h.aggregates/5,sourceItems:400,orders:2,visibleRows:report.rows.length});}
 assert.equal(out[1].choicesPerReport,1);assert.equal(out[1].ledgerAggregatesPerReport,1);assert.equal(out[0].visibleRows,out[1].visibleRows);console.log('RECEIVING_REPORT_COMPARISON',JSON.stringify(out));
});
