
"use strict";

/* ============================================================
   PHARMFLOW 2C.10.4.9 — NEEDS REVIEW SUBSYSTEM V2
   Fresh subsystem. No dependency on legacy V1 queue semantics.
============================================================ */

const NeedsReviewV2 = {
    bucket:"pharmflow-needs-review",
    photoUrls:new Map()
};

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

    const gtin=normalizeGTIN(parsed?.gtin||"");
    if(!gtin){
        throw new Error("GTIN could not be captured");
    }

    const result=await authRpc("create_pharmflow_needs_review_v2",{
        p_pharmacy_id:pharmacyId,
        p_workflow:options.workflow||"RECEIVING",
        p_gtin:gtin,
        p_raw_barcode:toSafeString(parsed?.raw||parsed?.original||parsed?.gtin||""),
        p_session_id:toSafeString(AppState?.session?.id||""),
        p_order_number:options.orderNumber||nrV2CurrentOrderNumber()||null,
        p_order_name:toSafeString(AppState?.workspace?.orderName||""),
        p_review_reason:options.reason||"UNKNOWN_GTIN",
        p_master_item_code_hint:options.itemCode||null,
        p_master_item_name_hint:options.itemName||null,
        p_source:(typeof isLikelyZebraDevice==="function"&&isLikelyZebraDevice())?"HANDHELD":"PC",
        p_device_id:typeof ensureDeviceId==="function"?ensureDeviceId():""
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

async function nrV2List(workflow="RECEIVING",orderNumber=null){
    const pharmacyId=nrV2PharmacyId();
    if(!pharmacyId || typeof authRpc!=="function") return [];

    const rows=await authRpc("list_pharmflow_needs_review_v2",{
        p_pharmacy_id:pharmacyId,
        p_workflow:workflow,
        p_order_number:orderNumber||null
    });

    return Array.isArray(rows) ? rows : [];
}

async function nrV2MarkResolved(row,item,resolutionType,transactionId){
    return authRpc("resolve_pharmflow_needs_review_v2",{
        p_pharmacy_id:nrV2PharmacyId(),
        p_review_id:row.review_id,
        p_item_code:item?.itemCode||"",
        p_item_name:item?.itemName||"",
        p_resolution_type:resolutionType,
        p_resolution_transaction_id:transactionId||""
    });
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
window.nrV2MarkResolved=nrV2MarkResolved;
window.nrV2Delete=nrV2Delete;
window.nrV2UploadPhoto=nrV2UploadPhoto;
window.nrV2PhotoObjectUrl=nrV2PhotoObjectUrl;
window.nrV2ResolutionTransactionId=nrV2ResolutionTransactionId;
window.nrV2HasLocalResolutionTransaction=nrV2HasLocalResolutionTransaction;
window.nrV2CurrentOrderNumber=nrV2CurrentOrderNumber;
