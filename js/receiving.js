"use strict";

/* =====================================================
   PHARMACY RECEIVING SYSTEM V3
   RECEIVING + MANUAL QUANTITY ENGINE
===================================================== */

const ReceivingEngine = {

    initialized:false,

    lastTransaction:null,

    recentScans:[],

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

function resolveCurrentWorkspaceGTIN(gtin){
    const normalized=normalizeGTIN(gtin);
    if(!normalized) return null;

    /*
       Current-session mappings are safe for a normal receive only when their
       mapped Item Code exists in the CURRENT workspace orderData.
       MASTER mappings are projected only for current order items; CLOUD
       mappings are the PC shared-session projection of those current items.
    */
    const indexedCode=normalizeItemCode(
        AppState?.indexes?.itemByGTIN?.get(normalized)||""
    );

    if(indexedCode){
        const item=(AppState?.workspace?.orderData||[]).find(row=>
            normalizeItemCode(row?.itemCode||"")===indexedCode
        )||null;

        if(item){
            return {
                item,
                itemCode:indexedCode,
                source:"CURRENT_WORKSPACE"
            };
        }
    }

    /* Defensive direct lookup in case index rebuild is one render behind. */
    const mapping=(AppState?.workspace?.mappingData||[]).find(record=>
        normalizeGTIN(record?.gtin||"")===normalized
    );

    if(!mapping) return null;

    const code=normalizeItemCode(mapping.itemCode||"");
    const item=(AppState?.workspace?.orderData||[]).find(row=>
        normalizeItemCode(row?.itemCode||"")===code
    )||null;

    return item
        ? {
            item,
            itemCode:code,
            source:mapping.source||"CURRENT_WORKSPACE"
        }
        : null;
}

async function receiveParsedBarcode(parsed){
    if(!parsed||!parsed.gtin){
        handleReceivingFailure("Barcode could not be identified");
        return false;
    }

    if(AppState.workspace.orderData.length===0){
        handleReceivingFailure("Load an order before receiving");
        return false;
    }

    const gtin=normalizeGTIN(parsed.gtin);
    if(!gtin){
        handleReceivingFailure("Barcode could not be identified");
        return false;
    }

    /* =========================================================
       PHASE 2C.10.6.1 — CURRENT SESSION FIRST

       The PC session already sends the exact current-order GTIN mappings to
       the Handheld. A normal scan must therefore resolve from the current
       workspace immediately instead of waiting for the entire 52k-record
       Global Master cache on the Handheld.
       ========================================================= */
    const current=resolveCurrentWorkspaceGTIN(gtin);

    if(current?.item){
        return receiveOrderItem({
            item:current.item,
            quantity:getValidReceivingQuantity(parsed.quantity),
            gtin,
            lot:parsed.lot,
            expiry:parsed.expiry,
            serial:parsed.serial,
            source:APP_CONFIG.transactionSources.scanner,
            manual:false
        });
    }

    /*
       Only scans NOT represented in the current session/order mapping need
       the complete Global Master / pharmacy-learned lookup to distinguish:
       known-extra vs true unknown.
    */
    let masterRecord=null;
    try{
        masterRecord=await getMasterGTINRecordByGTIN(gtin);
    }catch(error){
        Logger.warn("Global GTIN fallback lookup failed",error);
    }

    if(!masterRecord?.itemCode){
        return await quickResolveUnrecognizedGTIN(parsed,null);
    }

    const item=getReceivingItemByItemCode(masterRecord.itemCode);

    if(!item){
        return await quickResolveUnrecognizedGTIN(parsed,masterRecord);
    }

    addMappingRecord({
        itemCode:item.itemCode,
        gtin,
        source:masterRecord.source||"MASTER"
    });

    return receiveOrderItem({
        item,
        quantity:getValidReceivingQuantity(parsed.quantity),
        gtin,
        lot:parsed.lot,
        expiry:parsed.expiry,
        serial:parsed.serial,
        source:APP_CONFIG.transactionSources.scanner,
        manual:false
    });
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

function isHandheldCloudReceivingContext(){
    return !!(
        typeof isLikelyZebraDevice==="function" &&
        isLikelyZebraDevice() &&
        AppState?.session?.role==="ZEBRA" &&
        AppState?.session?.cloud===true &&
        AppState?.session?.id
    );
}

function getReceivingEligibleOrders(item){
    const selected=typeof getSelectedReceivingOrderNumbers==="function"
        ? getSelectedReceivingOrderNumbers()
        : [];
    const memberships=[...new Set((item?.orderNumbers||[item?.orderNumber])
        .map(normalizeOrderNumber).filter(Boolean))];

    if(memberships.length){
        return selected.length
            ? memberships.filter(order=>selected.includes(order))
            : memberships;
    }

    /* 2C.10.7.1 — LIVE HANDHELD SESSION RULE
       get_session_snapshot currently transports the PC session's aggregate
       order rows but not each row's local orderNumbers metadata. A row that
       exists in the authenticated live session snapshot is therefore already
       authoritative evidence that the item belongs to the PC's active session.
       Do NOT reclassify that row as Not in Order merely because browser-local
       membership metadata was not transported.

       If the PC exposed one concrete selected Order, use it. Otherwise return
       the live-session aggregate target; receiveOrderItem will update the
       shared item/ledger without inventing a false manual/over-stock item. */
    if(isHandheldCloudReceivingContext()){
        if(selected.length===1) return [selected[0]];
        return ["__LIVE_SESSION__"];
    }

    return [];
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
    if(orderNumber==="__LIVE_SESSION__"){
        const ordered=toNumber(item?.orderedQty,0);
        const received=toNumber(item?.receivedQty,0);
        return {orderedQty:ordered,receivedQty:received,remainingQty:Math.max(0,ordered-received)};
    }
    const row=getReceivingOrderRow(item,orderNumber);
    if(!row) return null;
    const ordered=toNumber(row["Ordered Qty"],0);
    const received=toNumber(row["Received Qty"],0);
    return {orderedQty:ordered,receivedQty:received,remainingQty:Math.max(0,ordered-received)};
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

    if(gtin){
        addMappingRecord({
            itemCode,
            gtin,
            source:"MASTER"
        });
    }

    return item;
}

function renderKnownNotInOrderHandheld(parsed,masterRecord){
    clearHandheldActionCard();

    const lastScan=document.getElementById("lastScanCard");
    if(!lastScan) return false;

    const gtin=normalizeGTIN(parsed?.gtin||"");
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
      <label class="handheldReviewQtyLabel">
        <span>PHYSICAL QTY</span>
        <input id="handheldKnownExtraQty" type="number" min="1" step="1" inputmode="numeric" value="1">
      </label>
      <button id="btnHandheldAddExtra" class="handheldReviewSave" type="button">
        ${needsPharmacistTarget ? "SAVE EXTRA FOR REVIEW" : "ADD EXTRA & NEXT"}
      </button>
    `;

    lastScan.insertAdjacentElement("afterend",card);

    const qty=card.querySelector("#handheldKnownExtraQty");

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
            submit();
        }
    });

    card.querySelector("#btnHandheldAddExtra")
        ?.addEventListener("click",submit);

    setTimeout(()=>{
        try{
            qty?.focus({preventScroll:true});
            qty?.select();
        }catch(_){}
    },30);

    return true;
}

async function renderUnknownGTINHandheld(parsed,options={}){
    clearHandheldActionCard();

    const gtin=normalizeGTIN(parsed?.gtin||"");
    if(!gtin){
        handleReceivingFailure("Barcode could not be identified");
        return false;
    }

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
          <span>GTIN</span>
          <strong>${escapeHTML(gtin)}</strong>
          <small>✓ SAVED TO NEEDS REVIEW</small>
        </div>

        <button id="btnHandheldReviewPhoto" class="handheldPhotoButton" type="button">
          📷 PHOTO <small>OPTIONAL</small>
        </button>
        <input id="handheldReviewPhotoInput" type="file" accept="image/*" capture="environment" hidden>

        <label class="handheldReviewQtyLabel">
          <span>PHYSICAL QTY</span>
          <input id="handheldReviewQty" type="number" min="1" step="1" inputmode="numeric" value="1">
        </label>

        <button id="btnSaveHandheldReview" class="handheldReviewSave" type="button">SAVE &amp; NEXT</button>
      </div>
    `;

    lastScan.insertAdjacentElement("afterend",card);
    flashHandheldRed();

    const photoButton=card.querySelector("#btnHandheldReviewPhoto");
    const photoInput=card.querySelector("#handheldReviewPhotoInput");
    const qty=card.querySelector("#handheldReviewQty");
    const saveButton=card.querySelector("#btnSaveHandheldReview");

    photoButton?.addEventListener("click",()=>photoInput?.click());

    photoInput?.addEventListener("change",async()=>{
        const file=photoInput.files?.[0];
        if(!file) return;

        photoButton.disabled=true;
        photoButton.textContent="UPLOADING PHOTO…";

        try{
            await nrV2UploadPhoto(draft.review_id,file);
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

            card.querySelector(".handheldReviewStatus").textContent="SAVED FOR REVIEW ✓";
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
            finish();
        }
    });

    saveButton?.addEventListener("click",finish);
    setTimeout(()=>{qty?.focus({preventScroll:true});qty?.select();},60);

    refreshNeedsReviewCounters?.();
    return true;
}

async function quickResolveUnrecognizedGTIN(parsed,knownRecord=null){
    const gtin=normalizeGTIN(parsed?.gtin||"");
    if(!gtin){
        handleReceivingFailure("Barcode could not be identified");
        return false;
    }

    let masterRecord=null;
    try{
        masterRecord=await getMasterGTINRecordByGTIN(gtin);
    }catch(_){}

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

function openQuickGTINResolver(parsed,knownRecord=null){
    return new Promise(resolve=>{
        const gtin=normalizeGTIN(parsed.gtin);
        document.getElementById("quickGTINResolver")?.remove();

        const panel=document.createElement("div");
        panel.id="quickGTINResolver";
        panel.className="gtinResolutionShell open";
        panel.setAttribute("role","dialog");
        panel.setAttribute("aria-modal","true");
        panel.setAttribute("aria-label","GTIN resolution");

        const knownCode=normalizeItemCode(knownRecord?.itemCode||"");
        const knownName=toSafeString(knownRecord?.itemName||knownRecord?.name||knownCode);
        const selectedOrders=typeof getSelectedReceivingOrderNumbers==="function" ? getSelectedReceivingOrderNumbers() : [];
        const knownOrderOptions=selectedOrders.map(order=>`<option value="${escapeHTML(order)}">${escapeHTML(order)}</option>`).join("");
        const knownBlock=knownCode ? `
          <section class="gtinSuggestedMatch">
            <span class="gtinMiniLabel">MASTER MATCH · KNOWN ITEM</span>
            <strong>${escapeHTML(knownName)}</strong>
            <small>Item ${escapeHTML(knownCode)} · GTIN ${escapeHTML(gtin)} · Not in the selected order</small>
            ${selectedOrders.length>1?`<label class="gtinKnownTarget">Target Order<select data-known-order>${knownOrderOptions}</select></label>`:""}
            <button type="button" class="gtinPrimaryAction" data-known>ADD &amp; RECEIVE</button>
          </section>` : "";

        panel.innerHTML=`
          <button type="button" class="gtinResolutionScrim" data-close aria-label="Close"></button>
          <aside class="gtinResolutionPanel">
            <header class="gtinResolutionHeader">
              <div><span class="gtinActionBadge">ACTION REQUIRED</span><h2>Match this GTIN</h2><p>One quick decision, then scanning resumes automatically.</p></div>
              <button type="button" class="gtinCloseButton" data-close aria-label="Close">✕</button>
            </header>
            <div class="gtinReadout"><span>SCANNED GTIN</span><strong>${escapeHTML(gtin)}</strong></div>
            ${knownBlock}
            <section class="gtinResolutionSection">
              <label class="gtinResolutionLabel" for="gtinResolutionSearch">Find item in current order</label>
              <input id="gtinResolutionSearch" data-search class="gtinResolutionSearch" placeholder="Search item name or item code" autocomplete="off">
              <div data-results class="gtinResolutionResults"></div>
            </section>
            ${knownCode ? "" : `<section class="gtinResolutionSection gtinManualExtra"><div><span class="gtinMiniLabel">NOT IN THE ORDER?</span><strong>Add new Extra item</strong></div><div class="gtinExtraGrid"><input data-code placeholder="Item Code" autocomplete="off"><input data-name placeholder="Item Name" autocomplete="off"><button type="button" class="gtinSecondaryAction" data-extra>Add Extra &amp; Receive +1</button></div></section>`}
            <footer class="gtinResolutionFooter"><span>Resolve now or send this scan to Needs Review.</span><div><button type="button" data-review>Save for Review</button><button type="button" data-close>Cancel</button></div></footer>
          </aside>`;
        document.body.appendChild(panel);

        const results=panel.querySelector('[data-results]');
        const search=panel.querySelector('[data-search]');
        let finished=false;
        const finish=v=>{
            if(finished) return;
            finished=true;
            panel.remove();
            if(typeof setScanBoxState==="function") setScanBoxState(v?"success":"ready");
            setTimeout(()=>{ if(typeof focusScannerInput==="function") focusScannerInput(); },30);
            resolve(v);
        };
        const receiveMatched=async(item,manual=false)=>{
            try{
                await savePharmacyLearnedGTIN(gtin,item.itemCode,item.itemName);
                addMappingRecord({itemCode:item.itemCode,gtin,source:"PHARMACY_LEARNED"});
                const tx=await receiveOrderItem({item,quantity:getValidReceivingQuantity(parsed.quantity),gtin,lot:parsed.lot,expiry:parsed.expiry,serial:parsed.serial,source:APP_CONFIG.transactionSources.scanner,manual});
                finish(tx);
            }catch(e){
                if(typeof setScanBoxState==="function") setScanBoxState("error");
                const msg=panel.querySelector('.gtinPanelMessage');
                if(msg) msg.textContent=e.message||"Unable to save GTIN";
            }
        };
        const render=()=>{
            const q=toSafeString(search.value).toLowerCase().trim();
            const items=(AppState.workspace.orderData||[]).filter(i=>!q||toSafeString(i.itemName).toLowerCase().includes(q)||toSafeString(i.itemCode).toLowerCase().includes(q)).slice(0,8);
            results.innerHTML=items.length?items.map((i,n)=>`<button type="button" class="gtinResult" data-i="${n}"><span><strong>${escapeHTML(i.itemName)}</strong><small>Item ${escapeHTML(i.itemCode)}</small></span><b>Link GTIN &amp; Receive +1</b></button>`).join(''):'<div class="gtinNoResult">No matching order item.</div>';
            results.querySelectorAll('[data-i]').forEach(btn=>btn.onclick=()=>receiveMatched(items[Number(btn.dataset.i)],false));
        };
        search.oninput=render; render();
        panel.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>finish(false));
        panel.querySelector('[data-review]')?.addEventListener('click',async()=>{
            try{ await saveReceivingNeedsReview(parsed); if(typeof refreshNeedsReviewCounters==="function")refreshNeedsReviewCounters(); finish(true); }
            catch(error){ if(typeof setScanBoxState==="function")setScanBoxState("error"); }
        });
        panel.querySelector('[data-known]')?.addEventListener('click',async()=>{
            try{
                const targetOrder=normalizeOrderNumber(
                    panel.querySelector("[data-known-order]")?.value || selectedOrders[0] || ""
                );
                if(!targetOrder) throw new Error("Select the target Order");
                const item=prepareManualExtraItem(knownCode,knownName,gtin,targetOrder);
                const tx=receiveOrderItem({
                    item,
                    quantity:getValidReceivingQuantity(parsed.quantity),
                    gtin,
                    lot:parsed.lot,
                    expiry:parsed.expiry,
                    serial:parsed.serial,
                    source:APP_CONFIG.transactionSources.scanner,
                    manual:true
                });
                if(!tx) throw new Error("Unable to add unordered item");
                finish(tx);
            }catch(error){
                if(typeof setScanBoxState==="function") setScanBoxState("error");
                const msg=panel.querySelector('.gtinPanelMessage');
                if(msg) msg.textContent=error?.message||"Unable to add item";
            }
        });
        panel.querySelector('[data-extra]')?.addEventListener('click',async()=>{
            const code=normalizeItemCode(panel.querySelector('[data-code]').value), name=toSafeString(panel.querySelector('[data-name]').value).trim();
            if(!code||!name){ panel.querySelector('.gtinPanelMessage').textContent="Enter Item Code and Item Name"; return; }
            try{
                await savePharmacyLearnedGTIN(gtin,code,name);
                let item=upsertOrderItem({itemCode:code,itemName:name,orderedQty:0,receivedQty:0,manual:true}); item.manual=true;
                const tx=await receiveOrderItem({item,quantity:getValidReceivingQuantity(parsed.quantity),gtin,lot:parsed.lot,expiry:parsed.expiry,serial:parsed.serial,source:APP_CONFIG.transactionSources.scanner,manual:true});
                finish(tx);
            }catch(e){ if(typeof setScanBoxState==="function") setScanBoxState("error"); panel.querySelector('.gtinPanelMessage').textContent=e.message||"Unable to add extra"; }
        });
        const footer=panel.querySelector('.gtinResolutionFooter');
        footer.insertAdjacentHTML('beforebegin','<div class="gtinPanelMessage" aria-live="polite"></div>');
        setTimeout(()=>search.focus(),80);
    });
}

/* =====================================================
   FIND ITEM BY GTIN
===================================================== */

function findReceivingItemByGTIN(gtin){

    const normalized =
        normalizeGTIN(
            gtin
        );

    if(!normalized){
        return null;
    }

    let item =
        getItemByGTIN(
            normalized
        );

    if(item){
        return item;
    }

    const variants =
        createGTINVariants(
            normalized
        );

    for(const variant of variants){

        const itemCode =
            AppState.indexes
                .itemByGTIN
                .get(
                    variant
                );

        if(!itemCode){
            continue;
        }

        item =
            getItemByCode(
                itemCode
            );

        if(item){
            return item;
        }

    }

    return null;
}


/* =====================================================
   FALLBACK: DIRECT GLOBAL GTIN -> CURRENT ORDER
   Phase 2B.8
===================================================== */

async function findReceivingItemByGlobalGTIN(gtin){

    if(typeof getMasterGTINRecordByGTIN !== "function"){
        return null;
    }

    try{

        const record = await getMasterGTINRecordByGTIN(gtin);

        if(!record || !record.itemCode){
            return null;
        }

        const itemCode = normalizeItemCode(record.itemCode);
        const item = getItemByCode(itemCode);

        /* The Global GTIN may know the product, but receiving is only
           allowed when that Item Number actually exists in this order. */
        if(!item){
            return null;
        }

        if(record.category && !item.category){
            item.category = toSafeString(record.category);
        }

        addMappingRecord({
            itemCode:itemCode,
            gtin:normalizeGTIN(record.gtin || gtin),
            source:"MASTER"
        });

        return item;

    }
    catch(error){
        Logger.warn("Direct Global GTIN receiving lookup failed",error);
        return null;
    }
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
                targetOrder

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

        manual:
            options.manual === true,

        targetOrder:
            options.targetOrder || ""

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
       Manual items retain Manual status.
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
    const entry=ReceivingEngine.recentScans.find(row=>row.transactionId===transactionId);
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

    const oldReceived =
        toNumber(
            item.receivedQty,
            0
        );

    const newReceived =
        oldReceived +
        difference;

    if(newReceived < 0){

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

        const ordered =
            toNumber(
                item.orderedQty,
                0
            );

        if(newReceived > ordered){

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
                resolveReceivingTransactionOrder(item),

            selectedOrderNumber:
                resolveReceivingTransactionOrder(item),

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

    showToast(
        item.itemName +
        "  " +
        sign +
        difference +
        " → Received " +
        item.receivedQty,
        "success"
    );

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
   MANUAL ITEM
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
            "Manual item form is unavailable",
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
       New manual item
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
            "Unable to add manual item",
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
                "Master GTIN lookup for manual item failed",
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

            /* Distinguish first creation of an unordered/manual item
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
   DELETE MANUAL ITEM

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
            "Only manual items can be deleted",
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
       workspace. A zero-quantity manual item must not reappear after reload. */
    if(typeof saveWorkspaceSnapshot === "function"){
        saveWorkspaceSnapshot();
    }

    if(typeof saveCloudWorkspaceSnapshot === "function"){
        Promise.resolve(saveCloudWorkspaceSnapshot()).catch(()=>{});
    }

    showToast(
        "Manual item removed",
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
