/* Server-owned session lifecycle and operation corrections; no inventory cache. */
let expirySessionOpenPromise=null;
function expiryCorrectionKey(){return `pharmflow_expiry_correction_${expiryDraftScope()}/${expiryDeviceId()}`;}
async function reconcileExpirySessionCorrection(){
    const scope=expiryDraftScope(),key=expiryCorrectionKey(),stored=sessionStorage.getItem(key);
    if(!stored)return;
    const args=JSON.parse(stored);
    if(args.p_pharmacy_id!==expiryPharmacyId())throw new Error('Correction scope mismatch');
    try{
        const result=await authRpc('correct_pharmflow_expiry_session_v1',args);
        if(scope!==expiryDraftScope() || result?.operation_id!==args.p_operation_id || result.request_id!==args.p_request_id || result.quantity!==args.p_quantity)throw new Error('Correction acknowledgement mismatch');
        sessionStorage.removeItem(key);
    }catch(error){
        if(scope===expiryDraftScope() && error?.serverRejected===true)sessionStorage.removeItem(key);
        throw error;
    }
}
async function ensureExpiryActiveSession(){
    const {session}=expiryHandheldSession(),scope=expiryDraftScope();
    if(expirySessionOpenPromise?.id===session.id && expirySessionOpenPromise.scope===scope)return expirySessionOpenPromise.promise;
    const promise=authRpc('open_pharmflow_expiry_session_v1',{p_pharmacy_id:expiryPharmacyId(),p_session_id:session.id,p_device_id:session.deviceId}).then(row=>{
        if(scope!==expiryDraftScope() || row?.session_id!==session.id || row.status!=='OPEN')throw new Error('Session acknowledgement mismatch');
        session.serverOpened=true;sessionStorage.setItem(expiryHandheldSession().key,JSON.stringify(session));return session.id;
    });
    expirySessionOpenPromise={id:session.id,scope,promise};
    try{return await promise;}catch(error){expirySessionOpenPromise=null;throw error;}
}
async function closeExpiryActiveSession(){
    const {key,session}=expiryHandheldSession(),scope=expiryDraftScope();
    if(!session.closed && session.serverOpened){
        const row=await authRpc('close_pharmflow_expiry_session_v1',{p_pharmacy_id:expiryPharmacyId(),p_session_id:session.id});
        if(scope!==expiryDraftScope() || row?.session_id!==session.id || row.status!=='CLOSED')throw new Error('Session closure not acknowledged');
    }
    // Retain closed identity for read-only history, but never reopen it.
    session.closed=true;sessionStorage.setItem(key,JSON.stringify(session));expirySessionOpenPromise=null;
}
async function openExpiryHandheldHistory(tab='active'){
    if(!expiryIsHandheld())return;
    document.getElementById('expiryCapturedOverlay')?.remove();
    const scope=expiryDraftScope(),{session}=expiryHandheldSession();
    const overlay=document.createElement('div');overlay.id='expiryCapturedOverlay';overlay.className='expiryCapturedOverlay';
    overlay.innerHTML=`<section class="expiryCapturedPanel expiryRecentScans" role="dialog" aria-modal="true" aria-label="History"><header><div><span>EXPIRY</span><strong>History</strong></div><button type="button" data-close aria-label="Close History">✕</button></header><nav class="expirySessionTabs" role="tablist"><button role="tab" data-tab="active">Active Session</button><button role="tab" data-tab="review">Needs Review</button></nav><div class="expiryCapturedList" role="tabpanel">Loading…</div><p data-message role="status"></p></section>`;
    const list=overlay.querySelector('.expiryCapturedList'),message=overlay.querySelector('[data-message]');
    overlay.querySelector('[data-close]').onclick=()=>{overlay.remove();focusExpiryScanner();};
    let generation=0;
    async function render(selected){
        const token=++generation;
        overlay.querySelectorAll('[data-tab]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.tab===selected)));
        list.textContent='Loading…';message.textContent='';
        try{
            await reconcileExpirySessionCorrection();
            let rows=[];
            if(selected==='active'){
                if(!session.closed)await ensureExpiryActiveSession();
                rows=await authRpc('list_pharmflow_expiry_session_v1',{p_pharmacy_id:expiryPharmacyId(),p_session_id:session.id});
            }else{
                for(let offset=0;;offset+=250){
                    const page=await authRpc('list_pharmflow_expiry_reviews_v1',{p_pharmacy_id:expiryPharmacyId(),p_status:'ALL',p_limit:250,p_offset:offset});
                    if(!Array.isArray(page))throw new Error('Review history unavailable');rows.push(...page);if(page.length<250)break;
                }
            }
            if(scope!==expiryDraftScope() || token!==generation || !overlay.isConnected)return;
            if(!Array.isArray(rows))throw new Error('History unavailable');
            list.replaceChildren();
            if(!rows.length){list.textContent='No saved operations.';return;}
            for(const row of rows){
                const details=document.createElement('details');details.className='expiryCapturedRow';
                const summary=document.createElement('summary');summary.textContent=`${row.item_name||row.resolved_item_name||'Unrecognized item'} · Qty ${row.quantity??row.pending_quantity??'—'} · ${row.status||'SAVED'}`;details.appendChild(summary);
                const body=document.createElement('div');body.className='expiryRecentDetails';
                body.textContent=`Identifier: ${row.identifier_display||row.gtin||''} · Batch: ${row.batch_no||'—'} · Expiry: ${row.expiry_month||'—'}/${row.expiry_year||'—'}`;details.appendChild(body);
                if(selected==='active' && row.editable && !session.closed){
                    const edit=document.createElement('button');edit.type='button';edit.textContent='Edit Quantity';edit.onclick=()=>editOperation(row,false);
                    const del=document.createElement('button');del.type='button';del.textContent='Delete';del.onclick=()=>editOperation(row,true);body.append(edit,del);
                }else if(selected==='active'){const note=document.createElement('small');note.textContent=row.kind==='UNKNOWN'?'Review evidence · read only':'Read only';body.appendChild(note);}
                if(selected==='review'){
                    details.addEventListener('toggle',async()=>{
                        if(!details.open || details.dataset.loaded==='1')return;details.dataset.loaded='1';
                        try{
                            const reviewId=row.review_id||row.id;
                            const full=await ExpiryOperation.readReview(expiryPharmacyId(),reviewId);
                            if(scope!==expiryDraftScope() || !overlay.isConnected)return;
                            for(const path of [full?.product_photo_path,full?.expiry_photo_path].filter(Boolean)){
                                const url=await nrV2PhotoObjectUrl(path);if(scope!==expiryDraftScope() || !overlay.isConnected)return;
                                const img=document.createElement('img');img.src=url;img.alt='Needs Review evidence';img.className='expiryHistoryPhoto';body.appendChild(img);
                            }
                        }catch(error){message.textContent='Photo unavailable; saved evidence is retained.';details.dataset.loaded='';}
                    });
                }
                list.appendChild(details);
            }
        }catch(error){if(token===generation)list.textContent=String(error.message||'History unavailable');}
    }
    function editOperation(row,remove){
        if(ExpiryCaptureEngine.busy || ExpiryCaptureEngine.saveUncertain)return;
        const editor=document.createElement('form');editor.className='expirySessionEditor';
        const title=document.createElement('strong');title.textContent=`${remove?'Delete':'Edit quantity'}: ${row.item_name||row.identifier_display}`;
        const input=document.createElement('input');input.type='number';input.inputMode='numeric';input.min='1';input.step='1';input.value=String(row.quantity);input.setAttribute('aria-label','Replacement quantity');input.hidden=remove;
        const confirm=document.createElement('button');confirm.type='submit';confirm.textContent=remove?'Confirm Delete':'Save Quantity';
        const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>editor.remove();
        const status=document.createElement('span');status.setAttribute('role','status');editor.append(title,input,confirm,cancel,status);list.prepend(editor);if(!remove)input.focus();
        const requestId=crypto.randomUUID();let submittedQuantity=null;
        editor.onsubmit=async event=>{
            event.preventDefault();if(confirm.disabled || scope!==expiryDraftScope())return;
            const quantity=remove?0:Number(input.value);
            if(!Number.isSafeInteger(quantity) || quantity<0 || (!remove&&quantity<1)){status.textContent='Enter a positive whole quantity';return;}
            if(submittedQuantity!==null && submittedQuantity!==quantity){status.textContent='Retry the same quantity to confirm the previous result';return;}
            submittedQuantity=quantity;confirm.disabled=true;cancel.disabled=true;input.disabled=true;status.textContent='SAVING…';
            try{
                const key=expiryCorrectionKey(),args={p_pharmacy_id:expiryPharmacyId(),p_session_id:session.id,p_operation_id:row.operation_id,p_request_id:requestId,p_expected_revision:row.revision,p_quantity:quantity};
                const pending=sessionStorage.getItem(key);
                if(pending && JSON.parse(pending).p_request_id!==requestId)throw new Error('Check the pending correction first');
                sessionStorage.setItem(key,JSON.stringify(args));
                await reconcileExpirySessionCorrection();
                await render('active');
            }catch(error){status.textContent=String(error.message||'Result uncertain; retry the same correction');confirm.textContent='Check / Retry';confirm.disabled=false;}
        };
    }
    overlay.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>render(button.dataset.tab));
    document.body.appendChild(overlay);await render(tab);
}

window.prepareExpirySignOut=async function(){
    if(!expiryIsHandheld() || !ExpiryCaptureEngine.selectedWorkerId)return true;
    if(ExpiryCaptureEngine.currentItem || ExpiryCaptureEngine.busy || ExpiryCaptureEngine.saveUncertain)return leaveExpiryHandheld();
    try{await closeExpiryActiveSession();return true;}catch(error){setExpiryStatus('error','Session closure failed — retry sign out');return false;}
};
