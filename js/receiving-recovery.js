"use strict";
/* Receiving revisions/allocation. Server is authoritative; no optimistic rewrite.
   This candidate must only run against the verified Staging binding. */
function receivingRecoveryScope(){
    window.PharmFlowPermissions?.require("RECEIVING",true);
    const pharmacyId=AuthState.context?.pharmacy_id,userId=AuthState.user?.id;
    if(!pharmacyId||!userId) throw new Error("Sign in to a pharmacy first.");
    return {pharmacyId,userId};
}
function assertReceivingRecoveryScope(scope){
    if(scope.pharmacyId!==AuthState.context?.pharmacy_id||scope.userId!==AuthState.user?.id) throw new Error("Account changed. Reopen this action.");
}
function compareReceivingOrderRevision(before,after){
    const group=rows=>{const map=new Map();for(const r of rows){const c=normalizeItemCode(r.itemCode);const q=Number(r.orderedQty);if(!c||!Number.isSafeInteger(q)||q<=0)throw new Error("Every order line needs an item and positive whole quantity.");map.set(c,(map.get(c)||0)+q);}return map;};
    const old=group(before),next=group(after),changes=[];
    for(const code of new Set([...old.keys(),...next.keys()])){
        const from=old.get(code)||0,to=next.get(code)||0;
        if(from!==to) changes.push({itemCode:code,before:from,after:to,kind:!old.has(code)?"Added":!next.has(code)?"Removed":"Modified"});
    }
    return changes;
}
async function readReceivingRevisionFile(file,expectedOrder){
    const workbook=await readExcelWorkbook(file),rows=[];let internal="";
    for(const name of workbook.SheetNames){
        const matrix=worksheetToMatrix(workbook.Sheets[name]),header=findOrderHeaderRow(matrix);
        if(!header)continue;
        const order=normalizeOrderNumber(extractDocumentId(matrix,["to number","transfer id","transfer number","order number","order id"]));
        if(!order||order!==normalizeOrderNumber(expectedOrder)||(internal&&internal!==order))throw new Error("Internal Excel Order Number does not match the selected order.");
        internal=order;
        for(let n=header.rowIndex+1;n<matrix.length;n++){
            if(isMatrixRowEmpty(matrix[n]))continue;
            const item=parseOrderMatrixRow(matrix[n],header.columns);
            // Skip only blank/footer lines; an item row with invalid quantity fails.
            if(!item){if(matrix[n].some(v=>String(v??'').trim()) && /^\d+$/.test(String(matrix[n][header.columns.itemCode]??'')))throw new Error("Invalid order line "+(n+1));continue;}
            rows.push({itemCode:item.itemCode,itemName:item.itemName,orderedQty:item.orderedQty,category:item.category||"",sourceSheet:name,sourceRow:n+1});
        }
    }
    if(!rows.length||!internal)throw new Error("No valid internally identified order rows.");
    return {name:file.name,documentId:internal,rows:rows.length,sourceRows:rows,size:file.size,lastModified:file.lastModified};
}
async function refreshReceivingAfterRecovery(scope){
    assertReceivingRecoveryScope(scope);
    if(await pullActiveOrderManifestAuthority({clearIfMissing:false})!==true)throw new Error("Saved on server; current order synchronization is pending. Refresh before another correction.");
    assertReceivingRecoveryScope(scope);
    const synced=await pullCloudWorkspaceTransactions({force:true,includeUnassigned:true});
    if(synced!==true)throw new Error("Saved on server; refresh synchronization is pending. Reload before another correction.");
    assertReceivingRecoveryScope(scope);
    rebuildReceivingQuantitiesFromLedger();saveWorkspaceSnapshot?.();refreshEntireUI?.();
}
async function requestReceivingOrderRevision(order,file,progress=()=>{}){
    const scope=receivingRecoveryScope();
    // Validate locally before any queue/network wait. The secure parser is a
    // dedicated worker; no persistence is attempted until explicit confirmation.
    progress('Reading Excel…');
    const replacement=await readReceivingRevisionFile(file,order);assertReceivingRecoveryScope(scope);
    progress('Checking order…');
    await window.PharmFlowPermissions?.whenReady();assertReceivingRecoveryScope(scope);
    window.PharmFlowPermissions?.require('RECEIVING',true);
    if(await flushCloudWorkspaceQueue()!==true)throw new Error('Pending receipts must synchronize before updating an order.');
    if(await pullActiveOrderManifestAuthority({clearIfMissing:false})!==true)throw new Error('Unable to verify the current order. No update sent.');
    assertReceivingRecoveryScope(scope);
    const current=getWorkspaceOrderFile(order);if(!current)throw new Error('Order is no longer active.');
    const revision=Number(PharmFlowCloudWorkspace.activeManifestRevision),generation=Number(PharmFlowCloudWorkspace.generation);
    const changes=compareReceivingOrderRevision(current.sourceRows||[],replacement.sourceRows);
    if(!changes.length)throw new Error('No ordered quantity changes. Duplicate update blocked.');
    progress('Review update');
    const confirmed=await pharmFlowConfirm({title:'Confirm Order Update',message:order,confirmText:'Confirm'});
    if(!confirmed)return false;assertReceivingRecoveryScope(scope);
    progress('Saving update…');
    let acknowledged=false;
    try{
        await authRpc('revise_pharmflow_receiving_order_v1',{p_pharmacy_id:scope.pharmacyId,p_operation_id:crypto.randomUUID(),p_order_number:order,p_file:replacement,p_expected_generation:generation,p_expected_revision:revision});
        acknowledged=true;
    }catch(error){
        if(error.serverRejected)throw error;
        // A lost response is not proof of rollback. Read the server once before
        // reporting the result; never automatically resubmit a possibly committed write.
    }
    progress('Verifying update…');
    try{
        await refreshReceivingAfterRecovery(scope);
    }catch(error){
        const pending=new Error(acknowledged?'Order saved. Receiving synchronization is pending; refresh before another update.':'Update status is unconfirmed. Refresh before retrying.');
        pending.updateUncertain=true;throw pending;
    }
    const persisted=getWorkspaceOrderFile(order);
    if(!persisted || compareReceivingOrderRevision(persisted.sourceRows||[],replacement.sourceRows).length){
        const pending=new Error(acknowledged?'Order saved, but the current server order differs. Review it before another update.':'The requested update is not confirmed on the server. Refresh before retrying.');
        pending.updateUncertain=true;throw pending;
    }
    try{
        await reconcileRevisionUnassigned(scope,order,changes);
    }catch(error){
        const pending=new Error('Order saved. Unassigned reconciliation is pending; review Extra Items before retrying.');
        pending.updateUncertain=true;throw pending;
    }
    showToast('Order updated and Receiving synchronized.','success');return true;
}

async function recordUnassignedReceiving({itemCode,itemName,quantity,gtin="",lot="",expiry="",serial="",transactionId=crypto.randomUUID()}){
    const scope=receivingRecoveryScope(),q=Number(quantity);
    if(!normalizeItemCode(itemCode)||!String(itemName||'').trim()||!Number.isSafeInteger(q)||q<1)throw new Error("Item identity and positive whole quantity required.");
    const tx={transactionId,orderId:"",selectedOrderNumber:"",itemCode:normalizeItemCode(itemCode),itemName,quantity:q,gtin,lot,expiry,serial,unassigned:true,manual:true,source:"UNASSIGNED_RECEIVING",deviceId:ensureDeviceId(),deviceType:getReceivingRuntimeDeviceType(),dateTime:nowISO()};
    const result=await authRpc("append_pharmflow_receiving_action_v4",{p_pharmacy_id:scope.pharmacyId,p_transaction_id:transactionId,p_order_number:"",p_item_code:tx.itemCode,p_item_name:itemName,p_gtin:gtin,p_quantity:q,p_source:tx.source,p_device_id:tx.deviceId,p_occurred_at:tx.dateTime,p_payload:tx});
    const ack=Array.isArray(result)?result[0]:result;if(ack?.acknowledged!==true)throw new Error("Receipt was not acknowledged.");
    assertReceivingRecoveryScope(scope);applyCloudTransaction({...tx,payload:tx});saveWorkspaceSnapshot?.();refreshEntireUI?.();return tx;
}
function receivingAllocationBalance(tx){
    const order=normalizeOrderNumber(tx.selectedOrderNumber||tx.orderId||tx.orderNumber);
    return (AppState.workspace.receivingHistory||[]).reduce((n,t)=>normalizeItemCode(t.itemCode)===normalizeItemCode(tx.itemCode)&&normalizeOrderNumber(t.selectedOrderNumber||t.orderId||t.orderNumber)===order?n+Number(t.quantity||0):n,0);
}
function receivingReceiptAvailable(tx){
    const reversed=(AppState.workspace.receivingHistory||[]).filter(row=>row.source==="ORDER_ALLOCATION" && row.correctsTransactionId===tx.transactionId && Number(row.quantity)<0).reduce((n,row)=>n+Number(row.quantity),0);
    return Math.max(0,Math.min(Number(tx.quantity)+reversed,receivingAllocationBalance(tx)));
}
function getExtraCorrectionReceipts(){
    const selected=new Set(getSelectedReceivingOrderNumbers().map(normalizeOrderNumber));
    const targets=getActiveReceivingOrderNumbers();
    const seen=new Set();
    return (AppState.workspace.receivingHistory||[]).filter(tx=>{if(!tx.transactionId||seen.has(tx.transactionId)||Number(tx.quantity)<=0)return false;seen.add(tx.transactionId);return true;}).map(tx=>{
        const order=normalizeOrderNumber(tx.selectedOrderNumber||tx.orderId||''),code=normalizeItemCode(tx.itemCode),file=order?getWorkspaceOrderFile(order):null;
        const unassigned=!order&&tx.unassigned===true;
        const extra=order&&selected.has(order)&&Array.isArray(file?.sourceRows)&&!file.sourceRows.some(line=>normalizeItemCode(line.itemCode)===code&&Number(line.orderedQty)>0);
        if(!unassigned&&!extra)return null;
        const quantity=receivingReceiptAvailable(tx);
        if(quantity<=0)return null;
        const destinations=targets.filter(target=>normalizeOrderNumber(target)!==order&&getWorkspaceOrderSourceRows(target).some(line=>normalizeItemCode(line.itemCode)===code&&Number(line.orderedQty)>0));
        return {tx,order,code,quantity,type:unassigned?'Unassigned':'Extra',destinations};
    }).filter(Boolean);
}

// One displayed item row and one KPI projection; retain every receipt for the
// validated batch correction, rather than treating receipts as distinct items.
function getExtraCorrectionItems(receipts=getExtraCorrectionReceipts()){
    const items=new Map();
    for(const row of receipts){
        let item=items.get(row.code);
        if(!item){item={...row,quantity:0,receipts:[],assignments:[],types:[],destinations:[...row.destinations]};items.set(row.code,item);}
        item.quantity+=row.quantity;item.receipts.push(row);
        if(!item.assignments.includes(row.order||'Unassigned'))item.assignments.push(row.order||'Unassigned');
        if(!item.types.includes(row.type))item.types.push(row.type);
        item.destinations=item.destinations.filter(order=>row.destinations.includes(order));
        item.order=item.assignments.join(', ');item.type=item.types.join(' / ');
    }
    return [...items.values()];
}

async function reconcileRevisionUnassigned(scope,order,changes){
    const introduced=new Set(changes.filter(c=>c.before===0&&c.after>0).map(c=>normalizeItemCode(c.itemCode)));
    const candidates=getExtraCorrectionReceipts().filter(row=>row.type==='Unassigned'&&introduced.has(row.code));
    const receipts=[];
    for(const code of new Set(candidates.map(row=>row.code))){
        const rows=candidates.filter(row=>row.code===code);
        // Manifest revision fencing in the existing RPC protects this unique
        // destination decision against another PC changing active orders.
        if(rows.some(row=>row.destinations.length!==1||normalizeOrderNumber(row.destinations[0])!==normalizeOrderNumber(order)))continue;
        const total=rows.reduce((sum,row)=>sum+row.quantity,0);
        if(rows.some(row=>row.quantity!==Number(row.tx.quantity))||total!==receivingAllocationBalance(rows[0].tx))continue;
        receipts.push(...rows.map(row=>({transactionId:row.tx.transactionId,quantity:row.quantity})));
    }
    if(!receipts.length)return;
    assertReceivingRecoveryScope(scope);
    await authRpc('correct_pharmflow_extra_receipts_v1',{p_pharmacy_id:scope.pharmacyId,p_operation_id:crypto.randomUUID(),p_receipts:receipts,p_destination_order:order,p_expected_revision:Number(PharmFlowCloudWorkspace.activeManifestRevision),p_device_id:ensureDeviceId()});
    await refreshReceivingAfterRecovery(scope);
}

function getReceivingUnassignedSummary(rows=getExtraCorrectionReceipts()){
    const unassigned=rows.filter(row=>row.type==='Unassigned');
    return {items:new Set(unassigned.map(row=>row.code)).size,units:unassigned.reduce((sum,row)=>sum+row.quantity,0)};
}

function renderExtraReceivingCorrection(body){
    const rows=getExtraCorrectionItems(),selected=new Set();let operation=null;
    const writable=typeof isPharmacyAdmin==='function'&&isPharmacyAdmin()&&window.PharmFlowPermissions?.allowed('RECEIVING',true)&&!isLikelyZebraDevice?.();
    const extraCount=getKpiPanelItems('manual').length,unassignedCount=new Set(rows.filter(row=>row.types.includes('Unassigned')).map(row=>row.code)).size;
    body.innerHTML=`<div class="receivingExtraSummary">Extra items: <b>${extraCount}</b><span>Unassigned items: <b>${unassignedCount}</b></span></div><div class="receivingExtraTools"><label>Find item<input data-search type="search" placeholder="Item code or name"></label><label>Show<select data-filter><option value="All">All receipts</option><option>Extra</option><option>Unassigned</option></select></label></div><div class="receivingExtraAssign" ${writable?'':'hidden'}><label>Destination order<select data-target aria-label="Destination order"><option value="">Select records first</option></select></label><button class="primaryButton" data-preview type="button" disabled>Confirm</button><span data-selected role="status"></span></div><div class="receivingExtraTable" data-list></div><p class="receivingExtraMessage" data-message role="status" aria-live="polite"></p>`;
    const list=body.querySelector('[data-list]'),target=body.querySelector('[data-target]'),preview=body.querySelector('[data-preview]'),message=body.querySelector('[data-message]');
    const updateSelection=()=>{
        const chosen=rows.filter(r=>selected.has(r.tx.transactionId)),old=target.value;
        const destinations=chosen.length?chosen[0].destinations.filter(order=>chosen.every(row=>row.destinations.includes(order))):[];
        target.innerHTML='<option value="">Choose destination</option>'+destinations.map(order=>`<option value="${escapeHTML(order)}">${escapeHTML(order)}</option>`).join('');
        if(destinations.includes(old))target.value=old;
        preview.disabled=!writable||!chosen.length||!target.value;
        body.querySelector('[data-selected]').textContent=chosen.length?`${chosen.length} receipts · ${chosen.reduce((n,r)=>n+r.quantity,0)} units`:'';
        target.disabled=!destinations.length;
        message.textContent=(chosen.length&&!destinations.length)||(rows.length&&!rows.some(row=>row.destinations.length))?'No eligible destination orders.':'';
    };
    const draw=()=>{
        const query=body.querySelector('[data-search]').value.trim().toLowerCase(),filter=body.querySelector('[data-filter]').value||'All';
        const visible=rows.filter(r=>(filter==='All'||r.types.includes(filter))&&(!query||`${r.code} ${r.tx.itemName} ${r.order}`.toLowerCase().includes(query)));
        const selectable=visible.filter(r=>writable&&r.destinations.length);
        list.innerHTML=visible.length?`<table class="quickKpiTable"><thead><tr><th><input data-select-all type="checkbox" aria-label="Select eligible visible receipts" ${selectable.length?'':'disabled'}></th><th>Item Code</th><th>Item Name</th><th>Received</th><th>Current assignment</th><th>Type</th></tr></thead><tbody>${visible.map(r=>`<tr><td><input data-receipt="${escapeHTML(r.tx.transactionId)}" aria-label="Select receipt ${escapeHTML(r.code)} ${escapeHTML(r.tx.transactionId)}" type="checkbox" ${selected.has(r.tx.transactionId)?'checked':''} ${writable&&r.destinations.length?'':'disabled'}></td><td>${escapeHTML(r.code)}</td><td><b>${escapeHTML(r.tx.itemName)}</b></td><td>${r.quantity}</td><td>${escapeHTML(r.order||'Unassigned')}</td><td>${r.type}</td></tr>`).join('')}</tbody></table>`:'<div class="tableEmptyState">No Extra or Unassigned receipts.</div>';
        list.querySelectorAll('[data-receipt]').forEach(input=>input.onchange=()=>{input.checked?selected.add(input.dataset.receipt):selected.delete(input.dataset.receipt);updateSelection();});
        const all=list.querySelector('[data-select-all]');if(all){all.checked=selectable.length>0&&selectable.every(r=>selected.has(r.tx.transactionId));all.onchange=()=>{selectable.forEach(r=>all.checked?selected.add(r.tx.transactionId):selected.delete(r.tx.transactionId));draw();updateSelection();};}
    };
    body.querySelector('[data-search]').oninput=draw;body.querySelector('[data-filter]').onchange=draw;
    target.onchange=()=>{preview.disabled=!selected.size||!target.value||!writable;};
    preview.onclick=async()=>{
        preview.disabled=true;
        try{
            const scope=receivingRecoveryScope(),chosen=rows.filter(r=>selected.has(r.tx.transactionId)),destination=target.value;
            if(!chosen.length||!destination||chosen.some(r=>!r.destinations.includes(destination)))throw new Error('Select eligible receipts and a matching destination.');
            const receipts=chosen.flatMap(r=>r.receipts.map(receipt=>({transactionId:receipt.tx.transactionId,quantity:receipt.quantity}))).sort((a,b)=>a.transactionId.localeCompare(b.transactionId));
            const revision=Number(PharmFlowCloudWorkspace.activeManifestRevision),key=JSON.stringify([scope,receipts,destination,revision]);
            if(operation?.key!==key)operation={key,id:crypto.randomUUID()};
            assertReceivingRecoveryScope(scope);
            await authRpc('correct_pharmflow_extra_receipts_v1',{p_pharmacy_id:scope.pharmacyId,p_operation_id:operation.id,p_receipts:receipts,p_destination_order:destination,p_expected_revision:revision,p_device_id:ensureDeviceId()});
            await refreshReceivingAfterRecovery(scope);
            refreshDashboard?.();refreshOpenKpiPanel?.();showToast('Assignment saved.','success');
        }catch(error){message.textContent=error.message||'Assignment failed. Refresh and retry.';}
        finally{if(body.contains(preview))preview.disabled=!selected.size||!target.value;}
    };
    draw();updateSelection();
}

// One job per order owns progress and duplicate prevention across list redraws.
const receivingOrderRevisionJobs=new Map();
function paintReceivingOrderRevision(order){
    const job=receivingOrderRevisionJobs.get(order);
    document.querySelectorAll('[data-revise-order]').forEach(button=>{
        if(button.dataset.reviseOrder!==order)return;
        button.disabled=!!job;button.setAttribute('aria-busy',String(!!job&&!job.uncertain));
        button.textContent=job?.label||'Update Order';
    });
}
document.addEventListener('click',event=>{
    const update=event.target.closest('[data-revise-order]');if(!update)return;
    const order=update.dataset.reviseOrder;if(receivingOrderRevisionJobs.has(order))return;
    const input=document.createElement('input');input.type='file';input.accept='.xlsx,.xls';input.hidden=true;
    // Keep the native picker input connected for its entire lifetime. Detached
    // inputs could disappear before the browser/tool delivers the selected File.
    document.body.appendChild(input);
    input.addEventListener('cancel',()=>input.remove(),{once:true});
    input.onchange=async()=>{
        const file=input.files?.[0];input.remove();if(!file||receivingOrderRevisionJobs.has(order))return;
        const job={label:'Reading Excel…',startedAt:Date.now()};receivingOrderRevisionJobs.set(order,job);paintReceivingOrderRevision(order);
        showToast('Reading Excel for '+order+'…','info');
        try{await requestReceivingOrderRevision(order,file,label=>{job.label=label;paintReceivingOrderRevision(order);console.info('Receiving update '+label+'; '+(Date.now()-job.startedAt)+' ms');});}
        catch(error){job.uncertain=error.updateUncertain===true;if(job.uncertain)job.label='Refresh to verify';showToast(error.message||'Order update failed.',job.uncertain?'warning':'error',10000);}
        finally{if(!job.uncertain)receivingOrderRevisionJobs.delete(order);paintReceivingOrderRevision(order);}
    };
    input.click();
});
function decorateReceivingRecoveryControls(){
    if(typeof isLikelyZebraDevice==='function'&&isLikelyZebraDevice())return;
    document.querySelectorAll('[data-remove-order-file]').forEach(close=>{
        const existing=close.parentElement.querySelector('[data-revise-order]');if(existing){paintReceivingOrderRevision(existing.dataset.reviseOrder);return;}
        const file=(AppState.workspace.orderFiles||[]).find(f=>f.id===close.dataset.removeOrderFile);if(!file)return;
        const button=document.createElement('button');button.type='button';button.className='secondaryButton receivingRecoveryButton';button.dataset.reviseOrder=file.documentId;button.textContent='Update Order';close.before(button);paintReceivingOrderRevision(file.documentId);
    });
    document.getElementById('btnReceivingAllocation')?.remove();
}
// Existing render events are sufficient; no additional network polling.
if(typeof AppEvents!=='undefined')for(const name of ['files:updated','receiving:updated'])AppEvents.on(name,decorateReceivingRecoveryControls);
window.addEventListener('auth:context-ready',decorateReceivingRecoveryControls);

window.addEventListener("load",decorateReceivingRecoveryControls);
