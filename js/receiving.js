"use strict";

/* =====================================================
   PHARMACY RECEIVING SYSTEM V3
   RECEIVING + MANUAL QUANTITY ENGINE
===================================================== */

const ReceivingEngine = {

    initialized:false,

    lastTransaction:null,

    recentScans:[],

    /*
       2C.11.4.1
       Current Batch Qty = the consecutive run of the CURRENT item on THIS
       device. Switching to another item closes that batch. Returning to the
       previous item starts again from 1.
    */
    currentLocalBatch:{
        itemCode:"",
        quantity:0
    },

    adjustmentSources:{

        search:
            "SEARCH",

        manual:
            "MANUAL",

        increase:
            "MANUAL_INCREASE",

        decrease:
            "MANUAL_DECREASE",

        editIncrease:
            "MANUAL_EDIT_INCREASE",

        editDecrease:
            "MANUAL_EDIT_DECREASE"

    }

};


/* =====================================================
   INITIALIZE
===================================================== */

function initializeReceiving(){

    if(ReceivingEngine.initialized){
        return;
    }

    ReceivingEngine.initialized =
        true;

    const corrections =
        reconcileReceivedQuantitiesFromHistory({
            silent:true
        });

    if(corrections > 0){

        Logger.warn(
            "Receiving quantities reconciled from transaction history",
            corrections
        );

    }

    Logger.info(
        "Receiving module initialized"
    );

}


/* =====================================================
   RECEIVE PARSED BARCODE
===================================================== */

async function receiveParsedBarcode(parsed,queueOptions={}){
    if(!parsed||!parsed.gtin){
        handleReceivingFailure("Barcode could not be identified");
        return false;
    }

    if(AppState.workspace.orderData.length===0){
        handleReceivingFailure("Load an order before receiving");
        return false;
    }

    const identifierDisplay=toSafeString(parsed.identifierDisplay||parsed.gtin||parsed.raw||parsed.original||"");
    const gtin=normalizeIdentifier(identifierDisplay);
    if(!gtin){
        handleReceivingFailure("Barcode could not be identified");
        return false;
    }

    /* Identity resolution is server-authoritative. Workspace data determines
       only whether that already-resolved Item Code is in this device scope. */
    let masterRecord;
    try{ masterRecord=await IdentifierService.resolve(identifierDisplay); }
    catch(error){ handleReceivingFailure(error?.message||"Unable to resolve identifier"); return false; }

    const current=masterRecord?.found ? {
        item:getReceivingItemByItemCode(masterRecord.itemCode),
        itemCode:normalizeItemCode(masterRecord.itemCode),
        source:masterRecord.source||"GLOBAL_V2"
    } : null;

    if(current?.item){
        if(isKnownItemOutsideHandheldScope(current.item)){
            return showKnownItemOutsideHandheldScope(current.item);
        }

        return receiveOrderItem({
            item:current.item,
            quantity:getValidReceivingQuantity(parsed.quantity),
            transactionId:queueOptions.transactionId||null,
            gtin:identifierDisplay,
            lot:parsed.lot,
            expiry:parsed.expiry,
            serial:parsed.serial,
            source:APP_CONFIG.transactionSources.scanner,
            manual:false,
            identifierPreserveExact:masterRecord?.found===true,
            gtinResolution:masterRecord?.source==="PHARMACY_V2" ? {
                kind:"PHARMACY_LEARNED",
                mappingId:masterRecord.identifierId,
                mappingRevision:masterRecord.mappingRevision,
                identifierDisplay:masterRecord.identifierDisplay,
                identifierKey:masterRecord.identifierKey,
                resolvedItemCode:masterRecord.itemCode
            } : null
        });
    }

    return await quickResolveUnrecognizedGTIN({...parsed,gtin:identifierDisplay},masterRecord?.found?{...masterRecord,source:"GLOBAL_V2"}:null);
}

/* =====================================================
   PHASE 2C.6.1 - QUICK RESOLVE + SAFE PHARMACY LEARNING
===================================================== */

/* ============================================================
   PHASE 2C.10.4.9 — FRESH HANDHELD GTIN CLASSIFICATION FLOW
============================================================ */

function clearHandheldActionCard(){
    document.getElementById("handheldReceivingReviewCard")?.remove();
    document.getElementById("handheldKnownExtraCard")?.remove();
    document.body.classList.remove("handheldActionCardActive");
    window.__pfReceivingReviewDraft=null;
}

function flashHandheldRed(){
    document.body.classList.remove("handheldUnknownGTINFlash");
    void document.body.offsetWidth;
    document.body.classList.add("handheldUnknownGTINFlash");
    setTimeout(()=>document.body.classList.remove("handheldUnknownGTINFlash"),650);
}


function getReceivingItemByItemCode(itemCode){
    const code=normalizeItemCode(itemCode||"");
    if(!code) return null;

    const selected=
        typeof getSelectedReceivingOrderNumbers==="function"
            ? getSelectedReceivingOrderNumbers()
            : [];

    const matches=(AppState?.workspace?.orderData||[]).filter(
        item=>normalizeItemCode(item?.itemCode||"")===code
    );

    if(!matches.length) return null;
    if(!selected.length) return matches[0];

    return matches.find(item=>{
        const memberships=(item?.orderNumbers||[item?.orderNumber])
            .map(normalizeOrderNumber)
            .filter(Boolean);
        return memberships.some(order=>selected.includes(order));
    })||null;
}

/* A Handheld can identify an item from the shared Active Orders workspace
   while that item belongs only to an order assigned elsewhere. Keep this
   separate from an unknown GTIN and from an unordered extra: it must never
   alter quantities or invite the worker to add the item. */
function isKnownItemOutsideHandheldScope(item){
    const isHandheld=
        typeof isLikelyZebraDevice==="function" &&
        isLikelyZebraDevice();

    return Boolean(isHandheld && item && getReceivingEligibleOrders(item).length===0);
}

function showKnownItemOutsideHandheldScope(item){
    const memberships=[...new Set((item?.orderNumbers||[item?.orderNumber])
        .map(normalizeOrderNumber)
        .filter(Boolean))];
    const orderLabel=memberships.length ? memberships.join(", ") : "another active order";

    setScanBoxState?.("action");
    Logger.warn("Known item scanned outside Handheld assignment",item?.itemCode,memberships);
    showToast?.(
        `ITEM IN ANOTHER ACTIVE ORDER (${orderLabel}) — NOT ASSIGNED TO THIS HANDHELD`,
        "warning"
    );
    focusScannerInput?.();
    return false;
}

function getReceivingEligibleOrders(item){
    const selected=typeof getSelectedReceivingOrderNumbers==="function"
        ? getSelectedReceivingOrderNumbers()
        : [];
    const memberships=[...new Set((item?.orderNumbers||[item?.orderNumber])
        .map(normalizeOrderNumber).filter(Boolean))];

    /* 2C.11.0: Active Order Manifest is shared directly by PC and Handheld,
       including per-item order membership. No session snapshot fallback and no
       synthetic order sentinel are allowed in the authoritative path. */
    if(!memberships.length) return [];
    if(!selected.length) return memberships;
    return memberships.filter(order=>selected.includes(order));
}

function getReceivingOrderRow(item,orderNumber){
    if(!item || !orderNumber || typeof getPerOrderReceivingRows!=="function") return null;
    return getPerOrderReceivingRows(orderNumber).find(
        row=>normalizeItemCode(row?.["Item Number"]||"")===normalizeItemCode(item.itemCode||"")
    )||null;
}

function chooseDeterministicReceivingOrder(item){
    const eligible=getReceivingEligibleOrders(item);
    if(!eligible.length) return "";
    if(eligible.length===1) return eligible[0];

    for(const order of eligible){
        const row=getReceivingOrderRow(item,order);
        if(row && toNumber(row["Received Qty"],0)<toNumber(row["Ordered Qty"],0)) return order;
    }
    return eligible[0];
}

function getReceivingDisplayMetrics(item,orderNumber){
    const row=getReceivingOrderRow(item,orderNumber);
    if(!row) return null;
    const ordered=toNumber(row["Ordered Qty"],0);
    const received=toNumber(row["Received Qty"],0);
    return {orderedQty:ordered,receivedQty:received,remainingQty:Math.max(0,ordered-received)};
}

function getReceivingAutoAllocationCandidates(item,workScopeOrderNumbers=null){
    const captured=Array.isArray(workScopeOrderNumbers)
        ? [...new Set(workScopeOrderNumbers.map(normalizeOrderNumber).filter(Boolean))]
        : getReceivingEligibleOrders(item);
    const memberships=[...new Set((item?.orderNumbers||[item?.orderNumber]).map(normalizeOrderNumber).filter(Boolean))];
    return captured.filter(order=>memberships.includes(order)&&getReceivingOrderRow(item,order));
}

function buildReceivingAutoAllocationPlan(item,quantity,workScopeOrderNumbers=null,remainingState=null){
    let left=getValidReceivingQuantity(quantity);
    const candidates=getReceivingAutoAllocationCandidates(item,workScopeOrderNumbers);
    if(!candidates.length) throw new Error("Item not found in active Orders.");
    const plan=[];
    for(const order of candidates){
        if(left<=0) break;
        const row=getReceivingOrderRow(item,order);
        const key=normalizeOrderNumber(order);
        const currentRemaining=remainingState?.has(key)
            ? Math.max(0,toNumber(remainingState.get(key),0))
            : Math.max(0,toNumber(row?.["Remaining Qty"],toNumber(row?.["Ordered Qty"],0)-toNumber(row?.["Received Qty"],0)));
        const take=Math.min(left,currentRemaining);
        if(take>0){
            plan.push({orderNumber:key,quantity:take});
            left-=take;
            remainingState?.set(key,currentRemaining-take);
        }
    }
    if(left>0){
        if(AppState?.settings?.allowOverReceiving!==true){
            throw new Error("Quantity exceeds the remaining quantity in active Orders.");
        }
        const overflowOrder=normalizeOrderNumber(candidates[candidates.length-1]);
        const existing=plan.find(row=>row.orderNumber===overflowOrder);
        if(existing) existing.quantity+=left;
        else plan.push({orderNumber:overflowOrder,quantity:left});
        left=0;
    }
    return plan;
}

function receiveAutoAllocatedItem(options){
    if(!options?.item) throw new Error("Invalid receiving item");
    const plan=Array.isArray(options.plan)&&options.plan.length
        ? options.plan
        : buildReceivingAutoAllocationPlan(options.item,options.quantity,options.workScopeOrderNumbers);
    const baseId=toSafeString(options.transactionId||createTransactionId());
    const transactions=[];
    for(let index=0;index<plan.length;index++){
        const allocation=plan[index];
        const tx=receiveOrderItem({
            item:options.item,
            quantity:allocation.quantity,
            gtin:options.gtin||"",
            lot:options.lot||"",
            expiry:options.expiry||"",
            serial:options.serial||"",
            source:options.source||APP_CONFIG.transactionSources.scanner,
            manual:options.manual===true,
            targetOrder:allocation.orderNumber,
            transactionId:plan.length===1?baseId:`${baseId}:A${index+1}`,
            identifierPreserveExact:options.identifierPreserveExact===true,
            gtinResolution:options.gtinResolution||null
        });
        if(!tx) throw new Error("Unable to record allocated receiving transaction");
        transactions.push(tx);
    }
    return transactions;
}

function getManualExtraTargetOrder(){
    const selected=
        typeof getSelectedReceivingOrderNumbers==="function"
            ? getSelectedReceivingOrderNumbers()
            : [];

    if(selected.length===1){
        return normalizeOrderNumber(selected[0]);
    }

    const current=
        typeof nrV2CurrentOrderNumber==="function"
            ? nrV2CurrentOrderNumber()
            : "";

    if(current){
        return normalizeOrderNumber(current);
    }

    throw new Error(
        "Select one target Order before adding an unordered item."
    );
}

function prepareManualExtraItem(itemCode,itemName,gtin,targetOrderOverride=""){
    const targetOrder=
        normalizeOrderNumber(targetOrderOverride||"")
        ||
        getManualExtraTargetOrder();

    let item=upsertOrderItem({
        itemCode,
        itemName,
        orderedQty:0,
        receivedQty:0,
        manual:true
    });

    if(!item){
        throw new Error("Unable to add unordered item");
    }

    item.manual=true;
    item.orderNumbers=[targetOrder];
    item.orderNumber=targetOrder;

    return item;
}

function renderKnownNotInOrderHandheld(parsed,masterRecord){
    clearHandheldActionCard();

    const lastScan=document.getElementById("lastScanCard");
    if(!lastScan) return false;

    const gtin=normalizeIdentifier(parsed?.identifierDisplay||parsed?.gtin||"");
    const code=normalizeItemCode(masterRecord?.itemCode||"");
    const name=toSafeString(masterRecord?.itemName||masterRecord?.name||code);
    const selectedOrders=
        typeof getSelectedReceivingOrderNumbers==="function"
            ? getSelectedReceivingOrderNumbers()
            : [];

    const needsPharmacistTarget=selectedOrders.length!==1;

    const card=document.createElement("section");
    card.id="handheldKnownExtraCard";
    card.className="handheldKnownExtraCard";
    card.innerHTML=`
      <div class="handheldKnownExtraStatus">KNOWN ITEM · NOT IN ORDER</div>
      <strong class="handheldKnownExtraName">${escapeHTML(name)}</strong>
      <div class="handheldKnownExtraMeta">
        <span>Item <b>${escapeHTML(code)}</b></span>
        <span>GTIN <b>${escapeHTML(gtin)}</b></span>
      </div>
      ${
        needsPharmacistTarget
        ? `<div class="handheldKnownExtraNote">
             Multiple Orders are selected. The pharmacist will choose the target Order on PC.
           </div>`
        : ""
      }
      <div class="handheldReviewQtyLabel">
        <span>PHYSICAL QTY</span>
        <div class="handheldReviewQtyStepper">
          <button type="button" data-qty-step="-1" aria-label="Decrease quantity">−</button>
          <input id="handheldKnownExtraQty" type="number" min="1" step="1" inputmode="numeric" value="1">
          <button type="button" data-qty-step="1" aria-label="Increase quantity">+</button>
        </div>
      </div>
      <button id="btnHandheldAddExtra" class="handheldReviewSave" type="button">
        ${needsPharmacistTarget ? "SAVE EXTRA FOR REVIEW" : "ADD EXTRA & NEXT"}
      </button>
      <button id="btnHandheldCancelExtra" class="handheldReviewCancel" type="button">
        CANCEL SCAN
      </button>
    `;

    /* Keep the exception card in the worker's immediate scan path, above
       Last Scan, while the compact one-screen layout hides Last Scan until
       the exception is saved or cancelled. */
    lastScan.insertAdjacentElement("beforebegin",card);
    document.body.classList.add("handheldActionCardActive");

    const qty=card.querySelector("#handheldKnownExtraQty");
    card.querySelectorAll("[data-qty-step]").forEach(button=>{
        button.addEventListener("click",()=>{
            const next=Math.max(1,(Number(qty?.value||1)||1)+Number(button.dataset.qtyStep||0));
            if(qty) qty.value=String(next);
        });
    });

    const submit=async()=>{
        const button=card.querySelector("#btnHandheldAddExtra");
        if(button) button.disabled=true;

        try{
            const quantity=Math.max(1,Number(qty?.value||1)||1);

            /*
               Multiple selected Orders:
               Do NOT force a warehouse worker to choose accounting/reporting
               ownership. Persist it to Needs Review and let the pharmacist
               choose the target Order on PC.
            */
            if(needsPharmacistTarget){
                const draft=await nrV2CreateDraft(parsed,{
                    workflow:"RECEIVING",
                    reason:"KNOWN_NOT_IN_ORDER",
                    itemCode:code,
                    itemName:name,
                    orderNumber:null
                });

                if(!draft?.review_id){
                    throw new Error("Unable to save extra item for review");
                }

                await nrV2SetQty(draft.review_id,quantity);
                refreshNeedsReviewCounters?.();

                card.querySelector(".handheldKnownExtraStatus").textContent=
                    "SAVED FOR REVIEW ✓";

                setTimeout(()=>{
                    clearHandheldActionCard();
                    setScanBoxState?.("ready");
                    focusScannerInput?.();
                },220);

                return true;
            }

            /*
               Exactly one selected Order:
               target is unambiguous, so Receiving can remain one-tap fast.
            */
            const targetOrder=normalizeOrderNumber(selectedOrders[0]);
            const item=prepareManualExtraItem(
                code,
                name,
                gtin,
                targetOrder
            );

            const transaction=receiveOrderItem({
                item,
                quantity,
                gtin,
                lot:parsed?.lot||"",
                expiry:parsed?.expiry||"",
                serial:parsed?.serial||"",
                source:APP_CONFIG.transactionSources.scanner,
                manual:true,
                targetOrder
            });

            if(!transaction){
                throw new Error("Unable to receive unordered item");
            }

            clearHandheldActionCard();
            setScanBoxState?.("ready");
            focusScannerInput?.();
            return true;

        }catch(error){
            if(button) button.disabled=false;
            setScanBoxState?.("error");
            showToast?.(
                error?.message||"Unable to process extra item",
                "error"
            );
            return false;
        }
    };

    qty?.addEventListener("keydown",e=>{
        if(e.key==="Enter"){
            e.preventDefault();
            try{ qty.blur(); }catch(_){}
        }
    });

    card.querySelector("#btnHandheldAddExtra")
        ?.addEventListener("click",submit);

    card.querySelector("#btnHandheldCancelExtra")
        ?.addEventListener("click",()=>{
            try{ document.activeElement?.blur?.(); }catch(_){}
            clearHandheldActionCard();
            setScanBoxState?.("ready");
            window.hhRefreshReadyState?.();
            setTimeout(()=>focusScannerInput?.(),40);
        });

    /* Qty defaults to 1. Keyboard appears only after the worker taps Qty. */
    try{ document.activeElement?.blur?.(); }catch(_){}

    return true;
}

async function renderUnknownGTINHandheld(parsed,options={}){
    clearHandheldActionCard();

    const scannedCode=toSafeString(parsed?.gtin||parsed?.raw||"");
    if(!scannedCode){
        handleReceivingFailure("Barcode could not be identified");
        return false;
    }
    const codeLabel=parsed?.capturedCode===true||options.reason==="UNSUPPORTED_BARCODE"
        ? "SCANNED CODE"
        : "GTIN";

    /* DATA SAFETY: the draft is saved BEFORE the worker sees quantity/photo.
       Therefore a rapid next scan can never discard this GTIN. */
    const draft=await nrV2CreateDraft(parsed,{
        workflow:"RECEIVING",
        reason:options.reason||"UNKNOWN_GTIN",
        itemCode:options.itemCode||"",
        itemName:options.itemName||"",
        orderNumber:nrV2CurrentOrderNumber?.()||null
    });

    if(!draft?.review_id){
        throw new Error("Needs Review draft was not created");
    }

    const lastScan=document.getElementById("lastScanCard");
    if(!lastScan) return false;

    const card=document.createElement("section");
    card.id="handheldReceivingReviewCard";
    card.className="handheldReceivingReviewCard urgent";
    card.innerHTML=`
        <div class="handheldReviewStatus">ITEM NOT RECOGNISED</div>
        <div class="handheldReviewBody">
          <div class="handheldUnknownGTIN">
          <span>${codeLabel}</span>
          <strong>${escapeHTML(scannedCode)}</strong>
          <small>${codeLabel==="GTIN"?"NOT FOUND IN GLOBAL GTIN MASTER":"NOT RECOGNISED — SENT TO NEEDS REVIEW"}</small>
        </div>

        <button id="btnHandheldReviewPhoto" class="handheldPhotoButton" type="button">
          📷 PHOTO <small>OPTIONAL</small>
        </button>
        <input id="handheldReviewPhotoInput" type="file" accept="image/*" capture="environment" hidden>

        <div class="handheldReviewQtyLabel">
          <span>PHYSICAL QTY</span>
          <div class="handheldReviewQtyStepper">
            <button type="button" data-qty-step="-1" aria-label="Decrease quantity">−</button>
            <input id="handheldReviewQty" type="number" min="1" step="1" inputmode="numeric" value="1">
            <button type="button" data-qty-step="1" aria-label="Increase quantity">+</button>
          </div>
        </div>

        <button id="btnSaveHandheldReview" class="handheldReviewSave" type="button">SAVE &amp; SEND TO NEEDS REVIEW</button>
        <button id="btnCancelHandheldReview" class="handheldReviewCancel" type="button">CANCEL SCAN</button>
      </div>
    `;

    lastScan.insertAdjacentElement("beforebegin",card);
    document.body.classList.add("handheldActionCardActive");
    flashHandheldRed();

    const photoButton=card.querySelector("#btnHandheldReviewPhoto");
    const photoInput=card.querySelector("#handheldReviewPhotoInput");
    const qty=card.querySelector("#handheldReviewQty");
    const saveButton=card.querySelector("#btnSaveHandheldReview");
    const cancelButton=card.querySelector("#btnCancelHandheldReview");
    card.querySelectorAll("[data-qty-step]").forEach(button=>{
        button.addEventListener("click",()=>{
            const next=Math.max(1,(Number(qty?.value||1)||1)+Number(button.dataset.qtyStep||0));
            if(qty) qty.value=String(next);
        });
    });
    let uploadedPhotoPath=null;

    photoButton?.addEventListener("click",()=>photoInput?.click());

    photoInput?.addEventListener("change",async()=>{
        const file=photoInput.files?.[0];
        if(!file) return;

        photoButton.disabled=true;
        photoButton.textContent="UPLOADING PHOTO…";

        try{
            uploadedPhotoPath=await nrV2UploadPhoto(draft.review_id,file);
            photoButton.textContent="✓ PHOTO ADDED";
            photoButton.classList.add("added");
        }catch(error){
            photoButton.disabled=false;
            photoButton.innerHTML='📷 PHOTO <small>OPTIONAL</small>';
            showToast?.(error?.message||"Unable to upload photo","error");
        }
    });

    const finish=async()=>{
        saveButton.disabled=true;

        try{
            const quantity=Math.max(1,Number(qty?.value||1)||1);
            await nrV2SetQty(draft.review_id,quantity);

            card.querySelector(".handheldReviewStatus").textContent="SAVED TO NEEDS REVIEW ✓";
            card.classList.remove("urgent");
            card.classList.add("saved");

            refreshNeedsReviewCounters?.();

            setTimeout(()=>{
                clearHandheldActionCard();
                setScanBoxState?.("ready");
                focusScannerInput?.();
            },250);

            return true;
        }catch(error){
            saveButton.disabled=false;
            setScanBoxState?.("error");
            showToast?.(error?.message||"Unable to save quantity","error");
            return false;
        }
    };

    qty?.addEventListener("keydown",event=>{
        if(event.key==="Enter"){
            event.preventDefault();
            try{ qty.blur(); }catch(_){}
        }
    });

    saveButton?.addEventListener("click",finish);

    cancelButton?.addEventListener("click",async()=>{
        if(cancelButton.disabled) return;
        cancelButton.disabled=true;
        if(saveButton) saveButton.disabled=true;
        try{ document.activeElement?.blur?.(); }catch(_){}

        try{
            if(uploadedPhotoPath && typeof nrV2DeletePhoto==="function"){
                try{ await nrV2DeletePhoto(uploadedPhotoPath); }catch(_){}
            }
            if(typeof nrV2Delete==="function"){
                await nrV2Delete(draft.review_id);
            }

            clearHandheldActionCard();
            refreshNeedsReviewCounters?.();
            setScanBoxState?.("ready");
            window.hhRefreshReadyState?.();
            setTimeout(()=>focusScannerInput?.(),40);
        }catch(error){
            cancelButton.disabled=false;
            if(saveButton) saveButton.disabled=false;
            showToast?.(error?.message||"Unable to cancel this scan","error");
        }
    });

    /* Default Qty is 1. Do not auto-focus it. */
    try{ document.activeElement?.blur?.(); }catch(_){}

    refreshNeedsReviewCounters?.();
    return true;
}

/* A scanner payload that is not a valid GS1/GTIN parse still represents a
   physical item. Keep its exact captured value for the established Needs
   Review workflow; do not invent a GTIN or receiving transaction. */
async function receiveUnrecognizedHandheldScan(raw){
    const scannedCode=toSafeString(raw);
    if(!scannedCode){
        handleReceivingFailure("Barcode could not be identified");
        return false;
    }
    if(!(typeof isLikelyZebraDevice==="function"&&isLikelyZebraDevice())){
        handleReceivingFailure("Barcode could not be identified");
        return false;
    }
    setScanBoxState?.("action");
    try{
        return await renderUnknownGTINHandheld({
            raw:scannedCode,
            gtin:scannedCode,
            capturedCode:true,
            format:"UNSUPPORTED_CODE"
        },{reason:"UNSUPPORTED_BARCODE"});
    }catch(error){
        handleReceivingFailure(error?.message||"Unable to save scanned code for review");
        return false;
    }
}

async function quickResolveUnrecognizedGTIN(parsed,knownRecord=null){
    const gtin=normalizeIdentifier(parsed?.identifierDisplay||parsed?.gtin||parsed?.raw||parsed?.original||"");
    if(!gtin){
        handleReceivingFailure("Barcode could not be identified");
        return false;
    }

    /* The Stage 2 caller supplies the result of the sole V2 resolver. */
    const masterRecord=knownRecord;

    const isHandheld=
        typeof isLikelyZebraDevice==="function" &&
        isLikelyZebraDevice();

    /*
       CASE 1:
       GTIN is known in Global Master but that Item is not in the Order.
       Identity is certain: this is a true Unordered/Manual item.
    */
    if(masterRecord?.itemCode){
        const orderItem=getReceivingItemByItemCode(masterRecord.itemCode);

        if(orderItem){
            return receiveOrderItem({
                item:orderItem,
                quantity:getValidReceivingQuantity(parsed?.quantity),
                gtin,
                lot:parsed?.lot||"",
                expiry:parsed?.expiry||"",
                serial:parsed?.serial||"",
                source:APP_CONFIG.transactionSources.scanner,
                manual:false
            });
        }

        if(isHandheld){
            setScanBoxState?.("action");
            return renderKnownNotInOrderHandheld(parsed,masterRecord);
        }

        /* PC: identity is already authoritative. Do not send a known Global
           identifier through the unknown/link resolver merely because the
           Item Code is absent from the selected Orders. */
        const selectedOrders=typeof getSelectedReceivingOrderNumbers==="function"
            ? getSelectedReceivingOrderNumbers()
            : [];
        if(selectedOrders.length!==1){
            setScanBoxState?.("action");
            return openKnownNotInOrderPC(parsed,masterRecord,selectedOrders);
        }
        try{
            const item=prepareManualExtraItem(masterRecord.itemCode,masterRecord.itemName||masterRecord.name||masterRecord.itemCode,gtin,selectedOrders[0]);
            const transaction=receiveOrderItem({
                item,
                quantity:getValidReceivingQuantity(parsed?.quantity),
                gtin,
                lot:parsed?.lot||"",
                expiry:parsed?.expiry||"",
                serial:parsed?.serial||"",
                source:APP_CONFIG.transactionSources.scanner,
                manual:true,
                targetOrder:selectedOrders[0],
                identifierPreserveExact:true
            });
            return transaction||false;
        }catch(error){
            handleReceivingFailure(error?.message||"Unable to receive known extra item");
            return false;
        }
    }

    /*
       CASE 2 + CASE 3:
       Unknown GTIN. The Handheld does NOT guess whether this is:
       - an existing order item with a changed GTIN, or
       - a genuinely new market item.
       Worker records physical reality; pharmacist resolves identity on PC.
    */
    if(isHandheld){
        setScanBoxState?.("action");

        try{
            return await renderUnknownGTINHandheld(parsed,{
                reason:"UNKNOWN_GTIN"
            });
        }catch(error){
            handleReceivingFailure(
                error?.message ||
                "Unable to save unknown GTIN for review"
            );
            return false;
        }
    }

    setScanBoxState?.("action");
    return await openQuickGTINResolver(parsed,masterRecord);
}

function openKnownNotInOrderPC(parsed,masterRecord,selectedOrders=[]){
    return new Promise(resolve=>{
        const gtin=normalizeIdentifier(parsed?.identifierDisplay||parsed?.gtin||parsed?.raw||"");
        const code=normalizeItemCode(masterRecord?.itemCode||"");
        const name=toSafeString(masterRecord?.itemName||masterRecord?.name||code);
        document.getElementById("quickGTINResolver")?.remove();
        const panel=document.createElement("div");
        panel.id="quickGTINResolver";panel.className="gtinResolutionShell open";panel.setAttribute("role","dialog");panel.setAttribute("aria-modal","true");
        panel.innerHTML=`<button type="button" class="gtinResolutionScrim" data-close aria-label="Close"></button><aside class="gtinResolutionPanel pfnIdentityPanel pfnKnownExtraPanel"><header class="gtinResolutionHeader"><div><span class="gtinActionBadge">RECOGNISED · NOT IN ORDER</span><h2>Receive Extra Item</h2><p>The barcode is known in the Global Master, but this item is not part of the active Order.</p></div><button type="button" class="gtinCloseButton" data-close aria-label="Close">✕</button></header><div class="pfnIdentityBody"><div class="pfnIdentityCard"><div><small>ITEM</small><strong>${escapeHTML(name)}</strong><span>Item Code <b>${escapeHTML(code)}</b></span></div><div class="pfnBarcodeChip"><small>GTIN</small><b>${escapeHTML(gtin)}</b></div></div><div class="pfnExtraFields"><label><span>Target Order</span><select data-extra-order>${selectedOrders.map(order=>`<option value="${escapeHTML(order)}">${escapeHTML(order)}</option>`).join("")}</select></label><label class="pfnQtyField"><span>Quantity</span><input data-extra-qty type="number" min="1" step="1" value="${escapeHTML(getValidReceivingQuantity(parsed?.quantity))}"></label></div><div class="pfnInfoStrip"><b>Extra Item</b><span>Ordered quantity will remain 0. This receipt is recorded separately from the original Order items.</span></div></div><footer class="gtinResolutionFooter"><span>Recognised from Global Master</span><div><button type="button" data-close>Cancel</button><button type="button" class="gtinPrimaryAction" data-add-extra>Add Extra Item</button></div></footer></aside>`;
        document.body.appendChild(panel);let done=false;
        const finish=value=>{if(done)return;done=true;panel.remove();setScanBoxState?.(value?"success":"ready");setTimeout(()=>focusScannerInput?.(),30);resolve(value);};
        panel.querySelectorAll("[data-close]").forEach(button=>button.onclick=()=>finish(false));
        panel.querySelector("[data-add-extra]").onclick=()=>{
            try{
                const targetOrder=normalizeOrderNumber(panel.querySelector("[data-extra-order]").value);
                const quantity=Number(panel.querySelector("[data-extra-qty]").value);
                if(!targetOrder||!Number.isInteger(quantity)||quantity<1)throw new Error("Choose an Order and enter a valid quantity.");
                const item=prepareManualExtraItem(code,name,gtin,targetOrder);
                const tx=receiveOrderItem({item,quantity,gtin,lot:parsed?.lot||"",expiry:parsed?.expiry||"",serial:parsed?.serial||"",source:APP_CONFIG.transactionSources.scanner,manual:true,targetOrder,identifierPreserveExact:true});
                if(!tx)throw new Error("Unable to receive extra item");
                finish(tx);
            }catch(error){panel.querySelector(".gtinResolutionFooter span").textContent=error?.message||"Unable to receive extra item";}
        };
    });
}

function buildReceivingResolverSearchIndex(workScopeOrderNumbers=[]){
    const scope=new Set((workScopeOrderNumbers||[]).map(normalizeOrderNumber).filter(Boolean));
    const seen=new Set();
    return (AppState?.workspace?.orderData||[]).reduce((rows,item)=>{
        const code=normalizeItemCode(item?.itemCode||"");
        if(!code||seen.has(code)) return rows;
        const memberships=(item?.orderNumbers||[item?.orderNumber]).map(normalizeOrderNumber).filter(Boolean);
        if(scope.size&&!memberships.some(order=>scope.has(order))) return rows;
        seen.add(code);
        rows.push({
            item,
            searchText:toSafeString([item?.itemCode,item?.itemName].filter(Boolean).join(" ")).toLowerCase().replace(/\s+/g," ").trim()
        });
        return rows;
    },[]);
}

function findReceivingResolverMatches(query,searchIndex=[],limit=8){
    const q=toSafeString(query).toLowerCase().replace(/\s+/g," ").trim();
    if(!q) return [];
    const parts=q.split(" ").filter(Boolean),matches=[];
    for(const entry of searchIndex){
        if(entry.searchText.includes(q)||parts.every(part=>entry.searchText.includes(part))){
            matches.push(entry.item);
            if(matches.length>=limit) break;
        }
    }
    return matches;
}

function buildReceivingResolverSelectionModel(item,quantity,workScopeOrderNumbers=[]){
    const qty=getValidReceivingQuantity(quantity);
    const scope=[...new Set((workScopeOrderNumbers||[]).map(normalizeOrderNumber).filter(Boolean))];
    const plan=buildReceivingAutoAllocationPlan(item,qty,scope);
    const code=normalizeItemCode(item?.itemCode||"");
    const orderRows=scope.flatMap(order=>(getPerOrderReceivingRows(order)||[]).filter(
        row=>normalizeItemCode(row?.["Item Number"]||"")===code
    ));
    const ordered=orderRows.reduce((sum,row)=>sum+toNumber(row?.["Ordered Qty"],0),0);
    const received=orderRows.reduce((sum,row)=>sum+toNumber(row?.["Received Qty"],0),0);
    const afterReceived=received+qty;
    const delta=afterReceived-ordered;
    const status=ordered<=0
        ? {label:"EXTRA",value:`+${afterReceived}`,className:"isExtra"}
        : delta>0
            ? {label:"OVER",value:`+${delta}`,className:"isOver"}
            : delta<0
                ? {label:"REMAINING",value:`-${Math.abs(delta)}`,className:"isRemaining"}
                : {label:"COMPLETE",value:"0",className:"isComplete"};
    return {item,quantity:qty,scope,plan,ordered,received,afterReceived,status,totalOrders:new Set(plan.map(row=>row.orderNumber)).size};
}

function renderReceivingResolverSelectedCard(model,escapeFn=escapeHTML,changeAttribute="data-change-item"){
    const esc=value=>escapeFn(toSafeString(value));
    const {item,quantity,plan,ordered,received,afterReceived,status,totalOrders}=model;
    return `<div class="resolverSelectedCard">
      <div class="resolverSelectedHeading"><span>SELECTED ITEM</span><button type="button" ${changeAttribute}>Change Item</button></div>
      <div class="resolverSelectedIdentity"><strong class="resolverSelectedName">${esc(item?.itemName||"Unnamed item")}</strong><small class="resolverSelectedCode">Item Code <b>${esc(item?.itemCode||"")}</b></small></div>
      <div class="gtinItemMetrics"><div><span>This Scan</span><b>${quantity}</b></div><div><span>Ordered</span><b>${ordered}</b></div><div><span>Already Received</span><b>${received}</b></div><div class="${status.className}"><span>${status.label}</span><b>${status.value}</b></div></div>
      <div class="gtinAllocationSummary ${status.className}"><b>After this scan: ${afterReceived} / ${ordered} received · ${status.label} ${status.value}</b><span>${ordered<=0?"Extra Item":`Auto-allocated across ${totalOrders} active Order${totalOrders===1?"":"s"}`}</span></div>
      <details class="gtinAllocationDetails"><summary>View allocation</summary>${plan.map(row=>`<div><span>${esc(row.orderNumber)}</span><b>+${row.quantity}</b></div>`).join("")}</details>
    </div>`;
}

function openQuickGTINResolver(parsed,knownRecord=null){
    return new Promise(resolve=>{
        const gtin=normalizeIdentifier(parsed?.identifierDisplay||parsed?.gtin||parsed?.raw||parsed?.original||"");
        document.getElementById("quickGTINResolver")?.remove();
        const selectedOrders=typeof getSelectedReceivingOrderNumbers==="function"?getSelectedReceivingOrderNumbers():[];
        let resolverQuantity=getValidReceivingQuantity(parsed?.quantity);
        const panel=document.createElement("div");
        panel.id="quickGTINResolver";
        panel.className="gtinResolutionShell open";
        panel.setAttribute("role","dialog");
        panel.setAttribute("aria-modal","true");
        panel.setAttribute("aria-label","Resolve unrecognised barcode");
        panel.innerHTML=`
          <button type="button" class="gtinResolutionScrim" data-close aria-label="Close"></button>
          <aside class="gtinResolutionPanel gtinResolutionPanelWide pfnUnknownPanel">
            <header class="gtinResolutionHeader">
              <div><span class="gtinActionBadge">ITEM NOT RECOGNISED</span><h2>Link this barcode</h2><p>Find the item. PharmFlow will receive it into the correct active Order automatically.</p></div>
              <button type="button" class="gtinCloseButton" data-close aria-label="Close">✕</button>
            </header>
            <div class="gtinReadout"><span>SCANNED BARCODE</span><strong>${escapeHTML(gtin)}</strong><label class="gtinResolverQtyLabel">Quantity <input data-resolver-qty class="gtinResolverQtyInput" type="number" min="1" step="1" inputmode="numeric" value="${escapeHTML(resolverQuantity)}" aria-label="Quantity"></label></div>
            <section class="gtinResolutionSection pfnUnknownWorkspace">
              <div class="pfnResolverTabs"><button type="button" class="isActive" data-mode-find>Find Existing Item</button><button type="button" data-mode-create>Create New Item</button></div>
              <div data-find-pane>
                <label class="gtinResolutionLabel" for="gtinResolutionSearch">Find Item</label>
                <input id="gtinResolutionSearch" data-search class="gtinResolutionSearch" placeholder="Search by Item Code or Item Name" autocomplete="off" spellcheck="false">
                <div data-results class="gtinResolutionResults"></div>
                <div data-selection class="gtinResolutionSelection" hidden></div>
              </div>
              <div data-create-pane class="pfnCreateItemPane" hidden>
                <div class="pfnCreateIntro"><b>New item</b><span>Use this only when the product does not already exist in the master.</span></div>
                <div class="pfnCreateGrid"><label><span>Item Code</span><input data-new-code autocomplete="off" placeholder="Enter Item Code"></label><label><span>Item Name</span><input data-new-name autocomplete="off" placeholder="Enter Item Name"></label></div>
                <div class="pfnCreateMeta"><span><small>SCANNED GTIN</small><b>${escapeHTML(gtin)}</b></span><span class="pfnCreateQtyMirror"><small>QUANTITY</small><b data-create-qty-mirror>${escapeHTML(resolverQuantity)}</b></span>${selectedOrders.length>1?`<label><small>TARGET ORDER</small><select data-new-order>${selectedOrders.map(order=>`<option value="${escapeHTML(order)}">${escapeHTML(order)}</option>`).join("")}</select></label>`:""}</div>
                <button type="button" class="gtinPrimaryAction pfnCreateReceive" data-create-receive>Create &amp; Receive</button>
              </div>
            </section>
            <div class="gtinPanelMessage" aria-live="polite"></div>
            <footer class="gtinResolutionFooter"><span>Resolve now, or save it for later.</span><div><button type="button" data-review>Save for Review</button><button type="button" data-close>Cancel</button></div></footer>
          </aside>`;
        document.body.appendChild(panel);
        const results=panel.querySelector("[data-results]");
        const search=panel.querySelector("[data-search]");
        const searchLabel=panel.querySelector('label[for="gtinResolutionSearch"]');
        const selection=panel.querySelector("[data-selection]");
        const qtyInput=panel.querySelector("[data-resolver-qty]");
        const findPane=panel.querySelector("[data-find-pane]"),createPane=panel.querySelector("[data-create-pane]");
        const findTab=panel.querySelector("[data-mode-find]"),createTab=panel.querySelector("[data-mode-create]");
        const setResolverMode=mode=>{
            const create=mode==="create";findPane.hidden=create;createPane.hidden=!create;
            findTab.classList.toggle("isActive",!create);createTab.classList.toggle("isActive",create);
            panel.querySelector(".gtinPanelMessage").textContent="";
            setTimeout(()=>panel.querySelector(create?"[data-new-code]":"[data-search]")?.focus(),30);
        };
        findTab.addEventListener("click",()=>setResolverMode("find"));
        createTab.addEventListener("click",()=>setResolverMode("create"));
        const readQuantity=()=>{
            const value=Number(qtyInput?.value);
            if(!Number.isInteger(value)||value<1) throw new Error("Enter a whole quantity of 1 or more.");
            resolverQuantity=value;
            return value;
        };
        let selectedItem=null,finished=false;
        const finish=value=>{
            if(finished)return;finished=true;panel.remove();
            setScanBoxState?.(value?"success":"ready");
            setTimeout(()=>focusScannerInput?.(),30);
            resolve(value);
        };
        const searchableItems=buildReceivingResolverSearchIndex(selectedOrders);
        const drawSelection=()=>{
            if(!selectedItem){
                selection.hidden=true;selection.innerHTML="";
                panel.querySelector(".gtinResolutionPanel")?.classList.remove("isSelectionLocked");
                searchLabel.hidden=false;
                search.hidden=false;results.hidden=false;
                search.removeAttribute("aria-hidden");
                results.removeAttribute("aria-hidden");
                return;
            }
            const model=buildReceivingResolverSelectionModel(selectedItem,resolverQuantity,selectedOrders);
            panel.querySelector(".gtinResolutionPanel")?.classList.add("isSelectionLocked");
            results.innerHTML="";
            searchLabel.hidden=true;
            search.hidden=true;results.hidden=true;
            search.setAttribute("aria-hidden","true");
            results.setAttribute("aria-hidden","true");
            selection.hidden=false;
            selection.innerHTML=renderReceivingResolverSelectedCard(model,escapeHTML,"data-change-item")+`<button type="button" class="gtinPrimaryAction" data-link-receive>Link &amp; Receive</button>`;
            selection.querySelector("[data-change-item]")?.addEventListener("click",()=>{selectedItem=null;drawSelection();search.value="";search.focus();});
            selection.querySelector("[data-link-receive]")?.addEventListener("click",async event=>{
                const button=event.currentTarget;button.disabled=true;
                try{
                    if(typeof isPharmacyAdmin==="function"&&!isPharmacyAdmin())throw new Error("Pharmacy admin permission is required to link a new barcode.");
                    const mappingResult=await IdentifierService.learnIdentifier(globalThis.crypto.randomUUID(),gtin,selectedItem,"Receiving barcode resolution");
                    const mapping=Array.isArray(mappingResult)?mappingResult[0]:mappingResult;
                    const resolution=mapping?{kind:"PHARMACY_LEARNED",mappingId:mapping.identifierId,mappingRevision:mapping.mappingRevision,identifierDisplay:mapping.identifierDisplay,identifierKey:mapping.identifierKey,resolvedItemCode:mapping.itemCode}:null;
                    const txs=receiveAutoAllocatedItem({item:selectedItem,quantity:readQuantity(),gtin,lot:parsed?.lot||"",expiry:parsed?.expiry||"",serial:parsed?.serial||"",source:APP_CONFIG.transactionSources.scanner,workScopeOrderNumbers:selectedOrders,identifierPreserveExact:true,gtinResolution:resolution});
                    finish(txs[0]||true);
                }catch(error){button.disabled=false;setScanBoxState?.("error");panel.querySelector(".gtinPanelMessage").textContent=error?.message||"Unable to link and receive item";}
            });
        };
        let searchFrame=0;
        const render=()=>{
            searchFrame=0;
            const q=toSafeString(search.value).trim();
            if(!q){results.innerHTML="";return;}
            const items=findReceivingResolverMatches(q,searchableItems,8);
            results.innerHTML=items.length?items.map((item,index)=>`<button type="button" class="gtinResult" data-i="${index}"><span><strong>${escapeHTML(item.itemName)}</strong><small>Item Code ${escapeHTML(item.itemCode)}</small></span><b>Select</b></button>`).join(""):'<div class="gtinNoResult">No matching item in this device\'s active Orders.</div>';
            results.querySelectorAll("[data-i]").forEach(button=>button.addEventListener("click",()=>{selectedItem=items[Number(button.dataset.i)]||null;drawSelection();}));
        };
        search.addEventListener("input",()=>{
            if(searchFrame)cancelAnimationFrame(searchFrame);
            searchFrame=requestAnimationFrame(render);
        });
        qtyInput?.addEventListener("input",()=>{try{readQuantity();const mirror=panel.querySelector("[data-create-qty-mirror]");if(mirror)mirror.textContent=String(resolverQuantity);}catch(_error){}});
        qtyInput?.addEventListener("change",()=>{try{readQuantity();const mirror=panel.querySelector("[data-create-qty-mirror]");if(mirror)mirror.textContent=String(resolverQuantity);if(selectedItem)drawSelection();}catch(error){panel.querySelector(".gtinPanelMessage").textContent=error.message;qtyInput.focus();}});
        panel.querySelector("[data-review]")?.addEventListener("click",async()=>{
            try{
                const quantity=readQuantity();
                await nrV2CreateDraft({...parsed,quantity,identifierDisplay:gtin},{workflow:"RECEIVING",reason:knownRecord?"KNOWN_NOT_IN_ORDER":"UNKNOWN_GTIN",itemCode:knownRecord?.itemCode||"",itemName:knownRecord?.itemName||knownRecord?.name||"",orderNumber:null,workScopeOrderNumbers:selectedOrders});
                await refreshNeedsReviewCounters?.();finish(true);
            }catch(error){setScanBoxState?.("error");panel.querySelector(".gtinPanelMessage").textContent=error?.message||"Unable to save for review";}
        });
        panel.querySelector("[data-create-receive]")?.addEventListener("click",async event=>{
            const button=event.currentTarget;button.disabled=true;
            try{
                if(typeof isPharmacyAdmin==="function"&&!isPharmacyAdmin()) throw new Error("Pharmacy admin permission is required to create a new item.");
                const itemCode=normalizeItemCode(panel.querySelector("[data-new-code]")?.value||"");
                const itemName=toSafeString(panel.querySelector("[data-new-name]")?.value||"").trim();
                const quantity=readQuantity();
                if(!itemCode||!itemName) throw new Error("Item Code and Item Name are required.");
                if(!Number.isInteger(quantity)||quantity<1) throw new Error("Enter a whole quantity of 1 or more.");
                const item={itemCode,itemName};
                if(IdentifierService.isReferencePharmacy()){
                    await IdentifierService.createItem(globalThis.crypto.randomUUID(),{itemCode,itemName,identifierDisplay:gtin,reason:"Receiving new item creation"});
                }else{
                    await IdentifierService.addPharmacyIdentifier(globalThis.crypto.randomUUID(),gtin,item,"Receiving new item creation");
                }
                const orderItem=getItemByCode?.(itemCode);
                let tx;
                if(orderItem){
                    const txs=receiveAutoAllocatedItem({item:orderItem,quantity,gtin,lot:parsed?.lot||"",expiry:parsed?.expiry||"",serial:parsed?.serial||"",source:APP_CONFIG.transactionSources.scanner,workScopeOrderNumbers:selectedOrders,identifierPreserveExact:true});
                    tx=txs?.[0]||true;
                }else{
                    const targetOrder=normalizeOrderNumber(panel.querySelector("[data-new-order]")?.value||selectedOrders[0]||"");
                    if(!targetOrder) throw new Error("Choose an active Order before receiving this Extra Item.");
                    const extra=prepareManualExtraItem(itemCode,itemName,gtin,targetOrder);
                    tx=receiveOrderItem({item:extra,quantity,gtin,lot:parsed?.lot||"",expiry:parsed?.expiry||"",serial:parsed?.serial||"",source:APP_CONFIG.transactionSources.scanner,manual:true,targetOrder,identifierPreserveExact:true});
                }
                finish(tx||true);
            }catch(error){button.disabled=false;setScanBoxState?.("error");panel.querySelector(".gtinPanelMessage").textContent=error?.message||"Unable to create and receive item";}
        });
        panel.querySelectorAll("[data-close]").forEach(button=>button.addEventListener("click",()=>finish(false)));
        setTimeout(()=>search.focus(),80);
    });
}

/* =====================================================
   GTIN VARIANTS
===================================================== */

function createGTINVariants(gtin){

    const normalized =
        normalizeGTIN(
            gtin
        );

    const variants =
        new Set();

    if(!normalized){
        return [];
    }

    variants.add(
        normalized
    );

    let stripped =
        normalized;

    while(
        stripped.length > 8 &&
        stripped.startsWith("0")
    ){

        stripped =
            stripped.slice(1);

        variants.add(
            stripped
        );

    }

    if(
        normalized.length < 14
    ){

        variants.add(
            normalized.padStart(
                14,
                "0"
            )
        );

    }

    return Array.from(
        variants
    );

}


/* =====================================================
   RECEIVE FROM SEARCH

   quantity is optional so old calls remain compatible.
===================================================== */

function receiveItemBySearch(
    itemCode,
    quantity = 1
){

    const item =
        getItemByCode(
            itemCode
        );

    if(!item){

        handleReceivingFailure(
            "Item not found"
        );

        return false;

    }

    return receiveOrderItem({

        item:item,

        quantity:
            getValidReceivingQuantity(
                quantity
            ),

        gtin:"",

        lot:"",

        expiry:"",

        serial:"",

        source:
            ReceivingEngine
                .adjustmentSources
                .search,

        manual:
            item.manual === true

    });

}


/* =====================================================
   ADD SEARCH QUANTITY
===================================================== */

function addSearchItemQuantity(
    itemCode,
    quantity
){

    const qty =
        toNumber(
            quantity,
            0
        );

    if(
        !Number.isFinite(qty) ||
        qty <= 0
    ){

        showToast(
            "Enter a valid quantity",
            "warning"
        );

        return false;

    }

    return receiveItemBySearch(
        itemCode,
        qty
    );

}


/* =====================================================
   ADD QUANTITY TO EXISTING RECEIVED TOTAL

   IMPORTANT:
   This function ADDS to the current Received Qty.
   It never replaces quantities that were scanned before.
===================================================== */

function addItemReceivedQuantity(
    itemCode,
    quantity,
    source = "MANUAL_ADD"
){

    const item =
        getItemByCode(
            itemCode
        );

    if(!item){

        showToast(
            "Item not found",
            "error"
        );

        return false;
    }

    const qty =
        toNumber(
            quantity,
            0
        );

    if(
        !Number.isFinite(qty) ||
        qty <= 0
    ){

        showToast(
            "Enter a valid quantity to add",
            "warning"
        );

        return false;
    }

    return receiveOrderItem({
        item:item,
        quantity:qty,
        gtin:"",
        lot:"",
        expiry:"",
        serial:"",
        source:source,
        manual:item.manual === true
    });
}


/* =====================================================
   CORE RECEIVE FUNCTION
===================================================== */

function receiveOrderItem(options){

    if(
        !options ||
        !options.item
    ){

        handleReceivingFailure(
            "Invalid receiving item"
        );

        return false;

    }

    const item =
        options.item;

    const quantity =
        getValidReceivingQuantity(
            options.quantity
        );

    let targetOrder="";
    try{
        targetOrder=resolveReceivingTransactionOrder(item,options.targetOrder||"");
    }catch(error){
        handleReceivingFailure(error?.message||"Unable to determine target Order");
        return false;
    }

    if(quantity <= 0){

        handleReceivingFailure(
            "Invalid receiving quantity"
        );

        return false;

    }

    if(
        !AppState.settings
            .allowOverReceiving
        &&
        item.manual !== true
    ){

        const scopedMetrics=getReceivingDisplayMetrics(item,targetOrder);
        const remaining = scopedMetrics
            ? toNumber(scopedMetrics.remainingQty,0)
            : toNumber(item.remainingQty,0);

        if(remaining <= 0){

            handleReceivingFailure(
                "Item already completed"
            );

            return false;

        }

        if(quantity > remaining){

            handleReceivingFailure(
                "Quantity exceeds remaining order quantity"
            );

            return false;

        }

    }

    const previousReceived =
        toNumber(
            item.receivedQty,
            0
        );

    item.receivedQty =
        previousReceived +
        quantity;

    updateItemCalculatedFields(
        item
    );

    const transaction =
        createReceivingTransaction({

            item:item,

            quantity:quantity,

            transactionId:options.transactionId || null,

            gtin:
                options.gtin,

            lot:
                options.lot,

            expiry:
                options.expiry,

            serial:
                options.serial,

            source:
                options.source,

            manual:
                options.manual === true,

            targetOrder:
                targetOrder,

            gtinResolution:
                options.gtinResolution||null,

            identifierPreserveExact:
                options.identifierPreserveExact === true ||
                options.gtinResolution?.kind === "PHARMACY_LEARNED"

        });

    if(!transaction){

        item.receivedQty =
            previousReceived;

        updateItemCalculatedFields(
            item
        );

        handleReceivingFailure(
            "Unable to record receiving transaction"
        );

        return false;

    }

    /* AppState normalizes transaction fields; attach learned provenance to
       the stored record before finishReceivingChange emits the queue event. */
    if(options.gtinResolution){
        transaction.gtinResolution=options.gtinResolution;
    }

    finishReceivingChange(
        item,
        transaction,
        {
            successToast:true
        }
    );

    return transaction;
}


/* =====================================================
   CREATE RECEIVING TRANSACTION
===================================================== */


function resolveReceivingTransactionOrder(item,preferredOrder=""){
    const selectedOrders=typeof getSelectedReceivingOrderNumbers==="function"
        ? getSelectedReceivingOrderNumbers()
        : [];
    const memberships=[...new Set((item?.orderNumbers||[item?.orderNumber])
        .map(normalizeOrderNumber).filter(Boolean))];
    const eligible=memberships.filter(order=>selectedOrders.includes(order));
    const preferred=normalizeOrderNumber(preferredOrder||"");

    if(preferred && eligible.includes(preferred)) return preferred;
    if(selectedOrders.length===1 && memberships.includes(selectedOrders[0])) return selectedOrders[0];
    if(eligible.length===1) return eligible[0];
    if(eligible.length>1){
        const deterministic=chooseDeterministicReceivingOrder(item);
        if(deterministic) return deterministic;
    }
    throw new Error("This item is not included in the selected Orders.");
}



function getReceivingRuntimeDeviceType(){
    try{
        if(typeof isLikelyZebraDevice==="function" && isLikelyZebraDevice()){
            return "HANDHELD";
        }
    }catch(_){}

    return "PC";
}


function createReceivingTransaction(options){

    const item=options.item;
    const transactionOrder=
        resolveReceivingTransactionOrder(item,options.targetOrder||"");

    return addReceivingTransaction({

        transactionId:
            options.transactionId ||
            createTransactionId(),

        orderId:transactionOrder||AppState.workspace.orderId,
        selectedOrderNumber:transactionOrder,

        dateTime:
            nowISO(),

        itemCode:
            item.itemCode,

        itemName:
            item.itemName,

        gtin:
            options.gtin || "",

        quantity:
            options.quantity,

        lot:
            options.lot || "",

        expiry:
            options.expiry || "",

        serial:
            options.serial || "",

        source:
            options.source
            ||
            APP_CONFIG
                .transactionSources
                .scanner,

        deviceId:
            (typeof ensureDeviceId === "function" ? ensureDeviceId() : AppState.session.deviceId),

        deviceType:
            getReceivingRuntimeDeviceType(),

        manual:
            options.manual === true,

        targetOrder:
            options.targetOrder || "",

        identifierPreserveExact:
            options.identifierPreserveExact === true

    });

}


/* =====================================================
   VALID RECEIVING QUANTITY
===================================================== */

function getValidReceivingQuantity(value){

    let quantity =
        toNumber(
            value,
            APP_CONFIG
                .receiving
                .defaultQuantity
        );

    if(
        !Number.isFinite(quantity) ||
        quantity <= 0
    ){

        quantity =
            APP_CONFIG
                .receiving
                .defaultQuantity;

    }

    return quantity;
}


/* =====================================================
   UPDATE ITEM CALCULATED FIELDS
===================================================== */

function updateItemCalculatedFields(item){

    item.receivedQty =
        Math.max(
            0,
            toNumber(
                item.receivedQty,
                0
            )
        );

    item.remainingQty =
        calculateRemainingQty(
            item.orderedQty,
            item.receivedQty
        );

    /*
       Extra items retain the internal legacy status; UI/business terminology is Extra Item.
    */

    if(item.manual === true){

        item.status =
            APP_CONFIG
                .statuses
                .manual;

    }
    else{

        item.status =
            calculateItemStatus(
                item
            );

    }

}


/* =====================================================
   MANUAL +1
===================================================== */

function increaseItemQuantity(
    itemCode,
    amount = 1
){

    const item =
        getItemByCode(
            itemCode
        );

    if(!item){

        showToast(
            "Item not found",
            "error"
        );

        return false;

    }

    const quantity =
        toNumber(
            amount,
            1
        );

    if(
        !Number.isFinite(quantity) ||
        quantity <= 0
    ){

        showToast(
            "Invalid quantity",
            "warning"
        );

        return false;

    }

    return applyQuantityAdjustment({

        item:item,

        difference:
            quantity,

        source:
            ReceivingEngine
                .adjustmentSources
                .increase

    });

}


/* =====================================================
   MANUAL -1
===================================================== */

function decreaseItemQuantity(
    itemCode,
    amount = 1
){

    const item =
        getItemByCode(
            itemCode
        );

    if(!item){

        showToast(
            "Item not found",
            "error"
        );

        return false;

    }

    const quantity =
        toNumber(
            amount,
            1
        );

    if(
        !Number.isFinite(quantity) ||
        quantity <= 0
    ){

        showToast(
            "Invalid quantity",
            "warning"
        );

        return false;

    }

    if(
        toNumber(
            item.receivedQty,
            0
        ) <= 0
    ){

        showToast(
            "Received quantity is already zero",
            "warning"
        );

        return false;

    }

    const actualDecrease =
        Math.min(
            quantity,
            toNumber(
                item.receivedQty,
                0
            )
        );

    return applyQuantityAdjustment({

        item:item,

        difference:
            -actualDecrease,

        source:
            ReceivingEngine
                .adjustmentSources
                .decrease

    });

}


/* =====================================================
   EDIT RECEIVED QTY DIRECTLY
===================================================== */

function setItemReceivedQuantity(
    itemCode,
    newQuantity
){

    const item =
        getItemByCode(
            itemCode
        );

    if(!item){

        showToast(
            "Item not found",
            "error"
        );

        return false;

    }

    const target =
        Number(
            newQuantity
        );

    if(
        !Number.isFinite(target) ||
        target < 0
    ){

        showToast(
            "Enter a valid received quantity",
            "warning"
        );

        return false;

    }

    const current =
        toNumber(
            item.receivedQty,
            0
        );

    const difference =
        target -
        current;

    if(difference === 0){

        showToast(
            "Quantity unchanged",
            "warning"
        );

        return false;

    }

    if(
        difference > 0 &&
        !AppState.settings
            .allowOverReceiving &&
        item.manual !== true
    ){

        const ordered =
            toNumber(
                item.orderedQty,
                0
            );

        if(target > ordered){

            showToast(
                "Quantity exceeds ordered quantity",
                "warning"
            );

            return false;

        }

    }

    return applyQuantityAdjustment({

        item:item,

        difference:
            difference,

        source:
            difference > 0
            ?
            ReceivingEngine
                .adjustmentSources
                .editIncrease
            :
            ReceivingEngine
                .adjustmentSources
                .editDecrease

    });

}


function getLocalRuntimeBatchQuantity(itemCode){
    const code=normalizeItemCode(itemCode);
    const active=normalizeItemCode(
        ReceivingEngine?.currentLocalBatch?.itemCode||""
    );

    if(!code || code!==active){
        return 0;
    }

    return Math.max(
        0,
        toNumber(ReceivingEngine.currentLocalBatch?.quantity,0)
    );
}

function setCurrentLocalBatch(itemCode,quantity){
    const code=normalizeItemCode(itemCode);

    ReceivingEngine.currentLocalBatch={
        itemCode:code,
        quantity:Math.max(0,toNumber(quantity,0))
    };

    return ReceivingEngine.currentLocalBatch.quantity;
}

function resetCurrentLocalBatch(){
    ReceivingEngine.currentLocalBatch={
        itemCode:"",
        quantity:0
    };
}

function applyCurrentLocalBatchTransaction(itemCode,difference){
    const code=normalizeItemCode(itemCode);
    const delta=toNumber(difference,0);

    if(!code){
        return 0;
    }

    const active=normalizeItemCode(
        ReceivingEngine?.currentLocalBatch?.itemCode||""
    );

    /*
       Positive quantity on a different item starts a NEW consecutive batch.
       Example:
       Dompy x10 -> Panadol x10 -> Dompy scan => Dompy Batch Qty = 1.
    */
    if(code!==active){
        if(delta>0){
            return setCurrentLocalBatch(code,delta);
        }

        /* A correction to an older/different item must not modify the
           currently active batch shown to the worker. */
        return getLocalRuntimeBatchQuantity(active);
    }

    return setCurrentLocalBatch(
        code,
        getLocalRuntimeBatchQuantity(code)+delta
    );
}

function isCurrentDeviceReceivingTransaction(transaction){
    const ownDeviceId=typeof ensureDeviceId==="function"
        ? toSafeString(ensureDeviceId()||"")
        : toSafeString(AppState?.session?.deviceId||"");

    const txDeviceId=toSafeString(transaction?.deviceId||"");

    /*
       Local transactions created by this browser normally carry deviceId.
       If either side is unavailable, finishReceivingChange is still the local
       execution path, so it is safe to treat it as local.
    */
    return !ownDeviceId || !txDeviceId || ownDeviceId===txDeviceId;
}

function updateLocalRuntimeBatchFromTransaction(item,transaction){
    if(!item || !transaction || !isCurrentDeviceReceivingTransaction(transaction)){
        return;
    }

    const source=toSafeString(transaction?.source||"").toUpperCase();
    const qty=toNumber(transaction?.quantity,0);

    /*
       Correct Received Total is a correction of the shared total, not part of
       the worker's current physical batch. It closes the active local batch.
    */
    if(
        source===toSafeString(ReceivingEngine.adjustmentSources.editIncrease).toUpperCase() ||
        source===toSafeString(ReceivingEngine.adjustmentSources.editDecrease).toUpperCase()
    ){
        resetCurrentLocalBatch();
        return;
    }

    /*
       The local batch follows only the consecutive item sequence on this
       device. Undo/negative changes affect the visible batch only when they
       refer to the currently active item.
    */
    applyCurrentLocalBatchTransaction(item.itemCode,qty);
}


/* =====================================================
   PHASE 2C.6 FINAL - FAST SCAN SAFETY
   Keep normal receiving instant. Corrections are one-tap
   audit transactions instead of deleting history.
===================================================== */
function isScannerTransaction(transaction){
    const source=toSafeString(transaction?.source||"").toUpperCase();
    const scanner=toSafeString(APP_CONFIG?.transactionSources?.scanner||"SCANNER").toUpperCase();
    return !!transaction && toNumber(transaction.quantity,0)>0 && (source===scanner || source.includes("SCAN"));
}

function rememberRecentScannerTransaction(item, transaction){
    if(!isScannerTransaction(transaction)){ return; }
    const entry={
        transactionId:transaction.transactionId,
        itemCode:item.itemCode,
        itemName:item.itemName,
        quantity:toNumber(transaction.quantity,1),
        receivedQty:toNumber(item.receivedQty,0),
        orderedQty:toNumber(item.orderedQty,0),
        dateTime:transaction.dateTime||nowISO(),
        gtin:transaction.gtin||"",
        undone:false
    };
    ReceivingEngine.recentScans.unshift(entry);
    ReceivingEngine.recentScans=ReceivingEngine.recentScans.slice(0,1000);

    const over=entry.orderedQty>=0 && entry.receivedQty>entry.orderedQty;
    if(over){
        showToast(`OVER RECEIVED: ${entry.itemName} — Received ${entry.receivedQty} / Ordered ${entry.orderedQty}. Use Undo if accidental.`,`warning`);
    }
    if(typeof refreshScanSafetyUI==="function"){ refreshScanSafetyUI(); }
}

function getRecentScannerTransactions(){
    const rows=Array.isArray(ReceivingEngine.recentScans) ? ReceivingEngine.recentScans : [];
    const history=Array.isArray(AppState?.workspace?.receivingHistory)?AppState.workspace.receivingHistory:[];
    const ids=new Set(history.map(tx=>tx?.transactionId).filter(Boolean));
    return rows.filter(row=>ids.has(row.transactionId)).slice();
}

function undoRecentScannerTransaction(transactionId){
    let entry=ReceivingEngine.recentScans.find(row=>row.transactionId===transactionId);

    /*
       Recent Scans UI is rendered from authoritative workspace history.
       After reload/sync, the in-memory recentScans array can be empty even
       though the transaction is visible. Reconstruct the undo target from
       history instead of showing a dead Undo button.
    */
    if(!entry){
        const history=Array.isArray(AppState?.workspace?.receivingHistory)
            ? AppState.workspace.receivingHistory
            : [];

        const tx=history.find(row=>
            toSafeString(row?.transactionId||"")===toSafeString(transactionId||"")
        );

        if(tx && isScannerTransaction(tx)){
            const ownDeviceId=typeof ensureDeviceId==="function"
                ? toSafeString(ensureDeviceId()||"")
                : toSafeString(AppState?.session?.deviceId||"");

            if(
                ownDeviceId &&
                toSafeString(tx?.deviceId||"") &&
                toSafeString(tx.deviceId)!==ownDeviceId
            ){
                showToast("Undo is available only for this Handheld","warning");
                return false;
            }

            const itemForEntry=getItemByCode(tx.itemCode);
            entry={
                transactionId:tx.transactionId,
                itemCode:tx.itemCode,
                itemName:itemForEntry?.itemName||tx.itemName||tx.itemCode,
                quantity:Math.max(1,toNumber(tx.quantity,1)),
                receivedQty:toNumber(itemForEntry?.receivedQty,0),
                orderedQty:toNumber(itemForEntry?.orderedQty,0),
                dateTime:tx.dateTime||nowISO(),
                gtin:tx.gtin||"",
                undone:false
            };
            ReceivingEngine.recentScans.unshift(entry);
        }
    }

    if(!entry || entry.undone){ showToast("This scan is already corrected","warning"); return false; }
    const item=getItemByCode(entry.itemCode);
    if(!item){ showToast("Item is no longer available in the current order","error"); return false; }
    const current=toNumber(item.receivedQty,0);
    const qty=Math.min(toNumber(entry.quantity,1),current);
    if(qty<=0){ showToast("Received quantity is already zero","warning"); return false; }
    const tx=applyQuantityAdjustment({item:item,difference:-qty,source:"SCAN_UNDO"});
    if(tx){
        entry.undone=true;
        entry.undoneAt=nowISO();
        showToast(`${entry.itemName} — accidental scan corrected (-${qty})`,"success");
        if(typeof refreshScanSafetyUI==="function"){ refreshScanSafetyUI(); }
        if(typeof refreshOpenKpiPanel==="function"){ refreshOpenKpiPanel(); }
        return tx;
    }
    return false;
}

function undoLastScannerTransaction(){
    const entry=ReceivingEngine.recentScans.find(row=>!row.undone);
    if(!entry){ showToast("No recent scanner transaction to undo","warning"); return false; }
    return undoRecentScannerTransaction(entry.transactionId);
}

/* =====================================================
   GENERIC QUANTITY ADJUSTMENT

   Positive difference = increase
   Negative difference = decrease

   Negative transactions are intentional.
   Historical reports sum them so corrected quantities
   remain accurate.
===================================================== */

function applyQuantityAdjustment(options){

    if(
        !options ||
        !options.item
    ){

        return false;

    }

    const item =
        options.item;

    const difference =
        toNumber(
            options.difference,
            0
        );

    if(
        !Number.isFinite(difference) ||
        difference === 0
    ){

        return false;

    }

    const targetOrder=resolveReceivingTransactionOrder(item,options.targetOrder||"");
    const scopedMetrics=getReceivingDisplayMetrics(item,targetOrder);
    const oldScopedReceived=scopedMetrics
        ? toNumber(scopedMetrics.receivedQty,0)
        : toNumber(item.receivedQty,0);

    const oldReceived =
        toNumber(
            item.receivedQty,
            0
        );

    const newReceived =
        oldReceived +
        difference;

    if(oldScopedReceived+difference < 0){

        showToast(
            "Received quantity cannot be below zero",
            "warning"
        );

        return false;

    }

    if(
        difference > 0 &&
        !AppState.settings
            .allowOverReceiving &&
        item.manual !== true
    ){

        const ordered = scopedMetrics
            ? toNumber(scopedMetrics.orderedQty,0)
            : toNumber(item.orderedQty,0);

        if(oldScopedReceived+difference > ordered){

            showToast(
                "Quantity exceeds ordered quantity",
                "warning"
            );

            return false;

        }

    }

    item.receivedQty =
        newReceived;

    updateItemCalculatedFields(
        item
    );

    const transaction =
        addReceivingTransaction({

            transactionId:
                createTransactionId(),

            orderId:
                targetOrder,

            selectedOrderNumber:
                targetOrder,

            dateTime:
                nowISO(),

            itemCode:
                item.itemCode,

            itemName:
                item.itemName,

            gtin:"",

            quantity:
                difference,

            lot:"",

            expiry:"",

            serial:"",

            source:
                options.source
                ||
                "MANUAL_ADJUSTMENT",

            deviceId:
                (typeof ensureDeviceId === "function" ? ensureDeviceId() : AppState.session.deviceId),

            deviceType:
                getReceivingRuntimeDeviceType(),

            correctionReason:
                options.correctionReason || "",

            correctsTransactionId:
                options.correctsTransactionId || "",

            manual:
                item.manual === true

        });

    if(!transaction){

        item.receivedQty =
            oldReceived;

        updateItemCalculatedFields(
            item
        );

        showToast(
            "Unable to save quantity adjustment",
            "error"
        );

        return false;

    }

    finishReceivingChange(
        item,
        transaction,
        {
            successToast:false
        }
    );

    const sign =
        difference > 0
        ?
        "+"
        :
        "";

    const adjustmentSource=toSafeString(options.source||"").toUpperCase();
    const isQuickButtonAdjustment=
        adjustmentSource==="MANUAL_INCREASE" ||
        adjustmentSource==="MANUAL_DECREASE";

    if(!isQuickButtonAdjustment){
        showToast(
            item.itemName +
            "  " +
            sign +
            difference +
            " → Received " +
            item.receivedQty,
            "success"
        );
    }else{
        /* Quick +/- should confirm without interrupting scanning. The existing
           green scan-box / Last Scan flash from finishReceivingChange is the
           lightweight acknowledgement. */
        try{
            document.body?.classList.add("quantityQuickConfirmed");
            setTimeout(()=>document.body?.classList.remove("quantityQuickConfirmed"),320);
        }catch(_){}
    }

    return transaction;
}


/* =====================================================
   FINISH ANY RECEIVING CHANGE
===================================================== */

function finishReceivingChange(
    item,
    transaction,
    options = {}
){

    updateLastScanFromReceiving(
        item,
        transaction
    );

    ReceivingEngine.lastTransaction =
        transaction;

    updateLocalRuntimeBatchFromTransaction(item,transaction);

    rememberRecentScannerTransaction(item, transaction);

    recalculateStatistics();

    AppEvents.emit(
        "receiving:transaction",
        deepClone(
            transaction
        )
    );

    AppEvents.emit(
        "receiving:updated",
        {

            itemCode:
                item.itemCode,

            transactionId:
                transaction.transactionId,

            receivedQty:
                item.receivedQty,

            remainingQty:
                item.remainingQty,

            status:
                item.status

        }
    );

    /*
       UI will use this event in the next file
       to highlight the changed row.
    */

    AppEvents.emit(
        "receiving:item-highlight",
        {

            itemCode:
                item.itemCode

        }
    );

    setScanBoxState(
        "success"
    );

    flashLastScanCard(
        true
    );

    const scannerSource = toSafeString(APP_CONFIG?.transactionSources?.scanner || "SCANNER").toUpperCase();
    const transactionSource = toSafeString(transaction?.source || "").toUpperCase();
    if(options.successToast === true && transactionSource !== scannerSource){
        showToast(item.itemName + "  +" + transaction.quantity,"success");
    }

    focusScannerInput();
}


/* =====================================================
   UPDATE LAST SCAN
===================================================== */

function updateLastScanFromReceiving(
    item,
    transaction
){

    const txOrder=normalizeOrderNumber(transaction?.orderId||transaction?.orderNumber||transaction?.selectedOrderNumber||"");
    const scoped=getReceivingDisplayMetrics(item,txOrder);

    setLastScan({

        itemCode:
            item.itemCode,

        itemName:
            item.itemName,

        gtin:
            transaction.gtin,

        lot:
            transaction.lot,

        expiry:
            transaction.expiry,

        serial:
            transaction.serial,

        quantity:
            transaction.quantity,

        orderedQty:
            scoped?.orderedQty ?? item.orderedQty,

        receivedQty:
            scoped?.receivedQty ?? item.receivedQty,

        remainingQty:
            scoped?.remainingQty ?? item.remainingQty,

        status:
            item.status,

        source:
            transaction.source,

        transactionId:
            transaction.transactionId,

        scanTime:
            transaction.dateTime

    });

}


/* =====================================================
   SUCCESS UI
===================================================== */

function handleReceivingSuccess(
    item,
    quantity
){

    setScanBoxState(
        "success"
    );

    flashLastScanCard(
        true
    );

    showToast(
        item.itemName +
        "  +" +
        quantity,
        "success"
    );

    focusScannerInput();

}


/* =====================================================
   FAILURE UI
===================================================== */

function handleReceivingFailure(message){

    setScanBoxState(
        "error"
    );

    flashLastScanCard(
        false
    );

    Logger.warn(
        "Receiving rejected:",
        message
    );

    focusScannerInput();

}


/* =====================================================
   EXTRA ITEM
===================================================== */

async function saveManualReceivingItem(){

    const itemCodeInput =
        document.getElementById(
            "manualItemCode"
        );

    const itemNameInput =
        document.getElementById(
            "manualItemName"
        );

    const quantityInput =
        document.getElementById(
            "manualItemQuantity"
        );

    if(
        !itemCodeInput ||
        !itemNameInput ||
        !quantityInput
    ){

        showToast(
            "Extra item form is unavailable",
            "error"
        );

        return false;

    }

    const itemCode =
        normalizeItemCode(
            itemCodeInput.value
        );

    const itemName =
        toSafeString(
            itemNameInput.value
        );

    const quantity =
        toNumber(
            quantityInput.value,
            0
        );

    if(!itemCode){

        showToast(
            "Enter Item Number",
            "warning"
        );

        itemCodeInput.focus();

        return false;
    }

    if(!itemName){

        showToast(
            "Enter Item Name",
            "warning"
        );

        itemNameInput.focus();

        return false;
    }

    if(
        !isValidQuantity(
            quantity
        )
    ){

        showToast(
            "Enter a valid quantity",
            "warning"
        );

        quantityInput.focus();

        return false;
    }

    let item =
        getItemByCode(
            itemCode
        );

    /*
       Existing item:
       do not create duplicate.
    */

    if(item){

        const transaction =
            receiveOrderItem({

                item:item,

                quantity:
                    quantity,

                gtin:"",

                lot:"",

                expiry:"",

                serial:"",

                source:
                    ReceivingEngine
                        .adjustmentSources
                        .manual,

                manual:
                    item.manual === true

            });

        if(transaction){

            closeManualItemModal();

        }

        return transaction;
    }

    /*
       New extra item
    */

    item =
        upsertOrderItem({

            itemCode:
                itemCode,

            itemName:
                itemName,

            orderedQty:
                0,

            receivedQty:
                0,

            manual:
                true

        });

    if(!item){

        showToast(
            "Unable to add extra item",
            "error"
        );

        return false;
    }

    item.manual =
        true;

    item.status =
        APP_CONFIG
            .statuses
            .manual;

    if(
        typeof applyMasterGTINForItemCode ===
        "function"
    ){

        try{
            await applyMasterGTINForItemCode(
                item.itemCode
            );
        }
        catch(error){
            Logger.warn(
                "Master GTIN lookup for extra item failed",
                error
            );
        }

    }

    const transaction =
        receiveOrderItem({

            item:item,

            quantity:
                quantity,

            gtin:"",

            lot:"",

            expiry:"",

            serial:"",

            /* Distinguish first creation of an unordered extra item
               from later quantity edits in the audit history. */
            source:"MANUAL_ITEM",

            manual:true

        });

    if(transaction){

        closeManualItemModal();

        AppEvents.emit(
            "files:updated"
        );

    }

    return transaction;
}


/* =====================================================
   RECEIVE QUANTITY DIRECTLY
===================================================== */

function receiveItemQuantity(
    itemCode,
    quantity,
    source =
        ReceivingEngine
            .adjustmentSources
            .search
){

    const item =
        getItemByCode(
            itemCode
        );

    if(!item){
        return false;
    }

    return receiveOrderItem({

        item:item,

        quantity:
            quantity,

        gtin:"",

        lot:"",

        expiry:"",

        serial:"",

        source:
            source,

        manual:
            item.manual === true

    });

}


/* =====================================================
   DELETE EXTRA ITEM

   Only allowed when received quantity is zero.
===================================================== */

function deleteManualItem(
    itemCode
){

    const item =
        getItemByCode(
            itemCode
        );

    if(
        !item ||
        item.manual !== true
    ){

        showToast(
            "Only extra items can be deleted",
            "warning"
        );

        return false;

    }

    if(
        toNumber(
            item.receivedQty,
            0
        ) !== 0
    ){

        showToast(
            "Set received quantity to zero before deleting this item",
            "warning"
        );

        return false;

    }

    const index =
        AppState.workspace
            .orderData
            .findIndex(
                record=>
                    normalizeItemCode(
                        record.itemCode
                    )
                    ===
                    normalizeItemCode(
                        itemCode
                    )
            );

    if(index < 0){
        return false;
    }

    AppState.workspace
        .orderData
        .splice(
            index,
            1
        );

    rebuildStateIndexes();

    recalculateStatistics();

    AppEvents.emit(
        "receiving:updated"
    );

    AppEvents.emit(
        "files:updated"
    );

    /* Persist the structural removal and push it to the shared pharmacy
       workspace. A zero-quantity extra item must not reappear after reload. */
    if(typeof saveWorkspaceSnapshot === "function"){
        saveWorkspaceSnapshot();
    }

    if(typeof saveCloudWorkspaceSnapshot === "function"){
        Promise.resolve(saveCloudWorkspaceSnapshot()).catch(()=>{});
    }

    showToast(
        "Extra item removed",
        "success"
    );

    return true;
}


/* =====================================================
   CURRENT ORDER RECEIVED UNITS

   Uses transaction values including negative manual
   corrections so the total reflects actual quantity.
===================================================== */

function getCurrentOrderReceivedUnits(){

    return AppState.workspace
        .receivingHistory
        .reduce(
            (
                total,
                transaction
            )=>

                total +
                toNumber(
                    transaction.quantity,
                    0
                ),

            0
        );

}


/* =====================================================
   CURRENT ITEM TRANSACTIONS
===================================================== */

function getCurrentItemTransactions(
    itemCode
){

    const normalizedCode =
        normalizeItemCode(
            itemCode
        );

    return AppState.workspace
        .receivingHistory
        .filter(
            transaction=>

                normalizeItemCode(
                    transaction.itemCode
                )
                ===
                normalizedCode
        );
}


/* =====================================================
   RECEIVED QUANTITY INTEGRITY CHECK

   If an older UI action or interrupted save caused the
   item total to drift away from the transaction history,
   rebuild the total from the recorded receiving actions.
   Items with no history are left untouched to avoid data
   loss when importing older workspace formats.
===================================================== */

function reconcileReceivedQuantitiesFromHistory(
    options = {}
){

    const totals =
        new Map();

    AppState.workspace
        .receivingHistory
        .forEach(transaction=>{

            const itemCode =
                normalizeItemCode(
                    transaction.itemCode
                );

            const quantity =
                toNumber(
                    transaction.quantity,
                    0
                );

            if(!itemCode || !Number.isFinite(quantity)){
                return;
            }

            totals.set(
                itemCode,
                toNumber(
                    totals.get(itemCode),
                    0
                ) + quantity
            );

        });

    let corrections = 0;

    AppState.workspace
        .orderData
        .forEach(item=>{

            const itemCode =
                normalizeItemCode(
                    item.itemCode
                );

            if(!totals.has(itemCode)){
                return;
            }

            const expected =
                Math.max(
                    0,
                    toNumber(
                        totals.get(itemCode),
                        0
                    )
                );

            const current =
                toNumber(
                    item.receivedQty,
                    0
                );

            if(Math.abs(expected - current) < 0.000001){
                return;
            }

            item.receivedQty =
                expected;

            updateItemCalculatedFields(
                item
            );

            corrections++;

        });

    if(corrections > 0){

        recalculateStatistics();
        rebuildStateIndexes();

        if(options.silent !== true){

            showToast(
                corrections +
                " received quantity total(s) corrected from history",
                "success"
            );

        }

    }

    return corrections;
}


/* =====================================================
   VALIDATE WORKSPACE
===================================================== */

function validateReceivingWorkspace(){

    const result = {

        ready:true,

        errors:[],

        warnings:[]

    };

    if(
        AppState.workspace
            .orderData
            .length === 0
    ){

        result.ready =
            false;

        result.errors.push(
            "No order items loaded"
        );

    }

    if(
        AppState.workspace
            .mappingData
            .length === 0
    ){

        result.warnings.push(
            "No barcode mapping loaded"
        );

    }

    const missingMappings =
        typeof getItemsWithoutMapping ===
        "function"
        ?
        getItemsWithoutMapping()
        :
        [];

    if(missingMappings.length > 0){

        result.warnings.push(
            missingMappings.length +
            " item(s) do not have barcode mapping"
        );

    }

    return result;
}


/* =====================================================
   CURRENT RECEIVING SUMMARY
===================================================== */

function getCurrentReceivingSummary(){

    recalculateStatistics();

    return {

        orderId:
            AppState.workspace
                .orderId,

        totalItems:
            AppState.statistics
                .totalItems,

        completedItems:
            AppState.statistics
                .completedItems,

        remainingItems:
            AppState.statistics
                .remainingItems,

        overReceivedItems:
            AppState.statistics
                .overReceivedItems,

        manualItems:
            AppState.statistics
                .manualItems,

        totalTransactions:
            AppState.workspace
                .receivingHistory
                .length,

        totalReceivedUnits:
            getCurrentOrderReceivedUnits()

    };

}


/* =====================================================
   END RECEIVING ENGINE
===================================================== */
window.deleteManualItem = deleteManualItem;
