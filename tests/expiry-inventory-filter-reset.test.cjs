const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(){
 const timers=new Map(),nodes=new Map(),calls=[];let timer=0;
 function el(){const classes=new Set();return {value:'',innerHTML:'',textContent:'',hidden:false,dataset:{},childNodes:[{nodeValue:''}],style:{setProperty(){}},classList:{toggle(k,on){if(on)classes.add(k);else classes.delete(k);},contains:k=>classes.has(k),add(){}},setAttribute(){},querySelectorAll:()=>[],querySelector:()=>null};}
 for(const id of ['expiryCurrentSearch','expiryCurrentStateBody','expiryCurrentStateCount','expiryCurrentStateEmpty','btnClearExpiryFilters','expiryWorkspaceSubtitle','btnOpenExpiryInventory','btnExpirySessionView','btnClearExpirySession','expiryWorkspaceTitle','expiryQuantityHeading','expiryTimeHeading','btnExportExpiryInventory','zebraExpiryShell'])nodes.set(id,el());
 const headings=['category','expiry','operator','lastUpdated'].map(type=>{const e=el();e.dataset.expiryFilterHeading=type;const dot={hidden:true};e.querySelector=()=>dot;return e;});
 const engine={desktopView:'INVENTORY',currentRows:[],sessionRows:[]};const all=[{state_id:'1',item_name:'One',category:'Medicine',expiry_month:3,expiry_year:2028,verified_quantity:1},{state_id:'2',item_name:'Two',category:'Other',expiry_month:4,expiry_year:2028,verified_quantity:2}];
 const c={window:null,console,ExpiryCaptureEngine:engine,expiryIsHandheld:()=>false,expiryEscapeHtml:v=>String(v??''),expiryMonthShortName:()=>'',expiryFormatVerifiedAt:()=>'',renderExpiryKpis(){},setExpiryStatus(){},loadExpiryCurrentState:async search=>{calls.push(search);return search?[all[0]]:all;},bindExpiryCaptureUI(){},activateExpiryCapture(){},setTimeout(fn){const id=++timer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),addEventListener(){},document:{body:{classList:{add(){}}},documentElement:{dataset:{}},addEventListener(){},getElementById:id=>nodes.get(id),querySelectorAll:s=>s==='[data-expiry-filter-heading]'?headings:[]}};c.window=c;vm.createContext(c);
 const source=fs.readFileSync('js/expiry-desktop-v2.js','utf8').replace('  const originalBind=','  window.testFilter={clear:clearAllFilters,filters:FILTERS,setSort:v=>lastUpdatedSort=v,has:hasFilters};\n  const originalBind=');vm.runInContext(source,c);return {c,engine,all,calls,timers,nodes,headings};
}
test('Clear Filters clears search UI, every selection, sort, header state and fetches full inventory',async()=>{
 const h=harness();h.nodes.get('expiryCurrentSearch').value='ITEM1';await h.c.refreshExpiryCurrentState();assert.equal(h.engine.currentRows.length,1);
 Object.values(h.c.testFilter.filters).forEach(set=>set.add('selected'));h.c.testFilter.setSort('DESC');await h.c.testFilter.clear();
 assert.equal(h.nodes.get('expiryCurrentSearch').value,'');assert.equal(h.c.testFilter.has(),false);assert.equal(h.calls.at(-1),'');assert.equal(h.engine.currentRows.length,2);assert.equal(h.nodes.get('expiryCurrentStateCount').textContent,'2');
 assert.ok(h.nodes.get('expiryCurrentStateBody').innerHTML.includes('One'));assert.ok(h.nodes.get('expiryCurrentStateBody').innerHTML.includes('Two'));assert.ok(h.headings.every(e=>!e.classList.contains('is-filtered')&&e.querySelector().hidden));
});
test('Older searched response cannot restore a filter after Clear Filters',async()=>{
 const h=harness();let resolve;h.c.loadExpiryCurrentState=search=>search?new Promise(r=>resolve=r):Promise.resolve(h.all);h.nodes.get('expiryCurrentSearch').value='old';const pending=h.c.refreshExpiryCurrentState();await h.c.testFilter.clear();resolve([h.all[0]]);await pending;assert.equal(h.engine.currentRows.length,2);assert.equal(h.nodes.get('expiryCurrentSearch').value,'');
});
test('Clear Filters cancels pending search debounce and session subtitle stays absent',async()=>{
 const h=harness();h.c.bindExpiryCaptureUI();h.nodes.get('expiryCurrentSearch').value='queued';h.nodes.get('expiryCurrentSearch').oninput();assert.equal(h.timers.size,1);await h.nodes.get('btnClearExpiryFilters').onclick();assert.equal(h.timers.size,0);assert.equal(h.calls.length,1);assert.equal(h.calls[0],'');h.engine.desktopView='SESSION';await h.c.refreshExpiryCurrentState();assert.equal(h.nodes.get('expiryWorkspaceSubtitle').hidden,true);assert.equal(h.nodes.get('expiryWorkspaceSubtitle').textContent,'');
});
