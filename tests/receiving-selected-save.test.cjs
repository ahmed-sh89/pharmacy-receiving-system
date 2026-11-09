const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
async function panel(allowed=true){
 const {document,window}=parseHTML('<html><body></body></html>'),writes=[];
 const rows=['A','B','C','D'].map((itemCode,n)=>({itemCode,itemName:itemCode,exists:n!==1,identifiers:[],conflict:n===3}));
 const c={document,window,AuthState:{identityEpoch:1},escapeHTML:String,toNumber:Number,normalizeIdentifier:String,normalizeItemCode:String,renderReceivingGroupOptions:()=>'<option value="">Choose group</option><option value="Medicine">Medicine</option>',recalculateStatistics(){},refreshDashboard(){},refreshHealthSummary(){},ensureGlobalMasterGTINReady:()=>new Promise(()=>{}),IdentifierService:{pharmacyId:()=> 'P',workspaceSignature:()=> 'S',pendingAdminRequest:()=>null,refreshWorkspaceIdentifiers:async()=>rows,runAdminOperation:async(_a,_b,submitted)=>writes.push(JSON.parse(JSON.stringify(submitted)))}};
 window.PharmFlowPermissions={allowed:()=>allowed};const src=fs.readFileSync('ui.js','utf8');vm.createContext(c);vm.runInContext(src.slice(src.indexOf('async function openCurrentMissingGTINPanel('),src.indexOf('\nasync function requestRemoveActiveOrderFile')),c);await c.openCurrentMissingGTINPanel();
 return {document,window,writes,nodes:[...document.querySelectorAll('[data-mapping]')],settle:async()=>{for(let n=0;n<20;n++)await Promise.resolve();}};
}
test('Save Selected commits only completed selected rows; unfinished and unselected mappings survive, full master paging never blocks confirmation',async()=>{
 const h=await panel();h.nodes.forEach(row=>row.querySelector('[data-selected]').checked=true);
 h.nodes[0].querySelector('[data-barcode]').value='001A';h.nodes[1].querySelector('[data-barcode]').value='001B';
 h.document.querySelector('[data-barcode]').dispatchEvent(new h.window.Event('input',{bubbles:true}));
 assert.equal(h.document.querySelector('[data-save-selected]').textContent,'Save Selected (1)');
 h.document.querySelector('[data-save-selected]').click();await h.settle();assert.equal(h.writes.length,1);assert.deepEqual(h.writes[0].map(r=>r.itemCode),['A']);
 assert.equal(h.nodes[1].querySelector('[data-barcode]').value,'001B');assert.equal(h.nodes[1].dataset.saved,undefined);assert.match(h.document.querySelector('[data-message]').textContent,/Saved 1 mapping/);
 assert.equal(h.document.querySelector('[data-save]').disabled,false);
});
test('Save All retains partial-entry validation and duplicate rejection; eligible batch is atomic',async()=>{
 const h=await panel(),save=h.document.querySelector('[data-save]');h.nodes[0].querySelector('[data-barcode]').value='001';h.nodes[1].querySelector('[data-barcode]').value='002';
 save.click();await h.settle();assert.equal(h.writes.length,0);assert.match(h.document.querySelector('[data-message]').textContent,/Select Group/);
 // LinkeDOM select values are derived from selected options.
 h.nodes[1].querySelector('[data-group] option[value="Medicine"]').setAttribute('selected','');h.nodes[1].querySelector('[data-group] option[value=""]').removeAttribute('selected');
 h.nodes[1].querySelector('[data-barcode]').value='001';save.click();await h.settle();assert.equal(h.writes.length,0);assert.match(h.document.querySelector('[data-message]').textContent,/Duplicate/);
 h.nodes[1].querySelector('[data-barcode]').value='002';save.click();await h.settle();assert.equal(h.writes.length,1);assert.equal(h.writes[0].length,2);
});
test('read-only mapping controls cannot submit Selected',async()=>{const h=await panel(false);assert.equal(h.document.querySelector('[data-save-selected]').disabled,true);assert.equal(h.document.querySelector('[data-save]').disabled,true);assert.ok(h.nodes.every(row=>row.querySelector('[data-selected]').disabled));});

test('multiple completed selected rows save together and leave an unselected completed row untouched',async()=>{const h=await panel();for(const n of [0,2]){h.nodes[n].querySelector('[data-selected]').checked=true;h.nodes[n].querySelector('[data-barcode]').value='CODE'+n;}h.nodes[1].querySelector('[data-barcode]').value='UNSELECTED';h.document.querySelector('[data-barcode]').dispatchEvent(new h.window.Event('input',{bubbles:true}));assert.equal(h.document.querySelector('[data-save-selected]').textContent,'Save Selected (2)');h.document.querySelector('[data-save-selected]').click();await h.settle();assert.deepEqual(h.writes[0].map(row=>row.itemCode),['A','C']);assert.equal(h.nodes[1].querySelector('[data-barcode]').value,'UNSELECTED');});
