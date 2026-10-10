
"use strict";

/* ============================================================
   PHARMFLOW 2C.10.4.9 — NEEDS REVIEW SUBSYSTEM V2
   Fresh subsystem. No dependency on legacy V1 queue semantics.
============================================================ */

const NeedsReviewV2 = {
    bucket:"pharmflow-needs-review",
    photoUrls:new Map()
};

/* Expiry review has its own server-owned contract. The Receiving queue keeps
   its existing RPCs and is intentionally not reused for Expiry writes. */
const ExpiryReviewBackend = {
    ready:false,
    pendingCount:null,
    version:'EXPIRY_NEEDS_REVIEW_20261010_V2',
    async refresh(){
        const pharmacyId=nrV2PharmacyId();
        this.ready=false;this.pendingCount=null;
        const button=document.getElementById('btnExpiryNeedsReview');
        if(button){button.disabled=true;button.setAttribute('aria-disabled','true');}
        if(!pharmacyId||typeof authRpc!=='function'){if(typeof renderExpiryEvidence==='function')renderExpiryEvidence();return false;}
        try{
            const contract=await authRpc('get_pharmflow_expiry_review_contract_v1',{p_pharmacy_id:pharmacyId});
            const marker=Array.isArray(contract)?contract[0]?.contract_version:contract?.contract_version;
            if(marker!==this.version)throw new Error('Expiry review migration is not verified');
            const count=await authRpc('count_pharmflow_expiry_reviews_v1',{p_pharmacy_id:pharmacyId});
            const row=Array.isArray(count)?count[0]:count;
            const value=Number(row?.pending_count??row);
            if(!Number.isInteger(value)||value<0)throw new Error('Invalid Expiry review count');
            this.pendingCount=value;this.ready=true;
            const badge=document.getElementById('expiryNeedsReviewCount');
            if(badge){badge.textContent=String(value);badge.hidden=value===0;}
            if(button){button.disabled=false;button.setAttribute('aria-disabled','false');button.title='Open pharmacy Expiry cases pending item review';}
            if(typeof renderExpiryEvidence==='function')renderExpiryEvidence();
            return true;
        }catch(_error){
            if(typeof renderExpiryEvidence==='function')renderExpiryEvidence();
            return false;
        }
    },
    async list(){
        if(!this.ready&&!await this.refresh())throw new Error('Expiry Needs Review is unavailable until the approved Staging migration is applied and verified');
        const all=[];let offset=0;
        for(;;){
            const rows=await authRpc('list_pharmflow_expiry_reviews_v1',{p_pharmacy_id:nrV2PharmacyId(),p_status:'PENDING',p_limit:250,p_offset:offset});
            if(!Array.isArray(rows))throw new Error('Expiry review reader returned an invalid response');
            all.push(...rows);if(rows.length<250)return all;offset+=rows.length;
        }
    },
    async refreshAfterTerminal(decrement){
        const previous=this.pendingCount;
        const refreshed=await this.refresh();
        if(!refreshed&&decrement&&Number.isInteger(previous)){
            this.pendingCount=Math.max(0,previous-1);
            const badge=document.getElementById('expiryNeedsReviewCount');
            if(badge){badge.textContent=String(this.pendingCount);badge.hidden=this.pendingCount===0;}
        }
        return refreshed;
    },
    async resolve(reviewId,item,reason='Authorized Expiry review resolution'){
        if(!this.ready&&!await this.refresh())throw new Error('Expiry Needs Review is unavailable until the approved Staging migration is applied and verified');
        if(!globalThis.crypto?.randomUUID)throw new Error('Secure resolution operation IDs are unavailable');
        const result=await authRpc('resolve_pharmflow_expiry_review_v1',{
            p_pharmacy_id:nrV2PharmacyId(),p_review_id:reviewId,p_operation_id:globalThis.crypto.randomUUID(),
            p_item_code:item?.itemCode||'',p_reason:reason
        });
        const row=Array.isArray(result)?result[0]:result;
        if(!row?.success||row.review_id!==reviewId||row.item_code!==item?.itemCode)throw new Error('Expiry resolution was not acknowledged');
        await this.refreshAfterTerminal(!row.already_resolved);
        return row;
    },
    async delete(reviewId){
        if(!this.ready&&!await this.refresh())throw new Error('Expiry Needs Review is unavailable until its Staging contract is verified');
        let result;
        try{result=await authRpc('delete_pharmflow_expiry_review_v1',{p_pharmacy_id:nrV2PharmacyId(),p_review_id:reviewId});}
        catch(error){
            const message=String(error?.message||'').toLowerCase();
            if(error?.httpStatus===404||message.includes('could not find the function')||message.includes('schema cache'))throw new Error('Case deletion is unavailable until the separately approved Staging migration is applied');
            throw error;
        }
        const row=Array.isArray(result)?result[0]:result;
        if(!row?.success||row.review_id!==reviewId||row.status!=='DELETED')throw new Error('Expiry review deletion was not acknowledged');
        await this.refreshAfterTerminal(!row.already_deleted);
        return row;
    }
};
window.ExpiryReviewBackend=ExpiryReviewBackend;
function nrV2ReleasePhotoObjectUrl(photoPath){
    const cached=NeedsReviewV2.photoUrls.get(photoPath);
    if(cached){try{URL.revokeObjectURL(cached);}catch(_){}NeedsReviewV2.photoUrls.delete(photoPath);}
}
window.nrV2ReleasePhotoObjectUrl=nrV2ReleasePhotoObjectUrl;
if(typeof AppEvents!=="undefined"&&AppEvents?.on){
    AppEvents.on('auth:context',()=>setTimeout(()=>ExpiryReviewBackend.refresh(),0));
    AppEvents.on('route:changed',payload=>{if(payload?.routeName==='expiry')setTimeout(()=>ExpiryReviewBackend.refresh(),0);});
}
document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>ExpiryReviewBackend.refresh(),0));

function nrV2PharmacyId(){
    return (
        (typeof getCurrentPharmacyId==="function" && getCurrentPharmacyId()) ||
        AuthState?.context?.pharmacy_id ||
        AuthState?.profile?.pharmacy_id ||
        AuthState?.pharmacyId ||
        null
    );
}

function nrV2CurrentOrderNumber(){
    const selected =
        typeof getSelectedReceivingOrderNumbers==="function"
            ? getSelectedReceivingOrderNumbers()
            : [];

    if(selected.length===1){
        return normalizeOrderNumber(selected[0]);
    }

    const sessionOrder =
        normalizeOrderNumber(
            AppState?.session?.orderNumber ||
            AppState?.workspace?.selectedOrderNumber ||
            AppState?.workspace?.orderId ||
            ""
        );

    if(sessionOrder && sessionOrder!=="ALL"){
        return sessionOrder;
    }

    const files=Array.isArray(AppState?.workspace?.orderFiles)
        ? AppState.workspace.orderFiles
        : [];

    const orders=[
        ...new Set(
            files
                .map(file=>normalizeOrderNumber(file?.documentId||file?.orderNumber||""))
                .filter(Boolean)
        )
    ];

    return orders.length===1 ? orders[0] : "";
}

async function nrV2CreateDraft(parsed,options={}){
    const pharmacyId=nrV2PharmacyId();
    if(!pharmacyId || typeof authRpc!=="function"){
        throw new Error("Needs Review cloud queue is unavailable");
    }

    const capturedCode=toSafeString(parsed?.identifierDisplay||parsed?.gtin||parsed?.raw||parsed?.original||"");
    if(!capturedCode){
        throw new Error("Scanned code could not be captured");
    }

    const selectedOrders=typeof getSelectedReceivingOrderNumbers==="function"
        ? [...new Set(getSelectedReceivingOrderNumbers().map(normalizeOrderNumber).filter(Boolean))]
        : [];
    const explicitOrder=normalizeOrderNumber(options.orderNumber||"");
    const originalOrder=explicitOrder || (selectedOrders.length===1 ? selectedOrders[0] : "");
    const workScope=[...new Set((options.workScopeOrderNumbers||selectedOrders).map(normalizeOrderNumber).filter(Boolean))];
    if(originalOrder&&!workScope.includes(originalOrder)) workScope.push(originalOrder);
    if((options.workflow||"RECEIVING")==="RECEIVING"&&!workScope.length){
        throw new Error("Select a Receiving Order on this device before saving this scan for review.");
    }

    const result=await authRpc("create_pharmflow_needs_review_v4",{
        p_pharmacy_id:pharmacyId,
        p_workflow:options.workflow||"RECEIVING",
        p_identifier_display:capturedCode,
        p_raw_barcode:toSafeString(parsed?.raw||parsed?.original||capturedCode),
        p_session_id:toSafeString(AppState?.session?.id||""),
        p_order_number:originalOrder,
        p_order_name:toSafeString(AppState?.workspace?.orderName||""),
        p_review_reason:options.reason||"UNKNOWN_GTIN",
        p_master_item_code_hint:options.itemCode||null,
        p_master_item_name_hint:options.itemName||null,
        p_source:(typeof isLikelyZebraDevice==="function"&&isLikelyZebraDevice())?"HANDHELD":"PC",
        p_device_id:typeof ensureDeviceId==="function"?ensureDeviceId():"",
        p_work_scope_order_numbers:workScope
    });

    return Array.isArray(result) ? result[0] : result;
}

async function nrV2SetQty(reviewId,quantity){
    const pharmacyId=nrV2PharmacyId();
    const qty=Math.max(1,Number(quantity||1)||1);
    const result=await authRpc("set_pharmflow_needs_review_qty_v2",{
        p_pharmacy_id:pharmacyId,
        p_review_id:reviewId,
        p_pending_quantity:qty
    });
    return Array.isArray(result) ? result[0] : result;
}

async function nrV2Count(workflow="RECEIVING"){
    const pharmacyId=nrV2PharmacyId();
    if(!pharmacyId || typeof authRpc!=="function") return 0;
    const result=await authRpc("count_pharmflow_needs_review_v2",{
        p_pharmacy_id:pharmacyId,
        p_workflow:workflow
    });
    if(Array.isArray(result)) return Number(result[0]?.pending_count||result[0]||0)||0;
    if(result && typeof result==="object") return Number(result.pending_count||0)||0;
    return Number(result||0)||0;
}

async function nrV2List(workflow="RECEIVING",orderNumber=null){
    const pharmacyId=nrV2PharmacyId();
    if(!pharmacyId || typeof authRpc!=="function") return [];

    const rows=await authRpc("list_pharmflow_needs_review_v4",{
        p_pharmacy_id:pharmacyId,
        p_workflow:workflow,
        p_order_number:orderNumber||null
    });

    return Array.isArray(rows) ? rows : [];
}

async function nrV3ListHistory(workflow="RECEIVING",orderNumber=null){
    const pharmacyId=nrV2PharmacyId();
    if(!pharmacyId||typeof authRpc!=="function") return [];
    try{
        const rows=await authRpc("list_pharmflow_needs_review_history_v3",{p_pharmacy_id:pharmacyId,p_workflow:workflow,p_order_number:orderNumber||null});
        return Array.isArray(rows)?rows:[];
    }catch(error){
        const message=String(error?.message||error||"").toLowerCase();
        if(message.includes("could not find the function")||message.includes("schema cache")||message.includes("does not exist")) return await nrV2List(workflow,orderNumber);
        throw error;
    }
}
window.nrV3ListHistory=nrV3ListHistory;


async function nrV2AssignOrder(reviewId,orderNumber){
    const pharmacyId=nrV2PharmacyId();
    return authRpc("assign_pharmflow_needs_review_order_v1",{
        p_pharmacy_id:pharmacyId,p_review_id:reviewId,p_order_number:normalizeOrderNumber(orderNumber)
    });
}

async function nrV2RequestResolution(row,item,transactionId,allocations=null){
    if(!globalThis.crypto?.randomUUID){
        throw new Error("Secure operation IDs are unavailable; reload before resolving this review.");
    }
    const base={
        p_operation_id:globalThis.crypto.randomUUID(),
        p_pharmacy_id:nrV2PharmacyId(),
        p_review_id:row.review_id,
        p_item_code:item?.itemCode||"",
        p_item_name:item?.itemName||"",
        p_resolution_transaction_id:transactionId||""
    };
    if(Array.isArray(allocations)&&allocations.length){
        return authRpc("request_pharmflow_needs_review_resolution_v5",{
            ...base,
            p_allocations:allocations
        });
    }
    return authRpc("request_pharmflow_needs_review_resolution_v4",base);
}

async function nrV2Delete(reviewId){
    return authRpc("delete_pharmflow_needs_review_v2",{
        p_pharmacy_id:nrV2PharmacyId(),
        p_review_id:reviewId
    });
}

function nrV2PhotoExtension(file){
    const type=String(file?.type||"").toLowerCase();
    if(type==="image/png") return "png";
    if(type==="image/webp") return "webp";
    return "jpg";
}


async function nrV2LoadImageSource(file){
    if(typeof createImageBitmap==="function"){
        try{
            const bitmap=await createImageBitmap(file);
            return {
                width:bitmap.width,
                height:bitmap.height,
                draw(ctx,w,h){
                    ctx.drawImage(bitmap,0,0,w,h);
                },
                close(){
                    bitmap.close?.();
                }
            };
        }catch(_){}
    }

    /* Compatibility fallback for older enterprise Android browsers. */
    return await new Promise((resolve,reject)=>{
        const url=URL.createObjectURL(file);
        const image=new Image();

        image.onload=()=>{
            resolve({
                width:image.naturalWidth||image.width,
                height:image.naturalHeight||image.height,
                draw(ctx,w,h){
                    ctx.drawImage(image,0,0,w,h);
                },
                close(){
                    URL.revokeObjectURL(url);
                }
            });
        };

        image.onerror=()=>{
            URL.revokeObjectURL(url);
            reject(new Error("Unable to read camera photo"));
        };

        image.src=url;
    });
}

async function nrV2PreparePhoto(file){
    if(!file) return null;

    const allowed=["image/jpeg","image/png","image/webp"];
    if(!allowed.includes(String(file.type||"").toLowerCase())){
        throw new Error("Use a JPG, PNG, or WEBP photo.");
    }

    /*
       Worker UX rule:
       Camera file size is never the worker's problem.
       Normalize evidence photos to a practical review size before upload.
    */
    if(file.size<=1.5*1024*1024){
        return file;
    }

    const source=await nrV2LoadImageSource(file);

    try{
        const maxSide=1280;
        const scale=Math.min(
            1,
            maxSide/Math.max(source.width,source.height)
        );

        const canvas=document.createElement("canvas");
        canvas.width=Math.max(
            1,
            Math.round(source.width*scale)
        );
        canvas.height=Math.max(
            1,
            Math.round(source.height*scale)
        );

        const ctx=canvas.getContext("2d",{alpha:false});

        if(!ctx){
            throw new Error("Unable to prepare camera photo");
        }

        ctx.fillStyle="#ffffff";
        ctx.fillRect(0,0,canvas.width,canvas.height);
        source.draw(ctx,canvas.width,canvas.height);

        let quality=.78;
        let blob=null;

        do{
            blob=await new Promise(resolve=>
                canvas.toBlob(
                    resolve,
                    "image/jpeg",
                    quality
                )
            );

            quality-=.08;

        }while(
            blob &&
            blob.size>1.5*1024*1024 &&
            quality>=.42
        );

        if(!blob){
            throw new Error("Unable to compress camera photo");
        }

        /*
           5 MB remains only the server safety ceiling.
           A typical prepared image should be well below it.
        */
        if(blob.size>5*1024*1024){
            throw new Error("Unable to prepare camera photo");
        }

        return new File(
            [blob],
            "review-photo.jpg",
            {
                type:"image/jpeg",
                lastModified:Date.now()
            }
        );

    }finally{
        source.close?.();
    }
}

async function nrV2UploadPhoto(reviewId,file){
    file=await nrV2PreparePhoto(file);
    if(!file) return null;

    if(file.size>5*1024*1024){
        throw new Error("Photo is too large. Maximum 5 MB.");
    }

    const allowed=["image/jpeg","image/png","image/webp"];
    if(!allowed.includes(String(file.type||"").toLowerCase())){
        throw new Error("Use a JPG, PNG, or WEBP photo.");
    }

    const pharmacyId=nrV2PharmacyId();
    const token=getSupabaseAccessToken?.();
    if(!pharmacyId || !token){
        throw new Error("Please sign in before uploading a photo");
    }

    const ext=nrV2PhotoExtension(file);
    const path=`${pharmacyId}/${reviewId}/${Date.now()}.${ext}`;
    const url=
        getSupabaseProjectUrl()+
        "/storage/v1/object/"+
        encodeURIComponent(NeedsReviewV2.bucket)+
        "/"+
        path.split("/").map(encodeURIComponent).join("/");

    const response=await fetch(url,{
        method:"POST",
        headers:{
            "apikey":getSupabasePublishableKey(),
            "Authorization":"Bearer "+token,
            "Content-Type":file.type,
            "x-upsert":"true"
        },
        body:file
    });

    const text=await response.text();
    if(!response.ok){
        let message=text;
        try{
            const data=JSON.parse(text);
            message=data?.message||data?.error||text;
        }catch(_){}
        throw new Error(message||"Unable to upload product photo");
    }

    await authRpc("set_pharmflow_needs_review_photo_v2",{
        p_pharmacy_id:pharmacyId,
        p_review_id:reviewId,
        p_photo_path:path
    });

    return path;
}

async function nrV2PhotoObjectUrl(photoPath){
    if(!photoPath) return null;
    if(NeedsReviewV2.photoUrls.has(photoPath)){
        return NeedsReviewV2.photoUrls.get(photoPath);
    }

    const token=getSupabaseAccessToken?.();
    if(!token) return null;

    const url=
        getSupabaseProjectUrl()+
        "/storage/v1/object/authenticated/"+
        encodeURIComponent(NeedsReviewV2.bucket)+
        "/"+
        photoPath.split("/").map(encodeURIComponent).join("/");

    const response=await fetch(url,{
        headers:{
            "apikey":getSupabasePublishableKey(),
            "Authorization":"Bearer "+token
        }
    });

    if(!response.ok) return null;

    const blob=await response.blob();
    const objectUrl=URL.createObjectURL(blob);
    NeedsReviewV2.photoUrls.set(photoPath,objectUrl);
    return objectUrl;
}


async function nrV2DeletePhoto(photoPath){
    if(!photoPath) return true;
    const pharmacyId=nrV2PharmacyId();
    const token=getSupabaseAccessToken?.();
    if(!pharmacyId || !token) return false;
    const url=getSupabaseProjectUrl()+"/storage/v1/object/"+encodeURIComponent(NeedsReviewV2.bucket)+"/"+photoPath.split("/").map(encodeURIComponent).join("/");
    const response=await fetch(url,{method:"DELETE",headers:{"apikey":getSupabasePublishableKey(),"Authorization":"Bearer "+token}});
    if(response.ok || response.status===404){
        const cached=NeedsReviewV2.photoUrls.get(photoPath);
        if(cached) URL.revokeObjectURL(cached);
        NeedsReviewV2.photoUrls.delete(photoPath);
        return true;
    }
    return false;
}

async function nrV2ClearReceivingQueue(){
    const pharmacyId=nrV2PharmacyId();
    if(!pharmacyId || typeof authRpc!=="function") return false;

    /* Storage objects MUST be deleted through Storage API, never SQL tables. */
    let rows=[];
    try{ rows=await nrV2List("RECEIVING",null); }catch(_){ rows=[]; }
    const paths=[...new Set(rows.map(row=>row?.photo_path).filter(Boolean))];
    for(const path of paths){
        try{ await nrV2DeletePhoto(path); }catch(error){
            console.warn("Review photo cleanup failed",path,error);
        }
    }

    const result=await authRpc("clear_pharmflow_receiving_needs_review_v3",{
        p_pharmacy_id:pharmacyId
    });
    for(const url of NeedsReviewV2.photoUrls.values()){ try{ URL.revokeObjectURL(url); }catch(_){} }
    NeedsReviewV2.photoUrls.clear();
    return result;
}
function nrV2ResolutionTransactionId(reviewId){
    return "NEEDS_REVIEW_V2:"+String(reviewId||"");
}

function nrV2HasLocalResolutionTransaction(reviewId){
    const transactionId=nrV2ResolutionTransactionId(reviewId);
    return !!AppState?.indexes?.transactionIds?.has(transactionId);
}

window.NeedsReviewV2=NeedsReviewV2;
window.nrV2CreateDraft=nrV2CreateDraft;
window.nrV2SetQty=nrV2SetQty;
window.nrV2List=nrV2List;
window.nrV2AssignOrder=nrV2AssignOrder;
window.nrV2RequestResolution=nrV2RequestResolution;
window.nrV2Delete=nrV2Delete;
window.nrV2UploadPhoto=nrV2UploadPhoto;
window.nrV2PhotoObjectUrl=nrV2PhotoObjectUrl;
window.nrV2DeletePhoto=nrV2DeletePhoto;
window.nrV2ClearReceivingQueue=nrV2ClearReceivingQueue;
window.nrV2ResolutionTransactionId=nrV2ResolutionTransactionId;
window.nrV2HasLocalResolutionTransaction=nrV2HasLocalResolutionTransaction;
window.nrV2CurrentOrderNumber=nrV2CurrentOrderNumber;


/* ============================================================
   PHASE 2C.10.5.5 — OPERATION RECEIPT + MEDIA LIFECYCLE
============================================================ */
function showPharmFlowOperationReceipt(message,type="success"){
    let receipt=document.getElementById("pharmFlowOperationReceipt");
    if(!receipt){
        receipt=document.createElement("div");
        receipt.id="pharmFlowOperationReceipt";
        receipt.setAttribute("role","status");
        receipt.setAttribute("aria-live","assertive");
        document.body.appendChild(receipt);
    }
    receipt.className="pharmFlowOperationReceipt "+(type==="error"?"error":"success");
    receipt.textContent=toSafeString(message||"");
    receipt.hidden=false;
    clearTimeout(window.__pfOperationReceiptTimer);
    window.__pfOperationReceiptTimer=setTimeout(()=>{
        if(receipt?.isConnected) receipt.hidden=true;
    },12000);
}

async function nrV2DeleteResolvedPhoto(photoPath){
    if(!photoPath) return true;
    return await nrV2DeletePhoto(photoPath);
}

window.showPharmFlowOperationReceipt=showPharmFlowOperationReceipt;
window.nrV2DeleteResolvedPhoto=nrV2DeleteResolvedPhoto;

window.nrV2Count=nrV2Count;
