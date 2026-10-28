const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(){const window={};vm.runInNewContext(fs.readFileSync('js/global-items-export.js','utf8'),{window,document:{readyState:'loading',addEventListener(){}}});return window.PharmFlowGlobalItemsExport;}
const item=n=>({item_code:String(n).padStart(6,'0'),item_name:'Item '+n,identifier_count:1});
const identifier=n=>({id:String(n).padStart(8,'0')+'-0000-4000-8000-000000000000',item_code:String(n).padStart(6,'0'),identifier_display:n%2?'0000123':'A-001'});
test('all pages beyond default row cap; leading zeros, alphanumeric values and associations retained',async()=>{
 const h=harness();let calls=0;const r=await h.collect(async(name,a)=>{calls++;const all=Array.from({length:1507},(_,n)=>a.p_kind==='Items'?item(n):identifier(n));return {rows:all.filter(r=>(r.item_code && a.p_kind==='Items'?r.item_code:r.id)>a.p_after).slice(0,a.p_limit),version:'same',items:1507,identifiers:1507};});
 assert.equal(r.items.length,1507);assert.equal(r.identifiers.length,1507);assert.equal(calls,8);assert.equal(r.identifiers[0].identifier_display,'A-001');assert.equal(r.identifiers[1].identifier_display,'0000123');
});
test('changing master, malformed pages, count mismatch and account changes cancel export',async()=>{
 for(const mode of ['revision','count','association','cursor','scope']){let n=0;const h=harness();const rpc=async(name,a)=>{n++;if(n===1)return {rows:[item(0)],version:'a',items:1,identifiers:1};if(mode==='cursor')return {rows:[item(0)],version:'a',items:1,identifiers:1};if(n===2)return {rows:[],version:mode==='revision'?'b':'a',items:mode==='count'?2:1,identifiers:1};return {rows:a.p_after?[]:[{...identifier(0),item_code:'missing'}],version:'a',items:1,identifiers:1};};await assert.rejects(h.collect(rpc,()=>{if(mode==='scope'&&n)throw Error('scope');}));}
});
test('Excel Worker incremental round-trip retains text and produces exactly two worksheets',async()=>{
 const {worker}=require('./helpers/export-v2-fixture.cjs'),w=worker();await w.send('start');await w.send('page',{kind:'Items',rows:[{...item(0),item_name:'=1+1'}]});await w.send('page',{kind:'Identifiers',rows:[{...identifier(0),identifier_display:'0000123'},identifier(1)]});const book=w.c.XLSX.read((await w.send('finish')).buffer,{type:'array'});
 assert.deepEqual(Array.from(book.SheetNames),['Items','Identifiers']);assert.equal(book.Sheets.Items.B2.v,'=1+1');assert.equal(book.Sheets.Items.B2.f,undefined);assert.equal(book.Sheets.Identifiers.B2.v,'0000123');assert.equal(book.Sheets.Identifiers.B2.t,'s');
});
test('Database-collated Item Code order is accepted without JavaScript ordinal reordering',async()=>{
 let n=0;const h=harness(),rows=['A1','a2','B1'].map(item_code=>({item_code,identifier_count:0}));const data=await h.collect(async()=>({rows:++n===1?rows:[],version:'v',items:3,identifiers:0}));assert.deepEqual(Array.from(data.items,i=>i.item_code),['A1','a2','B1']);
});
