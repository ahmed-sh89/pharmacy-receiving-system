/* One camera input and one evidence image for each Expiry review case. */
let expiryPreviewURLs=[];
function renderExpiryEvidence(){
    const panel=document.getElementById('expiryEvidence');if(!panel)return;
    const engine=ExpiryCaptureEngine;
    panel.hidden=!expiryIsHandheld() || !engine.currentItem?.needsReview;
    expiryPreviewURLs.forEach(url=>URL.revokeObjectURL(url));expiryPreviewURLs=[];
    const previews=document.getElementById('expiryEvidencePreviews');if(previews)previews.replaceChildren();
    if(panel.hidden)return;
    const photo=engine.reviewPhotos.evidence||engine.reviewPhotos.product;
    if(photo && previews){const img=document.createElement('img');const url=URL.createObjectURL(photo);expiryPreviewURLs.push(url);img.src=url;img.alt='Needs Review evidence photo';previews.appendChild(img);}
    const next=document.getElementById('btnExpiryPhoto');
    const ready=typeof ExpiryReviewBackend!=='undefined'&&ExpiryReviewBackend.ready;
    if(next){next.hidden=!!photo;next.disabled=engine.busy||engine.saveUncertain||!ready;}
    const message=document.getElementById('expiryEvidenceMessage');if(message)message.textContent=!ready?'Needs Review submission is unavailable until the Staging review migration is applied and verified.':photo?'Evidence photo added. Submit for Review when the required fields are complete.':'Take one photo showing useful product or expiry evidence.';
    const save=document.getElementById('btnSaveExpiryCapture');if(save&&engine.currentItem?.needsReview){save.textContent='SUBMIT FOR REVIEW';save.disabled=engine.busy||engine.saveUncertain||!ready;}
}
function bindExpiryEvidence(){
    const input=document.getElementById('expiryCameraInput');if(!input || input.dataset.bound==='1')return;
    input.dataset.bound='1';
    const open=()=>{
        if(!expiryIsHandheld() || !ExpiryCaptureEngine.currentItem?.needsReview || ExpiryCaptureEngine.busy || ExpiryCaptureEngine.resolving || ExpiryCaptureEngine.saveUncertain || !ExpiryReviewBackend.ready)return;
        input.value='';input.click();
    };
    document.getElementById('btnExpiryPhoto')?.addEventListener('click',open);
    input.addEventListener('change',async()=>{
        let file=input.files?.[0];if(!file)return;
        if(ExpiryCaptureEngine.busy || ExpiryCaptureEngine.resolving || ExpiryCaptureEngine.saveUncertain)return;
        ExpiryCaptureEngine.resolving=true;
        try{
            if(typeof nrV2PreparePhoto==="function")file=await nrV2PreparePhoto(file);
            await setExpiryEvidencePhoto('evidence',file);
            renderExpiryEvidence();
            setExpiryStatus('action','EVIDENCE READY — SUBMIT FOR REVIEW');
        }catch(error){setExpiryStatus('error',String(error.message)+' — CAPTURE RETAINED');}
        finally{ExpiryCaptureEngine.resolving=false;input.value='';focusExpiryScanner();}
    });
}

function expiryDraftDiscardable(draft){
    return draft.status==="DRAFT" && !!draft.operation?.id && !draft.operation?.payload && !Object.keys(draft.operation?.uploaded||{}).length;
}
async function prepareExpiryDraftRecovery(){
    const scope=expiryDraftScope(),draft=await ExpiryDraftStore.get(scope);
    if(scope!==expiryDraftScope())throw new Error("Capture account changed");
    if(!draft?.item || draft.scope!==scope)return false;
    const device=draft.deviceId||draft.operation?.payload?.device_id;
    if(expiryIsHandheld() && device && device!==expiryDeviceId())throw new Error("Draft belongs to another device");
    // An acknowledged or uncertain write is checked read-only, never replayed.
    if(expiryIsHandheld() && draft.operation?.payload){
        const receipt=await ExpiryOperation.readReceipt(draft.operation,authRpc);
        if(scope!==expiryDraftScope())throw new Error("Capture account changed");
        if(receipt){
            const previous=ExpiryCaptureEngine.selectedWorkerId;
            try{ExpiryCaptureEngine.selectedWorkerId=draft.workerId;rememberExpiryReceipt(receipt);}
            finally{ExpiryCaptureEngine.selectedWorkerId=previous;}
            await ExpiryDraftStore.remove(scope);
            return false;
        }
    }
    ExpiryCaptureEngine.pendingDraft={scope,draft};
    ExpiryCaptureEngine.draftReady=false;
    await renderExpiryRecoverableDrafts();
    setExpiryStatus("action","Unsaved Capture · Resume or Discard");
    return true;
}
async function renderExpiryRecoverableDrafts(){
    const panel=document.getElementById('expiryRecoverableDrafts');if(!panel)return;
    panel.replaceChildren();panel.hidden=true;
    const scope=expiryDraftScope();
    let entries=ExpiryCaptureEngine.pendingDraft?[{key:null,draft:ExpiryCaptureEngine.pendingDraft.draft}]:(ExpiryDraftStore.list?await ExpiryDraftStore.list(scope):[]);
    if(scope!==expiryDraftScope() || ExpiryCaptureEngine.currentItem)return;
    entries=entries.filter(({draft})=>draft.scope===scope && (!expiryIsHandheld() || !draft.deviceId || draft.deviceId===expiryDeviceId()));
    for(const {key,draft} of entries){
        const row=document.createElement('div');row.className='expiryDraftRecovery';
        const label=document.createElement('strong');label.textContent='Unsaved Capture';row.appendChild(label);
        const detail=document.createElement('span');detail.textContent=draft.item.identifierDisplay+(expiryDraftDiscardable(draft)?'':' · Save status requires checking');row.appendChild(detail);
        const action=async discard=>{
            if(scope!==expiryDraftScope() || ExpiryCaptureEngine.currentItem || ExpiryCaptureEngine.busy)return;
            if(discard && !expiryDraftDiscardable(draft))return;
            if(key && (typeof navigator==='undefined' || !navigator.locks)){setExpiryStatus('error','Cross-tab recovery unavailable — draft retained');return;}
            ExpiryCaptureEngine.busy=true;
            try{
                await claimExpiryOperation(draft.operation?.id);
                if(key)await ExpiryDraftStore.recover(scope,key);
                if(discard){
                    const latest=await ExpiryDraftStore.get(scope);
                    if(!latest || latest.operation?.id!==draft.operation?.id || !expiryDraftDiscardable(latest))throw new Error('Draft changed');
                    await ExpiryDraftStore.remove(scope);releaseExpiryOperation();
                    ExpiryCaptureEngine.pendingDraft=null;ExpiryCaptureEngine.draftReady=true;
                    panel.replaceChildren();panel.hidden=true;setExpiryStatus('ready','READY TO SCAN');
                }else{
                    if(!await prepareExpiryDraftRecovery()){ExpiryCaptureEngine.pendingDraft=null;ExpiryCaptureEngine.draftReady=true;panel.replaceChildren();panel.hidden=true;}
                    else await restoreExpiryDraft();
                }
                focusExpiryScanner();
            }catch(error){setExpiryStatus('error','Draft recovery blocked — capture retained');}
            finally{ExpiryCaptureEngine.busy=false;renderExpiryEvidence();}
        };
        const resume=document.createElement('button');resume.type='button';resume.textContent='Resume';resume.addEventListener('click',()=>action(false));row.appendChild(resume);
        const discard=document.createElement('button');discard.type='button';discard.textContent='Discard';discard.disabled=!expiryDraftDiscardable(draft);discard.addEventListener('click',()=>action(true));row.appendChild(discard);
        panel.appendChild(row);panel.hidden=false;
    }
}

let expiryHeldOperation=null;
let expiryLockPending=null;
async function claimExpiryOperation(id){
    if(!id || typeof navigator==='undefined' || !navigator.locks)return;
    if(expiryHeldOperation?.id===id)return;
    if(expiryLockPending){await expiryLockPending;if(expiryHeldOperation?.id===id)return;}
    if(expiryHeldOperation)throw new Error('Another draft is active');
    let readyResolve,readyReject;
    expiryLockPending=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
    navigator.locks.request('pharmflow-expiry-operation-'+id,{ifAvailable:true},lock=>{
        if(!lock){readyReject(new Error('Capture is open in another tab'));return;}
        return new Promise(release=>{expiryHeldOperation={id,release};readyResolve();});
    }).catch(readyReject);
    try{await expiryLockPending;}finally{expiryLockPending=null;}
}
function releaseExpiryOperation(){
    expiryHeldOperation?.release();expiryHeldOperation=null;
}
