/* Server-owned session lifecycle and operation corrections; no inventory cache. */
let expirySessionOpenPromise=null;
function expiryAuthenticationRejected(error){
    return error?.serverRejected===true && /authentication session expired or revoked|authentication required|jwt expired|token is expired|invalid jwt/i.test(String(error.message||''));
}
async function prepareExpiryAuthenticatedRetry(operation,scope){
    const guard=()=>{if(scope!==expiryDraftScope() || operation.pharmacyId!==expiryPharmacyId() || (operation.payload && operation.payload.device_id!==expiryDeviceId()))throw Error('Capture account changed');};
    guard();
    const receipt=operation.payload?await ExpiryOperation.readReceipt(operation,authRpc):null;
    guard();
    if(receipt){
        if(receipt.created_by!==AuthState.user?.id || receipt.device_id!==expiryDeviceId())throw Error('Capture receipt scope mismatch');
        return receipt;
    }
    // Only an explicitly auth-rejected, uncommitted capture may use a fresh
    // signed session for the same account/pharmacy/device. Keep its operation ID.
    const sessionId=await ensureExpiryActiveSession({fresh:true});guard();
    operation.sessionId=sessionId;
    operation.authRecoveryRequired=false;
    await persistExpiryDraft('DRAFT');guard();
    return null;
}
function expiryCorrectionKey(){return `pharmflow_expiry_correction_${expiryDraftScope()}/${expiryDeviceId()}`;}
async function reconcileExpirySessionCorrection(){
    const scope=expiryDraftScope(),key=expiryCorrectionKey(),stored=sessionStorage.getItem(key);
    if(!stored)return;
    const args=JSON.parse(stored);
    if(args.p_pharmacy_id!==expiryPharmacyId())throw new Error('Correction scope mismatch');
    if(!args.p_correction)throw new Error('Previous correction requires verification — intent retained');
    try{
        const result=await authRpc('correct_pharmflow_expiry_session_v2',args);
        if(scope!==expiryDraftScope() || result?.operation_id!==args.p_operation_id || result.request_id!==args.p_request_id || result.quantity!==args.p_correction.quantity || (result.correction && Object.entries(args.p_correction).some(([key,value])=>result.correction[key]!==value)))throw new Error('Correction acknowledgement mismatch');
        sessionStorage.removeItem(key);
    }catch(error){
        if(scope===expiryDraftScope() && error?.serverRejected===true)sessionStorage.removeItem(key);
        throw error;
    }
}
async function ensureExpiryActiveSession(options={}){
    const {key,session}=expiryHandheldSession(),scope=expiryDraftScope();
    const authIdentity=expirySignedAuthIdentity();
    if(options.fresh && expirySessionOpenPromise?.settled)expirySessionOpenPromise=null;
    if(expirySessionOpenPromise?.scope===scope && expirySessionOpenPromise.authIdentity===authIdentity)return expirySessionOpenPromise.promise;
    const promise=authRpc('get_pharmflow_expiry_auth_session_v1',{p_pharmacy_id:expiryPharmacyId(),p_device_id:session.deviceId}).then(row=>{
        if(scope!==expiryDraftScope() || authIdentity!==expirySignedAuthIdentity() || !row?.session_id || row.status!=='OPEN')throw new Error('Signed session acknowledgement mismatch');
        session.id=row.session_id;session.authSessionId=row.auth_session_id;session.serverOpened=true;session.closed=false;
        sessionStorage.setItem(key,JSON.stringify(session));return row.session_id;
    });
    const entry={scope,authIdentity,promise,settled:false};expirySessionOpenPromise=entry;
    try{return await promise;}catch(error){if(expirySessionOpenPromise===entry)expirySessionOpenPromise=null;throw error;}finally{entry.settled=true;}
}
async function closeExpiryActiveSession(){
    const scope=expiryDraftScope();
    const row=await authRpc('close_pharmflow_expiry_auth_session_v1',{});
    if(scope!==expiryDraftScope() || row?.status!=='CLOSED')throw new Error('Session closure not acknowledged');
    const {key,session}=expiryHandheldSession();session.closed=true;sessionStorage.setItem(key,JSON.stringify(session));expirySessionOpenPromise=null;
    document.getElementById('expiryCapturedOverlay')?.remove();document.getElementById('expiryPhotoViewer')?.remove();document.getElementById('expiryNoteEditor')?.remove();
}
function openExpiryPhotoViewer(url,actions={}){
    document.getElementById('expiryPhotoViewer')?.remove();document.getElementById('expiryNoteEditor')?.remove();
    const previousFocus=document.activeElement;
    const overlay=document.createElement('div');overlay.id='expiryPhotoViewer';overlay.className='expiryPhotoViewer';
    const panel=document.createElement('section');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Photo');
    const image=document.createElement('img');image.src=url;image.alt='Identification photo';panel.appendChild(image);
    const close=document.createElement('button');close.type='button';close.textContent='Close';close.onclick=()=>{overlay.remove();actions.onClose?.();previousFocus?.focus?.();};panel.appendChild(close);
    for(const [label,action] of [['Retake',actions.onRetake],['Remove Photo',actions.onRemove]])if(action){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=async()=>{button.disabled=true;try{await action();close.onclick();}catch(error){button.disabled=false;button.textContent=String(error.message);}};panel.appendChild(button);}
    overlay.appendChild(panel);document.body.appendChild(overlay);close.focus();
}
function openExpiryNoteEditor(){
    if(!ExpiryCaptureEngine.currentItem?.needsReview || ExpiryCaptureEngine.busy || ExpiryCaptureEngine.saveUncertain || ExpiryCaptureEngine.operation?.payload)return;
    document.getElementById('expiryNoteEditor')?.remove();
    const scope=expiryDraftScope(),item=ExpiryCaptureEngine.currentItem,authIdentity=expirySignedAuthIdentity();
    const overlay=document.createElement('div');overlay.id='expiryNoteEditor';overlay.className='expiryPhotoViewer';
    const form=document.createElement('form');form.className='expirySessionEditor';form.setAttribute('role','dialog');form.setAttribute('aria-modal','true');form.setAttribute('aria-label','Identification note');
    const input=document.createElement('textarea');input.maxLength=250;input.dir='auto';input.value=ExpiryCaptureEngine.identificationNote||'';input.setAttribute('aria-label','Optional identification note');
    const save=document.createElement('button');save.type='submit';save.textContent='Save Note';const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>overlay.remove();
    form.append(input,save,cancel);form.onsubmit=async event=>{event.preventDefault();if(save.disabled)return;if(scope!==expiryDraftScope() || item!==ExpiryCaptureEngine.currentItem || authIdentity!==expirySignedAuthIdentity() || ExpiryCaptureEngine.busy || ExpiryCaptureEngine.operation?.payload){overlay.remove();return;}save.disabled=true;try{ExpiryCaptureEngine.identificationNote=input.value.trim().slice(0,250);await persistExpiryDraft();renderExpiryEvidence();overlay.remove();}catch(error){save.disabled=false;save.textContent='Retry';}};
    overlay.appendChild(form);document.body.appendChild(overlay);input.focus();
}
async function openExpiryHandheldHistory(){
    if(!expiryIsHandheld())return;
    document.getElementById('expiryCapturedOverlay')?.remove();
    const scope=expiryDraftScope();let sessionId,activeDialog=null;
    const overlay=document.createElement('div');overlay.id='expiryCapturedOverlay';overlay.className='expiryCapturedOverlay';
    overlay.innerHTML=`<section class="expiryCapturedPanel expiryRecentScans" role="dialog" aria-modal="true" aria-label="History"><header><div><strong>History</strong></div><button type="button" data-close aria-label="Close History">✕</button></header><div class="expiryCapturedList"></div><p data-message role="status"></p></section>`;
    const list=overlay.querySelector('.expiryCapturedList'),message=overlay.querySelector('[data-message]');
    overlay.querySelector('[data-close]').onclick=()=>{overlay.remove();focusExpiryScanner();};
    async function render(){
        if(scope!==expiryDraftScope() || !overlay.isConnected)return;
        list.textContent='Loading…';
        try{
            await reconcileExpirySessionCorrection();sessionId=await ensureExpiryActiveSession();
            const rows=await authRpc('list_pharmflow_expiry_session_v2',{p_pharmacy_id:expiryPharmacyId(),p_session_id:sessionId});
            if(scope!==expiryDraftScope() || !overlay.isConnected)return;
            if(!Array.isArray(rows) || new Set(rows.map(row=>row.operation_id)).size!==rows.length)throw new Error('History response invalid');
            list.replaceChildren();if(!rows.length){list.textContent='No saved operations.';return;}
            for(const row of rows.slice(0,10)){
                const unknown=row.kind==='UNKNOWN',activeReview=unknown && row.status!=='RESOLVED' && row.status!=='DELETED' && row.quantity>0,details=document.createElement('details');details.className='expiryCapturedRow'+(activeReview?' expiryHistoryNeedsReview':'');
                const summary=document.createElement('summary'),main=document.createElement('div');main.className='expiryCapturedMain';
                const title=document.createElement('strong');title.textContent=unknown?'Item Not Recognized':row.item_name;
                const subtitle=document.createElement('span');subtitle.textContent=`${unknown?row.identifier_display+' · ':''}${String(row.expiry_month).padStart(2,'0')}/${row.expiry_year} · Qty ${row.quantity}`;main.append(title,subtitle);
                const status=document.createElement('span');status.className='expiryHistoryStatus'+(activeReview?' review':'');status.textContent=row.status==='DELETED'?'Deleted':unknown?(row.status==='RESOLVED'?'Resolved':'Needs Review'):'Recognized';
                const chevron=document.createElement('span');chevron.className='expiryRecentChevron';chevron.textContent='⌄';chevron.setAttribute('aria-hidden','true');summary.append(main,status,chevron);details.appendChild(summary);
                const body=document.createElement('div');body.className='expiryRecentDetails';
                for(const [label,value] of [['Identifier',row.identifier_display],['Item Code',row.item_code],['Batch',row.batch_no],['Expiry',`${String(row.expiry_month).padStart(2,'0')}/${row.expiry_year}`],['Quantity',row.quantity],['Status',status.textContent],['Serial',row.sample_serial],['Note',row.identification_note]]){
                    if(value===undefined || value===null || value==='')continue;const field=document.createElement('div'),name=document.createElement('span'),text=document.createElement('strong');field.className='expiryHistoryField';name.className='expiryHistoryLabel';text.className='expiryHistoryValue';name.textContent=label;text.textContent=String(value);if(label==='Note')text.dir='auto';field.append(name,text);body.appendChild(field);
                }
                if(row.editable){const actions=document.createElement('div');actions.className='expiryHistoryActions';for(const [label,remove] of [['Edit',false],['Delete',true]]){const button=document.createElement('button');button.type='button';button.textContent=label;button.className=remove?'expiryHistoryDeleteButton':'';button.onclick=()=>editOperation(row,remove,button);actions.appendChild(button);}body.appendChild(actions);}
                details.appendChild(body);list.appendChild(details);
                details.addEventListener('toggle',async()=>{
                    if(!details.open)return;
                    for(const other of list.children)if(other!==details && other.tagName==='DETAILS')other.open=false;
                    const path=row.quantity>0?(row.product_photo_path||row.evidence_photo_path):null;
                    if(!path || details.dataset.photoLoaded==='1')return;details.dataset.photoLoaded='1';
                    try{const url=await nrV2PhotoObjectUrl(path);if(scope!==expiryDraftScope() || !overlay.isConnected)return;const button=document.createElement('button'),image=document.createElement('img');button.type='button';button.setAttribute('aria-label','View photo');image.src=url;image.alt='Identification photo';image.className='expiryHistoryThumbnail';button.appendChild(image);button.onclick=()=>openExpiryPhotoViewer(url);const field=document.createElement('div'),label=document.createElement('span');field.className='expiryHistoryField';label.className='expiryHistoryLabel';label.textContent='Photo';field.append(label,button);body.appendChild(field);}catch(error){details.dataset.photoLoaded='';message.textContent='Photo unavailable; evidence retained.';}
                });
            }
        }catch(error){list.textContent=String(error.message||'History unavailable');}
    }
    function editOperation(row,remove,trigger){
        if(ExpiryCaptureEngine.busy || ExpiryCaptureEngine.saveUncertain || activeDialog?.isConnected)return;
        const modal=document.createElement('div');modal.className='expiryHistoryActionOverlay';activeDialog=modal;
        const editor=document.createElement('form');editor.className='expirySessionEditor expiryHistoryDialog'+(remove?' expiryHistoryDeleteDialog':'');editor.setAttribute('role','dialog');editor.setAttribute('aria-modal','true');editor.setAttribute('aria-labelledby','expiryHistoryDialogTitle');const title=document.createElement('strong');title.id='expiryHistoryDialogTitle';title.textContent=`${remove?'Delete Operation':'Edit Operation'}: ${row.kind==='UNKNOWN'?row.identifier_display:row.item_name}`;const identity=document.createElement('small');identity.className='expiryHistoryOperationIdentity';identity.textContent=[row.identifier_display,row.batch_no?`Batch ${row.batch_no}`:null,`${String(row.expiry_month).padStart(2,'0')}/${row.expiry_year}`,`Qty ${row.quantity}`].filter(Boolean).join(' · ');title.appendChild(identity);
        const fields={},wrappers=[];for(const [key,label,type,value] of [['quantity','Quantity','number',row.quantity],['batch_no','Batch','text',row.batch_no||''],['expiry_month','Expiry Month','number',row.expiry_month],['expiry_year','Expiry Year','number',row.expiry_year]]){const field=document.createElement('input');field.type=type;field.value=String(value);field.setAttribute('aria-label',label);if(type==='number'){field.inputMode='numeric';field.step='1';field.min=key==='expiry_year'?'2020':'1';if(key==='expiry_month')field.max='12';if(key==='expiry_year')field.max='2200';}field.hidden=remove;fields[key]=field;const wrapper=document.createElement('label'),caption=document.createElement('span');caption.textContent=label;wrapper.hidden=remove;wrapper.append(caption,field);wrappers.push(wrapper);}
        const confirm=document.createElement('button');confirm.type='submit';confirm.className=remove?'expiryHistoryConfirmDelete':'expiryHistoryConfirmSave';confirm.textContent=remove?'Delete Operation':'Save';const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';
        const close=()=>{modal.remove();activeDialog=null;if(trigger?.isConnected)trigger.focus();else overlay.querySelector('[data-close]')?.focus();};
        const status=document.createElement('span');status.className='expiryHistoryDialogStatus';status.setAttribute('role','status');const buttons=document.createElement('div');buttons.className='expiryHistoryDialogActions';buttons.append(cancel,confirm);editor.append(title,...wrappers);if(remove){const warning=document.createElement('p');warning.textContent='Delete this saved operation? Its contribution will be removed; the audit record is retained.';editor.appendChild(warning);}editor.append(buttons,status);modal.appendChild(editor);overlay.appendChild(modal);
        // Modal belongs to History, so closing History/context removes it too.
        const panel=overlay.querySelector('.expiryCapturedPanel');panel?.setAttribute('inert','');panel?.setAttribute('aria-hidden','true');
        const closeDialog=()=>{panel?.removeAttribute('inert');panel?.removeAttribute('aria-hidden');close();};cancel.onclick=()=>{if(!cancel.disabled)closeDialog();};
        editor.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();cancel.onclick();return;}if(event.key!=='Tab')return;const controls=[...Object.values(fields),cancel,confirm].filter(field=>!field.hidden&&!field.disabled);const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}});
        if(remove)cancel.focus();else fields.quantity.focus();
        const requestId=crypto.randomUUID();let submitted=null;
        editor.onsubmit=async event=>{
            event.preventDefault();if(confirm.disabled || scope!==expiryDraftScope())return;
            const correction={quantity:remove?0:Number(fields.quantity.value),batch_no:fields.batch_no.value.trim()||null,expiry_month:Number(fields.expiry_month.value),expiry_year:Number(fields.expiry_year.value)};
            if(!Number.isInteger(correction.quantity)||correction.quantity<0||(!remove&&correction.quantity<1)||!Number.isInteger(correction.expiry_month)||correction.expiry_month<1||correction.expiry_month>12||!Number.isInteger(correction.expiry_year)||correction.expiry_year<2020||correction.expiry_year>2200||(correction.batch_no!==row.batch_no && String(correction.batch_no||'').length>(row.scan_format==='GS1'?20:128))){status.textContent='Check quantity, batch and expiry';return;}
            if(!remove && correction.batch_no!==row.batch_no && ExpiryOperation.batchIsScannerPayload(correction.batch_no)){status.textContent='Use Scan Barcode, not Batch';return;}
            if(submitted && JSON.stringify(submitted)!==JSON.stringify(correction)){status.textContent='Retry the same correction first';return;}submitted=correction;confirm.disabled=true;cancel.disabled=true;Object.values(fields).forEach(field=>field.disabled=true);status.textContent='SAVING…';
            try{const key=expiryCorrectionKey(),args={p_pharmacy_id:expiryPharmacyId(),p_session_id:sessionId,p_operation_id:row.operation_id,p_request_id:requestId,p_expected_revision:row.revision,p_correction:correction};const pending=sessionStorage.getItem(key);if(pending && JSON.parse(pending).p_request_id!==requestId)throw new Error('Check pending correction first');sessionStorage.setItem(key,JSON.stringify(args));await reconcileExpirySessionCorrection();if(remove&&row.product_photo_path&&typeof nrV2ReleasePhotoObjectUrl==='function')nrV2ReleasePhotoObjectUrl(row.product_photo_path);closeDialog();await render();overlay.querySelector('[data-close]')?.focus();}catch(error){status.textContent=String(error.message||'Result uncertain; retry same correction');confirm.textContent='Check / Retry';confirm.disabled=false;}
        };
    }
    document.body.appendChild(overlay);await render();
}

function expirySignedAuthIdentity(){
    try{const token=typeof getSupabaseAccessToken==='function'?getSupabaseAccessToken():AuthState.session?.access_token;return token?JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).session_id:null;}catch(_){return null;}
}
window.prepareExpirySignOut=async function(){
    if(!expiryIsHandheld() || !expiryDraftScope())return true;
    if(ExpiryCaptureEngine.currentItem || ExpiryCaptureEngine.busy || ExpiryCaptureEngine.saveUncertain){if(!await leaveExpiryHandheld())return false;}
    try{await reconcileExpirySessionCorrection();await closeExpiryActiveSession();return true;}
    catch(error){if(error?.serverRejected && /expired|revoked/i.test(String(error.message)))return true;setExpiryStatus('error','Sign Out not confirmed — retry');return false;}
};
window.addEventListener?.('auth:context-ready',()=>{
    if(!expiryIsHandheld() || !expiryDraftScope() || document.documentElement.classList.contains('pf-idle-sleep-active'))return;
    if(expirySessionOpenPromise && (expirySessionOpenPromise.scope!==expiryDraftScope() || expirySessionOpenPromise.authIdentity!==expirySignedAuthIdentity())){document.getElementById('expiryCapturedOverlay')?.remove();document.getElementById('expiryPhotoViewer')?.remove();document.getElementById('expiryNoteEditor')?.remove();expirySessionOpenPromise=null;}
    void ensureExpiryActiveSession().catch(()=>setExpiryStatus('error','Expiry session unavailable — retry when connected'));
});
