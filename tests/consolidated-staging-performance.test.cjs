const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process'),{performance}=require('node:perf_hooks');
function searchHarness(baseline=false){
 const source=baseline?cp.execFileSync('git',['show','08843e4:js/session.js'],{encoding:'utf8'}):fs.readFileSync('js/session.js','utf8');
 const start=source.indexOf('function getHistoricalSearchableItems('),end=source.indexOf('/* =====================================================\n   SESSION SUMMARY',start);
 const c={AppState:{workspace:{orderData:[]},archive:{transactions:[]}}};vm.createContext(c);vm.runInContext(fs.readFileSync('js/utils.js','utf8'),c);vm.runInContext(source.slice(start,end),c);return c;
}
test('Reports search returns identical ordered items and duplicate-code precedence',()=>{
 const old=searchHarness(true),next=searchHarness();const data=[{itemCode:'1',itemName:'Z name'},{itemCode:'2',itemName:'A name'},{itemCode:'1',itemName:'B name'}];
 for(const c of [old,next]){c.AppState.workspace.orderData=data;c.AppState.archive.transactions=[{itemCode:'1',itemName:'other'},{itemCode:'3',itemName:'C name'}];}
 for(const q of ['name','1',' a ','missing',''])assert.deepEqual(JSON.parse(JSON.stringify(next.searchItems(next.getHistoricalSearchableItems(q),q,40))),JSON.parse(JSON.stringify(old.searchItems(old.getHistoricalSearchableItems(),q,40))));
 next.AppState.archive.transactions.push({itemCode:'4',itemName:'New name'});assert(next.getHistoricalSearchableItems('new').some(i=>i.itemCode==='4'));
});
test('Controlled Reports search before/after: same data and query, no network or real-PC claim',()=>{
 const rows=Array.from({length:30000},(_,n)=>({itemCode:String(n),itemName:'Product '+String((n*7919)%30000).padStart(5,'0')}));const out=[];
 for(const baseline of [true,false]){const c=searchHarness(baseline);c.AppState.archive.transactions=rows;const samples=[];let result;
 for(let n=0;n<9;n++){const start=performance.now();result=c.searchItems(c.getHistoricalSearchableItems(baseline?'':'Product 019'), 'Product 019',40);if(n>1)samples.push(performance.now()-start);}
 samples.sort((a,b)=>a-b);out.push({variant:baseline?'baseline':'candidate',medianMs:Number(samples[3].toFixed(2)),results:result.length,transactions:rows.length});}
 assert.equal(out[0].results,out[1].results);console.log('REPORTS_SEARCH_COMPARISON',JSON.stringify(out));
});
