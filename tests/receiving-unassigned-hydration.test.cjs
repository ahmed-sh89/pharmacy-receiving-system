const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fn(s,n){const i=s.indexOf('function '+n+'(');return s.slice(i,s.indexOf('\n}',i)+2);}
const state=fs.readFileSync('js/state.js','utf8'),cloud=fs.readFileSync('cloud-workspace.js','utf8');
test('explicit Unassigned survives the real state writer without selected-order fallback',()=>{
 const c={AppState:{workspace:{orderId:'A',selectedOrderNumber:'A',receivingHistory:[]},session:{deviceId:'PC'},indexes:{transactionIds:new Set()}},normalizeItemCode:String,toSafeString:v=>String(v||''),toNumber:Number,normalizeReceivingTransactionIdentifier:v=>v||'',APP_CONFIG:{transactionSources:{scanner:'SCAN'}},nowISO:()=> 'now'};vm.createContext(c);vm.runInContext(fn(state,'addReceivingTransaction'),c);
 const row=c.addReceivingTransaction({transactionId:'u',itemCode:'SYNTH',quantity:10,unassigned:true});assert.equal(row.orderId,'');assert.equal(row.selectedOrderNumber,'');assert.equal(row.unassigned,true);assert.equal(c.addReceivingTransaction({transactionId:'u'}),false);
 const assigned=c.addReceivingTransaction({transactionId:'a',itemCode:'SYNTH',quantity:1,orderId:'B'});assert.equal(assigned.orderId,'B');assert.equal(assigned.unassigned,false);
});
test('scoped ledger retains Unassigned and its reversal while rejecting unmarked unknown records',()=>{
 const rows=[],c={AppState:{workspace:{receivingHistory:rows}},normalizeCloudReceivingTransaction:x=>x,getItemByCode:()=>null,getActiveReceivingOrderSetForCloud:()=>new Set(['A']),normalizeOrderNumber:v=>v||'',addReceivingTransaction:t=>{rows.push(t);return t;},rebuildReceivingQuantitiesFromLedger(){}};vm.createContext(c);vm.runInContext(fn(cloud,'mergeCloudReceivingLedger'),c);
 c.mergeCloudReceivingLedger([{transactionId:'u',itemCode:'X',quantity:10,unassigned:true},{transactionId:'r',itemCode:'X',quantity:-10,unassigned:true},{transactionId:'bad',itemCode:'X',quantity:1},{transactionId:'closed',itemCode:'X',quantity:1,orderId:'CLOSED'}]);assert.deepEqual(rows.map(r=>r.transactionId).sort(),['r','u']);c.mergeCloudReceivingLedger(rows.slice());assert.equal(rows.length,2);
});
