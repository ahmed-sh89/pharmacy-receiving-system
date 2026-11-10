const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
test('report has nine aligned columns, largest Item Name column and working Received controls; Actions was header-only',()=>{
 const {document}=parseHTML(fs.readFileSync('index.html','utf8')),table=document.getElementById('receivingTableBody').closest('table');
 assert.deepEqual([...table.querySelectorAll('th')].map(th=>th.textContent.trim()),['#','Order Number','Item Number','Item Name','Group','Ordered','Received','Difference','Status']);
 const widths=[...table.querySelectorAll('col')].map(col=>Number(col.getAttribute('style').match(/[\d.]+/)[0]));assert.equal(widths.reduce((a,b)=>a+b),100);assert.equal(Math.max(...widths),widths[3]);
 const source=fs.readFileSync('ui.js','utf8'),at=source.indexOf('function createReceivingTableRow('),code=source.slice(at,source.indexOf('\n}',at)+2),calls=[];
 const c={document,window:{},AppState:{workspace:{}},getReceivingRowClass:()=>'',escapeHTML:String,toSafeString:v=>String(v??''),toNumber:(v,f=0)=>Number.isFinite(Number(v))?Number(v):f,renderReceivingDifference:()=>'',renderStatusBadge:s=>s,increaseItemQuantity:(...args)=>calls.push(['plus',...args]),decreaseItemQuantity:(...args)=>calls.push(['minus',...args]),openQuantityEditPrompt:item=>calls.push(['edit',item.itemCode]),getItemByCode:()=>null};
 vm.createContext(c);vm.runInContext(code,c);const row=c.createReceivingTableRow({itemCode:'X',itemName:'Example',orderNumber:'A',orderedQty:5,receivedQty:2,status:'Partial Shortage'},0);assert.equal(row.children.length,9);table.querySelector('tbody').appendChild(row);
 for(const action of ['plus','minus','edit'])row.querySelector('[data-action="'+action+'"]').click();assert.deepEqual(calls,[['plus','X',1,'A'],['minus','X',1,'A'],['edit','X']]);assert.ok([...row.children[6].querySelectorAll('button')].length===3);
 assert.match(fs.readFileSync('css/receiving-surface.css','utf8'),/\.receivingReportTable\{table-layout:fixed\}/);assert.doesNotMatch(source,/colspan="10" class="tableEmptyState"/);
});
