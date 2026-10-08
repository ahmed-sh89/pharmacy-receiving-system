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

async function renderExpiryRecoverableDrafts(){
    const panel=document.getElementById('expiryRecoverableDrafts');if(!panel || !ExpiryDraftStore.list)return;
    panel.replaceChildren();panel.hidden=true;
    const scope=expiryDraftScope(),entries=await ExpiryDraftStore.list(scope);
    if(scope!==expiryDraftScope() || ExpiryCaptureEngine.currentItem)return;
    for(const {key,draft} of entries){
        const button=document.createElement('button');button.type='button';
        button.textContent=`Recover ${draft.item.identifierDisplay} • ${draft.status}`;
        button.addEventListener('click',async()=>{
            if(scope!==expiryDraftScope() || ExpiryCaptureEngine.currentItem || ExpiryCaptureEngine.busy)return;
            if(typeof navigator==='undefined' || !navigator.locks){setExpiryStatus('error','CROSS-TAB RECOVERY REQUIRES WEB LOCKS — DRAFT RETAINED');return;}
            ExpiryCaptureEngine.busy=true;
            try{await claimExpiryOperation(draft.operation?.id);await ExpiryDraftStore.recover(scope,key);await restoreExpiryDraft();panel.hidden=true;}
            catch(error){setExpiryStatus('error','DRAFT RECOVERY FAILED — CAPTURE RETAINED');}
            finally{ExpiryCaptureEngine.busy=false;renderExpiryEvidence();}
        });panel.appendChild(button);panel.hidden=false;
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
