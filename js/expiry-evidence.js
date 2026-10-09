/* One camera input, product → expiry → review/retake. Handheld only. */
let expiryCameraRole='product';
let expiryPreviewURLs=[];
function renderExpiryEvidence(){
    const panel=document.getElementById('expiryEvidence');if(!panel)return;
    const engine=ExpiryCaptureEngine;
    panel.hidden=!expiryIsHandheld() || !engine.currentItem?.needsReview;
    expiryPreviewURLs.forEach(url=>URL.revokeObjectURL(url));expiryPreviewURLs=[];
    const previews=document.getElementById('expiryEvidencePreviews');if(previews)previews.replaceChildren();
    if(panel.hidden)return;
    for(const role of ['product','expiry']){
        const photo=engine.reviewPhotos[role];
        if(photo && previews){
            const img=document.createElement('img');const url=URL.createObjectURL(photo);expiryPreviewURLs.push(url);
            img.src=url;img.alt=role==='product'?'Product photo':'Expiry photo';previews.appendChild(img);
        }
        const retake=document.getElementById(role==='product'?'btnExpiryRetakeProduct':'btnExpiryRetakeExpiry');
        if(retake){retake.hidden=!photo;retake.disabled=engine.busy || engine.saveUncertain;}
    }
    const next=document.getElementById('btnExpiryPhoto');
    if(next){next.hidden=!!engine.reviewPhotos.product && !!engine.reviewPhotos.expiry;next.disabled=engine.busy || engine.saveUncertain;next.textContent=engine.reviewPhotos.product?'EXPIRY PHOTO':'PRODUCT PHOTO';}
    const message=document.getElementById('expiryEvidenceMessage');if(message)message.textContent=next?.hidden?'Review both photos, then Save & Next':'Take product photo, then expiry photo';
}
function bindExpiryEvidence(){
    const input=document.getElementById('expiryCameraInput');if(!input || input.dataset.bound==='1')return;
    input.dataset.bound='1';
    const open=role=>{
        if(!expiryIsHandheld() || !ExpiryCaptureEngine.currentItem?.needsReview || ExpiryCaptureEngine.busy || ExpiryCaptureEngine.resolving || ExpiryCaptureEngine.saveUncertain)return;
        expiryCameraRole=role;input.value='';input.click();
    };
    document.getElementById('btnExpiryPhoto')?.addEventListener('click',()=>open(ExpiryCaptureEngine.reviewPhotos.product?'expiry':'product'));
    document.getElementById('btnExpiryRetakeProduct')?.addEventListener('click',()=>open('product'));
    document.getElementById('btnExpiryRetakeExpiry')?.addEventListener('click',()=>open('expiry'));
    input.addEventListener('change',async()=>{
        let file=input.files?.[0];if(!file)return;const role=expiryCameraRole;
        if(ExpiryCaptureEngine.busy || ExpiryCaptureEngine.resolving || ExpiryCaptureEngine.saveUncertain)return;
        ExpiryCaptureEngine.resolving=true;
        try{
            if(typeof nrV2PreparePhoto==="function")file=await nrV2PreparePhoto(file);
            await setExpiryEvidencePhoto(role,file);
            renderExpiryEvidence();
            setExpiryStatus('action',ExpiryCaptureEngine.reviewPhotos.product && ExpiryCaptureEngine.reviewPhotos.expiry?'REVIEW PHOTOS — SAVE & NEXT':'TAKE EXPIRY PHOTO');
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
    if(device && device!==expiryDeviceId())throw new Error("Draft belongs to another device");
    // An acknowledged or uncertain write is checked read-only, never replayed.
    if(draft.operation?.payload){
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
    entries=entries.filter(({draft})=>draft.scope===scope && (!draft.deviceId || draft.deviceId===expiryDeviceId()));
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
