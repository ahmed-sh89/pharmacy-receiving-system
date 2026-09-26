"use strict";

/* =====================================================
   PHARMACY RECEIVING SYSTEM V3
   SMART UI ENGINE
===================================================== */

const UI = {

    initialized:false,

    elements:{},

    confirmCallback:null,

    searchResults:[],

    reportSearchResults:[],

    receivingFilters:{
        issues:new Set(["not_received","partial","received_any","over","manual"]),
        category:"all",
        classification:{groups:[],categories:[],subCategories:[]},
        search:""
    },

    smartScan:{
        container:null,
        results:null,
        selectedItem:null,
        quantity:1
    }

};


/* =====================================================
   CACHE ELEMENTS
===================================================== */

function cacheUIElements(){

    UI.elements = {

        pageTitle:
            document.getElementById("pageTitle"),

        pageSubtitle:
            document.getElementById("pageSubtitle"),

        headerOrderId:
            document.getElementById("headerOrderId"),

        headerSessionId:
            document.getElementById("headerSessionId"),

        systemStatus:
            document.getElementById("systemStatus"),

        barcodeInput:
            document.getElementById("barcodeInput"),

        scanBox:
            document.getElementById("scanBox"),

        scanStatusBadge:
            document.getElementById("scanStatusBadge"),

        statTotalItems:
            document.getElementById("statTotalItems"),

        statCompleted:
            document.getElementById("statCompleted"),

        statRemainingItems:
            document.getElementById("statRemainingItems"),

        statRemaining:
            document.getElementById("statRemaining"),

        statOver:
            document.getElementById("statOver"),

        statManual:
            document.getElementById("statManual"),

        statScans:
            document.getElementById("statScans"),

        progressBar:
            document.getElementById("progressBar"),

        progressLabel:
            document.getElementById("progressLabel"),

        progressCompletedText:
            document.getElementById("progressCompletedText"),

        progressRemainingText:
            document.getElementById("progressRemainingText"),

        lastScanCard:
            document.getElementById("lastScanCard"),

        lastItemName:
            document.getElementById("lastItemName"),

        lastItemCode:
            document.getElementById("lastItemCode"),

        lastGTIN:
            document.getElementById("lastGTIN"),

        lastOrderedQty:
            document.getElementById("lastOrderedQty"),

        lastReceivedQty:
            document.getElementById("lastReceivedQty"),

        lastRemainingQty:
            document.getElementById("lastRemainingQty"),

        lastItemStatus:
            document.getElementById("lastItemStatus"),

        lastScanTime:
            document.getElementById("lastScanTime"),

        receivingTableBody:
            document.getElementById("receivingTableBody"),

        receivingIssueFilter:
            document.getElementById("receivingIssueFilter"),

        receivingCategoryFilter:
            document.getElementById("receivingCategoryFilter"),

        archiveTableBody:
            document.getElementById("archiveTableBody"),

        itemReportTableBody:
            document.getElementById("itemReportTableBody"),

        orderFilesList:
            document.getElementById("orderFilesList"),

        mappingFilesList:
            document.getElementById("mappingFilesList"),

        masterGTINStatus:
            document.getElementById("masterGTINStatus"),

        masterGTINItemCount:
            document.getElementById("masterGTINItemCount"),

        masterGTINMatchedCount:
            document.getElementById("masterGTINMatchedCount"),

        masterGTINUpdatedAt:
            document.getElementById("masterGTINUpdatedAt"),

        masterGTINNotice:
            document.getElementById("masterGTINNotice"),

        healthOrderItems:
            document.getElementById("healthOrderItems"),

        healthMappings:
            document.getElementById("healthMappings"),

        healthMissingBarcode:
            document.getElementById("healthMissingBarcode"),

        healthDuplicateGTIN:
            document.getElementById("healthDuplicateGTIN"),

        sessionPageId:
            document.getElementById("sessionPageId"),

        sessionDeviceId:
            document.getElementById("sessionDeviceId"),

        sessionQueueCount:
            document.getElementById("sessionQueueCount"),

        sessionLastSave:
            document.getElementById("sessionLastSave"),

        archiveOrderCount:
            document.getElementById("archiveOrderCount"),

        archiveTransactionCount:
            document.getElementById("archiveTransactionCount"),

        searchModal:
            document.getElementById("searchModal"),

        globalSearchInput:
            document.getElementById("globalSearchInput"),

        globalSearchResults:
            document.getElementById("globalSearchResults"),

        manualItemModal:
            document.getElementById("manualItemModal"),

        manualItemCode:
            document.getElementById("manualItemCode"),

        manualItemName:
            document.getElementById("manualItemName"),

        manualItemQuantity:
            document.getElementById("manualItemQuantity"),

        confirmModal:
            document.getElementById("confirmModal"),

        confirmTitle:
            document.getElementById("confirmTitle"),

        confirmMessage:
            document.getElementById("confirmMessage"),

        toastContainer:
            document.getElementById("toastContainer"),

        loadingOverlay:
            document.getElementById("loadingOverlay"),

        loadingText:
            document.getElementById("loadingText"),

        reportItemSearch:
            document.getElementById("reportItemSearch"),

        reportItemResults:
            document.getElementById("reportItemResults"),

        reportSelectedItem:
            document.getElementById("reportSelectedItem"),

        reportSelectedCode:
            document.getElementById("reportSelectedCode"),

        reportTotalReceived:
            document.getElementById("reportTotalReceived"),

        reportOrderCount:
            document.getElementById("reportOrderCount")

    };

}


/* =====================================================
   INITIALIZE UI
===================================================== */

function initializeUI(){

    if(UI.initialized){
        return;
    }

    cacheUIElements();

    createSmartScanSearchUI();

    initializeZebraInterface();

    moveLastScanBelowScanBox();

    createProfessionalLastScanLayout();

    createLastScanQuantityControls();

    bindDashboardStatDrilldowns();

    createOrderStatusReportButton();

    bindUIEvents();

    bindUIStateEvents();

    refreshEntireUI();

    UI.initialized = true;

    Logger.info(
        "Smart UI initialized"
    );

}


/* =====================================================
   CREATE SMART SCAN SEARCH AREA
===================================================== */

function createSmartScanSearchUI(){

    const scanPanel =
        document.querySelector(
            ".scanPanel"
        );

    const scanBox =
        UI.elements.scanBox;

    if(
        !scanPanel ||
        !scanBox
    ){
        return;
    }

    if(
        document.getElementById(
            "smartScanSearchArea"
        )
    ){
        return;
    }

    const wrapper =
        document.createElement(
            "div"
        );

    wrapper.id =
        "smartScanSearchArea";

    wrapper.className =
        "smartScanSearchArea";

    wrapper.innerHTML = `

        <div
            id="smartScanResults"
            class="smartScanResults"
        ></div>

        <div
            id="smartScanSelected"
            class="smartScanSelected hidden"
        >

            <div class="smartSelectedMain">

                <div>

                    <span class="sectionEyebrow">
                        SELECTED ITEM
                    </span>

                    <h3 id="smartSelectedName">
                        -
                    </h3>

                    <div class="smartSelectedCode">
                        Item Number:
                        <strong id="smartSelectedCode">
                            -
                        </strong>
                    </div>

                </div>

                <button
                    id="btnCloseSmartSelection"
                    type="button"
                    class="iconButton"
                >
                    ✕
                </button>

            </div>

            <div class="smartSelectedStats">

                <div>
                    <span>Ordered</span>
                    <strong id="smartSelectedOrdered">0</strong>
                </div>

                <div>
                    <span>Received</span>
                    <strong id="smartSelectedReceived">0</strong>
                </div>

                <div>
                    <span>Remaining</span>
                    <strong id="smartSelectedRemaining">0</strong>
                </div>

            </div>

            <div class="smartQuantityRow">

                <span class="smartQuantityLabel">
                    Quantity
                </span>

                <div class="smartQuantityControl">

                    <button
                        id="btnSmartQtyMinus"
                        type="button"
                        class="quantityButton"
                    >
                        −
                    </button>

                    <input
                        id="smartQuantityInput"
                        type="number"
                        inputmode="numeric"
                        pattern="[0-9]*"
                        min="1"
                        step="1"
                        value="1"
                    >

                    <button
                        id="btnSmartQtyPlus"
                        type="button"
                        class="quantityButton"
                    >
                        +
                    </button>

                </div>

                <button
                    id="btnAddSmartQuantity"
                    type="button"
                    class="primaryButton"
                >
                    Add Quantity
                </button>

            </div>

        </div>

    `;

    scanBox.insertAdjacentElement(
        "afterend",
        wrapper
    );

    UI.smartScan.container =
        wrapper;

    UI.smartScan.results =
        document.getElementById(
            "smartScanResults"
        );

    bindSmartScanSelectionControls();

}


/* =====================================================
   MOVE LAST SCAN
===================================================== */


let receivingAutoClearTimer=null;
let receivingAutoClearKey="";

function cancelReceivingAutoClear(){
    clearTimeout(receivingAutoClearTimer);
    receivingAutoClearTimer=null;
    receivingAutoClearKey="";
}

function receivingLastScanKey(scan){
    if(!scan) return "";

    return toSafeString(
        scan.transactionId ||
        [
            scan.itemCode,
            scan.dateTime,
            scan.receivedQty,
            scan.gtin
        ].join("|")
    );
}

function scheduleReceivingAutoClear(scan){
    if(!scan) return;

    const key=receivingLastScanKey(scan);

    /* Cloud/workspace refreshes may render Last Scan repeatedly. The timer is
       tied to the actual scan identity, so sync cannot postpone the 30-second
       operator inactivity boundary. */
    if(!key || key===receivingAutoClearKey) return;

    cancelReceivingAutoClear();
    receivingAutoClearKey=key;

    receivingAutoClearTimer=setTimeout(()=>{
        const current=AppState?.workspace?.lastScan;

        if(!current || receivingLastScanKey(current)!==key) return;

        let isHandheld=false;
        try{
            isHandheld=typeof isLikelyZebraDevice==="function" && isLikelyZebraDevice();
        }catch(_){}

        /* PC quantity editing is deliberate activity. Handheld has no modal
           dependency here, so its Last Scan always clears after 30 seconds. */
        if(!isHandheld){
            const quantityModal=document.getElementById("quantityAdjustmentModal");
            if(quantityModal?.classList?.contains("open")){
                receivingAutoClearKey="";
                scheduleReceivingAutoClear(current);
                return;
            }
        }

        /* UI/local-batch boundary only. Never reverse a receiving transaction
           or change cumulative Received/history. */
        if(typeof resetCurrentLocalBatch==="function") resetCurrentLocalBatch();

        AppState.workspace.lastScan=null;
        cancelReceivingAutoClear();
        refreshEntireUI?.();
        window.hhRefreshReadyState?.();

        try{ document.activeElement?.blur?.(); }catch(_){}
        setTimeout(()=>{
            focusScannerInput?.();
            if(isHandheld) window.hhRepairScannerFocus?.("last-scan-auto-clear");
        },30);
    },30000);
}


function ensurePcClearScreenButton(){
    if(typeof isLikelyZebraDevice==="function" && isLikelyZebraDevice()){
        return;
    }

    const card=document.getElementById("lastScanCard");
    if(!card) return;

    let button=document.getElementById("btnPcClearLastScan");

    if(!button){
        button=document.createElement("button");
        button.id="btnPcClearLastScan";
        button.type="button";
        button.className="pcClearLastScan";
        button.textContent="CLEAR SCREEN";

        const heading=card.querySelector(".cardHeader");
        if(heading){
            heading.appendChild(button);
        }else{
            card.appendChild(button);
        }
    }

    button.onclick=()=>{
        /*
           Visual-only clear. Does not modify receiving quantities/history.
        */
        cancelReceivingAutoClear();

        /* CLEAR SCREEN is UI-only for shared receiving data, but it is an
           explicit boundary for this PC's local current batch. */
        if(typeof resetCurrentLocalBatch === "function"){
            resetCurrentLocalBatch();
        }

        AppState.workspace.lastScan=null;
        refreshEntireUI?.();

        try{ document.activeElement?.blur?.(); }catch(_){}
        setTimeout(()=>focusScannerInput?.(),30);
    };
}

function moveLastScanBelowScanBox(){

    const lastScanCard =
        UI.elements.lastScanCard;

    const smartArea =
        document.getElementById(
            "smartScanSearchArea"
        );

    if(
        !lastScanCard ||
        !smartArea
    ){
        return;
    }

    smartArea.insertAdjacentElement(
        "afterend",
        lastScanCard
    );

}


/* =====================================================
   SMART SCAN CONTROLS
===================================================== */

function bindSmartScanSelectionControls(){

    document
        .getElementById(
            "btnCloseSmartSelection"
        )
        ?.addEventListener(
            "click",
            function(){

                closeSmartScanSearch(
                    true
                );

            }
        );


    document
        .getElementById(
            "btnSmartQtyMinus"
        )
        ?.addEventListener(
            "click",
            function(){

                const input =
                    document.getElementById(
                        "smartQuantityInput"
                    );

                if(!input){
                    return;
                }

                const current =
                    Math.max(
                        1,
                        toInteger(
                            input.value,
                            1
                        )
                    );

                input.value =
                    Math.max(
                        1,
                        current - 1
                    );

            }
        );


    document
        .getElementById(
            "btnSmartQtyPlus"
        )
        ?.addEventListener(
            "click",
            function(){

                const input =
                    document.getElementById(
                        "smartQuantityInput"
                    );

                if(!input){
                    return;
                }

                const current =
                    Math.max(
                        1,
                        toInteger(
                            input.value,
                            1
                        )
                    );

                input.value =
                    current + 1;

            }
        );


    document
        .getElementById(
            "btnAddSmartQuantity"
        )
        ?.addEventListener(
            "click",
            addSelectedSmartQuantity
        );

    document
        .getElementById(
            "smartQuantityInput"
        )
        ?.addEventListener(
            "keydown",
            function(event){
                let isHandheld=false;
                try{
                    isHandheld=typeof isLikelyZebraDevice === "function" && isLikelyZebraDevice();
                }catch(_){ }

                if(isHandheld || event.key !== "Enter" || event.repeat){
                    return;
                }

                event.preventDefault();
                event.stopPropagation();
                addSelectedSmartQuantity();
            }
        );

}


/* =====================================================
   SMART SEARCH INPUT
===================================================== */

function getReceivingSearchProjection(){
    const selectedOrders=typeof getSelectedReceivingOrderNumbers==="function"
        ? getSelectedReceivingOrderNumbers().map(normalizeOrderNumber).filter(Boolean)
        : [];
    if(typeof getPerOrderReceivingRows!=="function"||!selectedOrders.length){
        return typeof getSearchableItems==="function" ? getSearchableItems() : [];
    }

    const byCode=new Map();
    selectedOrders.forEach(order=>{
        getPerOrderReceivingRows(order).forEach(row=>{
            const code=toSafeString(row["Item Number"]||"").trim();
            if(!code) return;
            const key=normalizeItemCode(code);
            const current=byCode.get(key)||{
                itemCode:code,
                itemName:toSafeString(row["Item Name"]||""),
                orderedQty:0,
                receivedQty:0,
                remainingQty:0,
                orderNumbers:[],
                manual:row.issueKey==="manual"
            };
            current.orderedQty+=toNumber(row["Ordered Qty"],0);
            current.receivedQty+=toNumber(row["Received Qty"],0);
            current.remainingQty+=Math.max(0,toNumber(row["Ordered Qty"],0)-toNumber(row["Received Qty"],0));
            if(!current.orderNumbers.includes(order)) current.orderNumbers.push(order);
            byCode.set(key,current);
        });
    });
    return [...byCode.values()];
}

function handleSmartScanSearchInput(
    searchText
){

    const query =
        normalizeText(
            searchText
        );

    if(!query){

        closeSmartScanSearch(
            false
        );

        return;
    }

    const results =
        searchItems(
            getReceivingSearchProjection(),
            query,
            APP_CONFIG
                .receiving
                .searchResultLimit
        );

    renderSmartScanSearchResults(
        results,
        query
    );

}


/* =====================================================
   SMART SEARCH RESULTS
===================================================== */

function renderSmartScanSearchResults(
    results,
    query = ""
){

    const container =
        UI.smartScan.results
        ||
        document.getElementById(
            "smartScanResults"
        );

    if(!container){
        return;
    }

    container.innerHTML =
        "";

    if(
        !Array.isArray(results) ||
        results.length === 0
    ){

        if(query){

            container.innerHTML = `

                <div class="smartSearchEmpty">

                    No matching item found for:

                    <strong>
                        ${escapeHTML(query)}
                    </strong>

                </div>

            `;

        }

        return;
    }

    const fragment =
        document.createDocumentFragment();

    results.forEach(item=>{

        const row = document.createElement("div");
        row.className = "smartSearchResultRow";
        row.style.display = "flex";
        row.style.alignItems = "stretch";
        row.style.gap = "6px";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "smartSearchResult";
        button.style.flex = "1 1 auto";
        button.innerHTML = `
            <div class="smartSearchResultMain">
                <strong>${escapeHTML(item.itemName)}</strong>
                <span>${escapeHTML(item.itemCode)}</span>
            </div>
            <div class="smartSearchResultQty pfnSearchQtySplit">
                <span><small>ORDER</small><b>${toNumber(item.orderedQty,0)}</b></span>
                <span><small>RECEIVED</small><b>${toNumber(item.receivedQty,0)}</b></span>
            </div>`;

        button.addEventListener("click",function(){
            selectSmartScanItem(item);
        });
        row.appendChild(button);

        /* Phase 2C.7.6: the Dashboard inline search must expose the same
           historical review/correction workflow as the Receiving search. */
        if(item.manual===true && toNumber(item.receivedQty,0)===0){
            const remove=document.createElement("button");
            remove.type="button";
            remove.className="secondaryButton removeManualSearchButton";
            remove.textContent="Remove Manual Item";
            remove.style.flex="0 0 auto";
            remove.addEventListener("click",function(event){
                event.preventDefault();
                event.stopPropagation();
                if(typeof deleteManualItem==="function" && deleteManualItem(item.itemCode)){
                    renderSmartScanSearchResults(
                        searchItems(
                            getSearchableItems(),
                            query,
                            APP_CONFIG.receiving.searchResultLimit
                        ),
                        query
                    );
                }
            });
            row.appendChild(remove);
        }

        const review=document.createElement("button");
        review.type="button";
        review.className="secondaryButton smartSearchReviewButton";
        review.textContent="Review / Adjust";
        review.style.flex="0 0 132px";
        review.addEventListener("click",function(event){
            event.preventDefault();
            event.stopPropagation();
            closeSmartScanSearch(false);
            openSearchedItemReview(item);
        });
        row.appendChild(review);

        fragment.appendChild(row);

    });

    container.appendChild(
        fragment
    );

}


/* =====================================================
   SELECT SMART ITEM
===================================================== */

function selectSmartScanItem(item){

    if(!item){
        return;
    }

    UI.smartScan.selectedItem =
        item;

    const results =
        document.getElementById(
            "smartScanResults"
        );

    const selected =
        document.getElementById(
            "smartScanSelected"
        );

    if(results){

        results.innerHTML =
            "";

    }

    if(selected){

        selected.classList.remove(
            "hidden"
        );

    }

    setElementText(
        document.getElementById(
            "smartSelectedName"
        ),
        item.itemName
    );

    setElementText(
        document.getElementById(
            "smartSelectedCode"
        ),
        item.itemCode
    );

    setElementText(
        document.getElementById(
            "smartSelectedOrdered"
        ),
        toNumber(
            item.orderedQty,
            0
        )
    );

    setElementText(
        document.getElementById(
            "smartSelectedReceived"
        ),
        toNumber(
            item.receivedQty,
            0
        )
    );

    setElementText(
        document.getElementById(
            "smartSelectedRemaining"
        ),
        toNumber(
            item.remainingQty,
            0
        )
    );

    const quantityInput =
        document.getElementById(
            "smartQuantityInput"
        );

    if(quantityInput){

        quantityInput.value =
            "1";

        setTimeout(()=>{

            quantityInput.focus();

            quantityInput.select();

        },30);

    }

}


/* =====================================================
   ADD SELECTED SMART QUANTITY
===================================================== */

function addSelectedSmartQuantity(){

    const item =
        UI.smartScan.selectedItem;

    if(!item){

        showToast(
            "Select an item first",
            "warning"
        );

        return false;
    }

    const quantityInput =
        document.getElementById(
            "smartQuantityInput"
        );

    const quantity =
        quantityInput
        ?
        toNumber(
            quantityInput.value,
            0
        )
        :
        0;

    if(
        !Number.isFinite(quantity) ||
        quantity <= 0
    ){

        showToast(
            "Enter a valid quantity",
            "warning"
        );

        return false;
    }

    const transaction =
        addSearchItemQuantity(
            item.itemCode,
            quantity
        );

    if(transaction){

        const barcodeInput =
            UI.elements.barcodeInput;

        if(barcodeInput){

            barcodeInput.value =
                "";

        }

        closeSmartScanSearch(
            false
        );

        focusScannerInput();

    }

    return transaction;
}


/* =====================================================
   CLOSE SMART SEARCH
===================================================== */

function closeSmartScanSearch(
    clearInput = false
){

    const results =
        document.getElementById(
            "smartScanResults"
        );

    const selected =
        document.getElementById(
            "smartScanSelected"
        );

    if(results){

        results.innerHTML =
            "";

    }

    if(selected){

        selected.classList.add(
            "hidden"
        );

    }

    UI.smartScan.selectedItem =
        null;

    if(
        clearInput &&
        UI.elements.barcodeInput
    ){

        UI.elements
            .barcodeInput
            .value =
            "";

    }

    if(clearInput){

        focusScannerInput();

    }

}


/* =====================================================
   GLOBAL UI EVENTS
===================================================== */

function bindUIEvents(){

    setupDashboardKpiInteractivity();
    setupPhase263ActionDelegation();
    refreshScanSafetyUI();

    document.getElementById("btnExportReceivingSummaryExcel")?.addEventListener("click",()=>{ if(typeof exportReceivingSummaryExcel==="function") exportReceivingSummaryExcel(); });
    document.getElementById("btnExportReceivingSummaryPDF")?.addEventListener("click",()=>{ if(typeof exportReceivingSummaryPDF==="function") exportReceivingSummaryPDF(); });
    document.getElementById("btnEmailReceivingDifferences")?.addEventListener("click",()=>{
        if(
            typeof buildEmailReportFromDisplayedReceiving!=="function" ||
            typeof openFinalizedDiscrepancyEmailPreview!=="function"
        ){
            showToast?.("Email report is unavailable","error");
            return;
        }

        const report=buildEmailReportFromDisplayedReceiving();

        if(!report.rows.length){
            showToast?.("No displayed rows to email","warning");
            return;
        }

        openFinalizedDiscrepancyEmailPreview(report,{
            fromArchive:false,
            liveReport:true,
            filteredView:true
        });
    });

    {
        const pickerButton=document.getElementById("headerOrderPickerButton");
        const pickerMenu=document.getElementById("headerOrderPickerMenu");

        pickerButton?.addEventListener("click",event=>{
            event.preventDefault();
            event.stopPropagation();

            const willOpen=pickerMenu?.hidden!==false;

            if(pickerMenu){
                pickerMenu.hidden=!willOpen;
            }

            pickerButton.setAttribute(
                "aria-expanded",
                willOpen ? "true" : "false"
            );
        });

        pickerMenu?.addEventListener("click",event=>{
            const action=event.target.closest("[data-order-picker-action]");
            const option=event.target.closest("[data-header-order]");

            if(action){
                event.preventDefault();
                const active=
                    typeof getActiveReceivingOrderNumbers==="function"
                        ? getActiveReceivingOrderNumbers()
                        : [];

                if(action.dataset.orderPickerAction==="all"){
                    pickerMenu
                        .querySelectorAll("[data-header-order]")
                        .forEach(el=>{ el.checked=true; });
                }
                else if(action.dataset.orderPickerAction==="clear"){
                    pickerMenu
                        .querySelectorAll("[data-header-order]")
                        .forEach(el=>{ el.checked=false; });
                }
                else if(action.dataset.orderPickerAction==="ok"){
                    const selected=[
                        ...pickerMenu.querySelectorAll(
                            "[data-header-order]:checked"
                        )
                    ].map(el=>el.dataset.headerOrder);

                    if(!selected.length){
                        showToast?.(
                            "Select at least one Order",
                            "warning"
                        );
                        return;
                    }

                    if(
                        typeof setSelectedReceivingOrderNumbers==="function" &&
                        setSelectedReceivingOrderNumbers(selected)
                    ){
                        window.PharmFlowOrderScope=
                            selected.length===active.length
                                ? "ALL"
                                : selected.join("|");

                        pickerMenu.hidden=true;
                        pickerButton?.setAttribute(
                            "aria-expanded",
                            "false"
                        );

                        refreshHeader();
                        refreshDashboard();
                        refreshProgress();
                        refreshReceivingTable();
                        refreshHealthSummary?.();
                        refreshOpenOrderStatusReport?.();
                        refreshNeedsReviewCounters?.();
                        /* Phase 2C.11.4.4 — Finalize selection-state sync.
                           The header picker updates the receiving order scope, but the
                           Finalize button is maintained by orders.js and is not rebuilt
                           by the normal Receiving UI refresh. Re-evaluate it immediately
                           so a persisted multi-order workspace can finalize the single
                           order the operator just selected. */
                        refreshFinalizeReceivingButton?.();

                        showToast?.(
                            selected.length===active.length
                                ? "Showing all active orders"
                                : selected.length===1
                                    ? "Selected order: "+selected[0]
                                    : selected.length+" Orders Selected",
                            "success"
                        );
                    }
                }
                return;
            }

            if(option){
                event.stopPropagation();
            }
        });

        document.addEventListener("click",event=>{
            if(
                pickerMenu &&
                !pickerMenu.hidden &&
                !event.target.closest("#headerOrderPicker")
            ){
                pickerMenu.hidden=true;
                pickerButton?.setAttribute("aria-expanded","false");
            }
        });
    }


    document
        .getElementById("btnQuickSearch")
        ?.addEventListener(
            "click",
            openItemSearchModal
        );



    document.querySelectorAll("[data-issue-card]").forEach(card=>{
        card.addEventListener("click",()=>{
            toggleReceivingIssueCard(card.dataset.issueCard||"");
        });
    });

    /* Operational selectors are mutually exclusive: opening one closes its sibling. */
    {
        const groupFilter=document.querySelector("#receivingClassificationFilters [data-class-filter=\"groups\"]");
        groupFilter?.addEventListener("toggle",()=>{ if(groupFilter.open) document.querySelectorAll(".pfnReportActionMenu[open]").forEach(menu=>menu.open=false); });
    }

    UI.elements.receivingCategoryFilter
        ?.addEventListener("change",function(event){
            UI.receivingFilters.category = event.target.value || "all";
            refreshReceivingTable();
        });

    document.getElementById("receivingInlineSearch")?.addEventListener("input",function(event){
        UI.receivingFilters.search=toSafeString(event.target.value||"").trim().toLowerCase();
        refreshReceivingTable();
    });

    document.getElementById("btnBackToReceivingDashboard")?.addEventListener("click",function(){
        if(typeof navigateTo==="function"){ navigateTo("dashboard"); return; }
        document.querySelector('.sidebarItem[data-page="dashboard"]')?.click();
    });


    document
        .getElementById("btnCloseSearch")
        ?.addEventListener(
            "click",
            closeItemSearchModal
        );


    UI.elements.globalSearchInput
        ?.addEventListener(
            "input",
            debounce(
                handleGlobalSearchInput,
                120
            )
        );


    document
        .getElementById("btnOpenManualAdd")
        ?.addEventListener(
            "click",
            openManualItemModal
        );


    document
        .getElementById("btnCloseManualItem")
        ?.addEventListener(
            "click",
            closeManualItemModal
        );


    document
        .getElementById("btnCancelManualItem")
        ?.addEventListener(
            "click",
            closeManualItemModal
        );


    document
        .getElementById("btnSaveManualItem")
        ?.addEventListener(
            "click",
            function(){

                if(
                    typeof saveManualReceivingItem ===
                    "function"
                ){

                    saveManualReceivingItem();

                }

            }
        );


    document
        .getElementById("btnConfirmCancel")
        ?.addEventListener(
            "click",
            closeConfirmModal
        );


    document
        .getElementById("btnConfirmOK")
        ?.addEventListener(
            "click",
            handleConfirmOK
        );


    document.addEventListener(
        "keydown",
        function(event){

            if(event.key !== "Escape"){
                return;
            }

            closeSmartScanSearch(
                false
            );

            closeItemSearchModal();

            closeManualItemModal();

            closeConfirmModal();

        }
    );


    document.addEventListener(
        "keydown",
        function(event){

            if(
                (
                    event.ctrlKey ||
                    event.metaKey
                )
                &&
                event.key
                    .toLowerCase() ===
                    "k"
            ){

                event.preventDefault();

                openItemSearchModal();

            }

        }
    );


    [
        UI.elements.searchModal,
        UI.elements.manualItemModal,
        UI.elements.confirmModal

    ].forEach(modal=>{

        if(!modal){
            return;
        }

        modal.addEventListener(
            "click",
            function(event){

                if(event.target === modal){

                    modal.classList.remove(
                        "open"
                    );

                    modal.setAttribute(
                        "aria-hidden",
                        "true"
                    );

                    focusScannerInput();

                }

            }
        );

    });

}


/* =====================================================
   APP STATE EVENTS
===================================================== */

function bindUIStateEvents(){

    AppEvents.on(
        "workspace:created",
        refreshEntireUI
    );


    AppEvents.on(
        "workspace:cleared",
        refreshEntireUI
    );


    AppEvents.on(
        "workspace:saved",
        refreshSessionUI
    );


    AppEvents.on(
        "state:restored",
        refreshEntireUI
    );


    AppEvents.on(
        "receiving:updated",
        function(){

            refreshEntireUI();

            refreshSelectedSmartItem();

            refreshZebraInterface();

        }
    );


    AppEvents.on(
        "receiving:item-highlight",
        function(data){

            if(
                data &&
                data.itemCode
            ){

                highlightReceivingRow(
                    data.itemCode
                );

            }

        }
    );


    AppEvents.on(
        "files:updated",
        function(){

            refreshFileLists();

            refreshHealthSummary();

            refreshDashboard();

        }
    );


    AppEvents.on(
        "masterGTIN:updated",
        refreshMasterGTINUI
    );


    AppEvents.on(
        "masterGTIN:order-applied",
        function(){
            refreshMasterGTINUI();
            refreshHealthSummary();
        }
    );


    AppEvents.on(
        "session:updated",
        refreshSessionUI
    );


    AppEvents.on(
        "archive:updated",
        refreshArchiveUI
    );

}


/* =====================================================
   REFRESH ENTIRE UI
===================================================== */

function refreshEntireUI(){

    if(typeof refreshSafeAccountIdentity === "function"){ refreshSafeAccountIdentity(); }

    refreshHeader();

    refreshDashboard();

    refreshProgress();

    refreshLastScan();

    refreshReceivingTable();

    refreshFileLists();

    refreshMasterGTINUI();

    refreshHealthSummary();

    refreshSessionUI();

    refreshArchiveUI();

    refreshOpenOrderStatusReport();

    ensurePcClearScreenButton?.();
}


/* =====================================================
   HEADER
===================================================== */

function refreshHeader(){

    // Global pharmacy identity belongs to the shell and is visible on every module.
    {
        const ctx = window.AuthState?.context || {};
        const pharmacyName = String(
            ctx.pharmacy_name ||
            document.getElementById("accountPharmacyName")?.textContent ||
            "Pharmacy"
        ).trim() || "Pharmacy";
        const pharmacyCode = String(
            ctx.pharmacy_code ||
            document.getElementById("settingsPharmacyCode")?.textContent ||
            "—"
        ).trim() || "—";

        setElementText(document.getElementById("topBarPharmacyName"), pharmacyName);
        setElementText(document.getElementById("topBarPharmacyCode"), pharmacyCode);
        setElementText(document.getElementById("accountPharmacyCode"), pharmacyCode);
    }

    // Pharmacy identity lives in the sidebar; the header identifies the route.
    const dashboardActive = document.getElementById("page-dashboard")?.classList.contains("active");
    if(dashboardActive){
        setElementText(UI.elements.pageTitle, "Receiving");
        setElementText(UI.elements.pageSubtitle, "Scan, review and reconcile orders");
    }

    const hasActiveOrder = !!(
        AppState.workspace?.active === true &&
        (AppState.workspace?.orderData?.length || AppState.workspace?.orderFiles?.length)
    );
    const manageOrdersLabel=document.querySelector("#pfnManageOrders span");
    if(manageOrdersLabel){
        manageOrdersLabel.textContent="Manage Orders";
    }

    {
        const orderLabel=UI.elements.headerOrderId;
        const picker=document.getElementById("headerOrderPicker");
        const pickerLabel=document.getElementById("headerOrderPickerLabel");
        const pickerMenu=document.getElementById("headerOrderPickerMenu");

        const activeOrders=
            typeof getActiveReceivingOrderNumbers==="function"
                ? getActiveReceivingOrderNumbers()
                : [];

        const selectedOrders=
            typeof getSelectedReceivingOrderNumbers==="function"
                ? getSelectedReceivingOrderNumbers()
                : [];

        const selected=
            typeof getSelectedReceivingOrderNumber==="function"
                ? getSelectedReceivingOrderNumber()
                : "";

        if(hasActiveOrder && activeOrders.length && picker){
            orderLabel.hidden=true;
            picker.hidden=false;

            const allSelected=
                selectedOrders.length===activeOrders.length;

            if(pickerLabel){
                pickerLabel.textContent=
                    allSelected
                        ? "All Active Orders"
                        : selectedOrders.length===1
                            ? selectedOrders[0]
                            : selectedOrders.length+" Orders Selected";
            }

            if(pickerMenu){
                const signature=
                    activeOrders.join("|")+
                    "::"+
                    selectedOrders.join("|");

                if(pickerMenu.dataset.signature!==signature){
                    pickerMenu.innerHTML=`
                        <div class="headerOrderPickerOptions">
                            ${activeOrders.map(order=>`
                                <label class="headerOrderCheckOption">
                                    <input
                                        type="checkbox"
                                        data-header-order="${escapeHTML(order)}"
                                        ${selectedOrders.includes(order) ? "checked" : ""}
                                    >
                                    <span class="headerOrderCheckBox"></span>
                                    <span class="headerOrderCheckText">
                                        <strong>${escapeHTML(order)}</strong>
                                        <small>Include in Receiving</small>
                                    </span>
                                </label>
                            `).join("")}
                        </div>

                        <div class="headerOrderPickerActions">
                            <button
                                type="button"
                                data-order-picker-action="all"
                            >Select All</button>
                            <button
                                type="button"
                                data-order-picker-action="clear"
                            >Clear</button>
                            <button
                                type="button"
                                class="headerOrderPickerOk"
                                data-order-picker-action="ok"
                            >Apply</button>
                        </div>
                    `;

                    pickerMenu.dataset.signature=signature;
                }
            }
        }else{
            if(picker) picker.hidden=true;
            orderLabel.hidden=false;

            setElementText(
                orderLabel,
                hasActiveOrder
                    ? (
                        activeOrders[0] ||
                        AppState.workspace.orderName ||
                        "Active Order"
                    )
                    : "No Active Order"
            );
        }
    }


    setElementText(
        UI.elements.headerSessionId,
        hasActiveOrder
            ? (AppState.session.cloud === true ? "CONNECTED" : "LOCAL")
            : "INACTIVE"
    );

}


/* =====================================================
   DASHBOARD
===================================================== */

function getSelectedOrderDashboardMetrics(){
    const selected=
        typeof getSelectedReceivingOrderNumber==="function"
            ? getSelectedReceivingOrderNumber()
            : "";

    if(
        !selected ||
        typeof getPerOrderReceivingRows!=="function"
    ){
        return null;
    }

    const activeOrders=
        typeof getActiveReceivingOrderNumbers==="function"
            ? getActiveReceivingOrderNumbers()
            : [];

    const targetOrders=
        typeof getSelectedReceivingOrderNumbers==="function"
            ? getSelectedReceivingOrderNumbers()
            : (
                selected==="ALL"
                    ? activeOrders
                    : [selected]
            );

    if(!targetOrders.length){
        return null;
    }

    const localDevice=
        typeof ensureDeviceId==="function"
            ? ensureDeviceId()
            : AppState.session?.deviceId;

    let totalItems=0;
    let completedItems=0;
    let remainingUnits=0;
    let remainingItems=0;
    let overReceivedItems=0;
    let manualItems=0;

    targetOrders.forEach(orderNumber=>{
        const rows=getPerOrderReceivingRows(orderNumber);

        rows.forEach(row=>{
            const ordered=toNumber(row["Ordered Qty"],0);
            const received=toNumber(row["Received Qty"],0);

            if(ordered>0){
                totalItems++;

                if(received===ordered){
                    completedItems++;
                }

                remainingUnits+=Math.max(0,ordered-received);
                if(received<ordered) remainingItems++;

                if(received>ordered){
                    overReceivedItems++;
                }
            }
            else if(row.issueKey==="manual" && received>0){
                manualItems++;
            }
        });
    });

    const totalScans=(AppState.workspace?.receivingHistory||[])
        .filter(tx=>{
            const txOrder=normalizeOrderNumber(
                tx?.selectedOrderNumber ||
                tx?.orderId ||
                tx?.orderNumber ||
                ""
            );

            const inScope=
                targetOrders
                    .map(normalizeOrderNumber)
                    .includes(txOrder);

            return inScope;
        }).length;

    return {
        totalItems,
        completedItems,
        remainingUnits,
        remainingItems,
        overReceivedItems,
        manualItems,
        totalScans
    };
}

function refreshDashboard(){

    /* 2C.10.5.3 authority gate: no active Order means no operational metrics.
       Never render stale browser statistics when the manifest/workspace is empty. */
    const hasActiveOrder=!!(
        AppState.workspace?.active===true &&
        (AppState.workspace?.orderData?.length || AppState.workspace?.orderFiles?.length)
    );

    if(!hasActiveOrder){
        resetStatistics?.();
        [UI.elements.statTotalItems,UI.elements.statCompleted,UI.elements.statRemainingItems,UI.elements.statRemaining,
         UI.elements.statOver,UI.elements.statManual,UI.elements.statScans]
            .forEach(el=>setElementText(el,0));
        setElementText(document.getElementById("receivingNeedsReviewCount"),0);
        if(UI.elements.headerSessionId){
            setElementText(UI.elements.headerSessionId,"INACTIVE");
        }
        refreshProgress();
        return;
    }

    recalculateStatistics();

    const stats=AppState.statistics;
    const selectedMetrics=getSelectedOrderDashboardMetrics();

    let scoped;

    if(selectedMetrics){
        scoped=selectedMetrics;
    }else{
        const scopedItems=getScopedOrderItems();
        const scopeActive=getActiveOrderScope()!=="ALL";

        scoped=scopeActive ? {
            totalItems:scopedItems.length,
            completedItems:scopedItems.filter(i=>
                toNumber(i.orderedQty,0)>0 &&
                toNumber(i.receivedQty,0)===toNumber(i.orderedQty,0)
            ).length,
            remainingUnits:scopedItems.reduce(
                (n,i)=>n+Math.max(
                    0,
                    toNumber(i.orderedQty,0)-toNumber(i.receivedQty,0)
                ),
                0
            ),
            remainingItems:scopedItems.filter(i=>Math.max(0,toNumber(i.orderedQty,0)-toNumber(i.receivedQty,0))>0).length,
            overReceivedItems:scopedItems.filter(i=>
                toNumber(i.receivedQty,0)>toNumber(i.orderedQty,0)
            ).length,
            manualItems:scopedItems.filter(i=>i.manual===true).length,
            totalScans:(AppState.workspace?.receivingHistory||[]).filter(tx=>{
                const item=getItemByCode?.(tx.itemCode);
                const localDevice=
                    typeof ensureDeviceId==="function"
                        ? ensureDeviceId()
                        : AppState.session?.deviceId;

                return (
                    (!item || itemBelongsToOrderScope(item)) &&
                    toSafeString(tx.deviceId||"")===
                        toSafeString(localDevice||"")
                );
            }).length
        } : {
            ...stats,
            remainingUnits:AppState.workspace.orderData.reduce((sum,item)=>sum+Math.max(0,toNumber(item.orderedQty,0)-toNumber(item.receivedQty,0)),0),
            totalScans:(AppState.workspace?.receivingHistory||[]).filter(tx=>{
                const localDevice=
                    typeof ensureDeviceId==="function"
                        ? ensureDeviceId()
                        : AppState.session?.deviceId;

                return toSafeString(tx.deviceId||"")===
                    toSafeString(localDevice||"");
            }).length
        };
    }

    setElementText(UI.elements.statTotalItems,scoped.totalItems);
    setElementText(UI.elements.statCompleted,scoped.completedItems);
    setElementText(UI.elements.statRemainingItems,scoped.remainingItems);
    setElementText(
        UI.elements.statRemaining,
        Number.isFinite(scoped.remainingUnits)
            ? scoped.remainingUnits
            : stats.remainingItems
    );
    setElementText(UI.elements.statOver,scoped.overReceivedItems);
    setElementText(UI.elements.statManual,scoped.manualItems);
    setElementText(UI.elements.statScans,scoped.totalScans);

    refreshProgress();
}

/* =====================================================
   PROGRESS
===================================================== */

function refreshProgress(){

    const selectedMetrics=
        typeof getSelectedOrderDashboardMetrics==="function"
            ? getSelectedOrderDashboardMetrics()
            : null;

    const total =
        selectedMetrics
            ? selectedMetrics.totalItems
            : AppState.statistics.totalItems;

    const completed =
        selectedMetrics
            ? selectedMetrics.completedItems
            : AppState.statistics.completedItems;

    let percent = 0;

    if(total > 0){

        percent =
            Math.round(
                completed /
                total *
                100
            );

    }

    percent =
        Math.max(
            0,
            Math.min(
                100,
                percent
            )
        );

    if(UI.elements.progressBar){

        UI.elements
            .progressBar
            .style
            .width =
            percent + "%";

    }

    setElementText(
        UI.elements.progressLabel,
        percent + "%"
    );

    setElementText(
        UI.elements.progressCompletedText,
        completed + " / " + total + " Items Completed"
    );

    setElementText(
        UI.elements.progressRemainingText,
        AppState.statistics
            .remainingItems +
        " Remaining"
    );

}


/* =====================================================
   LAST SCAN
===================================================== */

function refreshLastScan(){

    const scan =
        AppState.workspace.lastScan;

    UI.elements.lastScanCard?.classList.toggle("isEmpty",!scan);

    if(!scan){

        cancelReceivingAutoClear();
        clearLastScanUI();

        refreshProfessionalLastScan(
            null
        );

        refreshLastScanQuantityControl();

        return;
    }

    scheduleReceivingAutoClear(scan);

    /*
       Keep legacy elements updated for compatibility
       with the existing application structure.
    */

    setElementText(
        UI.elements.lastItemName,
        scan.itemName || "-"
    );

    setElementText(
        UI.elements.lastItemCode,
        scan.itemCode || "-"
    );

    setElementText(
        UI.elements.lastGTIN,
        scan.gtin || "-"
    );

    setElementText(
        UI.elements.lastOrderedQty,
        scan.orderedQty ?? "-"
    );

    setElementText(
        UI.elements.lastReceivedQty,
        scan.receivedQty ?? "-"
    );

    setElementText(
        UI.elements.lastRemainingQty,
        scan.remainingQty ?? "-"
    );

    setElementText(
        UI.elements.lastItemStatus,
        scan.status || "-"
    );

    setElementText(
        UI.elements.lastScanTime,
        formatDateTime(
            scan.scanTime
        )
    );

    refreshProfessionalLastScan(
        scan
    );

    refreshLastScanQuantityControl();

}


/* =====================================================
   CLEAR LAST SCAN
===================================================== */

function clearLastScanUI(){

    [
        UI.elements.lastItemName,
        UI.elements.lastItemCode,
        UI.elements.lastGTIN,
        UI.elements.lastOrderedQty,
        UI.elements.lastReceivedQty,
        UI.elements.lastRemainingQty,
        UI.elements.lastItemStatus,
        UI.elements.lastScanTime

    ].forEach(element=>{

        setElementText(
            element,
            "-"
        );

    });

}


function getReceivingIssueKey(item){
    if(!item){ return ""; }
    const ordered=toNumber(item.orderedQty,0);
    const received=toNumber(item.receivedQty,0);
    if(item.manual===true && received>0){ return "manual"; }
    if(received>ordered){ return "over"; }
    if(ordered>0 && received<=0){ return "not_received"; }
    if(ordered>0 && received>0 && received<ordered){ return "partial"; }
    return "";
}

function refreshReceivingIssueFilterLabel(){
    const label=document.getElementById("receivingIssueFilterLabel");
    if(!label){ return; }
    const set=UI.receivingFilters.issues instanceof Set ? UI.receivingFilters.issues : new Set();
    const names={not_received:"Not Received",partial:"Partial Shortage",received_any:"Received Any Quantity",over:"Over Received",manual:"Manual Extra"};
    const discrepancyKeys=["not_received","partial","over","manual"];
    const allDiscrepancies=discrepancyKeys.every(key=>set.has(key));
    if(set.size===5 && allDiscrepancies && set.has("received_any")){ label.textContent="All selected"; return; }
    if(set.size===4 && allDiscrepancies && !set.has("received_any")){ label.textContent="All discrepancies"; return; }
    if(set.size===0){ label.textContent="None selected"; return; }
    if(set.size===1){ label.textContent=names[Array.from(set)[0]]||"1 selected"; return; }
    label.textContent=set.size+" selected";
}

const RECEIVING_ISSUE_CARD_KEYS={
    all:["not_received","partial","received_any","over","manual"],
    shortage:["not_received","partial"],
    received:["received_any"],
    over:["over"],
    manual:["manual"]
};

function refreshReceivingIssueCards(){
    const selected=UI.receivingFilters.issues instanceof Set
        ? UI.receivingFilters.issues
        : new Set();
    Object.entries(RECEIVING_ISSUE_CARD_KEYS).forEach(([card,keys])=>{
        const button=document.querySelector(`[data-issue-card="${card}"]`);
        if(!button) return;
        const active=card==="all"
            ? keys.every(key=>selected.has(key))
            : keys.every(key=>selected.has(key));
        button.classList.toggle("active",active);
        button.setAttribute("aria-pressed",active?"true":"false");
    });
}

function toggleReceivingIssueCard(card){
    const keys=RECEIVING_ISSUE_CARD_KEYS[card];
    if(!keys) return;
    const current=UI.receivingFilters.issues instanceof Set
        ? new Set(UI.receivingFilters.issues)
        : new Set();
    const isActive=keys.every(key=>current.has(key));
    if(card==="all"){
        UI.receivingFilters.issues=isActive ? new Set() : new Set(keys);
    }else{
        keys.forEach(key=>isActive ? current.delete(key) : current.add(key));
        UI.receivingFilters.issues=current;
    }
    refreshReceivingIssueFilterLabel();
    refreshReceivingIssueCards();
    refreshReceivingTable();
}

function getVisibleReceivingItemsForExport(){
    return Array.isArray(UI.receivingVisibleItems) ? UI.receivingVisibleItems.slice() : [];
}

/* Presentation-only: the report shows the signed reconciliation result.
   Stored remaining quantities remain non-negative for receiving safeguards. */
function renderReceivingDifference(orderedQty,receivedQty){
    const difference=toNumber(receivedQty,0)-toNumber(orderedQty,0);
    const tone=difference<0 ? "isShort" : (difference>0 ? "isOver" : "isEven");
    const label=difference>0 ? "+"+difference : String(difference);
    return `<span class="pfnDifferenceValue ${tone}">${label}</span>`;
}

/* =====================================================
   RECEIVING TABLE
===================================================== */

function normalizeReceivingSearchText(value){
    return toSafeString(value||"")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g," ")
        .trim()
        .replace(/\s+/g," ");
}

function matchesReceivingSearch(item,query){
    const terms=normalizeReceivingSearchText(query).split(" ").filter(Boolean);
    if(!terms.length) return true;
    const haystack=normalizeReceivingSearchText(
        [item?.itemCode,item?.itemName].filter(Boolean).join(" ")
    );
    return terms.every(term=>haystack.includes(term));
}

function refreshReceivingTable(){
    const tbody=UI.elements.receivingTableBody;if(!tbody)return;refreshReceivingCategoryFilter();tbody.innerHTML="";
    const issues=UI.receivingFilters.issues instanceof Set?UI.receivingFilters.issues:new Set(["not_received","partial","received_any","over","manual"]);
    const searchFilter=normalizeReceivingSearchText(UI.receivingFilters.search||"");
    const active=typeof getActiveReceivingOrderNumbers==="function"?getActiveReceivingOrderNumbers():[];
    const selectedOrders=typeof getSelectedReceivingOrderNumbers==="function"?getSelectedReceivingOrderNumbers():active;
    let rows=[];
    if(typeof getPerOrderReceivingRows==="function"&&active.length){
        const orders=selectedOrders.length?selectedOrders:[active[0]].filter(Boolean);
        orders.forEach(orderNumber=>getPerOrderReceivingRows(orderNumber).forEach(r=>{
            const received=toNumber(r["Received Qty"],0),issue=r.issueKey||"",match=issues.has(issue)||(issues.has("received_any")&&received>0);
            if(match) rows.push({orderNumber,itemCode:r["Item Number"],itemName:r["Item Name"],orderedQty:toNumber(r["Ordered Qty"],0),receivedQty:received,remainingQty:Math.max(0,toNumber(r["Ordered Qty"],0)-received),status:r["Issue Type"]==="Received"?"Completed":r["Issue Type"],group_name:r["Group"]||r.group_name||"",category:r["Category"]||"",sub_category:r["Sub Category"]||r.sub_category||"",manual:r.issueKey==="manual"});
        }));
    }else{
        rows=(AppState.workspace.orderData||[]).filter(item=>{
            if(selectedOrders.length&&!selectedOrders.some(order=>itemBelongsToOrderScope(item,order)))return false;
            const issue=getReceivingIssueKey(item),received=toNumber(item.receivedQty,0);
            return issues.has(issue)||(issues.has("received_any")&&received>0);
        });
    }
    if(window.PharmFlowClassificationFilters) rows=window.PharmFlowClassificationFilters.filter(rows,UI.receivingFilters.classification||{});
    if(searchFilter) rows=rows.filter(item=>matchesReceivingSearch(item,searchFilter));
    UI.receivingVisibleItems=rows.slice();const d=document.getElementById("rsDisplayedItems");if(d)d.textContent=rows.length;refreshReceivingIssueCards();if(typeof refreshReceivingVerificationSummary==="function")refreshReceivingVerificationSummary();
    const inline=document.getElementById("receivingInlineResult");
    if(!(AppState.workspace.orderData||[]).length){if(inline){inline.hidden=true;inline.innerHTML="";}tbody.innerHTML='<tr><td colspan="10" class="tableEmptyState">No order items loaded.</td></tr>';return;}
    if(!rows.length){if(inline){inline.hidden=true;inline.innerHTML="";}tbody.innerHTML='<tr><td colspan="10" class="tableEmptyState">No items match the selected filters.</td></tr>';return;}
    rows.forEach((item,index)=>{const tr=createReceivingTableRow(item,index);tr.dataset.orderNumber=item.orderNumber||"";tbody.appendChild(tr);});
    if(inline){ inline.hidden=true; inline.innerHTML=""; }

}
function refreshReceivingCategoryFilter(){
    const host=document.getElementById("receivingClassificationFilters");if(!host||!window.PharmFlowClassificationFilters)return;
    const active=typeof getActiveReceivingOrderNumbers==="function"?getActiveReceivingOrderNumbers():[];
    const selected=typeof getSelectedReceivingOrderNumbers==="function"?getSelectedReceivingOrderNumbers():active;
    const scoped=(AppState.workspace.orderData||[]).filter(item=>!selected.length||selected.some(order=>itemBelongsToOrderScope(item,order)));
    const state=UI.receivingFilters.classification||(UI.receivingFilters.classification={groups:[],categories:[],subCategories:[]});
    const choices=window.PharmFlowClassificationFilters.choices(scoped,state);
    const labels={groups:"GROUPS"};
    ["groups"].forEach(key=>{
        const details=host.querySelector('[data-class-filter="'+key+'"]'),menu=details?.querySelector(".pfrFilterMenu");if(!menu)return;
        const allowed=new Set(choices[key]);state[key]=(state[key]||[]).filter(v=>allowed.has(v));
        const sig=choices[key].join("|")+"::"+state[key].join("|");if(menu.dataset.signature===sig)return;menu.dataset.signature=sig;
        menu.innerHTML=`<div class="pfrFilterOptions">${choices[key].length?choices[key].map(v=>`<label><input type="checkbox" value="${escapeHTML(v)}" ${state[key].includes(v)?"checked":""}><span>${escapeHTML(v)}</span></label>`).join(""):'<span class="tableEmptyState">No groups</span>'}</div><div class="pfrFilterActions"><button type="button" data-group-action="all">Select All</button><button type="button" data-group-action="clear">Clear</button><button type="button" data-group-action="ok">OK</button></div>`;
        const groupLabel=details.querySelector("#receivingGroupFilterLabel")||details.querySelector("summary strong");
        const groupText=!state[key].length||state[key].length===choices[key].length?"All groups":state[key].length===1?state[key][0]:state[key].length+" groups";
        if(groupLabel) groupLabel.textContent=groupText;
    });
    if(host.dataset.bound!=="1"){
        host.dataset.bound="1";
        host.addEventListener("change",event=>{const details=event.target.closest("[data-class-filter]");if(!details)return;const key=details.dataset.classFilter;state[key]=[...details.querySelectorAll('input:checked')].map(x=>x.value);if(key==="groups"){state.categories=[];state.subCategories=[];}if(key==="categories")state.subCategories=[];refreshReceivingTable();});
        host.addEventListener("click",event=>{const action=event.target.closest('[data-group-action]')?.dataset.groupAction;if(!action)return;event.preventDefault();const details=event.target.closest('details'),boxes=[...details.querySelectorAll('input[type="checkbox"]')];if(action==="all")boxes.forEach(box=>box.checked=true);if(action==="clear")boxes.forEach(box=>box.checked=false);if(action==="ok")details.open=false;state.groups=boxes.filter(box=>box.checked).map(box=>box.value);state.categories=[];state.subCategories=[];refreshReceivingTable();});
    }
}

/* =====================================================
   RECEIVING TABLE ROW
===================================================== */

function createReceivingTableRow(
    item,
    index
){

    const row =
        document.createElement(
            "tr"
        );

    row.className =
        getReceivingRowClass(
            item.status
        );

    row.dataset.itemCode =
        item.itemCode;

    row.innerHTML = `

        <td>
            ${index + 1}
        </td>

        <td class="receivingOrderCell">
            ${escapeHTML(toSafeString(item.orderNumber || (Array.isArray(item.orderNumbers) ? item.orderNumbers[0] : "") || "—"))}
        </td>

        <td>
            ${escapeHTML(
                item.itemCode
            )}
        </td>

        <td>

            ${escapeHTML(
                item.itemName
            )}

            ${
                item.manual
                ?
                '<span class="manualBadge">MANUAL</span>'
                :
                ""
            }

        </td>

        <td class="receivingCategoryCell">
            ${escapeHTML(toSafeString((window.PharmFlowClassificationFilters?.normalize(item)?.group || "—")))}
        </td>

        <td>
            ${toNumber(
                item.orderedQty,
                0
            )}
        </td>

        <td>

            <div class="tableQtyControl">

                <button
                    type="button"
                    class="tableQtyButton"
                    data-action="minus"
                >
                    −
                </button>

                <button
                    type="button"
                    class="tableQtyValue"
                    data-action="edit"
                >
                    ${toNumber(
                        item.receivedQty,
                        0
                    )}
                </button>

                <button
                    type="button"
                    class="tableQtyButton"
                    data-action="plus"
                >
                    +
                </button>

            </div>

        </td>

        <td>${renderReceivingDifference(item.orderedQty,item.receivedQty)}</td>

        <td>
            ${renderStatusBadge(
                item.status
            )}
        </td>

    `;


    row
        .querySelector(
            '[data-action="plus"]'
        )
        ?.addEventListener(
            "click",
            function(event){

                event.stopPropagation();

                if(item.orderNumber){AppState.workspace.selectedOrderNumber=item.orderNumber;AppState.workspace.orderName=item.orderNumber;}
                increaseItemQuantity(item.itemCode,1);

            }
        );


    row
        .querySelector(
            '[data-action="minus"]'
        )
        ?.addEventListener(
            "click",
            function(event){

                event.stopPropagation();

                if(item.orderNumber){AppState.workspace.selectedOrderNumber=item.orderNumber;AppState.workspace.orderName=item.orderNumber;}
                decreaseItemQuantity(item.itemCode,1);

            }
        );


    row
        .querySelector(
            '[data-action="edit"]'
        )
        ?.addEventListener(
            "click",
            function(event){

                event.stopPropagation();

                if(item.orderNumber){AppState.workspace.selectedOrderNumber=item.orderNumber;AppState.workspace.orderName=item.orderNumber;}
                openQuantityEditPrompt(getItemByCode?.(item.itemCode)||item);

            }
        );


    return row;

}


/* =====================================================
   DEVICE-LOCAL QUANTITY HELPERS
   Phase 2C.7.3
===================================================== */

function getCurrentDeviceId(){
    try{
        if(typeof ensureDeviceId === "function"){
            return toSafeString(ensureDeviceId());
        }
    }catch(_){ }

    return toSafeString(AppState?.session?.deviceId || "");
}

function getDeviceItemReceivedQuantity(itemCode){
    const code = normalizeItemCode(itemCode);
    const deviceId = getCurrentDeviceId();

    if(!code || !deviceId){
        return 0;
    }

    const history = Array.isArray(AppState?.workspace?.receivingHistory)
        ? AppState.workspace.receivingHistory
        : [];

    const net = history.reduce((sum, tx)=>{
        if(normalizeItemCode(tx?.itemCode) !== code){
            return sum;
        }

        if(toSafeString(tx?.deviceId || "") !== deviceId){
            return sum;
        }

        return sum + toNumber(tx?.quantity, 0);
    }, 0);

    return Math.max(0, net);
}

/*
   Current batch = the uninterrupted run of actions for the item on THIS device.
   As soon as this device works on another item, the next scan of the original
   item starts a fresh batch at 1. Other devices never reset this local batch.
*/
const HANDHELD_BATCH_BOUNDARY_KEY="PRS_HH_BATCH_BOUNDARIES_V1";

function readHandheldBatchBoundaries(){
    try{
        const parsed=JSON.parse(localStorage.getItem(HANDHELD_BATCH_BOUNDARY_KEY)||"{}");
        return parsed && typeof parsed==="object" ? parsed : {};
    }catch(_){
        return {};
    }
}

function writeHandheldBatchBoundaries(value){
    try{
        localStorage.setItem(
            HANDHELD_BATCH_BOUNDARY_KEY,
            JSON.stringify(value||{})
        );
    }catch(_){}
}

function setHandheldBatchBoundary(itemCode,at=nowISO()){
    const code=normalizeItemCode(itemCode);
    if(!code) return;

    const map=readHandheldBatchBoundaries();
    map[code]=String(at||nowISO());
    writeHandheldBatchBoundaries(map);
}

function getHandheldBatchBoundaryTime(itemCode){
    const code=normalizeItemCode(itemCode);
    if(!code) return 0;

    let boundary=0;

    /* Explicit local Clear/Cancel starts a new worker batch without deleting
       receiving transactions. */
    try{
        const local=readHandheldBatchBoundaries()[code];
        const localTime=new Date(local||0).getTime();
        if(Number.isFinite(localTime)){
            boundary=Math.max(boundary,localTime);
        }
    }catch(_){}

    /* A direct quantity edit on ANOTHER device is an authoritative
       reconciliation boundary. Example: pharmacist sets Received to zero on PC.
       Old Handheld batch UI must not continue showing the pre-correction batch. */
    const deviceId=getCurrentDeviceId();
    const history=Array.isArray(AppState?.workspace?.receivingHistory)
        ? AppState.workspace.receivingHistory
        : [];

    history.forEach(tx=>{
        if(normalizeItemCode(tx?.itemCode)!==code) return;
        if(toSafeString(tx?.deviceId||"")===deviceId) return;

        const source=toSafeString(tx?.source||"").toUpperCase();
        if(
            source!==String(ReceivingEngine?.adjustmentSources?.editIncrease||"MANUAL_EDIT_INCREASE").toUpperCase() &&
            source!==String(ReceivingEngine?.adjustmentSources?.editDecrease||"MANUAL_EDIT_DECREASE").toUpperCase()
        ){
            return;
        }

        const time=new Date(tx?.dateTime||0).getTime();
        if(Number.isFinite(time)){
            boundary=Math.max(boundary,time);
        }
    });

    return boundary;
}

function getCurrentBatchQuantity(itemCode){
    const code=normalizeItemCode(itemCode);
    const currentDeviceId=getCurrentDeviceId();
    if(!code) return 0;

    const boundaryTime=getHandheldBatchBoundaryTime(code);
    const history=Array.isArray(AppState?.workspace?.receivingHistory)
        ? AppState.workspace.receivingHistory : [];
    const lastScan=AppState?.workspace?.lastScan;
    const lastScanMatches=normalizeItemCode(lastScan?.itemCode)===code;

    let anchoredDeviceId=currentDeviceId;
    if(lastScanMatches && lastScan?.transactionId){
        const anchorTx=history.find(tx=>
            toSafeString(tx?.transactionId||"")===toSafeString(lastScan.transactionId||"")
        );
        if(anchorTx?.deviceId) anchoredDeviceId=toSafeString(anchorTx.deviceId);
    }

    if(!anchoredDeviceId){
        return lastScanMatches ? Math.max(0,toNumber(lastScan?.quantity,0)) : 0;
    }

    const local=history.map((tx,index)=>({tx,index})).filter(row=>{
        if(toSafeString(row.tx?.deviceId||"")!==anchoredDeviceId) return false;
        const time=new Date(row.tx?.dateTime||0).getTime();
        return !Number.isFinite(boundaryTime) || time>boundaryTime;
    }).sort((a,b)=>{
        const ta=new Date(a.tx?.dateTime||0).getTime();
        const tb=new Date(b.tx?.dateTime||0).getTime();
        return ta===tb ? a.index-b.index : ta-tb;
    });

    if(!local.length){
        return lastScanMatches ? Math.max(0,toNumber(lastScan?.quantity,0)) : 0;
    }

    let endIndex=local.length-1;
    if(lastScanMatches && lastScan?.transactionId){
        const wanted=toSafeString(lastScan.transactionId);
        const found=local.findIndex(row=>toSafeString(row.tx?.transactionId||"")===wanted);
        if(found>=0) endIndex=found;
    }

    if(normalizeItemCode(local[endIndex]?.tx?.itemCode)!==code){
        return lastScanMatches ? Math.max(0,toNumber(lastScan?.quantity,0)) : 0;
    }

    let qty=0;
    for(let i=endIndex;i>=0;i--){
        const txCode=normalizeItemCode(local[i]?.tx?.itemCode);
        if(txCode!==code) break;
        qty+=toNumber(local[i]?.tx?.quantity,0);
    }
    if(qty===0 && lastScanMatches) return Math.max(0,toNumber(lastScan?.quantity,0));
    return Math.max(0,qty);
}

function getDeviceLastItemActionQuantity(itemCode){
    const code = normalizeItemCode(itemCode);
    const deviceId = getCurrentDeviceId();
    const history = Array.isArray(AppState?.workspace?.receivingHistory)
        ? AppState.workspace.receivingHistory
        : [];

    const row = history
        .filter(tx=>normalizeItemCode(tx?.itemCode)===code && toSafeString(tx?.deviceId||"")===deviceId)
        .sort((a,b)=>new Date(b?.dateTime||0)-new Date(a?.dateTime||0))[0];

    return row ? toNumber(row.quantity,0) : 0;
}

/* =====================================================
   EDIT QUANTITY
===================================================== */

function openQuantityEditPrompt(item){

    if(!item){
        return;
    }

    if(typeof isLikelyZebraDevice==="function" && isLikelyZebraDevice()){
        let handheldModal=document.getElementById("handheldBatchAddModal");

        if(!handheldModal){
            handheldModal=document.createElement("div");
            handheldModal.id="handheldBatchAddModal";
            handheldModal.className="quantityAdjustmentModal handheldReceivedEditModal";

            handheldModal.innerHTML=`
              <div class="quantityAdjustmentCard handheldReceivedEditCard">
                <div class="quantityAdjustmentHeader">
                  <div>
                    <span class="sectionEyebrow">ADD REMAINING PACKS</span>
                    <h3 id="handheldBatchAddName">-</h3>
                  </div>
                  <button type="button" id="btnCloseHandheldBatchAdd" class="iconButton" aria-label="Close">✕</button>
                </div>

                <div class="handheldScanAcknowledgement">
                  <span>✓ FIRST PACK ALREADY SCANNED</span>
                  <strong id="handheldBatchCurrentQty">1</strong>
                </div>

                <label class="quantityAdjustmentLabel" for="handheldBatchAddInput">
                  Add remaining packs
                </label>

                <input id="handheldBatchAddInput" class="quantityAdjustmentInput"
                       type="number" min="1" step="1" inputmode="numeric" value="">

                <button type="button" id="btnAddHandheldBatchQty" class="primaryButton">
                  ADD REMAINING
                </button>
              </div>`;

            document.body.appendChild(handheldModal);

            const close=()=>{
                try{ document.activeElement?.blur?.(); }catch(_){}
                handheldModal.classList.remove("open");
                setTimeout(()=>window.hhRefreshReadyState?.(),20);
            };

            document.getElementById("btnCloseHandheldBatchAdd")?.addEventListener("click",close);
            handheldModal.addEventListener("click",event=>{
                if(event.target===handheldModal) close();
            });

            document.getElementById("handheldBatchAddInput")?.addEventListener("keydown",event=>{
                if(event.key==="Enter"){
                    event.preventDefault();
                    try{ event.target.blur(); }catch(_){}
                    document.getElementById("btnAddHandheldBatchQty")?.click();
                }
            });

            document.getElementById("btnAddHandheldBatchQty")?.addEventListener("click",()=>{
                try{ document.activeElement?.blur?.(); }catch(_){}

                const code=handheldModal.dataset.itemCode;
                const input=document.getElementById("handheldBatchAddInput");
                const additional=toNumber(input?.value,0);

                if(additional<=0){
                    showToast("Enter additional packs","warning");
                    return;
                }

                const tx=addItemReceivedQuantity(code,additional,"HANDHELD_BATCH_ADD");
                if(tx){
                    handheldModal.classList.remove("open");
                    refreshEntireUI?.();
                    setTimeout(()=>window.hhRefreshReadyState?.(),20);
                }
            });
        }

        handheldModal.dataset.itemCode=item.itemCode;

        setElementText(
            document.getElementById("handheldBatchAddName"),
            item.itemName||item.itemCode
        );

        setElementText(
            document.getElementById("handheldBatchCurrentQty"),
            getCurrentBatchQuantity(item.itemCode)
        );

        const input=document.getElementById("handheldBatchAddInput");
        if(input){ input.value=""; }

        handheldModal.classList.add("open");

        setTimeout(()=>{
            try{
                input?.focus();
                input?.select();
            }catch(_){}
        },20);

        return;
    }

    let modal =
        document.getElementById(
            "quantityAdjustmentModal"
        );

    if(!modal){

        modal = document.createElement("div");
        modal.id = "quantityAdjustmentModal";
        modal.className = "quantityAdjustmentModal";

        modal.innerHTML = `
            <div class="quantityAdjustmentCard">
                <div class="quantityAdjustmentHeader">
                    <div>
                        <span class="sectionEyebrow">QUANTITY</span>
                        <h3 id="quantityAdjustmentItemName">-</h3>
                    </div>
                    <button type="button" id="btnCloseQuantityAdjustment" class="iconButton" aria-label="Close">✕</button>
                </div>

                <div class="quantityCurrentTotal">
                    <span>Received — All Devices</span>
                    <strong id="quantityAdjustmentCurrent">0</strong>
                </div>

                <div class="quantityCurrentTotal" style="margin-top:8px;">
                    <span>Current Batch Qty</span>
                    <strong id="quantityAdjustmentDeviceCurrent">0</strong>
                </div>

                <div id="quantityAddMode">
                    <label class="quantityAdjustmentLabel" for="quantityAdjustmentInput">
                        Additional quantity from this batch
                    </label>

                    <input
                        id="quantityAdjustmentInput"
                        class="quantityAdjustmentInput"
                        type="number"
                        min="0"
                        step="1"
                        value="1"
                        inputmode="numeric"
                    >

                    <div class="quantityCurrentTotal" style="margin-top:8px;">
                        <span>New Batch Qty</span>
                        <strong id="quantityAdjustmentPreview">0</strong>
                    </div>

                    <p class="quantityAdjustmentHelp">
                        Enter only the <strong>additional</strong> packs in front of you after the scanned pack(s).
                        Press <strong>Enter</strong> to add them and return to scanning.
                    </p>

                    <div class="quantityAdjustmentActions">
                        <button type="button" id="btnQuantityAdd" class="primaryButton">+ Add 1</button>
                    </div>

                    <button type="button" id="btnShowQuantityCorrection" class="authSecondaryLink" style="margin-top:8px;">
                        Correct received total
                    </button>
                </div>

                <div id="quantityCorrectionMode" hidden>
                    <label class="quantityAdjustmentLabel" for="quantityCorrectionInput">
                        Replace all-device received total with
                    </label>
                    <input
                        id="quantityCorrectionInput"
                        class="quantityAdjustmentInput"
                        type="number"
                        min="0"
                        step="1"
                        value="0"
                        inputmode="numeric"
                    >
                    <p class="quantityAdjustmentHelp">
                        This is a correction to the <strong>shared total across all devices</strong>. Use only when the current received total is wrong.
                    </p>
                    <div class="quantityAdjustmentActions">
                        <button type="button" id="btnQuantitySetTotal" class="secondaryButton">Confirm Correct Total</button>
                        <button type="button" id="btnCancelQuantityCorrection" class="secondaryButton">Back</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document
            .getElementById("btnCloseQuantityAdjustment")
            ?.addEventListener("click", closeQuantityAdjustmentModal);

        modal.addEventListener("click", function(event){
            if(event.target === modal){
                closeQuantityAdjustmentModal();
            }
        });

        modal.addEventListener("keydown", function(event){
            if(event.key === "Escape"){
                event.preventDefault();
                closeQuantityAdjustmentModal();
                return;
            }

            if(event.key !== "Enter"){
                return;
            }

            const correctionMode = !document.getElementById("quantityCorrectionMode")?.hidden;
            event.preventDefault();

            /* Close Android numeric keyboard deterministically before saving. */
            try{ document.activeElement?.blur?.(); }catch(_){ }

            if(correctionMode){
                document.getElementById("btnQuantitySetTotal")?.click();
            }else{
                document.getElementById("btnQuantityAdd")?.click();
            }
        });
    }

    modal.dataset.itemCode = item.itemCode;

    setElementText(
        document.getElementById("quantityAdjustmentItemName"),
        item.itemName
    );

    const allDevicesQty = toNumber(item.receivedQty, 0);
    const thisDeviceQty = getOperationalCurrentBatchQuantity(item.itemCode);

    setElementText(document.getElementById("quantityAdjustmentCurrent"), allDevicesQty);
    setElementText(document.getElementById("quantityAdjustmentDeviceCurrent"), thisDeviceQty);

    const input = document.getElementById("quantityAdjustmentInput");
    const correctionInput = document.getElementById("quantityCorrectionInput");
    const addMode = document.getElementById("quantityAddMode");
    const correctionMode = document.getElementById("quantityCorrectionMode");
    const addButton = document.getElementById("btnQuantityAdd");
    const setButton = document.getElementById("btnQuantitySetTotal");
    const preview = document.getElementById("quantityAdjustmentPreview");

    if(addMode){ addMode.hidden = false; }
    if(correctionMode){ correctionMode.hidden = true; }
    if(input){ input.value = "1"; }
    if(correctionInput){ correctionInput.value = String(allDevicesQty); }

    function refreshAddPreview(){
        const additional = Math.max(0, toNumber(input?.value, 0));
        if(preview){ preview.textContent = String(thisDeviceQty + additional); }
        if(addButton){ addButton.textContent = `+ Add ${additional}`; }
    }

    input?.addEventListener("input", refreshAddPreview, {once:false});
    refreshAddPreview();

    document.getElementById("btnShowQuantityCorrection").onclick = function(){
        if(addMode){ addMode.hidden = true; }
        if(correctionMode){ correctionMode.hidden = false; }
        if(correctionInput){
            correctionInput.value = String(toNumber(getItemByCode(modal.dataset.itemCode)?.receivedQty, allDevicesQty));
            setTimeout(()=>{ correctionInput.focus(); correctionInput.select(); }, 20);
        }
    };

    document.getElementById("btnCancelQuantityCorrection").onclick = function(){
        if(correctionMode){ correctionMode.hidden = true; }
        if(addMode){ addMode.hidden = false; }
        setTimeout(()=>{ input?.focus(); input?.select(); }, 20);
    };

    addButton.onclick = function(){
        try{ document.activeElement?.blur?.(); }catch(_){ }
        const code = modal.dataset.itemCode;
        const quantity = toNumber(input?.value, 0);

        if(quantity <= 0){
            showToast("Enter the additional quantity to add", "warning");
            return;
        }

        const transaction = addItemReceivedQuantity(code, quantity, "MANUAL_ADD");
        if(transaction){
            closeQuantityAdjustmentModal();
        }
    };

    setButton.onclick = function(){
        try{ document.activeElement?.blur?.(); }catch(_){ }
        const code = modal.dataset.itemCode;
        const total = toNumber(correctionInput?.value, -1);

        if(total < 0){
            showToast("Enter a valid total quantity", "warning");
            return;
        }

        const transaction = setItemReceivedQuantity(code, total);
        if(transaction){
            closeQuantityAdjustmentModal();
        }
    };

    modal.classList.add("open");

    setTimeout(()=>{
        input?.focus();
        input?.select();
    },30);
}


function closeQuantityAdjustmentModal(){

    document
        .getElementById(
            "quantityAdjustmentModal"
        )
        ?.classList
        .remove(
            "open"
        );

    focusScannerInput();
}



/* =====================================================
   ROW HIGHLIGHT
===================================================== */

function highlightReceivingRow(
    itemCode
){

    const code =
        normalizeItemCode(
            itemCode
        );

    const rows =
        document.querySelectorAll(
            "#receivingTableBody tr[data-item-code]"
        );

    let found =
        null;

    rows.forEach(row=>{

        row.classList.remove(
            "recentlyUpdated"
        );

        if(
            normalizeItemCode(
                row.dataset.itemCode
            )
            ===
            code
        ){

            found =
                row;

        }

    });

    if(!found){
        return;
    }

    found.classList.add(
        "recentlyUpdated"
    );

    setTimeout(()=>{

        found.classList.remove(
            "recentlyUpdated"
        );

    },1800);

}


/* =====================================================
   REFRESH SMART SELECTED ITEM
===================================================== */

function refreshSelectedSmartItem(){

    const selected =
        UI.smartScan.selectedItem;

    if(!selected){
        return;
    }

    const current =
        getItemByCode(
            selected.itemCode
        );

    if(!current){
        return;
    }

    UI.smartScan.selectedItem =
        current;

    setElementText(
        document.getElementById(
            "smartSelectedReceived"
        ),
        current.receivedQty
    );

    setElementText(
        document.getElementById(
            "smartSelectedRemaining"
        ),
        current.remainingQty
    );

}


/* =====================================================
   ROW CLASS
===================================================== */

function getReceivingRowClass(status){

    switch(status){

        case APP_CONFIG.statuses.receiving:
            return "rowReceiving";

        case APP_CONFIG.statuses.completed:
            return "rowCompleted";

        case APP_CONFIG.statuses.over:
            return "rowOver";

        case APP_CONFIG.statuses.manual:
            return "rowManual";

        default:
            return "rowPending";

    }

}


/* =====================================================
   STATUS BADGE
===================================================== */

function renderStatusBadge(status){

    let className =
        "statusPending";

    switch(status){

        case APP_CONFIG.statuses.receiving:

            className =
                "statusReceiving";

            break;


        case APP_CONFIG.statuses.completed:

            className =
                "statusCompleted";

            break;


        case APP_CONFIG.statuses.over:

            className =
                "statusOver";

            break;


        case APP_CONFIG.statuses.manual:

            className =
                "statusManual";

            break;

    }

    return `

        <span
            class="statusBadge ${className}"
        >
            ${escapeHTML(
                status || "Pending"
            )}
        </span>

    `;

}


/* =====================================================
   FILE LISTS
===================================================== */

function refreshFileLists(){

    renderFileList(
        UI.elements.orderFilesList,
        AppState.workspace.orderFiles,
        "No order files loaded."
    );

    renderFileList(
        UI.elements.mappingFilesList,
        AppState.workspace.mappingFiles,
        "No mapping files loaded."
    );

}


function renderFileList(
    container,
    files,
    emptyText
){

    if(!container){
        return;
    }

    container.innerHTML =
        "";

    if(
        !Array.isArray(files) ||
        files.length === 0
    ){

        container.innerHTML = `

            <div class="emptyState">
                ${escapeHTML(
                    emptyText
                )}
            </div>

        `;

        return;
    }

    files.forEach(file=>{

        const element =
            document.createElement(
                "div"
            );

        element.className =
            "fileItem";

        element.innerHTML = `

            <div>

                <strong>
                    ${escapeHTML(
                        file.name || "File"
                    )}
                </strong>

                <br>

                <small>
                    ${escapeHTML(
                        file.importedAt
                        ?
                        formatDateTime(
                            file.importedAt
                        )
                        :
                        ""
                    )}
                </small>

            </div>

            <div class="fileItemActions">
                <small>${toInteger(file.rows,0)} rows</small>
                ${container===UI.elements.orderFilesList ? `<button type="button" class="removeActiveOrderButton" data-remove-order-file="${escapeHTML(file.id||"")}" title="Remove this order only">Remove</button>` : ""}
            </div>

        `;

        container.appendChild(element);
        const removeBtn=element.querySelector("[data-remove-order-file]");
        if(removeBtn){ removeBtn.addEventListener("click",event=>{ event.stopPropagation(); requestRemoveActiveOrderFile(removeBtn.dataset.removeOrderFile); }); }

    });

}


/* =====================================================
   MASTER GTIN STATUS
===================================================== */

function refreshMasterGTINUI(){

    const status =
        typeof getMasterGTINStatus === "function"
        ? getMasterGTINStatus()
        : null;

    const headerMaster=document.getElementById("headerMasterGTINStatus");

    if(!status || status.installed !== true){

        if(headerMaster){
            headerMaster.textContent=navigator.onLine ? "SYNCING" : "OFFLINE";
            headerMaster.title="Global GTIN Master is not available on this device yet";
        }

        setElementText(
            UI.elements.masterGTINStatus,
            (navigator.onLine ? "CONNECTED — MASTER UNAVAILABLE" : "OFFLINE")
        );

        setElementText(
            UI.elements.masterGTINItemCount,
            "0"
        );

        setElementText(
            UI.elements.masterGTINMatchedCount,
            "0"
        );

        setElementText(
            UI.elements.masterGTINUpdatedAt,
            "-"
        );

        if(UI.elements.masterGTINNotice){
            UI.elements.masterGTINNotice.textContent =
                "System Global GTIN is not available on this device yet. PharmFlow will sync it automatically after sign-in.";
            UI.elements.masterGTINNotice.className =
                "masterGTINNotice";
        }

        const ordersMasterStatus=document.getElementById("ordersMasterStatus");
        const ordersMasterCount=document.getElementById("ordersMasterItemCount");
        const ordersMasterUpdated=document.getElementById("ordersMasterUpdatedAt");
        const ordersMasterCard=document.getElementById("ordersGlobalMasterCard");

        if(ordersMasterStatus){
            ordersMasterStatus.textContent=navigator.onLine ? "SYNCING" : "OFFLINE";
        }
        if(ordersMasterCount) ordersMasterCount.textContent="0";
        if(ordersMasterUpdated) ordersMasterUpdated.textContent="-";
        if(ordersMasterCard){
            ordersMasterCard.classList.remove("isActive");
            ordersMasterCard.classList.add("isSyncing");
        }

        return;
    }

    if(headerMaster){
        const count=toInteger(status.itemCount,0);
        headerMaster.textContent=navigator.onLine ? "ACTIVE · "+count.toLocaleString() : "CACHED · "+count.toLocaleString();
        headerMaster.title="Global GTIN Master — "+count.toLocaleString()+" items";
    }

    setElementText(
        UI.elements.masterGTINStatus,
        (navigator.onLine ? "CONNECTED — ACTIVE" : "OFFLINE — CACHED")
    );

    setElementText(
        UI.elements.masterGTINItemCount,
        toInteger(
            status.itemCount,
            0
        ).toLocaleString()
    );

    setElementText(
        UI.elements.masterGTINMatchedCount,
        toInteger(
            status.currentOrder?.matchedItems,
            0
        ).toLocaleString()
    );

    setElementText(
        UI.elements.masterGTINUpdatedAt,
        status.updatedAt
        ? formatDateTime(status.updatedAt)
        : "-"
    );

    /* Orders page uses the same Global Master status object as Settings
       and the header. It is a database status card, not a local file. */
    {
        const ordersMasterStatus=document.getElementById("ordersMasterStatus");
        const ordersMasterCount=document.getElementById("ordersMasterItemCount");
        const ordersMasterUpdated=document.getElementById("ordersMasterUpdatedAt");
        const ordersMasterCard=document.getElementById("ordersGlobalMasterCard");
        const count=toInteger(status.itemCount,0);

        if(ordersMasterStatus){
            ordersMasterStatus.textContent=navigator.onLine ? "ACTIVE" : "CACHED";
        }
        if(ordersMasterCount){
            ordersMasterCount.textContent=count.toLocaleString();
        }
        if(ordersMasterUpdated){
            ordersMasterUpdated.textContent=status.updatedAt
                ? formatDateTime(status.updatedAt)
                : "-";
        }
        if(ordersMasterCard){
            ordersMasterCard.classList.remove("isSyncing");
            ordersMasterCard.classList.add("isActive");
        }
    }

    if(UI.elements.masterGTINNotice){

        const conflicts =
            toInteger(
                status.currentOrder?.conflictGTINs,
                0
            );

        const missing =
            toInteger(
                status.currentOrder?.missingItems,
                0
            );

        if(conflicts > 0){

            UI.elements.masterGTINNotice.textContent =
                conflicts +
                " GTIN conflict(s) found in the current order. Those ambiguous barcodes are blocked; use Item Number/Name search or fallback Mapping for them.";

            UI.elements.masterGTINNotice.className =
                "masterGTINNotice warning";

        }
        else if(missing > 0){

            UI.elements.masterGTINNotice.textContent =
                missing +
                " order item(s) have no usable Master GTIN. They can still be received by Item Number/Name or manual entry.";

            UI.elements.masterGTINNotice.className =
                "masterGTINNotice warning";

        }
        else{

            UI.elements.masterGTINNotice.textContent =
                "System Global GTIN is active for the current order. Mapping file is not required.";

            UI.elements.masterGTINNotice.className =
                "masterGTINNotice success";

        }

    }
}


/* =====================================================
   HEALTH
===================================================== */

function refreshHealthSummary(){

    const orders =
        AppState.workspace.orderData;

    const mappings =
        AppState.workspace.mappingData;

    setElementText(
        UI.elements.healthOrderItems,
        orders.length
    );

    setElementText(
        UI.elements.healthMappings,
        mappings.length
    );

    const missingMappings =
        typeof getItemsWithoutMapping ===
        "function"
        ?
        getItemsWithoutMapping()
        :
        [];

    setElementText(
        UI.elements.healthMissingBarcode,
        missingMappings.length
    );

    const duplicateGTINs =
        typeof getDuplicateGTINs ===
        "function"
        ?
        getDuplicateGTINs()
        :
        [];

    setElementText(
        UI.elements.healthDuplicateGTIN,
        duplicateGTINs.length
    );

}


/* =====================================================
   SESSION UI
===================================================== */

function refreshSessionUI(){

    const session =
        AppState.session;

    const hasActiveOrder=!!(
        AppState.workspace?.active===true &&
        (AppState.workspace?.orderData?.length || AppState.workspace?.orderFiles?.length)
    );

    setElementText(
        UI.elements.sessionPageId,
        !hasActiveOrder
            ? "INACTIVE"
            : (session.cloud === true ? "CONNECTED" : "LOCAL")
    );

    setElementText(
        UI.elements.sessionDeviceId,
        session.deviceId || "-"
    );

    setElementText(
        UI.elements.sessionQueueCount,
        Array.isArray(
            session.pendingQueue
        )
        ?
        session.pendingQueue.length
        :
        0
    );

    setElementText(
        UI.elements.sessionLastSave,
        session.lastSave
        ?
        formatDateTime(
            session.lastSave
        )
        :
        "-"
    );

    refreshHeader();

    refreshZebraInterface();

}


/* =====================================================
   ARCHIVE
===================================================== */

function refreshArchiveUI(){

    const orders =
        AppState.archive.orders
        ||
        [];

    const transactions =
        AppState.archive.transactions
        ||
        [];

    setElementText(
        UI.elements.archiveOrderCount,
        orders.length
    );

    setElementText(
        UI.elements.archiveTransactionCount,
        transactions.length
    );

    renderArchiveTable(
        orders
    );

}


function getArchiveOrderNumbers(order){
    const values=[];
    const seen=new Set();
    const files=Array.isArray(order && order.orderFiles)?order.orderFiles:[];
    files.forEach(file=>{
        const raw=toSafeString(file && (file.documentId||file.orderNumber||file.order_number)).trim();
        const value=typeof normalizeOrderNumber==="function"?normalizeOrderNumber(raw):raw.toUpperCase().replace(/\s+/g,"");
        if(value && !seen.has(value)){seen.add(value);values.push(value);}
    });
    if(!values.length && order && order.orderNumber){
        const raw=toSafeString(order.orderNumber).trim();
        if(raw)values.push(raw);
    }
    return values;
}

function getArchiveOrderDate(order){
    const files=Array.isArray(order && order.orderFiles)?order.orderFiles:[];
    for(const file of files){
        const value=file && (file.orderDate||file.order_date||file.documentDate||file.reportDate);
        if(value){return formatDate(value);}
    }
    return "-";
}

async function requestDeleteArchivedOrder(internalOrderId,orderNumber){
    if(typeof isPharmacyAdmin==="function" && !isPharmacyAdmin()){
        showToast("Admin permission is required to delete a received order","warning");
        return false;
    }
    const safeOrder=toSafeString(orderNumber).trim();
    if(!safeOrder){showToast("Order Number is unavailable for this archive record","error");return false;}
    if(!window.confirm("Delete received order "+safeOrder+" and its related receiving data? This does NOT delete the Global GTIN Master or other orders."))return false;
    const typed=window.prompt("Type the Order Number exactly to continue:\n\n"+safeOrder,"");
    if(toSafeString(typed).trim().toUpperCase()!==safeOrder.toUpperCase()){
        showToast("Order Number confirmation did not match","warning");
        return false;
    }
    if(!window.confirm("FINAL CONFIRMATION\n\nPermanently delete "+safeOrder+"?"))return false;
    showLoading("Deleting "+safeOrder+"...");
    try{
        if(typeof authRpc==="function" && typeof AuthState!=="undefined" && AuthState.context && AuthState.context.pharmacy_id){
            try{
                await authRpc("delete_pharmflow_order_complete",{
                    p_pharmacy_id:AuthState.context.pharmacy_id,
                    p_order_number:safeOrder,
                    p_confirmation:safeOrder
                });
            }catch(error){
                Logger.warn("Cloud order delete RPC unavailable or failed",error);
                throw new Error("Cloud order deletion failed. No local archive data was removed. "+(error.message||""));
            }
        }
        if(typeof deleteArchivedOrderLocalData!=="function")throw new Error("Local archive delete helper is unavailable");
        await deleteArchivedOrderLocalData(internalOrderId);

        /* Cloud is authoritative: reload Archive and lifecycle after deletion,
           then verify before ever showing a success toast. */
        if(typeof restoreHistoricalArchive==="function"){
            await restoreHistoricalArchive();
        }
        if(typeof refreshOrderLifecycleRegistry==="function"){
            await refreshOrderLifecycleRegistry();
        }
        if(typeof refreshItemTransferOrderOptions==="function"){
            refreshItemTransferOrderOptions();
        }

        if(
            typeof ReportsEngine!=="undefined" &&
            ReportsEngine.itemTransfer &&
            typeof normalizeOrderNumber==="function" &&
            normalizeOrderNumber(ReportsEngine.itemTransfer.orderNumber)===normalizeOrderNumber(safeOrder)
        ){
            ReportsEngine.itemTransfer={orderNumber:"",orderMeta:null,rows:[]};
            if(typeof renderItemTransferReport==="function")renderItemTransferReport();
        }

        const stillInArchive=(AppState.archive.orders||[]).some(order=>
            getArchiveOrderNumbers(order).some(number=>
                normalizeOrderNumber(number)===normalizeOrderNumber(safeOrder)
            )
        );

        const stillInRegistry=(
            typeof OrderLifecycleEngine!=="undefined" &&
            Array.isArray(OrderLifecycleEngine.records)
        ) ? OrderLifecycleEngine.records.some(row=>
            normalizeOrderNumber(row.order_number)===normalizeOrderNumber(safeOrder)
        ) : false;

        if(stillInArchive || stillInRegistry){
            throw new Error("Deletion was not confirmed by the cloud. The order remains protected.");
        }

        showToast("Order "+safeOrder+" permanently deleted","success");
        return true;
    }catch(error){
        Logger.error("Delete archived order failed",error);
        showToast(error.message||"Unable to delete order","error");
        return false;
    }finally{hideLoading();}
}
window.requestDeleteArchivedOrder=requestDeleteArchivedOrder;


function openArchivedDiscrepancyReport(internalOrderId){
    const order=(AppState.archive.orders||[]).find(
        row=>String(row?.orderId||"")===String(internalOrderId||"")
    );

    if(!order){
        showToast("Archived order could not be found","error");
        return false;
    }

    const fullReport=order.fullReceivingReport;
    const emailReport=order.discrepancyReport;

    if(fullReport && Array.isArray(fullReport.rows)){
        if(typeof openOrderStatusReportFromSnapshot==="function"){
            openOrderStatusReportFromSnapshot(
                JSON.parse(JSON.stringify(fullReport))
            );
            return true;
        }

        if(typeof printLiveReceivingReport==="function"){
            printLiveReceivingReport(
                JSON.parse(JSON.stringify(fullReport))
            );
            return true;
        }
    }

    /* Compatibility for reports finalized by 2C.10.2.2. */
    if(emailReport && Array.isArray(emailReport.rows)){
        openFinalizedDiscrepancyEmailPreview?.(
            JSON.parse(JSON.stringify(emailReport)),
            {fromArchive:true}
        );
        return true;
    }

    showToast(
        "No saved report is available for this older archive record",
        "warning"
    );
    return false;
}

window.openArchivedDiscrepancyReport=openArchivedDiscrepancyReport;


function renderArchiveTable(orders){
    const tbody=UI.elements.archiveTableBody;
    if(!tbody){return;}
    tbody.innerHTML="";
    if(!orders || orders.length===0){
        tbody.innerHTML=`<tr><td colspan="7" class="tableEmptyState">No archived orders yet.</td></tr>`;
        return;
    }
    orders.forEach(order=>{
        const numbers=getArchiveOrderNumbers(order);
        const displayNumber=numbers.length?numbers.join(", "):"Unavailable";
        const row=document.createElement("tr");
        row.innerHTML=`
            <td><strong>${escapeHTML(displayNumber)}</strong></td>
            <td>${escapeHTML(getArchiveOrderDate(order))}</td>
            <td>${escapeHTML(formatDate(order.closedAt||order.createdAt))}</td>
            <td>${toInteger(order.totalItems,0)}</td>
            <td>${toNumber(order.totalReceivedUnits,0)}</td>
            <td><span class="archiveStatus completed">${escapeHTML(order.status||"Received")}</span></td>
            <td>
              <div class="archiveRowActions">
                ${order.discrepancyReport && Array.isArray(order.discrepancyReport.rows)
                    ? `<button type="button" class="archiveViewReportButton" data-view-archive-report="${escapeHTML(order.orderId)}">View Report</button>`
                    : `<span class="archiveActionNote">No saved report</span>`}
                ${numbers.length===1
                    ? `<button type="button" class="archiveDeleteOrderButton" data-delete-archive-order="${escapeHTML(order.orderId)}" data-order-number="${escapeHTML(numbers[0])}">Delete Order</button>`
                    : `<span class="archiveActionNote">${numbers.length>1?"Batch record":"Order number unavailable"}</span>`}
              </div>
            </td>`;
        tbody.appendChild(row);
    });
    tbody.querySelectorAll("[data-view-archive-report]").forEach(button=>{
        button.addEventListener(
            "click",
            ()=>openArchivedDiscrepancyReport(button.dataset.viewArchiveReport)
        );
    });

    tbody.querySelectorAll("[data-delete-archive-order]").forEach(button=>{
        button.addEventListener("click",()=>requestDeleteArchivedOrder(button.dataset.deleteArchiveOrder,button.dataset.orderNumber));
    });
}



/* =====================================================
   OLD SEARCH MODAL
===================================================== */

function openItemSearchModal(
    defaultText = ""
){

    const modal =
        UI.elements.searchModal;

    const input =
        UI.elements.globalSearchInput;

    if(
        !modal ||
        !input
    ){
        return;
    }

    modal.classList.add(
        "open"
    );

    modal.setAttribute(
        "aria-hidden",
        "false"
    );

    input.value =
        defaultText;

    renderGlobalSearchResults(
        defaultText
    );

    setTimeout(()=>{

        input.focus();

        input.select();

    },50);

}


function closeItemSearchModal(){

    const modal =
        UI.elements.searchModal;

    if(!modal){
        return;
    }

    modal.classList.remove(
        "open"
    );

    modal.setAttribute(
        "aria-hidden",
        "true"
    );

    if(
        UI.elements.globalSearchInput
    ){

        UI.elements
            .globalSearchInput
            .value =
            "";

    }

    if(
        UI.elements.globalSearchResults
    ){

        UI.elements
            .globalSearchResults
            .innerHTML =
            "";

    }

    focusScannerInput();

}


function handleGlobalSearchInput(event){

    renderGlobalSearchResults(
        event.target.value
    );

}


function renderGlobalSearchResults(searchText){

    const container =
        UI.elements.globalSearchResults;

    if(!container){
        return;
    }

    container.innerHTML =
        "";

    const query =
        normalizeText(
            searchText
        );

    if(!query){
        return;
    }

    const results =
        searchItems(
            getSearchableItems(),
            query,
            APP_CONFIG
                .receiving
                .searchResultLimit
        );

    if(results.length === 0){

        container.innerHTML = `

            <div class="emptyState">
                No matching item found.
            </div>

        `;

        return;
    }

    results.forEach(item=>{

        const button =
            document.createElement(
                "button"
            );

        button.type =
            "button";

        button.className =
            "searchResultItem";

        button.innerHTML = `

            <div class="searchResultMain">

                <strong>
                    ${escapeHTML(
                        item.itemName
                    )}
                </strong>

                <span>
                    ${escapeHTML(
                        item.itemCode
                    )}
                </span>

            </div>

            <div class="searchResultMeta">

                ${toNumber(
                    item.receivedQty,
                    0
                )}

                /

                ${toNumber(
                    item.orderedQty,
                    0
                )}

            </div>

        `;

        button.addEventListener(
            "click",
            function(event){

                if(event.target?.closest?.("[data-review-item]")){
                    event.preventDefault();
                    event.stopPropagation();
                    openSearchedItemReview(item);
                    return;
                }

                selectSmartScanItem(
                    item
                );

                closeItemSearchModal();

            }
        );

        if(item.manual===true && toNumber(item.receivedQty,0)===0){
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "secondaryButton removeManualSearchButton";
            remove.style.marginLeft = "10px";
            remove.style.padding = "7px 10px";
            remove.textContent = "Remove Manual Item";
            remove.addEventListener("click", function(event){
                event.preventDefault();
                event.stopPropagation();

                if(typeof deleteManualItem==="function" && deleteManualItem(item.itemCode)){
                    renderGlobalSearchResults(
                        UI.elements.globalSearchInput?.value || ""
                    );
                }
            });
            button.appendChild(remove);
        }

        if(toNumber(item.receivedQty,0) > 0){
            const review = document.createElement("button");
            review.type = "button";
            review.className = "secondaryButton";
            review.setAttribute("data-review-item", item.itemCode);
            review.style.marginLeft = "10px";
            review.style.padding = "7px 10px";
            review.textContent = "Review / Adjust";
            review.addEventListener("click", function(event){
                event.preventDefault();
                event.stopPropagation();
                openSearchedItemReview(item);
            });
            button.appendChild(review);
        }

        container.appendChild(
            button
        );

    });

}


/* =====================================================
   PHASE 2C.7.5 - SEARCHED ITEM REVIEW / CORRECTION
===================================================== */
function openSearchedItemReview(item){
    if(!item) return;

    closeItemSearchModal();

    let modal=document.getElementById("searchedItemReviewModal");
    if(!modal){
        modal=document.createElement("div");
        modal.id="searchedItemReviewModal";
        modal.className="quantityAdjustmentModal";
        modal.innerHTML=`
          <div class="quantityAdjustmentCard" style="max-width:680px;">
            <div class="quantityAdjustmentHeader">
              <div><span class="sectionEyebrow">ITEM REVIEW</span><h3 id="searchedReviewName">-</h3></div>
              <button type="button" id="btnCloseSearchedReview" class="iconButton" aria-label="Close">✕</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0;">
              <div class="quantityCurrentTotal"><span>Ordered</span><strong id="searchedReviewOrdered">0</strong></div>
              <div class="quantityCurrentTotal"><span>Received — All Devices</span><strong id="searchedReviewReceived">0</strong></div>
              <div class="quantityCurrentTotal"><span>Remaining</span><strong id="searchedReviewRemaining">0</strong></div>
            </div>
            <div class="quantityCurrentTotal" style="margin-bottom:10px;">
              <span>Last Update</span><strong id="searchedReviewLastUpdate">-</strong>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
              <button type="button" id="btnSearchedAdjust" class="primaryButton">Adjust Received Qty</button>
              <button type="button" id="btnSearchedActivity" class="secondaryButton">View Activity</button>
              <button type="button" id="btnSearchedRemoveManual" class="dangerButton" hidden>Remove Manual Item</button>
            </div>
            <div id="searchedReviewCorrection" hidden>
              <label class="quantityAdjustmentLabel" for="searchedReviewCorrectionInput">Correct total received to</label>
              <input id="searchedReviewCorrectionInput" class="quantityAdjustmentInput" type="number" min="0" step="1" inputmode="numeric">
              <p class="quantityAdjustmentHelp">This changes the shared total for this item. PharmFlow records only the difference as a correction, so the audit history remains intact.</p>
              <div class="quantityAdjustmentActions">
                <button type="button" id="btnApplySearchedCorrection" class="primaryButton">Apply Correction</button>
                <button type="button" id="btnCancelSearchedCorrection" class="secondaryButton">Cancel</button>
              </div>
            </div>
            <div id="searchedReviewActivity" hidden style="margin-top:10px;"></div>
          </div>`;
        document.body.appendChild(modal);
        document.getElementById("btnCloseSearchedReview")?.addEventListener("click",closeSearchedItemReview);
        modal.addEventListener("click",e=>{if(e.target===modal)closeSearchedItemReview();});
        modal.addEventListener("keydown",e=>{
            if(e.key==="Escape"){e.preventDefault();closeSearchedItemReview();return;}
            if(e.key==="Enter" && !document.getElementById("searchedReviewCorrection")?.hidden){
                e.preventDefault(); document.getElementById("btnApplySearchedCorrection")?.click();
            }
        });
    }

    modal.dataset.itemCode=item.itemCode;
    setElementText(document.getElementById("searchedReviewName"),item.itemName||item.itemCode);
    setElementText(document.getElementById("searchedReviewOrdered"),toNumber(item.orderedQty,0));
    setElementText(document.getElementById("searchedReviewReceived"),toNumber(item.receivedQty,0));
    setElementText(document.getElementById("searchedReviewRemaining"),Math.max(0,toNumber(item.orderedQty,0)-toNumber(item.receivedQty,0)));

    const history=(Array.isArray(AppState?.workspace?.receivingHistory)?AppState.workspace.receivingHistory:[])
      .filter(tx=>normalizeItemCode(tx?.itemCode)===normalizeItemCode(item.itemCode))
      .sort((a,b)=>new Date(b?.dateTime||0)-new Date(a?.dateTime||0));
    const last=history[0];
    setElementText(document.getElementById("searchedReviewLastUpdate"),last?.dateTime?(typeof formatDateTime==="function"?formatDateTime(last.dateTime):last.dateTime):"No activity yet");

    const correction=document.getElementById("searchedReviewCorrection");
    const activity=document.getElementById("searchedReviewActivity");
    const removeManualButton=document.getElementById("btnSearchedRemoveManual");
    if(removeManualButton){
        removeManualButton.hidden = !(
            item.manual===true &&
            toNumber(item.receivedQty,0)===0
        );
        removeManualButton.onclick=()=>{
            const current=getItemByCode(modal.dataset.itemCode);
            if(!current || current.manual!==true || toNumber(current.receivedQty,0)!==0){
                showToast("Set the manual item quantity to zero first","warning");
                return;
            }
            showConfirmModal(
                "Remove Manual Item",
                "Remove this manually-added item from the current receiving workspace? It will no longer appear in Search or reports.",
                ()=>{
                    if(deleteManualItem(current.itemCode)){
                        closeSearchedItemReview();
                    }
                }
            );
        };
    }
    if(correction) correction.hidden=true;
    if(activity){activity.hidden=true;activity.innerHTML="";}

    document.getElementById("btnSearchedAdjust").onclick=()=>{
        if(activity) activity.hidden=true;
        if(correction) correction.hidden=false;
        const current=getItemByCode(modal.dataset.itemCode);
        const input=document.getElementById("searchedReviewCorrectionInput");
        if(input){input.value=String(toNumber(current?.receivedQty,item.receivedQty));setTimeout(()=>{input.focus();input.select();},20);}
    };

    document.getElementById("btnCancelSearchedCorrection").onclick=()=>{if(correction) correction.hidden=true;};

    document.getElementById("btnApplySearchedCorrection").onclick=()=>{
        const input=document.getElementById("searchedReviewCorrectionInput");
        const total=toNumber(input?.value,-1);
        if(total<0){showToast("Enter a valid received total","warning");return;}
        const tx=setItemReceivedQuantity(modal.dataset.itemCode,total);
        if(!tx) return;
        const current=getItemByCode(modal.dataset.itemCode);
        setElementText(document.getElementById("searchedReviewReceived"),toNumber(current?.receivedQty,total));
        setElementText(document.getElementById("searchedReviewRemaining"),Math.max(0,toNumber(current?.orderedQty,0)-toNumber(current?.receivedQty,total)));
        if(correction) correction.hidden=true;

        if(removeManualButton){
            removeManualButton.hidden = !(
                current?.manual===true &&
                toNumber(current?.receivedQty,0)===0
            );
        }

        showToast("Received quantity corrected. History preserved.","success");
    };

    document.getElementById("btnSearchedActivity").onclick=()=>{
        if(correction) correction.hidden=true;
        if(!activity) return;
        const rows=(typeof getReceivingActivityRows==="function"?getReceivingActivityRows():[])
          .filter(row=>normalizeItemCode(row?.itemCode)===normalizeItemCode(modal.dataset.itemCode))
          .sort((a,b)=>new Date(b?.dateTime||0)-new Date(a?.dateTime||0));
        activity.hidden=false;
        activity.innerHTML=rows.length?`<div class="phase263TableWrap" style="max-height:260px;"><table class="quickKpiTable phase263Table"><thead><tr><th>Time</th><th>Device</th><th>Source</th><th>Qty Change</th><th>Total After</th></tr></thead><tbody>${rows.map(row=>{const q=toNumber(row.qtyChange,0);return `<tr><td>${escapeHTML(typeof formatDateTime==="function"?formatDateTime(row.dateTime):toSafeString(row.dateTime))}</td><td>${escapeHTML(toSafeString(row.deviceId||"Unknown"))}</td><td>${escapeHTML(typeof getActivitySourceLabel==="function"?getActivitySourceLabel(row.source):toSafeString(row.source))}</td><td>${q>0?"+":""}${escapeHTML(q)}</td><td><b>${escapeHTML(toNumber(row.totalAfterAction,0))}</b></td></tr>`;}).join("")}</tbody></table></div>`:'<div class="tableEmptyState">No receiving activity for this item.</div>';
    };

    modal.classList.add("open");
    modal.setAttribute("aria-hidden","false");
}

function closeSearchedItemReview(){
    const modal=document.getElementById("searchedItemReviewModal");
    modal?.classList.remove("open");
    modal?.setAttribute("aria-hidden","true");
    focusScannerInput();
}
window.openSearchedItemReview=openSearchedItemReview;


/* =====================================================
   MANUAL ITEM
===================================================== */

function openManualItemModal(){

    closeItemSearchModal();

    const modal =
        UI.elements.manualItemModal;

    if(!modal){
        return;
    }

    modal.classList.add(
        "open"
    );

    modal.setAttribute(
        "aria-hidden",
        "false"
    );

    if(UI.elements.manualItemCode){
        UI.elements.manualItemCode.value = "";
    }

    if(UI.elements.manualItemName){
        UI.elements.manualItemName.value = "";
    }

    if(UI.elements.manualItemQuantity){
        UI.elements.manualItemQuantity.value = "1";
    }

    setTimeout(()=>{

        UI.elements
            .manualItemCode
            ?.focus();

    },50);

}


function closeManualItemModal(){

    const modal =
        UI.elements.manualItemModal;

    if(!modal){
        return;
    }

    modal.classList.remove(
        "open"
    );

    modal.setAttribute(
        "aria-hidden",
        "true"
    );

    focusScannerInput();

}


/* =====================================================
   CONFIRM MODAL
===================================================== */

function showConfirmModal(
    title,
    message,
    onConfirm
){

    const modal =
        UI.elements.confirmModal;

    if(!modal){
        return;
    }

    setElementText(
        UI.elements.confirmTitle,
        title || "Confirm"
    );

    setElementText(
        UI.elements.confirmMessage,
        message || "Are you sure?"
    );

    UI.confirmCallback =
        typeof onConfirm ===
        "function"
        ?
        onConfirm
        :
        null;

    modal.classList.add(
        "open"
    );

    modal.setAttribute(
        "aria-hidden",
        "false"
    );

}


function closeConfirmModal(){

    const modal =
        UI.elements.confirmModal;

    if(!modal){
        return;
    }

    modal.classList.remove(
        "open"
    );

    modal.setAttribute(
        "aria-hidden",
        "true"
    );

    UI.confirmCallback =
        null;

    focusScannerInput();

}


async function handleConfirmOK(){

    /* Phase 2C.10.4.3 — confirmation actions that perform Supabase work must
       be single-flight and awaited. This prevents a long destructive action
       from being detached from its UI lifecycle and losing its final receipt. */
    if(UI.confirmInProgress){
        return;
    }

    const callback = UI.confirmCallback;

    if(!callback){
        closeConfirmModal();
        return;
    }

    UI.confirmInProgress = true;

    const confirmButton = document.getElementById("btnConfirmOK");
    if(confirmButton){
        confirmButton.disabled = true;
    }

    closeConfirmModal();

    try{
        await Promise.resolve(callback());
    }
    catch(error){
        Logger.error("Confirmed action failed",error);
        showToast(
            error?.message || "Unable to complete the requested action",
            "error"
        );
    }
    finally{
        UI.confirmInProgress = false;
        if(confirmButton){
            confirmButton.disabled = false;
        }
    }

}


/* =====================================================
   TOAST
===================================================== */

function showToast(
    message,
    type = "info",
    duration =
        APP_CONFIG
            .ui
            .toastDurationMs
){

    /* Phase 2C.10.4.4 — always resolve the live toast host from the DOM.
       Long async operations can outlive a cached UI reference after a view
       refresh. Reset worked because it emits immediately; Historical Delete
       can finish after several server/UI refreshes. */
    let container =
        document.getElementById("toastContainer");

    if(!container || !container.isConnected){
        container = UI.elements.toastContainer;
    }

    if(!container || !container.isConnected){

        Logger.info(
            "Toast:",
            message
        );

        return;
    }

    UI.elements.toastContainer = container;

    const toast =
        document.createElement(
            "div"
        );

    toast.className =
        "toastMessage";

    if(
        type === "success" ||
        type === "warning" ||
        type === "error"
    ){

        toast.classList.add(
            type
        );

    }

    toast.textContent =
        toSafeString(
            message
        );

    container.appendChild(
        toast
    );

    setTimeout(()=>{

        toast.remove();

    },duration);

}


/* =====================================================
   LOADING
===================================================== */

function showLoading(
    message = "Loading..."
){

    const overlay =
        UI.elements.loadingOverlay;

    if(!overlay){
        return;
    }

    setElementText(
        UI.elements.loadingText,
        message
    );

    overlay.classList.add(
        "show"
    );

    AppState.ui.loading =
        true;

}


function hideLoading(){

    const overlay =
        UI.elements.loadingOverlay;

    if(!overlay){
        return;
    }

    overlay.classList.remove(
        "show"
    );

    AppState.ui.loading =
        false;

}


/* =====================================================
   SYSTEM STATUS
===================================================== */

function setSystemStatus(
    text,
    type = "ready"
){

    const status =
        UI.elements.systemStatus;

    if(!status){
        return;
    }

    status.textContent =
        toSafeString(
            text
        );

    status.className =
        "systemStatus " +
        type;

}


/* =====================================================
   SCANNER FOCUS
===================================================== */

function focusScannerInput(){

    if(
        !AppState.settings
            .autofocusScanner
    ){
        return;
    }

    const input =
        UI.elements.barcodeInput;

    if(!input){
        return;
    }

    if(document.querySelector(".modalOverlay.open, .gtinResolutionShell.open")){
        return;
    }

    /*
       Do not steal focus while user is entering the
       selected search quantity.
    */

    const active =
        document.activeElement;

    if(
        active &&
        active.id ===
        "smartQuantityInput"
    ){
        return;
    }

    setTimeout(()=>{

        input.focus();

    },
    APP_CONFIG
        .receiving
        .scannerFocusDelayMs);

}


/* =====================================================
   SCAN BOX STATE
===================================================== */

function triggerScanFieldFlash(kind="success"){

    const scanBox = UI.elements.scanBox || document.getElementById("scanBox");
    if(!scanBox){ return; }

    let layer = scanBox.querySelector(":scope > .pfnScanFlashLayer");
    if(!layer){
        layer = document.createElement("span");
        layer.className = "pfnScanFlashLayer";
        layer.setAttribute("aria-hidden","true");
        scanBox.appendChild(layer);
    }

    const flashClass = kind === "error"
        ? "pfnScanFlashLayerError"
        : "pfnScanFlashLayerSuccess";

    layer.classList.remove(
        "pfnScanFlashLayerSuccess",
        "pfnScanFlashLayerError",
        "pfnScanFlashLayerActive"
    );

    /* Restart the transition even for two consecutive scans with the same
       result.  The layer is a real element above the input/icon backgrounds,
       so the whole Scan/Search field receives one continuous tint. */
    void layer.offsetWidth;
    layer.classList.add(flashClass,"pfnScanFlashLayerActive");

    clearTimeout(scanBox._pfnFullFieldFlashTimer);
    scanBox._pfnFullFieldFlashTimer=setTimeout(()=>{
        layer.classList.remove("pfnScanFlashLayerActive");
    },760);
}

window.triggerScanFieldFlash=triggerScanFieldFlash;

function setScanBoxState(
    state = "ready"
){

    const scanBox =
        UI.elements.scanBox;

    const badge =
        UI.elements.scanStatusBadge;

    if(!scanBox){
        return;
    }

    scanBox.classList.remove(
        "success",
        "error",
        "flashSuccess",
        "flashError",
        "action"
    );

    if(state === "success"){

        scanBox.classList.add(
            "success",
            "flashSuccess"
        );

        triggerScanFieldFlash("success");

        if(badge){

            badge.className =
                "scanStatusBadge ready";

            badge.innerHTML = `

                <span class="scanPulse"></span>

                RECEIVED

            `;

        }

        setTimeout(()=>{

            setScanBoxState(
                "ready"
            );

        },600);

        return;
    }

    if(state === "action") {
        scanBox.classList.add("action");
        if(badge){
            badge.className="scanStatusBadge action";
            badge.innerHTML=`<span class="scanPulse"></span>ACTION REQUIRED`;
        }
        return;
    }

    if(state === "error"){

        scanBox.classList.add(
            "error",
            "flashError"
        );

        triggerScanFieldFlash("error");

        if(badge){

            badge.className =
                "scanStatusBadge error";

            badge.innerHTML = `

                <span class="scanPulse"></span>

                NOT FOUND

            `;

        }

        setTimeout(()=>{

            setScanBoxState(
                "ready"
            );

        },900);

        return;
    }

    if(badge){

        badge.className =
            "scanStatusBadge ready";

        badge.innerHTML = `

            <span class="scanPulse"></span>

            READY TO SCAN

        `;

    }

}


/* =====================================================
   LAST SCAN FLASH
===================================================== */

function flashLastScanCard(
    success = true
){

    const card =
        UI.elements.lastScanCard;

    if(!card){
        return;
    }

    card.classList.remove(
        "scanSuccess",
        "scanError"
    );

    void card.offsetWidth;

    card.classList.add(
        success
        ?
        "scanSuccess"
        :
        "scanError"
    );

    /*
       Keep the successful Last Scan visually green until the
       next scan replaces it.  An error is temporary because
       the previous successful item is still the last received item.
    */
    if(!success){
        setTimeout(()=>{
            card.classList.remove("scanError");
        },1400);
    }

}


/* =====================================================
   REPORT SEARCH
===================================================== */

function renderReportItemSearchResults(results){

    const container =
        UI.elements.reportItemResults;

    if(!container){
        return;
    }

    container.innerHTML =
        "";

    UI.reportSearchResults =
        results;

    results.forEach(item=>{

        const button =
            document.createElement(
                "button"
            );

        button.type =
            "button";

        button.className =
            "dropdownItem";

        button.innerHTML = `

            <strong>
                ${escapeHTML(
                    item.itemName
                )}
            </strong>

            <br>

            <small>
                ${escapeHTML(
                    item.itemCode
                )}
            </small>

        `;

        button.addEventListener(
            "click",
            function(){

                AppState.ui
                    .selectedReportItem =
                    {
                        itemCode:
                            item.itemCode,

                        itemName:
                            item.itemName
                    };

                if(
                    UI.elements.reportItemSearch
                ){

                    UI.elements
                        .reportItemSearch
                        .value =
                        item.itemName +
                        " — " +
                        item.itemCode;

                }

                setElementText(
                    UI.elements.reportSelectedItem,
                    item.itemName
                );

                setElementText(
                    UI.elements.reportSelectedCode,
                    item.itemCode
                );

                container.innerHTML =
                    "";

            }
        );

        container.appendChild(
            button
        );

    });

}


function resetItemReportUI(){

    AppState.ui.selectedReportItem =
        null;

    setElementText(
        UI.elements.reportSelectedItem,
        "-"
    );

    setElementText(
        UI.elements.reportSelectedCode,
        "-"
    );

    setElementText(
        UI.elements.reportTotalReceived,
        "0"
    );

    setElementText(
        UI.elements.reportOrderCount,
        "0"
    );

    if(
        UI.elements.itemReportTableBody
    ){

        UI.elements
            .itemReportTableBody
            .innerHTML =
            "";

    }

}


/* =====================================================
   GENERIC TEXT SETTER
===================================================== */

function setElementText(
    element,
    value
){

    if(!element){
        return;
    }

    element.textContent =
        value === null ||
        value === undefined ||
        value === ""
        ?
        "-"
        :
        String(value);

}

/* =====================================================
   PROFESSIONAL LAST SCAN LAYOUT
===================================================== */

function createProfessionalLastScanLayout(){

    const card =
        UI.elements.lastScanCard;

    if(!card){
        return;
    }

    if(
        document.getElementById(
            "professionalLastScanLayout"
        )
    ){
        return;
    }

    /*
       Hide the old equal-width information grid.
       It remains in the DOM so older code stays compatible.
    */

    const legacyGrid =
        card.querySelector(
            ".lastScanGrid"
        );

    if(legacyGrid){

        legacyGrid.classList.add(
            "legacyLastScanGrid"
        );

    }

    const layout =
        document.createElement(
            "div"
        );

    layout.id =
        "professionalLastScanLayout";

    layout.className =
        "professionalLastScanLayout";

    layout.innerHTML = `

        <div class="lastScanHero">

            <div
                id="lastScanHeroName"
                class="lastScanHeroName"
            >
                -
            </div>

            <div class="lastScanMetaRow">

                <div class="lastScanMetaItem">

                    <span>
                        Item Number
                    </span>

                    <strong
                        id="lastScanHeroCode"
                    >
                        -
                    </strong>

                </div>

                <div class="lastScanMetaItem lastScanMetaGTIN">

                    <span>
                        GTIN
                    </span>

                    <strong
                        id="lastScanHeroGTIN"
                    >
                        -
                    </strong>

                </div>

                <div class="lastScanMetaItem lastScanMetaTime">

                    <span>
                        Last Update
                    </span>

                    <strong
                        id="lastScanHeroTime"
                    >
                        -
                    </strong>

                </div>

            </div>

        </div>

        <div class="lastScanMetrics">

            <div class="lastScanMetric">

                <span>
                    Ordered
                </span>

                <strong
                    id="lastScanHeroOrdered"
                >
                    -
                </strong>

            </div>

            <div class="lastScanMetric lastScanMetricReceived">

                <span>
                    Received
                </span>

                <strong
                    id="lastScanHeroReceived"
                >
                    -
                </strong>

            </div>

            <div class="lastScanMetric lastScanMetricRemaining">

                <span>
                    Remaining
                </span>

                <strong
                    id="lastScanHeroRemaining"
                >
                    -
                </strong>

            </div>

            <div class="lastScanMetric lastScanMetricStatus">

                <span
                    id="lastScanHeroStatusLabel"
                >
                    Status
                </span>

                <div
                    id="lastScanHeroStatus"
                    class="lastScanHeroStatus"
                >
                    -
                </div>

            </div>

        </div>

    `;

    const header =
        card.querySelector(
            ".cardHeader"
        );

    if(header){

        header.insertAdjacentElement(
            "afterend",
            layout
        );

    }
    else{

        card.prepend(
            layout
        );

    }

}


/* =====================================================
   REFRESH PROFESSIONAL LAST SCAN
===================================================== */

function refreshProfessionalLastScan(
    scan
){

    const name =
        document.getElementById(
            "lastScanHeroName"
        );

    const code =
        document.getElementById(
            "lastScanHeroCode"
        );

    const gtin =
        document.getElementById(
            "lastScanHeroGTIN"
        );

    const time =
        document.getElementById(
            "lastScanHeroTime"
        );

    const ordered =
        document.getElementById(
            "lastScanHeroOrdered"
        );

    const received =
        document.getElementById(
            "lastScanHeroReceived"
        );

    const remaining =
        document.getElementById(
            "lastScanHeroRemaining"
        );

    const status =
        document.getElementById(
            "lastScanHeroStatus"
        );

    const statusLabel =
        document.getElementById(
            "lastScanHeroStatusLabel"
        );

    if(!scan){

        setElementText(
            name,
            "-"
        );

        setElementText(
            code,
            "-"
        );

        setElementText(
            gtin,
            "-"
        );

        setElementText(
            time,
            "-"
        );

        setElementText(
            ordered,
            "-"
        );

        setElementText(
            received,
            "-"
        );

        setElementText(
            remaining,
            "-"
        );

        if(status){

            status.textContent =
                "-";

        }

        if(statusLabel){

            statusLabel.textContent =
                "Status";

        }

        return;
    }

    setElementText(
        name,
        scan.itemName || "-"
    );

    setElementText(
        code,
        scan.itemCode || "-"
    );

    setElementText(
        gtin,
        scan.gtin || "-"
    );

    setElementText(
        time,
        formatDateTime(
            scan.scanTime
        )
    );

    setElementText(
        ordered,
        scan.orderedQty ?? "-"
    );

    setElementText(
        received,
        scan.receivedQty ?? "-"
    );

    setElementText(
        remaining,
        scan.remainingQty ?? "-"
    );

    if(status){

        const orderedQty =
            toNumber(
                scan.orderedQty,
                0
            );

        const receivedQty =
            toNumber(
                scan.receivedQty,
                0
            );

        const overQty =
            Math.max(
                0,
                receivedQty - orderedQty
            );

        const isOver =
            overQty > 0 ||
            scan.status ===
                APP_CONFIG.statuses.over;

        if(isOver){

            if(statusLabel){

                statusLabel.textContent =
                    "Over Qty";

            }

            status.innerHTML = `
                <strong class="lastScanOverQuantity">
                    +${overQty}
                </strong>
            `;

        }
        else{

            if(statusLabel){

                statusLabel.textContent =
                    "Status";

            }

            status.innerHTML =
                renderStatusBadge(
                    scan.status ||
                    APP_CONFIG.statuses.pending
                );

        }

    }

}


/* =====================================================
   LAST SCAN QUANTITY CONTROLS
===================================================== */

function createLastScanQuantityControls(){

  const card =
      UI.elements.lastScanCard;

  if(!card){
      return;
  }

  if(
      document.getElementById(
          "lastScanQuantityControls"
      )
  ){
      return;
  }

  const controls =
      document.createElement(
          "div"
      );

  controls.id =
      "lastScanQuantityControls";

  controls.className =
      "lastScanQuantityControls";

  controls.innerHTML = `

      <div class="lastScanQtyTitle">

          BATCH QTY

      </div>

      <div class="handheldScanContext" aria-live="polite">
          <div>
              <span>LAST ACTION</span>
              <strong id="handheldThisScan">+0</strong>
          </div>
          <div>
              <span>ALL DEVICES</span>
              <strong id="handheldTotalReceived">0</strong>
          </div>
      </div>

      <div class="lastScanQtyActions">

          <button
              type="button"
              id="btnLastScanMinus"
              class="lastScanQtyButton"
          >
              −
          </button>

          <button
              type="button"
              id="btnLastScanEdit"
              class="lastScanQtyValue"
              aria-label="Add Quantity"
              title="Add Quantity"
          >
              0
          </button>

          <button
              type="button"
              id="btnLastScanPlus"
              class="lastScanQtyButton"
          >
              +
          </button>

      </div>

      <div id="handheldScanSavedAck" class="handheldScanSavedAck">
          ✓ SCANNED +1 · PACK SAVED
      </div>

      <div class="lastScanQtyHint">

          Current local batch only. Scanning another item starts a new batch.

      </div>

      <button
          type="button"
          id="btnHandheldClearLastScan"
          class="handheldClearLastScan"
      >
          CLEAR SCREEN
      </button>

  `;

  const isHandheld=
      typeof isLikelyZebraDevice === "function" &&
      isLikelyZebraDevice();

  const professionalLayout=
      document.getElementById(
          "professionalLastScanLayout"
      );

  const metrics=
      professionalLayout?.querySelector(
          ".lastScanMetrics"
      );

  /* Keep the Handheld identity, batch quantity and operational totals in one
     expanding Last Scan surface. Desktop retains its established placement. */
  if(isHandheld && professionalLayout && metrics){
      professionalLayout.insertBefore(
          controls,
          metrics
      );
  }
  else{
      card.appendChild(
          controls
      );
  }


  document
      .getElementById(
          "btnLastScanPlus"
      )
      ?.addEventListener(
          "click",
          function(){

              const item =
                  getCurrentLastScanItem();

              if(!item){

                  showToast(
                      "No last scanned item",
                      "warning"
                  );

                  return;
              }

              increaseItemQuantity(
                  item.itemCode,
                  1
              );

          }
      );


  document
      .getElementById(
          "btnLastScanMinus"
      )
      ?.addEventListener(
          "click",
          function(){

              const item =
                  getCurrentLastScanItem();

              if(!item){

                  showToast(
                      "No last scanned item",
                      "warning"
                  );

                  return;
              }

              decreaseItemQuantity(
                  item.itemCode,
                  1
              );

          }
      );


  document
      .getElementById(
          "btnLastScanEdit"
      )
      ?.addEventListener(
          "click",
          function(){

              const item =
                  getCurrentLastScanItem();

              if(!item){

                  showToast(
                      "No last scanned item",
                      "warning"
                  );

                  return;
              }

              openQuantityEditPrompt(
                  item
              );

          }
      );

  document
      .getElementById("btnHandheldClearLastScan")
      ?.addEventListener("click",function(){

          /* CLEAR is data-safe: it never reverses a transaction or changes
             Received/history. It does end the worker's visible local batch, so
             the next scan of the same item correctly starts again at 1. */
          if(typeof resetCurrentLocalBatch==="function"){
              resetCurrentLocalBatch();
          }
          cancelReceivingAutoClear();
          AppState.workspace.lastScan=null;

          refreshEntireUI?.();
          window.hhRefreshReadyState?.();

          try{ document.activeElement?.blur?.(); }catch(_){}

          setTimeout(()=>{
              focusScannerInput?.();
              window.hhRepairScannerFocus?.("clear-screen");
          },40);
      });

}


/* =====================================================
 GET CURRENT LAST SCAN ITEM
===================================================== */

function getCurrentLastScanItem(){

  const scan =
      AppState.workspace.lastScan;

  if(
      !scan ||
      !scan.itemCode
  ){
      return null;
  }

  return getItemByCode(
      scan.itemCode
  );

}


/* =====================================================
 REFRESH LAST SCAN QUANTITY CONTROL
===================================================== */

function getPcLegacyCurrentBatchQuantity(itemCode){
    const code=normalizeItemCode(itemCode);
    const deviceId=getCurrentDeviceId();
    if(!code || !deviceId) return 0;

    const history=Array.isArray(AppState?.workspace?.receivingHistory)
        ? AppState.workspace.receivingHistory : [];

    const local=history.map((tx,index)=>({tx,index})).filter(row=>
        toSafeString(row.tx?.deviceId||"")===deviceId
    ).sort((a,b)=>{
        const ta=new Date(a.tx?.dateTime||0).getTime();
        const tb=new Date(b.tx?.dateTime||0).getTime();
        return ta===tb ? a.index-b.index : ta-tb;
    });

    if(!local.length) return 0;
    if(normalizeItemCode(local[local.length-1]?.tx?.itemCode)!==code) return 0;

    let qty=0;
    for(let i=local.length-1;i>=0;i--){
        if(normalizeItemCode(local[i]?.tx?.itemCode)!==code) break;
        qty+=toNumber(local[i]?.tx?.quantity,0);
    }
    return Math.max(0,qty);
}

function getOperationalCurrentBatchQuantity(itemCode){
    /*
       2C.11.4.0
       Batch Qty is the packs handled by THIS browser/device in the current
       operational batch. It must update immediately and must not depend on
       Supabase/history hydration.
    */
    if(typeof getLocalRuntimeBatchQuantity==="function"){
        return getLocalRuntimeBatchQuantity(itemCode);
    }

    return 0;
}

function refreshLastScanQuantityControl(){

  const button =
      document.getElementById(
          "btnLastScanEdit"
      );

  const thisScanElement =
      document.getElementById(
          "handheldThisScan"
      );

  const totalReceivedElement =
      document.getElementById(
          "handheldTotalReceived"
      );

  if(!button){
      return;
  }

  const item =
      getCurrentLastScanItem();

  const scan =
      AppState.workspace.lastScan;

  if(!item){

      button.textContent = "0";
      if(thisScanElement){ thisScanElement.textContent = "+0"; }
      if(totalReceivedElement){ totalReceivedElement.textContent = "0"; }
      document.getElementById("handheldScanSavedAck")?.setAttribute("hidden","");

      return;
  }

  const totalReceived =
      toNumber(
          item.receivedQty,
          0
      );

  /* 2C.11.1.3 — Handheld primary quantity is the worker's CURRENT LOCAL
     BATCH on this device. Shared totals remain informational below. */
  const localBatchQty=getOperationalCurrentBatchQuantity(item.itemCode);

  button.textContent =
      String(localBatchQty);

  if(totalReceivedElement){
      totalReceivedElement.textContent =
          String(totalReceived);
  }

  if(thisScanElement){
      const localDelta =
          scan && scan.itemCode === item.itemCode
              ? toNumber(scan.quantity,0)
              : 0;

      thisScanElement.textContent =
          (localDelta > 0 ? "+" : "") +
          String(localDelta);
  }

  const savedAck=document.getElementById("handheldScanSavedAck");
  if(savedAck){
      const localDelta=
          scan && normalizeItemCode(scan.itemCode)===normalizeItemCode(item.itemCode)
              ? toNumber(scan.quantity,0)
              : 0;

      if(localDelta>0){
          savedAck.textContent=
              `✓ SCANNED +${localDelta} · ${localDelta===1 ? "PACK" : "PACKS"} SAVED`;
          savedAck.hidden=false;
      }else{
          savedAck.hidden=true;
      }
  }

}


/* =====================================================
 DASHBOARD STAT CARD DRILLDOWN
===================================================== */

function bindDashboardStatDrilldowns(){

  bindStatisticDrilldown(
      UI.elements.statRemaining,
      "remaining"
  );

  bindStatisticDrilldown(
      UI.elements.statOver,
      "over"
  );

}


/* =====================================================
 BIND SINGLE STATISTIC
===================================================== */

function bindStatisticDrilldown(
  valueElement,
  type
){

  if(!valueElement){
      return;
  }

  const card =
      valueElement.closest(
          ".statCard"
      );

  if(!card){
      return;
  }

  card.classList.add(
      "clickableStatCard"
  );

  card.setAttribute(
      "role",
      "button"
  );

  card.setAttribute(
      "tabindex",
      "0"
  );


  card.addEventListener(
      "click",
      function(){

          openStatisticItemsModal(
              type
          );

      }
  );


  card.addEventListener(
      "keydown",
      function(event){

          if(
              event.key === "Enter" ||
              event.key === " "
          ){

              event.preventDefault();

              openStatisticItemsModal(
                  type
              );

          }

      }
  );

}


/* =====================================================
 OPEN STATISTIC CONTENT
===================================================== */

function openStatisticItemsModal(
  type
){

  let items = [];

  let title = "";


  if(type === "remaining"){

      title =
          "Remaining Items";

      items =
          AppState.workspace
              .orderData
              .filter(
                  item=>

                      toNumber(
                          item.remainingQty,
                          0
                      ) > 0
              )
              .sort(
                  (
                      a,
                      b
                  )=>

                      toNumber(
                          b.remainingQty,
                          0
                      )
                      -
                      toNumber(
                          a.remainingQty,
                          0
                      )
              );

  }


  if(type === "over"){

      title =
          "Over Received Items";

      items =
          AppState.workspace
              .orderData
              .filter(
                  item=>

                      item.status ===
                      APP_CONFIG
                          .statuses
                          .over
              )
              .sort(
                  (
                      a,
                      b
                  )=>

                      (
                          toNumber(
                              b.receivedQty,
                              0
                          )
                          -
                          toNumber(
                              b.orderedQty,
                              0
                          )
                      )
                      -
                      (
                          toNumber(
                              a.receivedQty,
                              0
                          )
                          -
                          toNumber(
                              a.orderedQty,
                              0
                          )
                      )
              );

  }


  showStatisticItemsModal(
      title,
      items,
      type
  );

}


/* =====================================================
 CREATE STATISTIC MODAL
===================================================== */

function showStatisticItemsModal(
  title,
  items,
  type
){

  let modal =
      document.getElementById(
          "statItemsModal"
      );


  if(!modal){

      modal =
          document.createElement(
              "div"
          );

      modal.id =
          "statItemsModal";

      modal.className =
          "statItemsModal";

      modal.innerHTML = `

          <div class="statItemsModalCard">

              <div class="statItemsModalHeader">

                  <div>

                      <span>
                          ORDER DETAILS
                      </span>

                      <h2 id="statItemsModalTitle"></h2>

                  </div>

                  <button
                      type="button"
                      id="btnCloseStatItems"
                      class="statItemsClose"
                  >
                      ✕
                  </button>

              </div>

              <div
                  id="statItemsModalSummary"
                  class="statItemsModalSummary"
              ></div>

              <div class="statItemsTableWrap">

                  <table class="dataTable statItemsDataTable">

                      <thead>

                          <tr>

                              <th>Item Number</th>
                              <th>Item Name</th>
                              <th>Ordered</th>
                              <th>Received</th>
                              <th id="statItemsQtyHeading">Remaining</th>
                              <th>Status</th>

                          </tr>

                      </thead>

                      <tbody id="statItemsModalBody"></tbody>

                  </table>

              </div>

          </div>

      `;


      document.body.appendChild(
          modal
      );


      document
          .getElementById(
              "btnCloseStatItems"
          )
          ?.addEventListener(
              "click",
              closeStatisticItemsModal
          );


      modal.addEventListener(
          "click",
          function(event){

              if(event.target === modal){

                  closeStatisticItemsModal();

              }

          }
      );

  }


  setElementText(
      document.getElementById(
          "statItemsModalTitle"
      ),
      title
  );


  const qtyHeading =
      document.getElementById(
          "statItemsQtyHeading"
      );

  if(qtyHeading){

      qtyHeading.textContent =
          type === "over"
          ?
          "Over Qty"
          :
          "Remaining";

  }


  const summary =
      document.getElementById(
          "statItemsModalSummary"
      );


  if(summary){

      let totalQuantity = 0;

      if(type === "over"){

          totalQuantity =
              items.reduce(
                  (sum,item)=>
                      sum + Math.max(
                          0,
                          toNumber(item.receivedQty,0)
                          -
                          toNumber(item.orderedQty,0)
                      ),
                  0
              );

      }
      else{

          totalQuantity =
              items.reduce(
                  (sum,item)=>
                      sum + Math.max(
                          0,
                          toNumber(item.remainingQty,0)
                      ),
                  0
              );

      }

      summary.innerHTML = `

          <div class="statSummaryBlock">
              <strong>${items.length}</strong>
              <span>item(s)</span>
          </div>

          <div class="statSummaryBlock statSummaryQuantity">
              <strong>${totalQuantity}</strong>
              <span>${type === "over" ? "total extra units" : "total remaining units"}</span>
          </div>

      `;

  }


  const tbody =
      document.getElementById(
          "statItemsModalBody"
      );


  if(tbody){

      tbody.innerHTML =
          "";


      if(items.length === 0){

          tbody.innerHTML = `

              <tr>

                  <td
                      colspan="6"
                      class="tableEmptyState"
                  >
                      No items found.
                  </td>

              </tr>

          `;

      }
      else{

          items.forEach(item=>{

              const row =
                  document.createElement(
                      "tr"
                  );

              const ordered =
                  toNumber(
                      item.orderedQty,
                      0
                  );

              const received =
                  toNumber(
                      item.receivedQty,
                      0
                  );

              const overQty =
                  Math.max(
                      0,
                      received - ordered
                  );

              const quantityCell =
                  type === "over"
                  ?
                  `<strong class="overQtyBadge">+${overQty}</strong>`
                  :
                  String(
                      toNumber(
                          item.remainingQty,
                          0
                      )
                  );


              if(type === "over"){

                  row.classList.add(
                      "rowOver"
                  );

              }


              row.innerHTML = `

                  <td>${escapeHTML(item.itemCode)}</td>

                  <td>${escapeHTML(item.itemName)}</td>

                  <td>${ordered}</td>

                  <td>${received}</td>

                  <td>${quantityCell}</td>

                  <td>
                      ${renderStatusBadge(item.status)}
                  </td>

              `;


              tbody.appendChild(
                  row
              );

          });

      }

  }


  modal.classList.add(
      "open"
  );

}


/* =====================================================
 CLOSE STATISTIC MODAL
===================================================== */

function closeStatisticItemsModal(){

  document
      .getElementById(
          "statItemsModal"
      )
      ?.classList
      .remove(
          "open"
      );

  focusScannerInput();

}



/* =====================================================
   DASHBOARD ORDER STATUS REPORT
===================================================== */

function createOrderStatusReportButton(){

    if(
        document.getElementById(
            "btnOrderStatusReport"
        )
    ){
        return;
    }

    const searchButton =
        document.getElementById(
            "btnQuickSearch"
        );

    if(!searchButton){
        return;
    }

    const button =
        document.createElement(
            "button"
        );

    button.type =
        "button";

    button.id =
        "btnOrderStatusReport";

    button.className =
        (
            searchButton.className ||
            ""
        )
        +
        " orderStatusReportButton";

    button.innerHTML =
        "📋 Receiving Report";

    button.addEventListener(
        "click",
        function(){

            openOrderStatusReport(
                "all"
            );

        }
    );

    searchButton.insertAdjacentElement(
        "afterend",
        button
    );

}


function getOrderStatusReportRows(filter = "all"){

    const rows =
        AppState.workspace
            .orderData
            .map(item=>{

                const ordered =
                    toNumber(
                        item.orderedQty,
                        0
                    );

                const received =
                    toNumber(
                        item.receivedQty,
                        0
                    );

                const difference =
                    received - ordered;

                let reportStatus =
                    "complete";

                if(item.manual===true || ordered===0){
                    reportStatus = received>0 ? "unordered" : "complete";
                }
                else if(received===0 && ordered>0){
                    reportStatus = "not_received";
                }
                else if(difference < 0){
                    reportStatus = "shortage";
                }
                else if(difference > 0){
                    reportStatus = "over";
                }

                return {
                    item:item,
                    ordered:ordered,
                    received:received,
                    difference:difference,
                    reportStatus:reportStatus
                };

            });

    if(filter === "shortage"){

        return rows
            .filter(
                row=>
                    row.difference < 0
            )
            .sort(
                (a,b)=>
                    a.difference -
                    b.difference
            );

    }

    if(filter === "over"){

        return rows
            .filter(
                row=>
                    row.difference > 0
            )
            .sort(
                (a,b)=>
                    b.difference -
                    a.difference
            );

    }

    if(filter === "complete"){

        return rows
            .filter(
                row=>
                    row.difference === 0
            );

    }

    return rows;

}


function openOrderStatusReport(
    filter = "all"
){

    let modal =
        document.getElementById(
            "orderStatusReportModal"
        );

    if(!modal){

        modal =
            document.createElement(
                "div"
            );

        modal.id =
            "orderStatusReportModal";

        modal.className =
            "orderStatusReportModal";

        modal.innerHTML = `

            <div class="orderStatusReportCard">

                <div class="orderStatusReportHeader">

                    <div>
                        <span>LIVE ORDER REPORT</span>
                        <h2>Receiving Report</h2>
                        <p>
                            Live snapshot of the current receiving progress. Available before Finalize.
                        </p>
                    </div>

                    <button
                        id="btnCloseOrderStatusReport"
                        type="button"
                        class="statItemsClose"
                    >
                        ✕
                    </button>

                </div>

                <div class="orderStatusReportToolbar">

                    <div class="orderStatusFilters">

                        <button
                            type="button"
                            data-report-filter="all"
                        >
                            All
                        </button>

                        <button
                            type="button"
                            data-report-filter="shortage"
                        >
                            Shortage
                        </button>

                        <button
                            type="button"
                            data-report-filter="over"
                        >
                            Over
                        </button>

                        <button
                            type="button"
                            data-report-filter="complete"
                        >
                            Complete
                        </button>

                    </div>

                    <div
                        id="orderStatusReportSummary"
                        class="orderStatusReportSummary"
                    ></div>

                    <div class="liveReceivingReportActions">
                        <button id="btnPrintLiveReceivingReport" type="button" class="secondaryButton">
                            Print / Save PDF
                        </button>

                        <button id="btnEmailLiveReceivingDifferences" type="button" class="primaryButton">
                            Email Differences
                        </button>
                    </div>

                </div>

                <div class="orderStatusReportTableWrap">

                    <table class="dataTable orderStatusReportTable">

                        <thead>
                            <tr>
                                <th>Item Number</th>
                                <th>Item Name</th>
                                <th>Ordered</th>
                                <th>Received</th>
                                <th>Difference</th>
                                <th>Status</th>
                            </tr>
                        </thead>

                        <tbody id="orderStatusReportBody"></tbody>

                    </table>

                </div>

            </div>

        `;

        document.body.appendChild(
            modal
        );

        document
            .getElementById(
                "btnCloseOrderStatusReport"
            )
            ?.addEventListener(
                "click",
                closeOrderStatusReport
            );

        modal.addEventListener(
            "click",
            function(event){

                if(event.target === modal){
                    closeOrderStatusReport();
                }

            }
        );

        modal
            .querySelectorAll(
                "[data-report-filter]"
            )
            .forEach(button=>{

                button.addEventListener(
                    "click",
                    function(){

                        renderOrderStatusReport(
                            this.dataset.reportFilter
                        );

                    }
                );

            });


        document.getElementById("btnPrintLiveReceivingReport")
            ?.addEventListener("click",()=>{
                if(typeof buildLiveReceivingReport==="function" && typeof printLiveReceivingReport==="function"){
                    printLiveReceivingReport(buildLiveReceivingReport());
                }
            });

        document.getElementById("btnEmailLiveReceivingDifferences")
            ?.addEventListener("click",()=>{
                if(
                    typeof buildLiveReceivingReport!=="function" ||
                    typeof buildReceivingEmailDifferencesReport!=="function" ||
                    typeof openFinalizedDiscrepancyEmailPreview!=="function"
                ){
                    showToast?.("Email report is unavailable","error");
                    return;
                }

                const live=buildLiveReceivingReport();
                const emailReport=buildReceivingEmailDifferencesReport(live);

                if(!emailReport.rows.length){
                    showToast?.("All items are Completed. There are no differences to email.","success");
                    return;
                }

                openFinalizedDiscrepancyEmailPreview(
                    emailReport,
                    {
                        fromArchive:false,
                        liveReport:true
                    }
                );
            });

    }

    modal.classList.add(
        "open"
    );

    renderOrderStatusReport(
        filter
    );

}


function renderOrderStatusReport(
    filter = "all"
){

    const modal =
        document.getElementById(
            "orderStatusReportModal"
        );

    if(!modal){
        return;
    }

    modal.dataset.activeFilter =
        filter;

    modal
        .querySelectorAll(
            "[data-report-filter]"
        )
        .forEach(button=>{

            button.classList.toggle(
                "active",
                button.dataset.reportFilter ===
                    filter
            );

        });

    const allRows =
        getOrderStatusReportRows(
            "all"
        );

    const rows =
        getOrderStatusReportRows(
            filter
        );

    const shortageItems =
        allRows.filter(
            row=>
                row.difference < 0
        );

    const overItems =
        allRows.filter(
            row=>
                row.difference > 0
        );

    const totalShortage =
        shortageItems.reduce(
            (sum,row)=>
                sum + Math.abs(
                    row.difference
                ),
            0
        );

    const totalOver =
        overItems.reduce(
            (sum,row)=>
                sum + row.difference,
            0
        );

    const summary =
        document.getElementById(
            "orderStatusReportSummary"
        );

    if(summary){

        summary.innerHTML = `

            <div>
                <strong>${shortageItems.length}</strong>
                <span>Shortage Items</span>
            </div>

            <div class="shortageValue">
                <strong>-${totalShortage}</strong>
                <span>Shortage Units</span>
            </div>

            <div>
                <strong>${overItems.length}</strong>
                <span>Over Items</span>
            </div>

            <div class="overValue">
                <strong>+${totalOver}</strong>
                <span>Extra Units</span>
            </div>

        `;

    }

    const tbody =
        document.getElementById(
            "orderStatusReportBody"
        );

    if(!tbody){
        return;
    }

    tbody.innerHTML =
        "";

    if(rows.length === 0){

        tbody.innerHTML = `

            <tr>
                <td
                    colspan="6"
                    class="tableEmptyState"
                >
                    No items found for this filter.
                </td>
            </tr>

        `;

        return;

    }

    rows.forEach(rowData=>{

        const tr =
            document.createElement(
                "tr"
            );

        if(rowData.reportStatus === "over"){
            tr.classList.add("rowOver");
        }
        else if(["shortage","not_received"].includes(rowData.reportStatus)){
            tr.classList.add("orderStatusShortageRow");
        }
        else if(rowData.reportStatus === "unordered"){
            tr.classList.add("orderStatusUnorderedRow");
        }
        else{
            tr.classList.add("rowCompleted");
        }

        let differenceHTML =
            '<strong class="differenceComplete">0</strong>';

        let statusHTML =
            '<span class="statusBadge statusCompleted">Complete</span>';

        if(rowData.reportStatus==="not_received"){
            differenceHTML=`<span class="differenceShortage">${rowData.difference}</span>`;
            statusHTML=`<span class="statusBadge statusShortage">Not Received</span>`;
        }
        else if(rowData.reportStatus==="shortage"){
            differenceHTML=`<span class="differenceShortage">${rowData.difference}</span>`;
            statusHTML=`<span class="statusBadge statusShortage">Shortage ${Math.abs(rowData.difference)}</span>`;
        }
        else if(rowData.reportStatus==="over"){
            differenceHTML=`<span class="differenceOver">+${rowData.difference}</span>`;
            statusHTML=`<span class="statusBadge statusOver">Over +${rowData.difference}</span>`;
        }
        else if(rowData.reportStatus==="unordered"){
            differenceHTML=`<span class="differenceOver">+${rowData.received}</span>`;
            statusHTML=`<span class="statusBadge statusUnordered">Unordered</span>`;
        }

        tr.innerHTML = `

            <td>${escapeHTML(rowData.item.itemCode)}</td>

            <td>${escapeHTML(rowData.item.itemName)}</td>

            <td>${rowData.ordered}</td>

            <td>${rowData.received}</td>

            <td>${differenceHTML}</td>

            <td>${statusHTML}</td>

        `;

        tbody.appendChild(
            tr
        );

    });

}



function openOrderStatusReportFromSnapshot(report){
    if(!report || !Array.isArray(report.rows)){
        showToast?.("Saved report is unavailable","warning");
        return false;
    }

    document.getElementById("archivedReceivingReportOverlay")?.remove();

    const esc=v=>typeof escapeHTML==="function"
        ? escapeHTML(String(v??""))
        : String(v??"");

    const orders=Array.isArray(report.orders)?report.orders:[];
    const orderLabel=orders.map(o=>o.orderNumber).filter(Boolean).join(" + ") || report.orderId || "-";
    const orderDate=orders.map(o=>o.orderDate).filter(Boolean)[0] || "-";

    const overlay=document.createElement("div");
    overlay.id="archivedReceivingReportOverlay";
    overlay.className="orderStatusReportModal open";

    overlay.innerHTML=`
      <div class="orderStatusReportCard archivedReceivingReportCard">
        <div class="orderStatusReportHeader">
          <div>
            <span>SAVED RECEIVING REPORT</span>
            <h2>Receiving Report</h2>
            <p>${esc(orderLabel)} · ${esc(orderDate)} · Finalized snapshot</p>
          </div>
          <button type="button" class="statItemsClose" data-close>✕</button>
        </div>

        <div class="archivedReportSummary">
          <div><span>Total Items</span><strong>${report.counts?.total||report.rows.length}</strong></div>
          <div><span>Completed</span><strong>${report.counts?.COMPLETED||0}</strong></div>
          <div><span>Requires Review</span><strong>${report.counts?.requiresReview||0}</strong></div>
          <div><span>Generated</span><strong>${esc(report.generatedAt ? new Date(report.generatedAt).toLocaleString() : "-")}</strong></div>
        </div>

        <div class="liveReceivingReportActions archiveLiveReportActions">
          <button type="button" class="secondaryButton" id="btnPrintArchivedReceivingReport">Print / Save PDF</button>
          <button type="button" class="primaryButton" id="btnEmailArchivedDifferences">Email Differences</button>
        </div>

        <div class="orderStatusReportTableWrap">
          <table class="dataTable orderStatusReportTable">
            <thead><tr>
              <th>Item Number</th><th>Item Name</th><th>Ordered</th>
              <th>Received</th><th>Difference</th><th>Status</th>
            </tr></thead>
            <tbody>
              ${report.rows.map(row=>{
                  const diff=Number(row["Difference"]||0);
                  return `<tr>
                    <td>${esc(row["Item Number"])}</td>
                    <td>${esc(row["Item Name"])}</td>
                    <td>${row["Ordered Qty"]}</td>
                    <td>${row["Received Qty"]}</td>
                    <td>${diff>0?"+":""}${diff}</td>
                    <td><span class="statusBadge">${esc(row.Status)}</span></td>
                  </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    overlay.querySelectorAll("[data-close]").forEach(button=>{
        button.onclick=()=>overlay.remove();
    });

    document.getElementById("btnPrintArchivedReceivingReport")?.addEventListener("click",()=>{
        printLiveReceivingReport?.(report);
    });

    document.getElementById("btnEmailArchivedDifferences")?.addEventListener("click",()=>{
        const emailReport=buildReceivingEmailDifferencesReport?.(report);
        if(!emailReport?.rows?.length){
            showToast?.("All items are Completed. There are no differences to email.","success");
            return;
        }
        openFinalizedDiscrepancyEmailPreview?.(
            emailReport,
            {fromArchive:true}
        );
    });

    return true;
}

window.openOrderStatusReportFromSnapshot=openOrderStatusReportFromSnapshot;


function refreshOpenOrderStatusReport(){

    const modal =
        document.getElementById(
            "orderStatusReportModal"
        );

    if(
        !modal ||
        !modal.classList.contains(
            "open"
        )
    ){
        return;
    }

    renderOrderStatusReport(
        modal.dataset.activeFilter ||
        "all"
    );

}


function closeOrderStatusReport(){

    document
        .getElementById(
            "orderStatusReportModal"
        )
        ?.classList
        .remove(
            "open"
        );

    focusScannerInput();

}


/* =====================================================
   ZEBRA TWO-MODE EXPERIENCE
   - Live Receiving linked to PC cloud session
   - Expiry Capture (workflow implemented in its dedicated phase)
===================================================== */

function isLikelyZebraDevice(){
    const ua = String(navigator.userAgent || "").toLowerCase();

    const enterpriseHandheld =
        /zebra|symbol|enterprise browser|tc[0-9]{2,}|mc[0-9]{2,}/i.test(ua);

    let explicitHandheld = false;
    let persistedHandheld = false;

    try{
        const params = new URLSearchParams(window.location.search || "");
        explicitHandheld =
            params.get("handheld") === "1" ||
            localStorage.getItem("PHARMFLOW_HANDHELD_TEST_MODE") === "1";

        persistedHandheld =
            localStorage.getItem("PHARMFLOW_HANDHELD_DEVICE") === "1";
    }catch(_){}

    /*
       Chrome on some Zebra builds reports a generic Android user-agent.
       PharmFlow therefore also recognizes the narrow Android enterprise
       form factor, then remembers this browser as a Handheld.
    */
    const android = /android/i.test(ua);
    const shortestScreenSide = Math.min(
        Number(window.screen?.width || window.innerWidth || 9999),
        Number(window.screen?.height || window.innerHeight || 9999)
    );
    const handheldFormFactor =
        android &&
        shortestScreenSide <= 600 &&
        Number(navigator.maxTouchPoints || 0) > 0;

    const detected =
        enterpriseHandheld ||
        explicitHandheld ||
        persistedHandheld ||
        handheldFormFactor;

    if(detected){
        try{
            localStorage.setItem("PHARMFLOW_HANDHELD_DEVICE","1");
        }catch(_){}
    }

    return detected;
}

function backupLegacyZebraWorkspace(reason){
    try{
        const hasOrder = Array.isArray(AppState?.workspace?.orderData) && AppState.workspace.orderData.length > 0;
        const hasHistory = Array.isArray(AppState?.workspace?.receivingHistory) && AppState.workspace.receivingHistory.length > 0;
        if(!hasOrder && !hasHistory){ return null; }
        const key = "PRS_V3_ZEBRA_RECOVERY_" + Date.now();
        localStorage.setItem(key, JSON.stringify({
            reason: reason || "legacy-zebra-cleanup",
            savedAt: nowISO(),
            snapshot: typeof serializeCurrentWorkspace === "function" ? serializeCurrentWorkspace() : null
        }));
        return key;
    }catch(error){
        Logger.warn("Unable to create Handheld recovery backup", error);
        return null;
    }
}

function resetZebraWorkingState(reason, options = {}){
    const pending = Array.isArray(AppState?.session?.pendingQueue) ? AppState.session.pendingQueue.length : 0;
    if(pending > 0 && options.force !== true){
        Logger.warn("Handheld cleanup postponed because unsynced transactions remain", pending);
        return false;
    }

    backupLegacyZebraWorkspace(reason);
    if(typeof stopCloudPolling === "function"){ stopCloudPolling(); }
    if(typeof clearCurrentWorkspace === "function"){ clearCurrentWorkspace(); }
    /* Zebra idle state must have NO order at all. startNewWorkspace() creates
       a fresh order id, so it is intentionally not used here. */
    AppState.workspace = typeof createEmptyWorkspace === "function"
        ? createEmptyWorkspace()
        : {orderId:null,orderName:"",active:false,orderFiles:[],mappingFiles:[],orderData:[],mappingData:[],receivingHistory:[],lastScan:null};
    if(typeof resetStatistics === "function"){ resetStatistics(); }
    if(typeof rebuildStateIndexes === "function"){ rebuildStateIndexes(); }
    if(typeof deleteWorkspaceSnapshot === "function"){ deleteWorkspaceSnapshot(); }

    AppState.session = {
        ...createEmptySession(),
        id:createSessionId(),
        deviceId:ensureDeviceId(),
        role:"ZEBRA_IDLE",
        cloud:false,
        createdAt:nowISO(),
        pendingQueue:[]
    };

    if(typeof saveWorkspaceSnapshot === "function"){ saveWorkspaceSnapshot(); }
    AppEvents.emit("session:updated");
    /* Handheld detach/idle cleanup is device-local. It must never masquerade
       as a pharmacy-wide Current Workspace reset. */
    AppEvents.emit("receiving:updated",{source:"handheld-local-reset"});
    return true;
}

function initializeZebraInterface(){
    if(!isLikelyZebraDevice()){
        document.body.classList.remove(
            "zebraDevice",
            "zebraHomeActive",
            "zebraJoinActive",
            "zebraReceivingActive",
            "zebraExpiryActive",
            "zebraMode"
        );
        return;
    }

    document.body.classList.add("zebraDevice");

    /* Keep the Zebra hardware scanner focused without summoning the Android
       soft keyboard. Manual search inputs remain normal text inputs. */
    const barcodeInput = document.getElementById("barcodeInput");
    if(barcodeInput){
        barcodeInput.setAttribute("inputmode","none");
        barcodeInput.setAttribute("autocomplete","off");
    }

    /* =========================================================
       PHASE 2C.11.0 — UNIFIED PHARMACY WORKSPACE
       The Handheld is now a first-class client of the authenticated pharmacy
       workspace. It MUST NOT clear a valid Active Order merely because there is
       no legacy Create/Join cloud session. Active Order Manifest + receiving
       ledger are the same server authorities already used by PC2/PC3.
       ========================================================= */
    AppState.session = {
        ...createEmptySession(),
        id:null,
        secret:null,
        deviceId:ensureDeviceId(),
        role:"HANDHELD_WORKSPACE",
        cloud:false,
        createdAt:nowISO(),
        pendingQueue:[]
    };
    AppEvents.emit("session:updated",{source:"unified-pharmacy-workspace"});

    if(!document.getElementById("zebraHome")){
        const home = document.createElement("section");
        home.id = "zebraHome";
        home.className = "zebraHome";
        home.innerHTML = `
            <div class="zebraBrandRow">
                <div class="zebraBrandLockup">
                    <span class="zebraBrandMark"><img src="assets/pharmflow-mark.svg" alt="" aria-hidden="true"></span>
                    <div><strong>PharmFlow</strong><span>Handheld Workspace</span></div>
                </div>
            </div>
            <div class="zebraModeIntro">
                <span>WORK MODE</span>
                <h1>Choose your workspace</h1>
                <p>Fast access to the tools needed for the current task.</p>
            </div>
            <div class="zebraModeCards">
                <button id="btnZebraReceivingMode" class="zebraModeCard zebraModeReceiving" type="button">
                    <span class="zebraModeIcon" aria-hidden="true">▥</span>
                    <div><strong>Receiving</strong><small>Scan and count active orders.</small></div>
                    <span class="zebraModeArrow" aria-hidden="true">›</span>
                </button>
                <button class="zebraModeCard zebraModeExpiry" type="button" disabled aria-disabled="true" title="Coming soon">
                    <span class="zebraModeIcon" aria-hidden="true">◷</span>
                    <div><strong>Near Expiry</strong><small>COMING SOON</small></div>
                    <span class="zebraModeArrow" aria-hidden="true">›</span>
                </button>
            </div>
            <button id="btnZebraSignOut" class="zebraSignOut" type="button">Sign Out</button>
        `;
        document.querySelector(".mainContent")?.prepend(home);

        document.getElementById("btnZebraReceivingMode")?.addEventListener("click", async function(){
            await openUnifiedHandheldReceiving();
        });
        document.getElementById("btnZebraSignOut")?.addEventListener("click", function(){
            const pending = Array.isArray(AppState?.session?.pendingQueue) ? AppState.session.pendingQueue.length : 0;
            if(pending > 0){
                showToast("Sync pending Handheld work before signing out","warning");
                return;
            }
            /* Unified Workspace has no user-created Handheld session to detach. */
            document.getElementById("btnLogout")?.click();
        });
    }


    if(!document.getElementById("zebraJoinHeader")){
        const hero = document.querySelector("#page-sessions .cloudSessionHero");
        if(hero){
            const joinHeader = document.createElement("div");
            joinHeader.id = "zebraJoinHeader";
            joinHeader.className = "zebraJoinHeader";
            joinHeader.innerHTML = `
                <button id="btnZebraJoinBack" type="button">‹ Modes</button>
                <div><span>RECEIVING</span><strong>Join PC Session</strong></div>
            `;
            hero.prepend(joinHeader);
            document.getElementById("btnZebraJoinBack")?.addEventListener("click", setZebraHomeMode);
        }
    }

    if(!document.getElementById("zebraQuickHeader")){
        const page = document.getElementById("page-dashboard");
        if(page){
            const header = document.createElement("section");
            header.id = "zebraQuickHeader";
            header.className = "zebraQuickHeader";
            header.innerHTML = `
                <div class="zebraQuickHeaderMain">
                    <div>
                        <span class="zebraModeEyebrow">LIVE RECEIVING</span>
                        <strong id="zebraQuickOrder">No active order</strong>
                    </div>
                    <button id="btnZebraModes" class="zebraModesButton" type="button">Modes</button>
                </div>
            `;
            page.insertBefore(header,page.firstChild);
            document.getElementById("btnZebraModes")?.addEventListener("click", setZebraHomeMode);
        }
    }

    /* Near Expiry is now a permanent appPage in index.html.
       PC and Zebra share the exact same capture markup and data logic. */

    /* Unified Workspace starts at Modes. Receiving pulls the authoritative
       Active Order Manifest directly; no Join Code / QR / session validation. */
    setZebraHomeMode();
    setTimeout(()=>refreshUnifiedHandheldWorkspace({silent:true}),120);
}

/* ============================================================
   B11 — HANDHELD WORKER PERMISSION BOUNDARY
   Handheld workers receive operational scan/history controls only.
   Desktop administrative controls are disabled at the DOM boundary,
   not merely covered by visual CSS.
============================================================ */
function setHandheldWorkerSurface(active){
    if(!isLikelyZebraDevice()) return;

    const selectors=[
        "#page-dashboard .scanPanelFooter.pfnActionBar",
        "#pfnManageOrders",
        "#btnReceivingNeedsReview",
        "#btnAdjustReceiving",
        "#btnReceivingReportAction",
        ".pfnOrderControlGroup",
        ".pfnSessionStatus"
    ];

    selectors.forEach(selector=>{
        document.querySelectorAll(selector).forEach(el=>{
            if(active){
                el.dataset.handheldWorkerHidden="1";
                el.hidden=true;
                el.setAttribute("aria-hidden","true");
                try{ el.inert=true; }catch(_){}
            }else if(el.dataset.handheldWorkerHidden==="1"){
                el.hidden=false;
                el.removeAttribute("aria-hidden");
                try{ el.inert=false; }catch(_){}
                delete el.dataset.handheldWorkerHidden;
            }
        });
    });
}
window.setHandheldWorkerSurface=setHandheldWorkerSurface;

function clearZebraModeClasses(){
    document.body.classList.remove("zebraHomeActive","zebraJoinActive","zebraReceivingActive","zebraExpiryActive","zebraMode");
}
function setZebraHomeMode(){
    if(!isLikelyZebraDevice()){ return; }
    setHandheldWorkerSurface(false);

    /*
       Strict mode isolation:
       before showing Home, deactivate every app page and every operational
       Zebra surface so no previous Receiving / Join / Expiry markup can remain
       visible underneath Mode Selection.
    */
    clearZebraModeClasses();

    document.querySelectorAll(".appPage").forEach(page=>{
        page.classList.remove("active");
    });

    [
        "zebraExpiryShell",
        "zebraJoinPanel",
        "page-dashboard",
        "page-receiving",
        "page-files",
        "page-reports",
        "page-sessions",
        "page-archive",
        "page-returnsArchive",
        "page-settings"
    ].forEach(id=>{
        const el = document.getElementById(id);
        if(el){
            el.classList.remove("active");
        }
    });

    document.body.classList.add("zebraDevice","zebraHomeActive");

    try{ document.activeElement?.blur?.(); }catch(_){}

    [
        "authEmail",
        "authPassword",
        "barcodeInput",
        "cloudSessionCodeInput",
        "expiryBarcodeInput",
        "searchInput",
        "smartScanSearchInput"
    ].forEach(id=>{
        const el = document.getElementById(id);
        if(el && typeof el.blur === "function"){
            try{ el.blur(); }catch(_){}
        }
    });

    try{
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        window.scrollTo(0,0);
    }catch(_){}
}
function setZebraJoinMode(){
    if(!isLikelyZebraDevice()){ return; }

    clearZebraModeClasses();
    document.body.classList.add("zebraDevice","zebraJoinActive");

    document.querySelectorAll(".appPage").forEach(page=>{
        page.classList.remove("active");
    });

    document.getElementById("zebraExpiryShell")?.classList.remove("active");
    document.getElementById("page-dashboard")?.classList.remove("active");

    try{ document.activeElement?.blur?.(); }catch(_){}
    try{
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        window.scrollTo(0,0);
    }catch(_){}

    const code = document.getElementById("cloudSessionCodeInput");
    if(code){
        code.setAttribute("inputmode","numeric");
        code.setAttribute("autocomplete","off");
    }
}
async function refreshUnifiedHandheldWorkspace(options={}){
    if(!isLikelyZebraDevice()) return false;
    if(typeof AuthState==="undefined" || !AuthState?.context?.pharmacy_id) return false;
    if(typeof pullActiveOrderManifest!=="function") return false;

    /* Background reconciliation must never replace the worker surface. The
       shared cloud scheduler already owns normal syncing; this indicator is
       reserved for the initial route entry before the scan panel is shown. */
    const blocking=options?.blocking===true;
    if(blocking){
        document.body.dataset.hhWorkspaceLoading="1";
        window.hhRefreshReadyState?.();
    }
    try{
        await pullActiveOrderManifest({clearIfMissing:true});
        if(typeof pullCloudWorkspaceTransactions==="function"){
            await pullCloudWorkspaceTransactions();
        }
        rebuildStateIndexes?.();
        recalculateStatistics?.();
        refreshZebraInterface();
        window.hhRefreshReadyState?.();

        /* Manifest refresh may legitimately report "unchanged". Readiness is
           determined from the authoritative hydrated workspace, not from the
           transport return flag. This prevents the false "No Active Order"
           warning while Active Orders are already present. */
        return !!(
            Array.isArray(AppState?.workspace?.orderFiles) &&
            AppState.workspace.orderFiles.length>0 &&
            Array.isArray(AppState?.workspace?.orderData) &&
            AppState.workspace.orderData.length>0
        );
    }catch(error){
        Logger?.warn?.("Unified Handheld workspace refresh failed",error);
        if(options?.silent!==true){
            showToast(error?.message||"Unable to load pharmacy Active Orders","error");
        }
        return false;
    }finally{
        if(blocking) delete document.body.dataset.hhWorkspaceLoading;
        window.hhRefreshReadyState?.();
        refreshHandheldWorkspaceStatus?.();
    }
}

async function openUnifiedHandheldReceiving(){
    if(!isLikelyZebraDevice()) return false;

    clearZebraModeClasses();
    document.body.classList.add("zebraDevice","zebraReceivingActive","zebraMode");
    try{ window.scrollTo(0,0); }catch(_){ }

    window.hhRefreshReadyState?.();
    const ready=await refreshUnifiedHandheldWorkspace({silent:true,blocking:true});

    setZebraReceivingMode();

    if(!ready){
        showToast("No Active Order is available for this pharmacy yet","warning");
    }
    return ready;
}

window.refreshUnifiedHandheldWorkspace=refreshUnifiedHandheldWorkspace;
window.openUnifiedHandheldReceiving=openUnifiedHandheldReceiving;

function setZebraReceivingMode(){
    if(!isLikelyZebraDevice()){ return; }
    clearZebraModeClasses();
    setHandheldWorkerSurface(true);
    document.body.classList.add("zebraDevice","zebraReceivingActive","zebraMode");
    try{ window.scrollTo(0,0); }catch(_){}
    refreshZebraInterface();
    if(typeof ensureHandheldReceivingTools === "function"){
        ensureHandheldReceivingTools();
    }
    setTimeout(()=>focusScannerInput(),80);
}
function setZebraExpiryMode(){
    if(!isLikelyZebraDevice()){ return; }

    setHandheldWorkerSurface(false);
    clearZebraModeClasses();
    document.body.classList.add("zebraDevice","zebraExpiryActive");

    document.querySelectorAll(".appPage").forEach(page=>{
        page.classList.remove("active");
    });

    document.getElementById("zebraJoinPanel")?.classList.remove("active");
    document.getElementById("page-dashboard")?.classList.remove("active");
    document.getElementById("page-receiving")?.classList.remove("active");

    const expiryPage = document.getElementById("zebraExpiryShell");
    expiryPage?.classList.add("active");

    try{ document.activeElement?.blur?.(); }catch(_){}
    try{
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        window.scrollTo(0,0);
    }catch(_){}

    if(typeof activateExpiryCapture === "function"){
        setTimeout(()=>activateExpiryCapture(),40);
    }
}


function getFriendlyReceivingDeviceLabel(row,options={}){
    const ownDeviceId=toSafeString(
        options.ownDeviceId ||
        (typeof ensureDeviceId==="function" ? ensureDeviceId() : AppState?.session?.deviceId) ||
        ""
    );

    const rowDeviceId=toSafeString(row?.deviceId||"");
    const type=toSafeString(row?.deviceType||"").toUpperCase();

    if(type==="HANDHELD"){
        return "Handheld";
    }

    if(type==="PC"){
        return rowDeviceId && rowDeviceId===ownDeviceId
            ? "This PC"
            : "PC";
    }

    /* Legacy transactions may predate deviceType. Never expose UUIDs.
       We can still identify the current browser safely. */
    if(rowDeviceId && rowDeviceId===ownDeviceId){
        try{
            return typeof isLikelyZebraDevice==="function" && isLikelyZebraDevice()
                ? "Handheld"
                : "This PC";
        }catch(_){
            return "This Device";
        }
    }

    return "Other Device";
}


function getHandheldDeviceScannerRows(){
    const history = Array.isArray(AppState?.workspace?.receivingHistory)
        ? AppState.workspace.receivingHistory
        : [];
    const deviceId = typeof ensureDeviceId === "function"
        ? ensureDeviceId()
        : AppState?.session?.deviceId;

    return history.filter(tx => {
        const sameDevice = !deviceId || String(tx?.deviceId || "") === String(deviceId || "");
        const source = String(tx?.source || "").toUpperCase();
        const isScan = source === String(APP_CONFIG?.transactionSources?.scanner || "SCANNER").toUpperCase()
            || source.includes("SCAN");
        return sameDevice && isScan && Number(tx?.quantity || 0) > 0;
    });
}

function getAllWorkspaceScannerRows(){
    const history=Array.isArray(AppState?.workspace?.receivingHistory)
        ? AppState.workspace.receivingHistory
        : [];

    return history.filter(tx=>{
        const source=String(tx?.source||"").toUpperCase();
        const isScan=source===String(APP_CONFIG?.transactionSources?.scanner||"SCANNER").toUpperCase()
            || source.includes("SCAN");
        return isScan && Number(tx?.quantity||0)>0;
    });
}

function getHandheldTotalScans(){
    return getHandheldDeviceScannerRows().length;
}


function refreshHandheldWorkspaceStatus(){
    if(!isLikelyZebraDevice()) return;
    const state=document.getElementById("handheldWorkspaceStatus");
    if(!state) return;
    const activeOrders=typeof getActiveReceivingOrderNumbers==="function"
        ? getActiveReceivingOrderNumbers()
        : [];
    const selectedOrders=typeof getSelectedReceivingOrderNumbers==="function"
        ? getSelectedReceivingOrderNumbers()
        : activeOrders;
    const authenticated=!!AuthState?.context?.pharmacy_id;
    const loading=document.body.dataset.hhWorkspaceLoading==="1";
    const online=navigator.onLine!==false;

    const assignedButton=document.getElementById("btnHandheldAssignedOrders");
    const setStatus=connection=>{
        state.replaceChildren();
        const connectionEl=document.createElement("span");
        connectionEl.className="handheldConnectionState";
        connectionEl.textContent=connection;
        state.appendChild(connectionEl);
    };
    const setAssignedOrders=()=>{
        if(!assignedButton) return;
        const count=selectedOrders.length;
        assignedButton.disabled=count===0;
        assignedButton.textContent=count===1 ? "1 ORDER" : `${count} ORDERS`;
        assignedButton.title=count
            ? "View orders assigned from the computer"
            : "No orders assigned from the computer";
    };
    state.classList.remove("isSyncing","isOffline","isEmpty");
    if(loading){
        setStatus("RECONNECTING");
        state.classList.add("isSyncing");
    }else if(!online){
        setStatus("OFFLINE");
        state.classList.add("isOffline");
    }else if(!authenticated){
        setStatus("NOT CONNECTED");
        state.classList.add("isOffline");
    }else if(activeOrders.length>0){
        setStatus("ONLINE");
    }else{
        setStatus("ONLINE");
        state.classList.add("isEmpty");
    }
    setAssignedOrders();
}
window.refreshHandheldWorkspaceStatus=refreshHandheldWorkspaceStatus;

function ensureHandheldReceivingTools(){
    if(!isLikelyZebraDevice()) return;

    const page = document.getElementById("page-dashboard");
    if(!page) return;

    let header = document.getElementById("zebraQuickHeader");

    if(!header){
        header=document.createElement("section");
        header.id="zebraQuickHeader";
        header.className="zebraQuickHeader";
        page.insertBefore(header,page.firstChild);
    }

    let finalHeader=header.querySelector(".zebraFinalHeader");
    if(!finalHeader){
        header.innerHTML=`
            <div class="zebraFinalHeader">
                <div class="zebraControlGrid">
                    <div id="handheldWorkspaceStatus" class="zebraConnectedDot handheldTopControl" aria-live="polite">SYNCING…</div>
                    <button id="btnHandheldAssignedOrders" class="handheldAssignedOrdersButton handheldTopControl" type="button" aria-label="View assigned orders">0 ORDERS</button>
                    <button id="btnZebraModes" class="zebraModesButton handheldTopControl" type="button">MODE</button>
                    <button id="btnHandheldTotalScans" class="handheldTotalScansButton handheldRecentButton handheldTopControl" type="button" aria-label="Open recent scans"><span>HISTORY</span><strong id="handheldTotalScansValue">0</strong></button>
                    <button id="btnHandheldNeedsReview" class="handheldNeedsReviewButton handheldTopControl" type="button" aria-label="Open Needs Review">REVIEW</button>
                </div>
            </div>
        `;
        finalHeader=header.querySelector(".zebraFinalHeader");
    }else{
        refreshHandheldWorkspaceStatus();
    }

    document.getElementById("btnZebraModes").onclick=setZebraHomeMode;
    document.getElementById("btnHandheldTotalScans").onclick=openHandheldScansPanel;
    document.getElementById("btnHandheldAssignedOrders").onclick=openHandheldAssignedOrdersPanel;
    document.getElementById("btnHandheldNeedsReview").onclick=()=>openNeedsReviewPanel("RECEIVING");

    /* Assignment is read-only here and is managed on the computer, so staff
       cannot broaden their own scope. Needs Review is an exception workflow:
       it always retains the case's original Order rather than changing scope. */
    document.getElementById("btnHandheldMonitoring")?.remove();
    refreshHandheldWorkspaceStatus();
    refreshHandheldReceivingTools();
}

function refreshHandheldReceivingTools(){
    const value = document.getElementById("handheldTotalScansValue");
    if(value) value.textContent = String(getHandheldTotalScans());
}

function openHandheldAssignedOrdersPanel(){
    document.getElementById("handheldAssignedOrdersOverlay")?.remove();
    const active=typeof getActiveReceivingOrderNumbers==="function"
        ? getActiveReceivingOrderNumbers()
        : [];
    const assigned=typeof getSelectedReceivingOrderNumbers==="function"
        ? getSelectedReceivingOrderNumbers()
        : [];
    const esc=value=>typeof escapeHtml==="function"
        ? escapeHtml(String(value??""))
        : String(value??"");
    const rows=assigned.length
        ? assigned.map((order,index)=>`<article class="handheldAssignedOrderRow"><span>${index+1}</span><strong>${esc(order)}</strong></article>`).join("")
        : `<div class="handheldScansEmpty">No orders have been assigned from the computer.</div>`;
    const overlay=document.createElement("div");
    overlay.id="handheldAssignedOrdersOverlay";
    overlay.className="handheldScansOverlay handheldRecentOverlay handheldAssignedOrdersOverlay";
    overlay.innerHTML=`
      <section class="handheldScansPanel handheldRecentPanel handheldAssignedOrdersPanel" role="dialog" aria-modal="true" aria-label="Assigned orders">
        <header><div><span>COMPUTER ASSIGNMENT</span><strong>Assigned Orders</strong><small>${assigned.length} of ${active.length} active order${active.length===1?"":"s"} available on this Handheld</small></div><button type="button" data-close aria-label="Close">✕</button></header>
        <div class="handheldRecentList handheldAssignedOrdersList">${rows}</div>
        <div class="handheldRecentFooter"><span>Order access is controlled from Manage Orders on the computer.</span><button type="button" class="handheldPanelDone" data-close>DONE</button></div>
      </section>`;
    document.body.appendChild(overlay);
    overlay.querySelectorAll("[data-close]").forEach(button=>button.onclick=()=>{
        overlay.remove();
        setTimeout(()=>window.hhRefreshReadyState?.(),20);
    });
}

function openHandheldScansPanel(){
    document.getElementById("handheldScansOverlay")?.remove();
    try{ document.activeElement?.blur?.(); }catch(_){ }

    const esc=value=>typeof escapeHtml==="function"
        ? escapeHtml(String(value??""))
        : String(value??"");

    const formatTime=value=>{
        try{
            const d=new Date(value);
            if(!Number.isFinite(d.getTime())) return "";
            return d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
        }catch(_){ return ""; }
    };

    const scanRows=()=>getHandheldDeviceScannerRows().slice()
        .sort((a,b)=>String(b?.dateTime||"").localeCompare(String(a?.dateTime||"")))
        .slice(0,3);

    const overlay=document.createElement("div");
    overlay.id="handheldScansOverlay";
    overlay.className="handheldScansOverlay handheldRecentOverlay";

    const render=()=>{
        const recent=scanRows();

        const scanMarkup=recent.length ? recent.map((row,index)=>{
            const qty=Math.max(1,Number(row?.quantity||1)||1);
            return `
              <article class="handheldRecentRow handheldScanHistoryRow">
                <div class="handheldRecentIndex">${index+1}</div>
                <div class="handheldRecentInfo">
                  <strong>${esc(row?.itemName||"Item")}</strong>
                  <span>${esc(row?.itemCode||"")} · ${esc(formatTime(row?.dateTime))}</span>
                </div>
                <div class="handheldRecentQty">+${qty}</div>
                ${index===0
                    ? `<button type="button" class="handheldRemoveLastScan" data-remove-last="${esc(row?.transactionId||"")}">REMOVE</button>`
                    : `<span class="handheldRecentViewOnly">Saved</span>`}
              </article>`;
        }).join("") : `<div class="handheldScansEmpty">No recent scans on this Handheld.</div>`;

        overlay.innerHTML=`
          <section class="handheldScansPanel handheldRecentPanel" role="dialog" aria-modal="true" aria-label="Recent scans">
            <header>
              <div>
                <span>RECEIVING HISTORY</span>
                <strong>Recent Scans</strong>
                <small>Last ${recent.length} scan transactions</small>
              </div>
              <button type="button" data-close aria-label="Close">✕</button>
            </header>

            <div id="handheldRecentFeedback" class="handheldRecentFeedback" aria-live="polite"></div>

            <div class="handheldRecentList">
              ${scanMarkup}
            </div>

            <div class="handheldRecentFooter">
              <span>Only the latest scan can be removed. The correction is saved to the shared receiving record.</span>
              <button type="button" class="handheldPanelDone" data-close>DONE</button>
            </div>
          </section>`;

        overlay.querySelectorAll("[data-close]").forEach(btn=>btn.onclick=()=>{
            overlay.remove();
            setTimeout(()=>window.hhRefreshReadyState?.(),20);
        });

        overlay.querySelector("[data-remove-last]")?.addEventListener("click",()=>{
            const transactionId=overlay.querySelector("[data-remove-last]")?.dataset.removeLast||"";
            const latest=scanRows()[0];
            if(!latest || String(latest?.transactionId||"")!==String(transactionId)) return;
            if(!window.confirm(`Remove last scan: ${latest.itemName||"Item"} +${Math.max(1,Number(latest.quantity||1))}?`)) return;
            const removed=typeof undoRecentScannerTransaction==="function"
                ? undoRecentScannerTransaction(transactionId)
                : false;
            if(removed){
                setTimeout(()=>{
                    if(document.body.contains(overlay)) render();
                },0);
            }
        });

    };

    document.body.appendChild(overlay);
    render();

}


if(typeof AppEvents !== "undefined" && AppEvents?.on){
    AppEvents.on("receiving:updated", () => {
        if(typeof refreshHandheldReceivingTools === "function"){
            setTimeout(refreshHandheldReceivingTools,0);
        }
    });
}

function setZebraInterfaceMode(enabled){
    initializeZebraInterface();
    if(enabled === true){ setZebraReceivingMode(); }
    else{ setZebraHomeMode(); }
}
function refreshZebraInterface(){
    if(!isLikelyZebraDevice()){ return; }

    setElementText(
        document.getElementById("zebraQuickOrder"),
        AppState.workspace.orderName || AppState.workspace.orderId || "Active order"
    );
}



/* =====================================================
   PHASE 2C.6 FINAL - CLICKABLE KPI CONTENT
===================================================== */
let activeKpiKey=null;
let kpiPriorityOnly=false;

function setupDashboardKpiInteractivity(){
    if(document.documentElement.dataset.kpiCaptureBound==="1") return;
    document.documentElement.dataset.kpiCaptureBound="1";
    document.addEventListener("click",event=>{
        const card=event.target.closest?.(".dashboardKpiCard[data-kpi]");
        if(!card) return;
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        openDashboardKpiPanel(card.dataset.kpi);
    },true);
    document.addEventListener("keydown",event=>{
        const card=event.target.closest?.(".dashboardKpiCard[data-kpi]");
        if(card && (event.key==="Enter"||event.key===" ")){event.preventDefault();openDashboardKpiPanel(card.dataset.kpi);}
    },true);
    const missing=document.querySelector('[data-health-metric="missing"]');
    if(missing && missing.dataset.bound!=="1"){
        missing.dataset.bound="1";
        missing.addEventListener("click",openCurrentMissingGTINPanel);
        missing.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openCurrentMissingGTINPanel();}});
    }
}

function getActiveOrderScope(){
    const selected=
        typeof getSelectedReceivingOrderNumber==="function"
            ? getSelectedReceivingOrderNumber()
            : "";

    return toSafeString(
        selected ||
        window.PharmFlowOrderScope ||
        "ALL"
    );
}

function itemBelongsToOrderScope(item, scope=getActiveOrderScope()){
    if(!scope || scope==="ALL") return true;
    const list=Array.isArray(item?.orderNumbers)?item.orderNumbers:[];
    if(list.length) return list.map(normalizeOrderNumber).includes(normalizeOrderNumber(scope));
    /* Legacy workspaces created before 2C.7 have no per-item membership.
       Keep them visible rather than hiding valid stock. */
    return true;
}

function getScopedOrderItems(){
    const items=Array.isArray(AppState.workspace?.orderData)?AppState.workspace.orderData:[];
    const selected=typeof getSelectedReceivingOrderNumbers==="function"
        ? getSelectedReceivingOrderNumbers()
        : [];
    return selected.length
        ? items.filter(item=>selected.some(order=>itemBelongsToOrderScope(item,order)))
        : items;
}

function getKpiPanelItems(key){
    const items=getScopedOrderItems();
    if(key==="total"){
        const selectedOrders=typeof getSelectedReceivingOrderNumbers==="function" ? getSelectedReceivingOrderNumbers() : [];
        if(typeof getPerOrderReceivingRows==="function" && selectedOrders.length){
            return selectedOrders.flatMap(order=>getPerOrderReceivingRows(order).map(row=>({
                orderNumber:order,
                orderNumbers:[order],
                itemCode:row["Item Number"],
                itemName:row["Item Name"],
                orderedQty:toNumber(row["Ordered Qty"],0),
                receivedQty:toNumber(row["Received Qty"],0),
                remainingQty:Math.max(0,toNumber(row["Ordered Qty"],0)-toNumber(row["Received Qty"],0)),
                status:row["Issue Type"],
                manual:row.issueKey==="manual",
                group_name:row["Group"]||"",
                category:row["Category"]||"",
                sub_category:row["Sub Category"]||""
            })));
        }
        return items.slice();
    }
    const selectedOrders=typeof getSelectedReceivingOrderNumbers==="function" ? getSelectedReceivingOrderNumbers() : [];
    const perOrderRows=typeof getPerOrderReceivingRows==="function" ? selectedOrders.flatMap(order=>getPerOrderReceivingRows(order).map(row=>({
        orderNumber:order,
        itemCode:row["Item Number"], itemName:row["Item Name"],
        orderedQty:toNumber(row["Ordered Qty"],0), receivedQty:toNumber(row["Received Qty"],0),
        remainingQty:Math.max(0,toNumber(row["Ordered Qty"],0)-toNumber(row["Received Qty"],0)),
        status:row["Issue Type"], manual:row.issueKey==="manual"
    }))) : [];
    const scoped=perOrderRows.length ? perOrderRows : items;
    if(key==="completed") return scoped.filter(i=>{
        const o=toNumber(i.orderedQty,0),r=toNumber(i.receivedQty,0);
        return o>0 && r===o;
    });
    if(key==="remaining"||key==="remainingItems") return scoped.filter(i=>toNumber(i.remainingQty,0)>0);
    if(key==="over") return scoped.filter(i=>toNumber(i.receivedQty,0)>toNumber(i.orderedQty,0));
    if(key==="manual") return scoped.filter(i=>i.manual===true);
    return [];
}

function kpiTitle(key){
    return ({
        total:"Order Items",
        completed:"Completed Items",
        remaining:"Remaining Items",
        remainingItems:"Remaining Items",
        over:"Over Received",
        manual:"Manual / Unordered Extras",
        scans:"Receiving Activity History",
        received:"Received Items — Any Quantity"
    })[key]||"Dashboard Details";
}

function openDashboardKpiPanel(key){
    activeKpiKey=key;
    document.getElementById("dashboardKpiOverlay")?.remove();
    const overlay=document.createElement("div");
    overlay.id="dashboardKpiOverlay";
    overlay.className="quickKpiOverlay";
    overlay.innerHTML=`<div class="quickKpiPanel phase263Panel"><div class="quickKpiHeader"><h3>${kpiTitle(key)}</h3><button type="button" class="quickKpiClose" data-close>✕</button></div><div data-body></div></div>`;
    document.body.appendChild(overlay);
    window.PharmFlowModalStack?.open(overlay);
    overlay.querySelector("[data-close]").onclick=closeDashboardKpiPanel;
    overlay.addEventListener("click",event=>{if(event.target===overlay) closeDashboardKpiPanel();});
    const body=overlay.querySelector("[data-body]");
    const cloudReady=
        window.PharmFlowCloudWorkspace?.startupAuthorityReady!==false;
    if(
        key==="total" && !cloudReady &&
        typeof ensureStartupCloudAuthority==="function"
    ){
        body.innerHTML='<div class="tableEmptyState">Loading current order items…</div>';
        Promise.resolve(ensureStartupCloudAuthority()).finally(()=>{
            if(document.body.contains(overlay)){
                renderDashboardKpiPanel(key,body);
            }
        });
    }else{
        renderDashboardKpiPanel(key,body);
    }
}

function closeDashboardKpiPanel(){
    const overlay=document.getElementById("dashboardKpiOverlay");
    window.PharmFlowModalStack?.close(overlay);
    overlay?.remove();
    activeKpiKey=null;
    focusScannerInput?.();
}

function refreshOpenKpiPanel(){
    if(!activeKpiKey) return;
    const body=document.querySelector("#dashboardKpiOverlay [data-body]");
    if(body) renderDashboardKpiPanel(activeKpiKey,body);
}

function getReceivingActivityRows(){
    const history=Array.isArray(AppState?.workspace?.receivingHistory)?AppState.workspace.receivingHistory:[];
    const totals=new Map();
    const selectedOrders=typeof getSelectedReceivingOrderNumbers==="function" ? getSelectedReceivingOrderNumbers().map(normalizeOrderNumber) : [];
    const scopedHistory=history.filter(tx=>!selectedOrders.length||selectedOrders.includes(normalizeOrderNumber(tx?.selectedOrderNumber||tx?.orderId||tx?.orderNumber||"")));

    /* Always calculate totals in true chronological order.
       The stored history may be newest-first or oldest-first depending on
       the source/device, so array position must never decide the result. */
    const chronological=scopedHistory.slice().sort((a,b)=>{
        const ta=new Date(a?.dateTime||a?.date||a?.timestamp||0).getTime()||0;
        const tb=new Date(b?.dateTime||b?.date||b?.timestamp||0).getTime()||0;
        return ta-tb;
    });

    const rows=chronological.map(tx=>{
        const code=toSafeString(tx?.itemCode||"");
        const change=toNumber(tx?.quantity,0);
        const total=Math.max(0,toNumber(totals.get(code),0)+change);
        totals.set(code,total);
        return {...tx,qtyChange:change,totalAfterAction:total};
    });

    /* Review screen requirement: newest activity is always first. */
    return rows.sort((a,b)=>{
        const ta=new Date(a?.dateTime||a?.date||a?.timestamp||0).getTime()||0;
        const tb=new Date(b?.dateTime||b?.date||b?.timestamp||0).getTime()||0;
        return tb-ta;
    });
}

function getGroupedReceivingActivityRows(){
    const rows=getReceivingActivityRows();
    const chronological=rows.slice().sort((a,b)=>(new Date(a?.dateTime||0).getTime()||0)-(new Date(b?.dateTime||0).getTime()||0));
    const grouped=[];
    for(const row of chronological){
        const source=toSafeString(row?.source||"").toUpperCase();
        const isScanner=source.includes("SCAN")&&!source.includes("CORRECTION");
        const order=normalizeOrderNumber(row?.selectedOrderNumber||row?.orderId||row?.orderNumber||"");
        const previous=grouped[grouped.length-1];
        if(isScanner&&previous?.__scannerGroup===true&&normalizeItemCode(previous.itemCode)===normalizeItemCode(row.itemCode)&&normalizeOrderNumber(previous.selectedOrderNumber||previous.orderId||"")===order&&toSafeString(previous.deviceId||"")===toSafeString(row.deviceId||"")){
            previous.quantity=toNumber(previous.quantity,0)+toNumber(row.quantity,0);
            previous.qtyChange=previous.quantity;
            previous.transactionIds.push(row.transactionId);
            previous.dateTime=row.dateTime||previous.dateTime;
        }else{
            grouped.push({...row,__scannerGroup:isScanner,transactionIds:[row.transactionId],quantity:toNumber(row.quantity,0),qtyChange:toNumber(row.quantity,0)});
        }
    }
    return grouped.sort((a,b)=>(new Date(b?.dateTime||0).getTime()||0)-(new Date(a?.dateTime||0).getTime()||0));
}

function getActivitySourceLabel(source){
    const value=toSafeString(source||"").toUpperCase();
    if(value.includes("UNDO")||value.includes("CORRECTION")) return "Correction";
    if(value.includes("MANUAL_ITEM")||value.includes("MANUAL_EXTRA")||value.includes("EXTRA_ITEM")) return "Manual Item";
    if(value.includes("SCAN")) return "Scanner";
    if(value.includes("SEARCH")) return "Manual Quantity";
    if(value.includes("MANUAL")||value.includes("EDIT")||value.includes("ADJUST")) return "Manual Quantity";
    return source||"Receiving";
}

function getReceivingActivitySource(row){
    const source=toSafeString(row?.source||"").toUpperCase();
    if(source.includes("UNDO")||source.includes("CORRECTION")) return "Correction";
    if(source.includes("MANUAL")||source.includes("SEARCH")||source.includes("EDIT")||source.includes("ADJUST")) return "Manual";
    if(source.includes("SCAN")) return toSafeString(row?.deviceType||"").toUpperCase()==="HANDHELD" ? "Handheld" : "PC Scan";
    return toSafeString(row?.deviceType||"").toUpperCase()==="HANDHELD" ? "Handheld" : "Receiving";
}

function getActivityEffectiveQuantity(row,allRows){
    return toNumber(row?.quantity,0)+(allRows||[]).filter(tx=>toSafeString(tx?.correctsTransactionId||"")===toSafeString(row?.transactionId||"")).reduce((sum,tx)=>sum+toNumber(tx?.quantity,0),0);
}

function openReceivingActivityEditor(row,allRows){
    const current=getActivityEffectiveQuantity(row,allRows);
    const order=normalizeOrderNumber(row?.selectedOrderNumber||row?.orderId||row?.orderNumber||"");
    const item=getItemByCode?.(row?.itemCode);
    if(!item||current<0){showToast?.("This activity cannot be edited","warning");return;}
    const esc=value=>escapeHTML(toSafeString(value));
    const modal=document.createElement("div");
    modal.className="quickKpiOverlay pfnActivityEditOverlay";
    modal.innerHTML=`<form class="pfnActivityEdit" aria-label="Edit receiving activity"><h3>Edit Receiving Activity</h3><p><b>${esc(row.itemName||item.itemName)}</b><br>Item ${esc(row.itemCode)} · Order ${esc(order||"Current")}</p><label>Current transaction quantity<input value="${esc(current)}" disabled></label><label>Correct quantity<input data-corrected type="number" min="0" step="1" value="${esc(current)}" required></label><div><button type="button" data-cancel>Cancel</button><button type="button" class="dangerButton" data-delete-entry>Delete Entry</button><button type="submit">Save Correction</button></div></form>`;
    document.body.appendChild(modal);
    window.PharmFlowModalStack?.open(modal);
    const close=()=>{window.PharmFlowModalStack?.close(modal);modal.remove();};
    modal.querySelector("[data-cancel]").onclick=close;
    modal.querySelector("[data-delete-entry]").onclick=()=>{
        if(!window.confirm("Delete this receiving contribution? The item and order will not be deleted.")) return;
        const effective=getActivityEffectiveQuantity(row,allRows);
        if(effective<=0){showToast?.("This entry is already cancelled","warning");return;}
        const tx=applyQuantityAdjustment({item,difference:-effective,targetOrder:order,source:"RECEIVING_CORRECTION",correctionReason:"Receiving activity deleted",correctsTransactionId:row.transactionId});
        if(!tx)return;
        close();refreshDashboard?.();refreshOpenKpiPanel();showToast?.("Receiving entry cancelled","success");
    };
    modal.addEventListener("click",event=>{if(event.target===modal) close();});
    modal.querySelector("form").addEventListener("submit",event=>{
        event.preventDefault();
        const corrected=Number(modal.querySelector("[data-corrected]").value);
        if(!Number.isInteger(corrected)||corrected<0){showToast?.("Enter a whole quantity of zero or more","warning");return;}
        const difference=corrected-current;
        if(difference===0){showToast?.("The corrected quantity is unchanged","warning");return;}
        const tx=applyQuantityAdjustment({item,difference,targetOrder:order,source:"RECEIVING_CORRECTION",correctionReason:"Receiving activity edit",correctsTransactionId:row.transactionId});
        if(!tx) return;
        close(); refreshDashboard?.(); refreshOpenKpiPanel();
        showToast?.(`${item.itemName} correction recorded (${difference>0?"+":""}${difference})`,"success");
    });
    modal.querySelector("[data-corrected]").focus();
}

const itemPriorityPendingSelections=new Map();
let itemPriorityBatchTimer=null;
let itemPriorityBatchPromise=null;
let itemPriorityBatchVersion=0;
let itemPriorityRetryCount=0;

function applyPendingItemPrioritySelections(){
    itemPriorityPendingSelections.forEach((entry,itemCode)=>{
        const current=getItemByCode?.(itemCode);
        if(current){
            current.priorityType=entry.priorityType;
            current.highPriority=!!entry.priorityType;
        }
    });
}
window.applyPendingItemPrioritySelections=applyPendingItemPrioritySelections;

function getEffectiveItemPriority(item){
    const itemCode=toSafeString(item?.itemCode||item?.itemNumber||"");
    return itemPriorityPendingSelections.has(itemCode)
        ? itemPriorityPendingSelections.get(itemCode).priorityType
        : toSafeString(item?.priorityType||"");
}

function savePriorityApplicationState(){
    const nextUi=window.PharmFlowNext;
    const previousSuppression=nextUi?.suppressPriorityToast===true;
    try{
        if(nextUi) nextUi.suppressPriorityToast=true;
        saveApplicationState?.(false);
    }finally{
        if(nextUi) nextUi.suppressPriorityToast=previousSuppression;
    }
}

async function persistItemPriorityBatch(batch){
    const patched=await patchActiveOrderPriorities?.(batch)===true;
    if(patched) return true;

    /* Production can legitimately be on an older priority-patch RPC while
       still exposing the current revision-fenced Active Order Manifest save.
       Do not leave an operational priority only in browser memory: persist
       the already-updated manifest through that existing authority instead. */
    return await saveActiveOrderManifest?.({silent:true})===true;
}

function queueItemPrioritySelection(item,priorityType){
    const itemCode=toSafeString(item?.itemCode||item?.itemNumber||"");
    if(!itemCode) return Promise.resolve(false);

    const nextType=toSafeString(priorityType||"");
    const version=++itemPriorityBatchVersion;
    itemPriorityPendingSelections.set(itemCode,{priorityType:nextType,version});
    item.priorityType=nextType;
    item.highPriority=!!nextType;
    applyPendingItemPrioritySelections();
    itemPriorityRetryCount=0;

    clearTimeout(itemPriorityBatchTimer);
    itemPriorityBatchTimer=setTimeout(flushItemPriorityBatch,220);
    return Promise.resolve(true);
}

async function flushItemPriorityBatch(){
    if(itemPriorityBatchPromise) return itemPriorityBatchPromise;

    const batch=Array.from(itemPriorityPendingSelections.entries()).map(
        ([itemCode,entry])=>({itemCode,...entry})
    );
    if(!batch.length) return true;

    /* Persist the complete optimistic batch once. Saving the whole workspace
       on every rapid click made older pharmacy PCs appear unresponsive. */
    applyPendingItemPrioritySelections();
    savePriorityApplicationState();

    itemPriorityBatchPromise=(async()=>{
        let saved=false;
        for(let attempt=1;attempt<=2&&!saved;attempt++){
            saved=await persistItemPriorityBatch(
                batch.map(({itemCode,priorityType})=>({itemCode,priorityType}))
            );
            if(!saved) applyPendingItemPrioritySelections();
        }

        if(saved){
            itemPriorityRetryCount=0;
            batch.forEach(entry=>{
                const pending=itemPriorityPendingSelections.get(entry.itemCode);
                if(pending?.version===entry.version){
                    itemPriorityPendingSelections.delete(entry.itemCode);
                }
            });
            savePriorityApplicationState();
        }

        applyPendingItemPrioritySelections();
        return saved;
    })().finally(()=>{
        itemPriorityBatchPromise=null;
        if(itemPriorityPendingSelections.size&&itemPriorityRetryCount<2){
            itemPriorityRetryCount+=1;
            clearTimeout(itemPriorityBatchTimer);
            itemPriorityBatchTimer=setTimeout(flushItemPriorityBatch,2000);
        }
    });

    return itemPriorityBatchPromise;
}

function queueClearVisiblePriorities(items){
    items.forEach(item=>queueItemPrioritySelection(item,""));
    clearTimeout(itemPriorityBatchTimer);
    itemPriorityBatchTimer=setTimeout(flushItemPriorityBatch,0);
    return Promise.resolve(true);
}

function renderItemBrowser(body, rows, options={}){
    const esc=value=>typeof escapeHtml==="function"?escapeHtml(toSafeString(value)):toSafeString(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
    const orderMode=options.showPriority===true;
    const receivedMode=options.receivedMode===true;
    const orderNumbers=Array.from(new Set(rows.flatMap(item=>Array.isArray(item?.orderNumbers)?item.orderNumbers:[]).map(normalizeOrderNumber).filter(Boolean)));
    body.innerHTML=`
      <div class="pfnBrowserControls ${orderMode?'pfnOrderBrowserControls':''}">
        ${orderMode?`<div class="pfnBrowserControlRow"><label><span>Order</span><select data-order-filter><option value="ALL">All Orders</option>${orderNumbers.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select></label><div class="pfrClassificationFilters pfrGroupOnlyFilters"><details data-group-filter class="pfnMultiSelector operationalMultiFilter pfnUnifiedMultiSelect"><summary><span>Group</span><strong>All groups</strong></summary><div class="pfrFilterMenu pfnUnifiedMultiSelectMenu"></div></details></div><label><span>Quantity</span><select data-qty-sort><option value="desc" selected>Highest → Lowest</option><option value="asc">Lowest → Highest</option><option value="default">Default / Order Sequence</option></select></label></div>`:''}
        <div class="pfnBrowserActionRow"><label class="pfnBrowserSearchField"><span>Search</span><input class="phase263Search pfnWideSearch" type="search" placeholder="Search by Item Name or Item Number" aria-label="Search items"></label>${orderMode?`<div class="pfnBrowserPriorityActions"><button type="button" class="pfnHighPriorityFilter" data-priority-filter>High Priority</button><button type="button" class="pfnHighPriorityFilter" data-print-priority hidden>Print</button><button type="button" class="pfnHighPriorityFilter" data-clear-priority hidden>Clear High Priority</button></div>`:''}</div>
      </div>
      ${receivedMode?`<div class="phase263Summary"><b>Received Items: ${rows.length}</b></div>`:''}
      <div class="phase263TableWrap pfnCleanWorklist"><table class="quickKpiTable phase263Table"><thead><tr>${orderMode?'<th>Item Code</th><th>Item Name</th><th>Priority</th><th>Group</th><th>Quantity</th><th>Order No.</th>':'<th>Item Code</th><th>Item Name</th><th>Ordered</th>'}${receivedMode?'<th>Received</th>':''}</tr></thead><tbody data-rows></tbody></table></div>`;
    const input=body.querySelector('.phase263Search');
    const tbody=body.querySelector('[data-rows]');
    const orderFilter=body.querySelector('[data-order-filter]');
    const qtySort=body.querySelector('[data-qty-sort]');
    const groupFilter=body.querySelector('[data-group-filter]');
    let selectedGroups=[];
    const priorityFilter=body.querySelector('[data-priority-filter]');
    const printPriority=body.querySelector('[data-print-priority]');
    const clearPriority=body.querySelector('[data-clear-priority]');
    let priorityOnly=false;
    let visibleRows=[];
    let selectedRowKey="";
    const rowKey=item=>`${toSafeString(item?.itemCode)}|${(Array.isArray(item?.orderNumbers)?item.orderNumbers:[]).map(normalizeOrderNumber).filter(Boolean).join(",")}`;
    const rowHtml=item=>{
        const orders=(Array.isArray(item?.orderNumbers)?item.orderNumbers:[]).map(normalizeOrderNumber).filter(Boolean).join(', ')||'—';
        const pt=getEffectiveItemPriority(item);
        const key=rowKey(item);
        const selected=key===selectedRowKey;
        const rowAttributes=`class="pfnMobileItemCard${selected?' pfnBrowserRowSelected':''}" data-row-key="${esc(key)}" tabindex="0" aria-selected="${selected?'true':'false'}"`;
        if(orderMode)return `<tr ${rowAttributes}><td class="pfnItemCode" data-label="Item Number">${esc(item.itemCode)}</td><td class="pfnItemName" data-label="Item Name"><b>${esc(item.itemName)}</b></td><td class="pfnPriorityCell" data-label="Priority"><div class="pfnPrioritySegment"><button type="button" class="pfnPriorityMark ${pt==='SHORT'?'active short':''}" data-mark="SHORT" data-code="${esc(item.itemCode)}">SHORT</button><button type="button" class="pfnPriorityMark ${pt==='NEW'?'active new':''}" data-mark="NEW" data-code="${esc(item.itemCode)}">NEW</button></div></td><td class="pfnCategoryCell" data-label="Group">${esc((()=>{const x=window.PharmFlowClassificationFilters?.normalize(item)||{};return x.group||"—";})())}</td><td class="pfnOrderedQty" data-label="Quantity">${esc(toNumber(item.orderedQty,0))}</td><td class="pfnOrderNo" data-label="Order No.">${esc(orders)}</td></tr>`;
        return `<tr ${rowAttributes}><td class="pfnItemCode" data-label="Item Number">${esc(item.itemCode)}</td><td class="pfnItemName" data-label="Item Name"><b>${esc(item.itemName)}</b></td><td class="pfnOrderedQty" data-label="Ordered">${esc(toNumber(item.orderedQty,0))}</td>${receivedMode?`<td data-label="Received">${esc(toNumber(item.receivedQty,0))}</td>`:''}</tr>`;
    };
    const draw=()=>{
        const q=typeof normalizeReceivingSearchText==="function"
            ? normalizeReceivingSearchText(input?.value||"")
            : toSafeString(input?.value||"").trim().toLowerCase();
        const currentRows=orderMode?getKpiPanelItems("total"):rows;
        applyPendingItemPrioritySelections();
        let visible=currentRows.filter(item=>!q||(
            typeof matchesReceivingSearch==="function"
                ? matchesReceivingSearch(item,q)
                : toSafeString(item.itemName).toLowerCase().includes(q)||toSafeString(item.itemCode).toLowerCase().includes(q)
        ));
        const selectedOrder=orderFilter?.value||'ALL';
        if(orderMode&&selectedOrder!=='ALL') visible=visible.filter(item=>(Array.isArray(item?.orderNumbers)?item.orderNumbers:[]).map(normalizeOrderNumber).includes(selectedOrder));
        if(orderMode&&window.PharmFlowClassificationFilters){
            const selection={groups:selectedGroups,categories:[],subCategories:[]};
            visible=window.PharmFlowClassificationFilters.filter(visible,selection);
        }
        if(orderMode&&priorityOnly) visible=visible.filter(item=>['NEW','SHORT'].includes(getEffectiveItemPriority(item)));
        const sort=qtySort?.value||'desc';
        if(sort==='desc') visible=visible.slice().sort((a,b)=>toNumber(b.orderedQty,0)-toNumber(a.orderedQty,0));
        if(sort==='asc') visible=visible.slice().sort((a,b)=>toNumber(a.orderedQty,0)-toNumber(b.orderedQty,0));
        visibleRows=visible;
        if(orderMode&&priorityOnly){
            const groups=[['SHORT',visible.filter(i=>getEffectiveItemPriority(i)==='SHORT')],['NEW',visible.filter(i=>getEffectiveItemPriority(i)==='NEW')]];
            tbody.innerHTML=groups.map(([name,list])=>list.length?`<tr class="pfnPriorityGroup"><td colspan="6"><strong>${name}</strong><span>${list.length} items</span></td></tr>${list.map(rowHtml).join('')}`:'').join('')||`<tr><td colspan="6" class="tableEmptyState">No high priority items.</td></tr>`;
        }else{
            const colspan=orderMode?6:(receivedMode?4:3);
            tbody.innerHTML=visible.length?visible.map(rowHtml).join(''):`<tr><td colspan="${colspan}" class="tableEmptyState">No matching items.</td></tr>`;
        }
        tbody.querySelectorAll('[data-mark]').forEach(btn=>btn.onclick=async()=>{
            const item=typeof getItemByCode==='function'?getItemByCode(btn.dataset.code):null;if(!item)return;
            const previousType=getEffectiveItemPriority(item);
            const nextType=previousType===btn.dataset.mark?'':btn.dataset.mark;
            item.priorityType=nextType;
            item.highPriority=!!nextType;
            const segment=btn.closest('.pfnPrioritySegment');
            segment?.querySelectorAll('[data-mark]').forEach(mark=>{
                const active=mark.dataset.mark===nextType;
                mark.classList.toggle('active',active);
                mark.classList.toggle('short',active&&nextType==='SHORT');
                mark.classList.toggle('new',active&&nextType==='NEW');
            });
            const wrap=body.querySelector('.phase263TableWrap'),top=wrap?.scrollTop||0;
            const saved=await queueItemPrioritySelection(item,nextType);
            if(!saved||priorityOnly){
                draw();
                const finalWrap=body.querySelector('.phase263TableWrap');
                if(finalWrap) finalWrap.scrollTop=top;
            }
        });
    };
    const selectBrowserRow=row=>{
        if(!row?.dataset.rowKey)return;
        selectedRowKey=row.dataset.rowKey;
        tbody.querySelectorAll('.pfnBrowserRowSelected').forEach(candidate=>{
            candidate.classList.remove('pfnBrowserRowSelected');
            candidate.setAttribute('aria-selected','false');
        });
        row.classList.add('pfnBrowserRowSelected');
        row.setAttribute('aria-selected','true');
    };
    tbody?.addEventListener('click',event=>{
        if(event.target.closest('button,a,input,select,summary,label'))return;
        selectBrowserRow(event.target.closest('tr.pfnMobileItemCard'));
    });
    tbody?.addEventListener('keydown',event=>{
        if((event.key!=="Enter"&&event.key!==" ")||event.target.closest('button,a,input,select,summary,label'))return;
        const row=event.target.closest('tr.pfnMobileItemCard');
        if(!row)return;
        event.preventDefault();
        selectBrowserRow(row);
    });
    const rebuildClassification=()=>{
        if(!orderMode||!window.PharmFlowClassificationFilters)return;
        const currentRows=getKpiPanelItems("total");
        const selected={groups:selectedGroups,categories:[],subCategories:[]};
        const choices=window.PharmFlowClassificationFilters.choices(currentRows,selected);
        const menu=groupFilter?.querySelector('.pfrFilterMenu');
        if(!menu)return;
        const allowed=new Set(choices.groups);selectedGroups=selectedGroups.filter(value=>allowed.has(value));
        menu.innerHTML=`<div class="pfrFilterOptions">${choices.groups.map(value=>`<label><input type="checkbox" value="${esc(value)}" ${selectedGroups.includes(value)?"checked":""}><span>${esc(value)}</span></label>`).join('')||'<span class="tableEmptyState">No groups</span>'}</div><div class="pfrFilterActions"><button type="button" data-group-action="all">Select All</button><button type="button" data-group-action="clear">Clear</button><button type="button" data-group-action="ok">OK</button></div>`;
        const label=groupFilter.querySelector('summary strong');if(label)label.textContent=selectedGroups.length===0||selectedGroups.length===choices.groups.length?'All groups':selectedGroups.length===1?selectedGroups[0]:selectedGroups.length+' groups';
    };
    rebuildClassification();
    input?.addEventListener('input',draw);orderFilter?.addEventListener('change',draw);
    groupFilter?.addEventListener('click',event=>{const action=event.target.closest('[data-group-action]')?.dataset.groupAction;if(!action)return;event.preventDefault();const boxes=[...groupFilter.querySelectorAll('input[type="checkbox"]')];if(action==='all')boxes.forEach(box=>box.checked=true);if(action==='clear')boxes.forEach(box=>box.checked=false);if(action==='ok')groupFilter.open=false;selectedGroups=boxes.filter(box=>box.checked).map(box=>box.value);rebuildClassification();draw();});
    groupFilter?.addEventListener('change',event=>{if(!event.target.matches('input[type="checkbox"]'))return;selectedGroups=[...groupFilter.querySelectorAll('input:checked')].map(box=>box.value);rebuildClassification();draw();});
    groupFilter?.addEventListener('toggle',()=>{if(groupFilter.open){orderFilter?.blur();qtySort?.blur();}});
    qtySort?.addEventListener('change',draw);
    priorityFilter?.addEventListener('click',()=>{priorityOnly=!priorityOnly;priorityFilter.classList.toggle('active',priorityOnly);if(printPriority)printPriority.hidden=!priorityOnly;if(clearPriority)clearPriority.hidden=!priorityOnly;draw();});
    clearPriority?.addEventListener('click',async()=>{
        const targets=visibleRows.filter(item=>['NEW','SHORT'].includes(getEffectiveItemPriority(item)));
        if(!targets.length) return;
        if(!window.confirm(`Clear High Priority from ${targets.length} visible item(s)?`)) return;
        const top=body.querySelector('.phase263TableWrap')?.scrollTop||0;
        const clearRequest=queueClearVisiblePriorities(targets);
        draw();
        let finalWrap=body.querySelector('.phase263TableWrap');
        if(finalWrap) finalWrap.scrollTop=top;
        const cleared=await clearRequest;
        if(!cleared){
            draw();
            finalWrap=body.querySelector('.phase263TableWrap');
            if(finalWrap) finalWrap.scrollTop=top;
        }
    });
    printPriority?.addEventListener('click',()=>{
        const printable=visibleRows.filter(item=>['NEW','SHORT'].includes(getEffectiveItemPriority(item)));
        if(!printable.length) return;

        const selectedOrder=orderFilter?.value||'ALL';
        const receipt=document.createElement('iframe');
        receipt.setAttribute('aria-hidden','true');
        receipt.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
        document.body.appendChild(receipt);

        const receiptDocument=receipt.contentDocument;
        receiptDocument.open();
        receiptDocument.write(`<!doctype html><html><head><meta charset="utf-8"><title>High Priority Items</title><style>
          @page{margin:0}
          *{box-sizing:border-box}
          html,body{margin:0;padding:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          .highPriorityReceipt{width:80mm;max-width:100%;margin:0;padding:.5mm 1.5mm 1.5mm}
          header{margin:0 0 1mm;padding:0 0 .8mm;border-bottom:.35mm solid #000;text-align:center}
          h1{margin:0;font-size:13pt;line-height:1.05;font-weight:800}
          .meta{margin-top:.55mm;font-size:9pt;line-height:1.05;font-weight:700}
          table{width:100%;border:.35mm solid #000;border-collapse:collapse;table-layout:fixed}
          th,td{border-right:.35mm solid #000;border-bottom:.25mm solid #000;vertical-align:middle;color:#000}
          th:last-child,td:last-child{border-right:0}
          th{padding:.7mm 1mm;background:#fff;font-size:9pt;line-height:1;text-align:left;font-weight:800}
          td{padding:.65mm 1mm;font-size:10pt;line-height:1.05;white-space:nowrap;font-weight:600}
          th.name,td.name{padding-left:.6mm;padding-right:.6mm}
          td.name{overflow:hidden;text-overflow:ellipsis}
          th.qty,td.qty{width:13mm;padding-left:.25mm;padding-right:.25mm;text-align:center}
          th.qty{font-size:9pt;font-weight:800}
          td.qty{font-size:11pt;font-weight:700}
          tr.group td{padding:.55mm 1mm;background:#fff;font-size:9pt;font-weight:900;border-top:.5mm solid #000;border-bottom:.5mm solid #000}
          tr:last-child td{border-bottom:0}
        </style></head><body><main class="highPriorityReceipt"><header><h1>HIGH PRIORITY ITEMS</h1><div class="meta">${selectedOrder==='ALL'?'All Orders':`Order: ${esc(selectedOrder)}`}</div></header><table><thead><tr><th class="name">ITEM NAME</th><th class="qty">QTY</th></tr></thead><tbody>${['SHORT','NEW'].map(type=>{
            const group=printable.filter(item=>getEffectiveItemPriority(item)===type);
            if(!group.length) return '';
            return `<tr class="group"><td colspan="2">${type}</td></tr>${group.map(item=>{
                const name=toSafeString(item.itemName||item.itemCode||'—');
                const fontSize=name.length>64?'7.75pt':name.length>48?'8.25pt':'9.25pt';
                return `<tr><td class="name" style="font-size:${fontSize}">${esc(name)}</td><td class="qty">${esc(toNumber(item.orderedQty,0))}</td></tr>`;
            }).join('')}`;
        }).join('')}</tbody></table></main></body></html>`);
        receiptDocument.close();

        const removeReceipt=()=>setTimeout(()=>receipt.remove(),500);
        receipt.contentWindow.addEventListener('afterprint',removeReceipt,{once:true});
        setTimeout(()=>{
            receipt.contentWindow.focus();
            receipt.contentWindow.print();
        },100);
        setTimeout(removeReceipt,60000);
    });
    draw();
}

function renderDashboardKpiPanel(key,body){
    if(!body) return;
    const esc=value=>typeof escapeHtml==="function"?escapeHtml(toSafeString(value)):toSafeString(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
    if(key==="scans"){
        const allRows=getGroupedReceivingActivityRows();
        if(!allRows.length){body.innerHTML='<div class="tableEmptyState">No receiving activity in the current workspace yet.</div>';return;}
        body.innerHTML=`<div class="pfnActivityControls"><label for="pfnActivitySourceFilter">Source</label><select id="pfnActivitySourceFilter"><option value="All">All</option><option value="Handheld">Handheld</option><option value="PC Scan">PC Scan</option><option value="Manual">Manual</option><option value="Correction">Correction</option></select></div><div class="phase263TableWrap pfnActivityWorklist"><table class="quickKpiTable phase263Table"><thead><tr><th>Date / Time</th><th>Item Name</th><th>Item Number</th><th>GTIN</th><th>Recent Action Qty</th><th>Source</th><th>Order Number</th><th>Action</th></tr></thead><tbody data-activity-rows></tbody></table></div>`;
        const tbody=body.querySelector("[data-activity-rows]");
        const sourceFilter=body.querySelector("#pfnActivitySourceFilter");
        const draw=()=>{
            const selected=sourceFilter.value;
            const rows=selected==="All"?allRows:allRows.filter(row=>getReceivingActivitySource(row)===selected);
            tbody.innerHTML=rows.length?rows.map(row=>{const q=toNumber(row.qtyChange,0);const correction=toSafeString(row.source).toUpperCase().includes("CORRECTION");const editable=!correction&&q>0&&!!getItemByCode?.(row.itemCode);return `<tr><td>${esc(typeof formatDateTime==="function"?formatDateTime(row.dateTime):row.dateTime)}</td><td><b>${esc(row.itemName||getItemByCode?.(row.itemCode)?.itemName||"Unknown item")}</b></td><td>${esc(row.itemCode)}</td><td>${esc(row.gtin||"—")}</td><td class="${q<0?'phase263Negative':'phase263Positive'}">${correction?'Correction':'Received'} ${q>0?'+':''}${esc(q)}</td><td>${esc(getReceivingActivitySource(row))}</td><td>${esc(row.selectedOrderNumber||row.orderId||row.orderNumber||"—")}</td><td>${editable?`<button class="quickUndoButton" data-edit="${esc(row.transactionId)}">Edit</button>`:'—'}</td></tr>`;}).join(''):'<tr><td colspan="8" class="tableEmptyState">No activity from this source.</td></tr>';
            tbody.querySelectorAll("[data-edit]").forEach(btn=>btn.onclick=()=>{const row=allRows.find(entry=>toSafeString(entry.transactionId)===btn.dataset.edit);if(row)openReceivingActivityEditor(row,allRows);});
        };
        sourceFilter.addEventListener("change",draw);
        draw();
        return;
    }
    if(key==="received"){
        const rows=getScopedOrderItems().filter(i=>toNumber(i.receivedQty,0)>0);
        renderItemBrowser(body,rows,{receivedMode:true});
        return;
    }
    if(key==="total"){
        renderItemBrowser(body,getKpiPanelItems("total"),{showPriority:true});
        return;
    }
    const rows=getKpiPanelItems(key);
    if(!rows.length){body.innerHTML='<div class="tableEmptyState">No items in this category.</div>';return;}
    body.innerHTML=`<div class="phase263TableWrap"><table class="quickKpiTable phase263Table"><thead><tr><th>Item Code</th><th>Item Name</th><th>Ordered</th><th>Received</th><th>Remaining</th><th>Status</th></tr></thead><tbody>${rows.map(item=>`<tr class="pfnMobileItemCard"><td data-label="Item Number">${esc(item.itemCode)}</td><td data-label="Item Name"><b>${esc(item.itemName)}</b></td><td data-label="Ordered">${esc(toNumber(item.orderedQty,0))}</td><td data-label="Received">${esc(toNumber(item.receivedQty,0))}</td><td data-label="Remaining">${esc(toNumber(item.remainingQty,0))}</td><td data-label="Status">${esc(item.status||"")}</td></tr>`).join('')}</tbody></table></div>`;
}

/* =====================================================
   PHASE 2C.6 FINAL - ONE-TAP ACCIDENTAL SCAN CORRECTION
===================================================== */
function refreshScanSafetyUI(){
    document.querySelector("#lastScanCard .scanSafetyBar")?.remove();
    ensureNeedsReviewButtons();
}



function getNeedsReviewPharmacyId(){
    if(typeof getCurrentPharmacyId === "function"){
        const id = getCurrentPharmacyId();
        if(id) return id;
    }

    if(typeof AuthState !== "undefined"){
        return (
            AuthState?.context?.pharmacy_id ||
            AuthState?.profile?.pharmacy_id ||
            AuthState?.pharmacyId ||
            null
        );
    }

    return null;
}


async function loadNeedsReviewRows(workflow,orderNumber=null){
    if(typeof nrV2List!=="function") return [];
    return await nrV2List(workflow||"RECEIVING",orderNumber||null);
}

function getPcNeedsReviewOrderScope(){
    if(typeof isLikelyZebraDevice==="function"&&isLikelyZebraDevice()) return null;
    const selected=typeof getSelectedReceivingOrderNumbers==="function" ? getSelectedReceivingOrderNumbers() : [];
    return new Set(selected.map(normalizeOrderNumber).filter(Boolean));
}
function filterNeedsReviewRowsToPcScope(rows){
    const scope=getPcNeedsReviewOrderScope();
    if(scope===null) return rows||[];
    return (rows||[]).filter(row=>{const assigned=normalizeOrderNumber(row?.order_number||"");if(assigned)return scope.has(assigned);const captured=(Array.isArray(row?.work_scope_order_numbers)?row.work_scope_order_numbers:[]).map(normalizeOrderNumber).filter(Boolean);return captured.some(order=>scope.has(order));});
}

async function refreshNeedsReviewCounters(){
    if(typeof isLikelyZebraDevice==="function"&&isLikelyZebraDevice()) return;

    try{
        /* Pharmacy-scoped by design. Never hide Handheld drafts because of
           a PC-local order/workspace id mismatch. */
        const receiving=filterNeedsReviewRowsToPcScope(await loadNeedsReviewRows("RECEIVING",null));
        const rc=document.getElementById("receivingNeedsReviewCount");

        const grouped=groupNeedsReviewRows(receiving);
        if(rc) rc.textContent=String(grouped.length);

        document
            .getElementById("btnReceivingNeedsReview")
            ?.classList.toggle("hasItems",grouped.length>0);
    }catch(error){
        console.warn("Needs Review V2 count failed",error);
    }
}

function ensureNeedsReviewButtons(){
    if(typeof isLikelyZebraDevice==="function"&&isLikelyZebraDevice()) return;
    const button=document.getElementById("btnReceivingNeedsReview");
    if(button && button.dataset.bound!=="1"){button.dataset.bound="1";button.onclick=()=>openNeedsReviewPanel("RECEIVING");}
    refreshNeedsReviewCounters();
}


function nrV2FindOrderMatches(query,workScopeOrderNumbers=[]){
    const q=toSafeString(query).toLowerCase().replace(/\s+/g," ").trim();
    const scope=[...new Set((workScopeOrderNumbers||[]).map(normalizeOrderNumber).filter(Boolean))];
    const seen=new Set();
    const source=(AppState?.workspace?.orderData||[]).filter(item=>{
        const code=normalizeItemCode(item?.itemCode||"");
        if(!code||seen.has(code)) return false;
        if(typeof getReceivingAutoAllocationCandidates==="function"&&!getReceivingAutoAllocationCandidates(item,scope).length) return false;
        seen.add(code);
        return true;
    });
    if(!q) return source.slice(0,20);
    const parts=q.split(" ").filter(Boolean);
    return source.filter(item=>{
        const code=toSafeString(item?.itemCode).toLowerCase();
        const name=toSafeString(item?.itemName).toLowerCase().replace(/\s+/g," ");
        return code.includes(q)||name.includes(q)||parts.every(part=>code.includes(part)||name.includes(part));
    }).slice(0,20);
}
async function nrV2HydratePhoto(img,path){
    if(!img || !path) return;

    try{
        const url=await nrV2PhotoObjectUrl(path);
        if(url){
            img.src=url;
            img.hidden=false;
        }
    }catch(_){}
}

function groupNeedsReviewRows(rows){
    const groups=new Map();
    (rows||[]).forEach(row=>{
        /* V3 preserves the captured operational identifier.  `gtin` remains
           only as a compatibility read for pre-V3 cases. */
        const gtin=toSafeString(row?.identifier_display||row?.gtin||"").trim();
        const order=toSafeString(row?.order_number||"").trim();
        const reason=toSafeString(row?.review_reason||"UNKNOWN_GTIN").trim();
        const capturedScope=[...new Set((Array.isArray(row?.work_scope_order_numbers)?row.work_scope_order_numbers:[]).map(normalizeOrderNumber).filter(Boolean))].sort();
        if(order&&!capturedScope.includes(normalizeOrderNumber(order))) capturedScope.push(normalizeOrderNumber(order));
        const key=[gtin,reason,capturedScope.join("+")].join("|");
        if(!groups.has(key)){
            groups.set(key,{
                key,
                gtin,
                order_number:order,
                review_reason:reason,
                source:row?.source||"",
                rows:[],
                total_quantity:0,
                photos:[],
                master_item_name_hint:row?.master_item_name_hint||"",
                master_item_code_hint:row?.master_item_code_hint||"",
                work_scope_order_numbers:[...new Set((Array.isArray(row?.work_scope_order_numbers)?row.work_scope_order_numbers:[]).map(normalizeOrderNumber).filter(Boolean))]
            });
        }
        const group=groups.get(key);
        group.rows.push(row);
        group.total_quantity+=Math.max(0,Number(row?.pending_quantity||0)||0);
        if(row?.photo_path) group.photos.push(row.photo_path);
        if(!group.master_item_name_hint && row?.master_item_name_hint) group.master_item_name_hint=row.master_item_name_hint;
        if(!group.master_item_code_hint && row?.master_item_code_hint) group.master_item_code_hint=row.master_item_code_hint;
        (Array.isArray(row?.work_scope_order_numbers)?row.work_scope_order_numbers:[]).map(normalizeOrderNumber).filter(Boolean).forEach(order=>{if(!group.work_scope_order_numbers.includes(order))group.work_scope_order_numbers.push(order);});
    });
    return Array.from(groups.values()).map(group=>({
        ...group,
        total_quantity:Math.max(1,group.total_quantity||0),
        rows:group.rows.slice().sort((a,b)=>String(a?.created_at||a?.date_time||"").localeCompare(String(b?.created_at||b?.date_time||"")))
    }));
}

function nrV2GroupTransactionId(group){
    const safe=value=>toSafeString(value||"").replace(/[^a-z0-9]+/gi,"_").replace(/^_+|_+$/g,"").slice(0,42);
    return `NEEDS_REVIEW_GROUP_${safe(group?.gtin||"UNKNOWN")}`;
}

function nrV2HasTransactionId(transactionId){
    return (AppState?.workspace?.receivingHistory||[]).some(tx=>toSafeString(tx?.transactionId||"")===transactionId);
}

function nrV2AllocationScope(group){
    const captured=[...new Set((group?.work_scope_order_numbers||[]).map(normalizeOrderNumber).filter(Boolean))];
    if(captured.length) return captured;
    const legacy=normalizeOrderNumber(group?.order_number||"");
    return legacy?[legacy]:[];
}

function nrV2AllocationPreview(group,item){
    const plan=buildReceivingAutoAllocationPlan(item,Math.max(1,Number(group?.total_quantity||1)||1),nrV2AllocationScope(group));
    return {plan,orderCount:new Set(plan.map(row=>row.orderNumber)).size};
}

async function nrV2ResolveGroupToOrderItem(group,item){
    const scope=nrV2AllocationScope(group);
    if(!scope.length) throw new Error("Captured Receiving work scope is unavailable.");
    const identifier=toSafeString(group?.rows?.[0]?.identifier_display||group?.rows?.[0]?.gtin||group?.gtin).trim();
    let pharmacyMapping=null;
    if(typeof isPharmacyAdmin==="function"&&isPharmacyAdmin()&&identifier){
        const mappingResult=await IdentifierService.learnIdentifier(nrV2OperationId(),identifier,item,"Needs Review resolution");
        pharmacyMapping=Array.isArray(mappingResult)?mappingResult[0]:mappingResult;
    }
    const resolution=pharmacyMapping?{
        kind:"PHARMACY_LEARNED",
        mappingId:pharmacyMapping.identifierId,
        mappingRevision:pharmacyMapping.mappingRevision,
        identifierDisplay:pharmacyMapping.identifierDisplay,
        identifierKey:pharmacyMapping.identifierKey,
        resolvedItemCode:pharmacyMapping.itemCode
    }:null;
    const remainingState=new Map();
    for(const order of getReceivingAutoAllocationCandidates(item,scope)){
        const row=getReceivingOrderRow(item,order);
        remainingState.set(normalizeOrderNumber(order),Math.max(0,toNumber(row?.["Remaining Qty"],toNumber(row?.["Ordered Qty"],0)-toNumber(row?.["Received Qty"],0))));
    }
    const intents=[];
    for(const row of group.rows){
        const quantity=Math.max(1,Number(row?.pending_quantity||1)||1);
        const plan=buildReceivingAutoAllocationPlan(item,quantity,scope,remainingState);
        const baseId=typeof nrV2ResolutionTransactionId==="function"?nrV2ResolutionTransactionId(row.review_id):`NEEDS_REVIEW_V2:${row.review_id}`;
        const allocations=plan.map((allocation,index)=>({
            orderNumber:allocation.orderNumber,
            quantity:allocation.quantity,
            transactionId:plan.length===1?baseId:`${baseId}:A${index+1}`
        }));
        const requested=await nrV2RequestResolution(row,item,baseId,allocations);
        const intent=Array.isArray(requested)?requested[0]:requested;
        if(intent?.status==="BLOCKED"||intent?.blocked) throw new Error(intent?.detail||intent?.message||intent?.code||"Needs Review allocation was blocked.");
        intents.push(intent);
        receiveAutoAllocatedItem({
            item,quantity,plan,transactionId:baseId,gtin:identifier,
            source:APP_CONFIG.transactionSources.scanner,identifierPreserveExact:true,gtinResolution:resolution
        });
    }
    return {pending:intents.some(result=>result?.status!=="RESOLVED"),transactionId:nrV2GroupTransactionId(group)};
}
function nrV2ItemMetrics(item){
    const ordered=toNumber(item?.orderedQty,0);
    const received=toNumber(item?.receivedQty,0);
    return {ordered,received,remaining:Math.max(0,toNumber(item?.remainingQty,ordered-received))};
}

function nrV2ItemSummary(item,esc){
    const metrics=nrV2ItemMetrics(item);
    return `<span><small>Item Name</small><strong>${esc(item.itemName)}</strong><small>Item Code <b>${esc(item.itemCode)}</b></small></span><span class="needsReviewResultQty"><small>Ordered <b>${metrics.ordered}</b></small><small>Received <b>${metrics.received}</b></small><small>Remaining <b>${metrics.remaining}</b></small></span>`;
}

function closeNeedsReviewPhotoViewer(){
    document.getElementById("needsReviewPhotoViewer")?.remove();
}

function openNeedsReviewPhotoViewer(url){
    closeNeedsReviewPhotoViewer();
    const viewer=document.createElement("div");
    viewer.id="needsReviewPhotoViewer";
    viewer.className="needsReviewPhotoViewer";
    viewer.setAttribute("role","dialog");
    viewer.setAttribute("aria-modal","true");
    viewer.setAttribute("aria-label","Temporary product photo");
    viewer.innerHTML=`<button class="needsReviewPhotoScrim" type="button" data-photo-close aria-label="Close photo"></button><section><img src="${url}" alt="Temporary product review photo"><button type="button" data-photo-close>Close photo</button></section>`;
    document.body.appendChild(viewer);
    viewer.querySelectorAll("[data-photo-close]").forEach(button=>button.addEventListener("click",closeNeedsReviewPhotoViewer));
}

function nrV2OperationId(){
    if(!globalThis.crypto?.randomUUID) throw new Error("This browser cannot create a secure operation ID");
    return globalThis.crypto.randomUUID();
}

/* One manual Global Master administration renderer.  It uses the same V2
   service as Receiving and Needs Review; it deliberately has no scanner
   listener or legacy learned-mapping fallback. */
function renderV2IdentifierAdministration(overlay,esc=value=>escapeHTML(toSafeString(value))){
    const input=overlay.querySelector("[data-admin-identifier]");
    const workspace=overlay.querySelector("[data-admin-workspace]");
    const load=overlay.querySelector("[data-admin-load]");
    const itemSearch=overlay.querySelector("[data-admin-item-search]");
    const itemLoad=overlay.querySelector("[data-admin-item-load]");
    const clear=overlay.querySelector("[data-admin-clear]");
    if(!input||!workspace||!load) return;
    if(load.dataset.identifierAdminBound==="1") return;
    load.dataset.identifierAdminBound="1";
    if(itemLoad) itemLoad.dataset.identifierAdminBound="1";
    const isGlobalOwner=()=>typeof isSystemOwner==="function"&&isSystemOwner();
    const isCurrentPharmacyAdmin=()=>typeof isPharmacyAdmin==="function"&&isPharmacyAdmin();
    const isReferencePharmacyAdmin=()=>isCurrentPharmacyAdmin()&&toSafeString(AuthState?.context?.pharmacy_code).trim().toUpperCase()==="HHP084";
    const canWriteGlobal=()=>isGlobalOwner()||isReferencePharmacyAdmin();
    let resolved=null, selectedItem=null, pendingIdentifier="";
    const globalNotice=()=>`<p class="needsReviewGlobalNotice">${isCurrentPharmacyAdmin()&&!canWriteGlobal()?"Barcode changes here apply only to this pharmacy.":"Global barcode changes are protected by server permission."}</p>`;
    const reasonField=()=>`<label class="barcodeChangeNote">Change note<textarea data-reason rows="2" placeholder="Short note for the audit record"></textarea></label>`;
    const itemSummary=item=>`<div class="needsReviewMappingCurrent barcodeItemSummary"><span>ITEM</span><strong>${esc(item.item_code||item.itemCode)}</strong><b>${esc(item.item_name||item.itemName||"Unnamed item")}</b></div>`;
    const listIdentifiers=async itemCode=>{
        const identifiers=await IdentifierService.listItemIdentifiers(itemCode);
        return `<div class="needsReviewMappingCompare barcodeList"><span>BARCODES</span>${identifiers.length?identifiers.map(row=>`<strong>${esc(row.identifier_display)}</strong>`).join(""):'<strong>No barcodes are linked to this item.</strong>'}</div>`;
    };
    const bindItemResults=(items,afterSelect)=>{
        workspace.querySelectorAll("[data-global-item]").forEach(button=>button.addEventListener("click",async()=>{
            selectedItem=items[Number(button.dataset.globalItem)]||null;
            workspace.querySelectorAll("[data-global-item]").forEach(node=>node.classList.toggle("selected",node===button));
            if(selectedItem) await afterSelect(selectedItem);
        }));
    };
    const showItem=async(item,{identifier="",mapping=null}={})=>{
        const itemCode=toSafeString(item?.item_code||item?.itemCode);
        if(!itemCode) return;
        selectedItem=item;
        const identifiers=await listIdentifiers(itemCode);
        const hasIdentifier=!!identifier;
        const globalOwner=canWriteGlobal();
        const pharmacyAdmin=isCurrentPharmacyAdmin();
        const pharmacyMapping=mapping?.mappingScope==="PHARMACY";
        const canManage=pharmacyMapping ? pharmacyAdmin : globalOwner;
        const scopeLabel=pharmacyMapping?"THIS PHARMACY":(globalOwner?"GLOBAL":"GLOBAL · READ ONLY");
        const mappingActions=canManage?`
            <div class="needsReviewMappingActions">
                ${hasIdentifier?`<label>Barcode<input value="${esc(identifier)}" readonly></label>`:'<label>New Barcode<input data-new-identifier autocomplete="off" placeholder="Scan or enter barcode"></label>'}
                ${reasonField()}
                <button type="button" data-add>Add Barcode</button>
                ${mapping?`<label>Correct to Item Code<input data-target-code value="${esc(itemCode)}" placeholder="Item Code"></label><button type="button" data-correct>Correct</button><button type="button" class="danger" data-remove>Remove</button>`:""}
            </div>`:(pharmacyAdmin&&hasIdentifier?`
            <div class="needsReviewMappingActions"><label>Barcode<input value="${esc(identifier)}" readonly></label>${reasonField()}<button type="button" data-add-pharmacy>Add for This Pharmacy</button></div>`:globalNotice());
        workspace.innerHTML=`<span class="identifierScopeBadge">${scopeLabel}</span>${itemSummary(item)}${identifiers}${mappingActions}${pharmacyMapping?'<p class="needsReviewGlobalNotice">This barcode override belongs only to the current pharmacy.</p>':''}`;
        if(!canManage&&!pharmacyAdmin) return;
        const reason=()=>toSafeString(workspace.querySelector("[data-reason]")?.value).trim();
        const requireReason=()=>reason()||"Settings barcode management";
        const currentIdentifier=()=>toSafeString(identifier||workspace.querySelector("[data-new-identifier]")?.value).trim();
        const addPharmacy=async event=>{try{const value=currentIdentifier();if(!value) throw new Error("Enter an identifier to map");event.currentTarget.disabled=true;await IdentifierService.addPharmacyIdentifier(nrV2OperationId(),value,item,requireReason());await drawIdentifier();showToast?.("Pharmacy identifier mapping added","success");}catch(error){event.currentTarget.disabled=false;showToast?.(error?.message||"Unable to add pharmacy mapping","error");}};
        workspace.querySelector("[data-add-pharmacy]")?.addEventListener("click",addPharmacy);
        workspace.querySelector("[data-add]")?.addEventListener("click",async event=>{if(pharmacyMapping) return addPharmacy(event);try{const value=currentIdentifier();if(!value) throw new Error("Enter an identifier to map");event.currentTarget.disabled=true;await IdentifierService.addIdentifier(nrV2OperationId(),value,itemCode,requireReason());await drawIdentifier();showToast?.("Global identifier mapping added","success");}catch(error){event.currentTarget.disabled=false;showToast?.(error?.message||"Unable to add mapping","error");}});
        workspace.querySelector("[data-correct]")?.addEventListener("click",async()=>{try{const target=toSafeString(workspace.querySelector("[data-target-code]")?.value).trim();if(!target) throw new Error("Enter the target Item Code");if(!window.confirm("Correct only this identifier mapping? Historical Receiving is unchanged.")) return;if(pharmacyMapping){const candidates=await IdentifierService.searchItems(target,2);const targetItem=candidates.find(row=>toSafeString(row.item_code)===target);if(!targetItem) throw new Error("Select a valid Global Item Code");await IdentifierService.correctPharmacyIdentifier(nrV2OperationId(),mapping.identifierId,mapping.mappingRevision,targetItem,requireReason());}else await IdentifierService.correctIdentifier(nrV2OperationId(),mapping.identifierId,mapping.mappingRevision,target,requireReason());await drawIdentifier();showToast?.("Identifier mapping corrected","success");}catch(error){showToast?.(error?.message||"Unable to correct mapping","error");}});
        workspace.querySelector("[data-remove]")?.addEventListener("click",async()=>{try{if(!window.confirm("Remove only this identifier mapping? The Item and sibling identifiers remain.")) return;if(pharmacyMapping) await IdentifierService.removePharmacyIdentifier(nrV2OperationId(),mapping.identifierId,mapping.mappingRevision,requireReason());else await IdentifierService.removeIdentifier(nrV2OperationId(),mapping.identifierId,mapping.mappingRevision,requireReason());workspace.innerHTML="<div class=\"needsReviewAdminSuccess\">Identifier mapping removed. The Item and sibling identifiers were preserved.</div>";showToast?.("Identifier mapping removed","success");}catch(error){showToast?.(error?.message||"Unable to remove mapping","error");}});
    };
    const renderItemSearch=async(query,{forUnmappedIdentifier=false}={})=>{
        const value=toSafeString(query).trim();
        if(!value){showToast?.("Enter an Item Code or Item Name","warning");itemSearch?.focus();return;}
        const items=await IdentifierService.searchItems(value,12);
        workspace.innerHTML=items.length?`<div class="needsReviewNoMatches">Select the item.</div><div class="needsReviewMatches">${items.map((item,index)=>`<button type="button" data-global-item="${index}"><span><strong>${esc(item.item_code)}</strong><small>${esc(item.item_name||"Unnamed item")}</small></span></button>`).join("")}</div>`:`<div class="needsReviewNoMatches">No Global Item matches that Item Code or Item Name.</div>`;
        bindItemResults(items,item=>showItem(item,{identifier:forUnmappedIdentifier?pendingIdentifier:"",mapping:null}));
    };
    const renderUnmapped=()=>{
        const globalOwner=canWriteGlobal(), pharmacyAdmin=isCurrentPharmacyAdmin();
        if(!globalOwner&&!pharmacyAdmin){workspace.innerHTML=`<div class="needsReviewNoMatches">No mapping exists for this identifier.</div>${globalNotice()}`;return;}
        workspace.innerHTML=`<div class="needsReviewNoMatches">No mapping exists for <b>${esc(pendingIdentifier)}</b>. Search the item catalogue, then deliberately add a ${globalOwner?"Global":"current pharmacy"} mapping.</div><div class="needsReviewMappingActions"><label>Item Code / Item Name<input data-global-search placeholder="Search items"></label>${reasonField()}<div data-global-results></div><button type="button" data-add-existing disabled>${globalOwner?"Add Global Mapping":"Add Pharmacy Mapping"} to Selected Item</button>${globalOwner?'<label>New Item Code<input data-new-code placeholder="New Item Code"></label><label>New Item Name<input data-new-name placeholder="New Item Name"></label><button type="button" data-create>Add New Item &amp; First Identifier</button>':''}</div>`;
        let selected=null;
        const search=workspace.querySelector("[data-global-search]");
        const results=workspace.querySelector("[data-global-results]");
        const addExisting=workspace.querySelector("[data-add-existing]");
        search?.addEventListener("input",async()=>{const query=toSafeString(search.value).trim();selected=null;if(addExisting)addExisting.disabled=true;if(!query){results.innerHTML="";return;}try{const items=await IdentifierService.searchItems(query,12);results.innerHTML=items.map((item,index)=>`<button type="button" data-global-item="${index}">${esc(item.item_code)} — ${esc(item.item_name)}</button>`).join("")||"<div class=\"needsReviewNoMatches\">No Global Item found.</div>";results.querySelectorAll("[data-global-item]").forEach(button=>button.addEventListener("click",()=>{selected=items[Number(button.dataset.globalItem)]||null;results.querySelectorAll("button").forEach(node=>node.classList.toggle("selected",node===button));if(addExisting)addExisting.disabled=!selected;}));}catch(error){showToast?.(error?.message||"Unable to search Global Master","error");}});
        const reason=()=>toSafeString(workspace.querySelector("[data-reason]")?.value).trim();
        addExisting?.addEventListener("click",async event=>{if(!selected){showToast?.("Select an Item","warning");return;}event.currentTarget.disabled=true;try{if(globalOwner) await IdentifierService.addIdentifier(nrV2OperationId(),pendingIdentifier,selected.item_code,reason()||"Settings barcode management");else await IdentifierService.addPharmacyIdentifier(nrV2OperationId(),pendingIdentifier,selected,reason()||"Settings barcode management");await drawIdentifier();showToast?.("Identifier mapping added","success");}catch(error){event.currentTarget.disabled=false;showToast?.(error?.message||"Unable to add mapping","error");}});
        workspace.querySelector("[data-create]")?.addEventListener("click",async event=>{const code=toSafeString(workspace.querySelector("[data-new-code]")?.value).trim();const name=toSafeString(workspace.querySelector("[data-new-name]")?.value).trim();if(!code||!name){showToast?.("Item Code and Item Name are required","warning");return;}event.currentTarget.disabled=true;try{await IdentifierService.createItem(nrV2OperationId(),{itemCode:code,itemName:name,identifierDisplay:pendingIdentifier,reason:reason()||"Settings barcode management"});await drawIdentifier();showToast?.("Global Item and first identifier created","success");}catch(error){event.currentTarget.disabled=false;showToast?.(error?.message||"Unable to create Global Item","error");}});
    };
    const drawIdentifier=async()=>{
        pendingIdentifier=toSafeString(input.value).trim();
        if(!pendingIdentifier){showToast?.("Enter an identifier","warning");input.focus();return;}
        load.disabled=true;
        try{
            resolved=await IdentifierService.resolve(pendingIdentifier);
            if(!resolved?.found){
                renderUnmapped();
                return;
            }
            await showItem({item_code:resolved.itemCode,item_name:resolved.itemName},{identifier:pendingIdentifier,mapping:resolved});
        }catch(error){workspace.innerHTML="";showToast?.(error?.message||"Unable to load Global Master mapping","error");}
        finally{load.disabled=false;}
    };
    load.addEventListener("click",drawIdentifier);
    input.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();drawIdentifier();}});
    itemLoad?.addEventListener("click",()=>renderItemSearch(itemSearch?.value));
    itemSearch?.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();renderItemSearch(itemSearch.value);}});
    clear?.addEventListener("click",()=>{input.value="";if(itemSearch)itemSearch.value="";workspace.innerHTML="";resolved=null;selectedItem=null;pendingIdentifier="";input.focus();});
}

setTimeout(()=>{
    const settingsMaster=document.getElementById("globalIdentifierMasterAdmin");
    if(settingsMaster) renderV2IdentifierAdministration(settingsMaster);
},600);

async function openNeedsReviewPanel(workflow="RECEIVING"){
    const handheld=typeof isLikelyZebraDevice==="function"&&isLikelyZebraDevice();
    closeNeedsReviewPhotoViewer();
    const previousPanel=document.getElementById("needsReviewOverlay");
    previousPanel?.disposeFocus?.();
    previousPanel?.remove();

    let rawRows=[];
    try{ rawRows=await loadNeedsReviewRows(workflow,null); if(!handheld) rawRows=filterNeedsReviewRowsToPcScope(rawRows); }
    catch(error){ showToast?.(error?.message||"Unable to load Needs Review","error"); return; }

    const groups=groupNeedsReviewRows(rawRows);
    const esc=value=>escapeHTML(toSafeString(value));
    const admin=typeof isPharmacyAdmin==="function"&&isPharmacyAdmin();
    const overlay=document.createElement("div");
    overlay.id="needsReviewOverlay";
    overlay.className="needsReviewOverlay";
    overlay.setAttribute("role","dialog");
    overlay.setAttribute("aria-modal","true");
    overlay.setAttribute("aria-labelledby","needsReviewTitle");
    overlay.innerHTML=`
      <button class="needsReviewScrim" data-review-close aria-label="Close Needs Review"></button>
      <section class="needsReviewPanel">
        <header>
          <div><span class="needsReviewKicker">RECEIVING EXCEPTIONS</span><h2 id="needsReviewTitle">Needs Review <b class="pfnReviewCount">${groups.length}</b></h2><div class="pfnReviewTotals"><span><b>${groups.length}</b> Items</span><span><b>${groups.reduce((sum,group)=>sum+Math.max(0,Number(group.total_quantity||0)||0),0)}</b> Total Units</span></div><p>Find the item once. PharmFlow will allocate the quantity to the correct active Orders automatically.</p></div>
          <div class="needsReviewHeaderActions"><button type="button" data-review-back hidden>← Back</button><button type="button" data-review-history>History</button><button class="needsReviewClose" type="button" data-review-close aria-label="Close Needs Review">Close</button></div>
        </header>
        <div class="needsReviewList" data-review-list>
          ${groups.length?groups.map((group,index)=>`
            <section class="needsReviewRow" data-i="${index}">
              <button type="button" class="needsReviewRowSummary" data-review-detail="${index}" aria-expanded="false" aria-controls="needsReviewCase-${index}">
                <strong>${esc(group.gtin||"Identifier unavailable")}</strong><span>${group.work_scope_order_numbers.length} Active Order${group.work_scope_order_numbers.length===1?"":"s"}</span><b>Qty ${esc(group.total_quantity)}</b><span>Pending</span><i aria-hidden="true">›</i>
              </button>
              <div class="needsReviewCaseDetail" id="needsReviewCase-${index}" data-review-case-detail="${index}" hidden>
              <div class="needsReviewInfo">
                <span class="pfnReviewReason">${group.review_reason==="KNOWN_NOT_IN_ORDER"?"KNOWN ITEM · NOT IN ORDER":"ITEM NOT RECOGNISED"}</span>
                <div class="capturedIdentifier"><span class="pfnReviewLabel">CAPTURED IDENTIFIER</span><strong class="pfnReviewGTIN">${esc(group.gtin)}</strong><button type="button" data-copy-identifier="${index}">Copy</button></div>
                <div class="pfnReviewMeta">
                  <div class="important"><span>Quantity</span><b>${group.total_quantity}</b></div>
                  <div class="important"><span>Entries</span><b>${group.rows.length}</b></div>
                  <div><span>Source</span><b>${esc(group.source||"Unknown")}</b></div>
                  <div><span>Captured Scope</span><b>${esc(group.work_scope_order_numbers.length||1)} Order${group.work_scope_order_numbers.length===1?"":"s"}</b></div>
                </div>
                ${group.photos.length?`<div class="pfnReviewPhotoGrid">${group.photos.map((path,pidx)=>`<button type="button" data-photo-open="${index}:${pidx}"><img data-photo="${index}:${pidx}" alt="Temporary product photo" hidden><span>View temporary photo</span></button>`).join("")}</div>`:""}
              </div>
              <div class="needsReviewResolve">
                <label>Find Item<input type="search" data-search="${index}" placeholder="Item Code or Item Name" autocomplete="off" spellcheck="false"></label>
                <small class="needsReviewAutoAllocationHint">Automatic allocation across captured active Orders · no Order selection required.</small>
                <button class="needsReviewClear" type="button" data-clear-review="${index}">Clear</button>
                <div class="needsReviewMatches" data-matches="${index}"></div>
                <div class="needsReviewSelection" data-selection="${index}" hidden></div>
                <button class="needsReviewCancel" type="button" data-cancel-review="${index}">Cancel Review</button>
              </div>
              </div>
            </section>`).join(""):`<div class="needsReviewEmpty">Nothing needs review.</div>`}
        </div>
      </section>`;
    document.body.appendChild(overlay);

    const focusLifecycle=new AbortController();
    let pendingSearchFocus=null;
    overlay.disposeFocus=()=>{pendingSearchFocus=null;focusLifecycle.abort();};
    const restoreSearchFocus=()=>{
        if(document.hidden||!pendingSearchFocus?.isConnected||overlay.dataset.busy==="1")return;
        pendingSearchFocus.focus({preventScroll:true});
        pendingSearchFocus=null;
    };
    window.addEventListener("focus",restoreSearchFocus,{signal:focusLifecycle.signal});
    document.addEventListener("visibilitychange",restoreSearchFocus,{signal:focusLifecycle.signal});

    const closePanel=()=>{
        if(overlay.dataset.busy==="1"||overlay.dataset.confirming==="1") return;
        closeNeedsReviewPhotoViewer();
        overlay.disposeFocus();
        overlay.remove();
        if(handheld) focusScannerInput?.();
    };
    overlay.querySelectorAll("[data-review-close]").forEach(button=>button.addEventListener("click",closePanel));
    const historyButton=overlay.querySelector("[data-review-history]");
    const backButton=overlay.querySelector("[data-review-back]");
    backButton?.addEventListener("click",()=>{ closePanel(); openNeedsReviewPanel(workflow); });
    historyButton?.addEventListener("click",async()=>{
        pendingSearchFocus=null;
        const list=overlay.querySelector("[data-review-list]");if(!list)return;
        try{
            const history=await nrV3ListHistory?.(workflow,null)||[];
            if(backButton) backButton.hidden=false;
            if(historyButton) historyButton.hidden=true;
            list.innerHTML=history.length?`<div class="phase263TableWrap"><table class="quickKpiTable phase263Table"><thead><tr><th>Status</th><th>Updated</th><th>Identifier</th><th>Order</th><th>Quantity</th><th>Photo</th></tr></thead><tbody>${history.slice().sort((a,b)=>String(b.updated_at||b.created_at||"").localeCompare(String(a.updated_at||a.created_at||""))).map(row=>`<tr><td><b>${esc(row.status||"PENDING")}</b></td><td>${esc(typeof formatDateTime==="function"?formatDateTime(row.updated_at||row.created_at):row.updated_at||row.created_at||"—")}</td><td>${esc(row.identifier_display||row.gtin||"—")}</td><td>${esc(row.order_number||"—")}</td><td>${esc(row.pending_quantity||1)}</td><td>${row.photo_path?"Photo retained":"—"}</td></tr>`).join("")}</tbody></table></div>`:'<div class="needsReviewEmpty">No Needs Review history.</div>';
        }catch(error){showToast?.(error?.message||"Unable to load Needs Review history","error");}
    });

    groups.forEach((group,index)=>{
        const section=overlay.querySelector(`[data-i="${index}"]`);
        const detail=section.querySelector("[data-review-case-detail]");
        const summary=section.querySelector("[data-review-detail]");
        summary.addEventListener("click",()=>{
            detail.hidden=!detail.hidden;
            summary.setAttribute("aria-expanded",String(!detail.hidden));
        });
        const search=overlay.querySelector(`[data-search="${index}"]`);
        const matches=overlay.querySelector(`[data-matches="${index}"]`);
        const selection=overlay.querySelector(`[data-selection="${index}"]`);
        const cancelReview=overlay.querySelector(`[data-cancel-review="${index}"]`);
        const clearReview=overlay.querySelector(`[data-clear-review="${index}"]`);
        let selectedItem=null;
        overlay.querySelector(`[data-copy-identifier="${index}"]`)?.addEventListener("click",async event=>{
            try{
                if(!navigator.clipboard?.writeText)throw new Error("Clipboard unavailable");
                await navigator.clipboard.writeText(group.gtin);
                showToast?.("Identifier copied","success");
                pendingSearchFocus=search;
                search?.focus();
            }catch(_){showToast?.("Copy is unavailable; select the identifier and copy it manually.","warning");}
        });

        cancelReview?.addEventListener("click",async()=>{
            if(!window.confirm(`Cancel this Needs Review group for GTIN ${group.gtin}?\n\nThis will not learn the GTIN or change any received quantity.`)) return;
            const reason=toSafeString(window.prompt("Reason required: Wrong Scan, Test Entry, Item Cancelled, or Other")||"").trim();
            if(!reason){showToast?.("A cancellation reason is required","warning");return;}
            cancelReview.disabled=true; overlay.dataset.busy="1";
            try{
                /* The current V2 delete RPC has no reason field. Deletion is
                   intentionally limited to the exact rows in this displayed
                   GTIN/order/reason group; Storage objects are intentionally preserved until a verified lifecycle policy exists. */
                for(const row of group.rows) await nrV2Delete(row.review_id);
                section.remove(); await refreshNeedsReviewCounters();
                const count=overlay.querySelectorAll(".needsReviewRow").length;
                const countNode=overlay.querySelector(".pfnReviewCount");
                if(countNode) countNode.textContent=String(count);
                if(count===0) overlay.querySelector("[data-review-list]").innerHTML='<div class="needsReviewEmpty">Nothing needs review.</div>';
                showToast?.(`Needs Review cancelled — ${reason}`,"success");
            }catch(error){cancelReview.disabled=false;showToast?.(error?.message||"Unable to cancel review","error");}
            finally{overlay.dataset.busy="";}
        });

        group.photos.forEach((path,pidx)=>nrV2HydratePhoto(overlay.querySelector(`[data-photo="${index}:${pidx}"]`),path));
        group.photos.forEach((path,pidx)=>overlay.querySelector(`[data-photo-open="${index}:${pidx}"]`)?.addEventListener("click",async()=>{
            try{
                const url=await nrV2PhotoObjectUrl(path);
                if(!url) throw new Error("Photo is unavailable");
                openNeedsReviewPhotoViewer(url);
            }catch(error){ showToast?.(error?.message||"Unable to open review photo","error"); }
        }));

        const drawSelection=()=>{
            if(!selectedItem){ selection.hidden=true;selection.innerHTML="";return; }
            selection.hidden=false;
            const preview=nrV2AllocationPreview(group,selectedItem);
            selection.innerHTML=`<span class="needsReviewSelectionLabel">SELECTED ITEM</span><div>${nrV2ItemSummary(selectedItem,esc)}</div><small class="needsReviewAllocationPreview">${group.total_quantity} unit${group.total_quantity===1?"":"s"} → ${preview.orderCount} active Order${preview.orderCount===1?"":"s"}</small><button type="button" data-resolve>Link &amp; Receive</button>`;
            selection.querySelector("[data-resolve]").addEventListener("click",async event=>{
                const button=event.currentTarget;
                button.disabled=true;
                overlay.dataset.busy="1";
                try{
                    const outcome=await nrV2ResolveGroupToOrderItem(group,selectedItem);
                    if(outcome.pending){
                        button.textContent="Processing…";
                        /* Processing state lives on the action itself. Do not
                           emit a second warning toast for the normal durable
                           queue path; successful completion owns the single
                           user-facing toast below. */
                        const reviewIds=new Set(group.rows.map(row=>toSafeString(row?.review_id||"")).filter(Boolean));
                        let resolved=false;
                        for(let attempt=0;attempt<6;attempt++){
                            await new Promise(resolve=>setTimeout(resolve,500));
                            const pendingRows=await nrV2List(workflow,null);
                            if(!pendingRows.some(row=>reviewIds.has(toSafeString(row?.review_id||"")))){
                                resolved=true;
                                break;
                            }
                        }
                        if(!resolved){
                            button.textContent="Processing — Close & reopen to refresh";
                            showToast?.("Receipt is still processing. Do not press Link & Resolve again.","warning");
                            return;
                        }
                    }
                    section.remove();
                    await refreshNeedsReviewCounters();
                    const count=overlay.querySelectorAll(".needsReviewRow").length;
                    const countNode=overlay.querySelector(".pfnReviewCount");
                    if(countNode) countNode.textContent=String(count);
                    if(count===0) overlay.querySelector("[data-review-list]").innerHTML='<div class="needsReviewEmpty">Nothing needs review.</div>';
                    showToast?.(`Linked & received — ${group.total_quantity} units`,"success");
                }catch(error){ button.disabled=false;showToast?.(error?.message||"Unable to resolve review","error"); }
                finally{ overlay.dataset.busy=""; }
            });
        };
        const drawMatches=()=>{
            selectedItem=null;
            drawSelection();
            const q=toSafeString(search?.value||"").trim();
            if(!q){matches.innerHTML="";return;}
            const items=nrV2FindOrderMatches(q,nrV2AllocationScope(group)).slice(0,8);
            matches.innerHTML=items.length?items.map((item,itemIndex)=>`<button type="button" data-match="${itemIndex}">${nrV2ItemSummary(item,esc)}</button>`).join(""):`<div class="needsReviewNoMatches">No matching item in the captured active Orders.</div>`;
            matches.querySelectorAll("[data-match]").forEach(button=>button.addEventListener("click",()=>{
                selectedItem=items[Number(button.dataset.match)]||null;
                matches.querySelectorAll("button").forEach(result=>result.classList.toggle("selected",result===button));
                drawSelection();
            }));
        };
        search?.addEventListener("input",drawMatches);
        clearReview?.addEventListener("click",()=>{if(search)search.value="";selectedItem=null;matches.innerHTML="";drawSelection();search?.focus();});
    });

    if(!handheld) overlay.querySelector("[data-review-detail=\"0\"]")?.focus();


    overlay.addEventListener("keydown",event=>{
        if(event.key!=="Escape"||overlay.dataset.busy==="1") return;
        if(document.getElementById("needsReviewPhotoViewer")){closeNeedsReviewPhotoViewer();event.stopPropagation();return;}
        closePanel();
    });
}

window.refreshNeedsReviewCounters=refreshNeedsReviewCounters;

/* B11: lightweight cross-device Needs Review awareness.
   Full review rows are fetched only when the PC panel is opened; the watcher
   asks Supabase for a tiny count so a Handheld submission becomes visible on
   the PC without refreshing the whole workspace. */
let needsReviewCloudWatchTimer=null;
let needsReviewCloudWatchBusy=false;
let needsReviewCloudLastReadAt=0;
async function refreshNeedsReviewCountFromCloud({force=false}={}){
    if(window.PharmFlowIdleSleep?.active) return;
    if(typeof isLikelyZebraDevice==="function" && isLikelyZebraDevice()) return;
    if(document.hidden || needsReviewCloudWatchBusy || typeof nrV2Count!=="function") return;
    const now=Date.now();
    /* B10 Clean20 — Needs Review awareness remains live, but idle PC tabs no
       longer hit Supabase every 6 seconds. Focus/visibility calls are also
       deduped so mobile browsers cannot double-fire the same count request. */
    if(!force && now-needsReviewCloudLastReadAt<25000) return;
    needsReviewCloudWatchBusy=true;
    needsReviewCloudLastReadAt=now;
    try{
        /* Cloud count is pharmacy-wide. PC display must remain selected-order scoped. */
        await refreshNeedsReviewCounters();
    }catch(error){
        Logger?.warn?.("Needs Review count sync failed",error);
    }finally{
        needsReviewCloudWatchBusy=false;
    }
}
function startNeedsReviewCloudWatch(){
    if(typeof isLikelyZebraDevice==="function" && isLikelyZebraDevice()) return;
    clearInterval(needsReviewCloudWatchTimer);
    refreshNeedsReviewCountFromCloud({force:true});
    needsReviewCloudWatchTimer=setInterval(refreshNeedsReviewCountFromCloud,30000);
}
window.startNeedsReviewCloudWatch=startNeedsReviewCloudWatch;
window.addEventListener("focus",()=>refreshNeedsReviewCountFromCloud());
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) refreshNeedsReviewCountFromCloud(); });
setTimeout(startNeedsReviewCloudWatch,1200);
window.openNeedsReviewPanel=openNeedsReviewPanel;

function refreshOrderScopeControl(){
    const host=document.querySelector('.currentReceivingCard, .dashboardWorkspaceCard, .dashboardHeader') || document.querySelector('#dashboardPage');
    if(!host) return;
    let wrap=document.getElementById('orderScopeControl');
    const files=Array.isArray(AppState.workspace?.orderFiles)?AppState.workspace.orderFiles:[];
    const orders=Array.from(new Set(files.map(f=>normalizeOrderNumber(f.documentId||f.orderNumber||'')).filter(Boolean)));
    if(!orders.length){
        wrap?.remove();
        return;
    }
    if(!wrap){
        wrap=document.createElement('div'); wrap.id='orderScopeControl'; wrap.className='orderScopeControl';
        host.appendChild(wrap);
    }
    const current=getActiveOrderScope();
    if(current!=='ALL' && !orders.includes(current)) window.PharmFlowOrderScope='ALL';
    wrap.innerHTML=`<label>Order View</label><select id="orderScopeSelect"><option value="ALL">All Active Orders</option>${orders.map(o=>`<option value="${escapeHtml(o)}" ${getActiveOrderScope()===o?'selected':''}>${escapeHtml(o)}</option>`).join('')}</select>`;
    wrap.querySelector('select').onchange=e=>{ window.PharmFlowOrderScope=e.target.value||'ALL'; refreshDashboard(); refreshOpenKpiPanel(); };
}

AppEvents.on('workspace:saved',()=>setTimeout(refreshOrderScopeControl,0));
AppEvents.on('receiving:updated',()=>setTimeout(refreshOrderScopeControl,0));
window.addEventListener('auth:context-ready',()=>setTimeout(refreshOrderScopeControl,250));
setTimeout(refreshOrderScopeControl,800);
function setupPhase263ActionDelegation(){
    if(document.documentElement.dataset.phase263ActionsBound==="1") return;
    document.documentElement.dataset.phase263ActionsBound="1";
    document.addEventListener("click",event=>{
        /* Phase 2C.7.6: Dashboard Search Item and Receiving Search are one
           workflow. Capture binding prevents an older page-specific handler
           from opening a different/stale search implementation. */
        const unifiedSearch=event.target.closest?.("#btnReceivingSearch");
        if(unifiedSearch){
            event.preventDefault();
            event.stopImmediatePropagation?.();
            openItemSearchModal();
            return;
        }
        const received=event.target.closest?.("#btnReceivedItems");
        if(received){event.preventDefault();openDashboardKpiPanel("received");return;}
    },true);
}


/* =====================================================
   PHASE 2C.6.2 — DATA HEALTH + MULTI-ORDER CONTROL
===================================================== */
function openCurrentMissingGTINPanel(){
    const rows=typeof getItemsWithoutMapping==="function"?getItemsWithoutMapping():[];
    document.getElementById("currentMissingGTINOverlay")?.remove();
    const overlay=document.createElement("div");overlay.id="currentMissingGTINOverlay";overlay.className="quickKpiOverlay";
    const esc=typeof escapeHTML==="function"?escapeHTML:(v=>String(v??""));
    overlay.innerHTML=`<div class="quickKpiPanel"><div class="quickKpiHeader"><h3>Missing GTIN — Current Workspace</h3><button type="button" class="quickKpiClose" data-close>✕</button></div>${rows.length?`<table class="quickKpiTable"><thead><tr><th>Item Code</th><th>Item Name</th><th>Ordered</th></tr></thead><tbody>${rows.map(i=>`<tr><td>${esc(i.itemCode)}</td><td><b>${esc(i.itemName)}</b></td><td>${toNumber(i.orderedQty,0)}</td></tr>`).join("")}</tbody></table>`:`<div class="quickKpiEmpty">No missing GTIN items in the current workspace.</div>`}</div>`;
    document.body.appendChild(overlay);
    window.PharmFlowModalStack?.open(overlay);
    const close=()=>{window.PharmFlowModalStack?.close(overlay);overlay.remove();};
    overlay.querySelector('[data-close]').onclick=close;overlay.onclick=e=>{if(e.target===overlay)close();};
}

async function requestRemoveActiveOrderFile(fileId){
    const files=Array.isArray(AppState?.workspace?.orderFiles)?AppState.workspace.orderFiles:[];
    const file=files.find(f=>f.id===fileId);
    if(!file)return;

    const orderNumber=typeof normalizeOrderNumber==="function"
        ? normalizeOrderNumber(file.documentId||file.orderNumber||"")
        : toSafeString(file.documentId||"");
    if(!orderNumber){
        showToast("Unable to identify this active Order Number","error");
        return;
    }

    /* B10 Clean 8 — REMOVE is a structural, order-scoped operation.
       Source contribution comes from the active file's embedded sourceRows
       first. This is the same source used by order/report filtering and avoids
       relying on a historical/server snapshot that may be absent or delayed. */
    let sourceRows=[];
    try{
        sourceRows=typeof getWorkspaceOrderSourceRows==="function"
            ? (getWorkspaceOrderSourceRows(orderNumber)||[])
            : [];
    }catch(_){ sourceRows=[]; }
    if(!sourceRows.length){
        try{
            sourceRows=typeof getOriginalUploadedOrderSnapshot==="function"
                ? (await getOriginalUploadedOrderSnapshot(orderNumber)||[])
                : [];
        }catch(_){ sourceRows=[]; }
    }

    const targetMembership=(item)=>{
        const memberships=(Array.isArray(item?.orderNumbers)?item.orderNumbers:[])
            .map(normalizeOrderNumber)
            .filter(Boolean);
        return memberships.includes(orderNumber);
    };

    /* Transactions created by older builds did not always stamp orderNumber.
       If an item belongs to exactly one active order, attribution is still
       deterministic and safe. Shared-item transactions without an explicit
       order are deliberately NOT guessed. */
    const activeOrders=files
        .map(f=>normalizeOrderNumber(f.documentId||f.orderNumber||""))
        .filter(Boolean);
    const perOrderTransactions=(Array.isArray(AppState?.workspace?.receivingHistory)
        ? AppState.workspace.receivingHistory
        : []).filter(tx=>{
            const explicit=normalizeOrderNumber(tx?.selectedOrderNumber||tx?.orderNumber||tx?.orderId||"");
            if(explicit)return explicit===orderNumber;
            const item=typeof getItemByCode==="function"?getItemByCode(normalizeItemCode(tx?.itemCode||"")):null;
            const memberships=(Array.isArray(item?.orderNumbers)?item.orderNumbers:[])
                .map(normalizeOrderNumber)
                .filter(n=>activeOrders.includes(n));
            return memberships.length===1 && memberships[0]===orderNumber;
        });

    const receivedUnits=perOrderTransactions.reduce((sum,tx)=>sum+Number(tx?.quantity||0),0);
    const reviewRows=await loadNeedsReviewRows("RECEIVING",orderNumber).catch(()=>[]);
    const hasOperationalData=Math.abs(receivedUnits)>0 || reviewRows.length>0;
    const message=hasOperationalData
        ? `Remove ${orderNumber}?\n\nThis permanently removes THIS active order from Receiving, including its receiving quantities/scans and unresolved Needs Review cases. Other active orders are not affected.`
        : `Remove ${orderNumber} from Active Receiving?\n\nOther active orders are not affected.`;

    showConfirmModal("Remove Active Order",message,async()=>{
        try{
            showLoading("Removing order...");

            if(typeof authRpc!=="function" || typeof AuthState==="undefined" || !AuthState.context?.pharmacy_id){
                throw new Error("Pharmacy cloud context is unavailable. Sign in again before removing the order.");
            }
            if(!sourceRows.length){
                throw new Error("Order source data could not be resolved safely. No data was removed.");
            }

            /* Server structural authority first. If this fails, local state is
               untouched and no success message can be shown. */
            await authRpc("discard_pharmflow_active_order",{
                p_pharmacy_id:AuthState.context.pharmacy_id,
                p_order_number:orderNumber,
                p_confirmation:orderNumber
            });

            /* Temporary review evidence belongs to this active order only. */
            for(const row of reviewRows){
                try{
                    if(row?.review_id && typeof nrV2Delete==="function")await nrV2Delete(row.review_id);
                }catch(reviewError){
                    Logger.warn?.("Temporary review cleanup failed after active-order removal",reviewError);
                }
            }

            /* Remove received contribution first, then ordered contribution. */
            perOrderTransactions.forEach(tx=>{
                const item=typeof getItemByCode==="function"?getItemByCode(normalizeItemCode(tx?.itemCode||"")):null;
                if(!item)return;
                item.receivedQty=Math.max(0,Number(item.receivedQty||0)-Number(tx?.quantity||0));
                if(typeof updateItemCalculatedFields==="function")updateItemCalculatedFields(item);
            });

            sourceRows.forEach(row=>{
                const code=normalizeItemCode(row?.item_code||row?.itemCode||"");
                const item=typeof getItemByCode==="function"?getItemByCode(code):null;
                if(!item)return;
                item.orderedQty=Math.max(0,Number(item.orderedQty||0)-Number(row?.ordered_qty??row?.orderedQty??0));
                if(Array.isArray(item.orderNumbers)){
                    item.orderNumbers=item.orderNumbers.filter(n=>normalizeOrderNumber(n)!==orderNumber);
                }
                if(normalizeOrderNumber(item.orderNumber||"")===orderNumber){
                    const surviving=(item.orderNumbers||[]).map(normalizeOrderNumber).filter(Boolean);
                    item.orderNumber=surviving[0]||"";
                }
                if(typeof updateItemCalculatedFields==="function")updateItemCalculatedFields(item);
            });

            AppState.workspace.receivingHistory=(AppState.workspace.receivingHistory||[])
                .filter(tx=>!perOrderTransactions.includes(tx));
            AppState.workspace.orderFiles=files.filter(f=>f.id!==fileId);
            AppState.workspace.orderData=(AppState.workspace.orderData||[]).filter(item=>
                !(Number(item.orderedQty||0)<=0 && Number(item.receivedQty||0)<=0 && item.manual!==true)
            );

            const remaining=AppState.workspace.orderFiles
                .map(f=>normalizeOrderNumber(f.documentId||f.orderNumber||""))
                .filter(Boolean);
            AppState.workspace.selectedOrderNumbers=remaining.slice();
            AppState.workspace.selectedOrderNumber=remaining.length===1?remaining[0]:(remaining.length?"ALL":"");
            AppState.workspace.orderName=remaining.length===1?remaining[0]:(remaining.length?remaining.join(" + "):"");
            AppState.workspace.active=remaining.length>0;

            if(typeof ReceivingEngine!=="undefined"){
                ReceivingEngine.recentScans=(ReceivingEngine.recentScans||[]).filter(tx=>{
                    const explicit=normalizeOrderNumber(tx?.selectedOrderNumber||tx?.orderNumber||tx?.orderId||"");
                    if(explicit)return explicit!==orderNumber;
                    const item=typeof getItemByCode==="function"?getItemByCode(normalizeItemCode(tx?.itemCode||"")):null;
                    return !targetMembership(item);
                });
                const last=ReceivingEngine.lastTransaction;
                const lastOrder=normalizeOrderNumber(last?.selectedOrderNumber||last?.orderNumber||last?.orderId||"");
                if(lastOrder===orderNumber)ReceivingEngine.lastTransaction=null;
            }

            if(typeof rebuildStateIndexes==="function")rebuildStateIndexes();
            if(typeof recalculateStatistics==="function")recalculateStatistics();

            /* Local persistence does not announce a separate "Workspace saved"
               toast. More importantly, REMOVE must update the full cloud
               workspace even when the last order was removed. Normal autosave
               intentionally skips empty workspaces and was the root cause of
               the deleted order being hydrated back into Manage Orders. */
            if(typeof saveWorkspaceSnapshot==="function")saveWorkspaceSnapshot();

            if(typeof syncReceivingStructureAfterChange!=="function"){
                throw new Error("Structural receiving synchronization is unavailable. Reload and try again.");
            }
            const structureSaved=await syncReceivingStructureAfterChange("Active order removal synchronized");
            if(structureSaved!==true){
                throw new Error("The server did not confirm removal from the Active Order Manifest. No success was recorded. Reload before continuing.");
            }

            /* Re-read the structural authority before success. This prevents a
               stale Active Order Manifest from silently re-hydrating the order
               after the green toast. Empty server state is authoritative. */
            if(typeof pullActiveOrderManifest==="function"){
                await pullActiveOrderManifest({clearIfMissing:remaining.length===0});
            }
            if(typeof verifyActiveOrderManifestMatchesLocal==="function"){
                const verified=await verifyActiveOrderManifestMatchesLocal();
                if(verified!==true){
                    throw new Error("Active Order removal verification failed. Reload before continuing.");
                }
            }

            if(typeof refreshOrderLifecycleRegistry==="function")await refreshOrderLifecycleRegistry();
            if(typeof refreshEntireUI==="function")refreshEntireUI();
            if(typeof refreshNeedsReviewCounters==="function")await refreshNeedsReviewCounters();

            showToast(
                `${orderNumber} removed successfully. ${remaining.length} active order(s) remain.`,
                "success",
                9000
            );
        }catch(error){
            Logger.error("Remove active order failed",error);
            showToast(error?.message||"Unable to remove order","error",10000);
        }finally{
            hideLoading();
        }
    });
}

/* PharmFlow 2C.9 — handheld quantity semantics.
   Manual entry is ADDITIONAL quantity, not total quantity. */
function refreshHandheldQuantityGuidance(){
    const hint=document.getElementById("handheldQtyHint");
    if(!hint) return;
    const receivedEl=document.getElementById("lastReceived");
    const remainingEl=document.getElementById("lastRemaining");
    const deviceEl=document.getElementById("lastThisPcQty") || document.getElementById("lastThisDeviceQty");
    const d=deviceEl ? (deviceEl.textContent||"0").trim() : "0";
    const r=remainingEl ? (remainingEl.textContent||"0").trim() : "0";
    hint.textContent=`Scanned on this device: ${d} • Remaining to order: ${r}`;
}

if(typeof AppEvents!=="undefined"&&AppEvents?.on){
    AppEvents.on("route:changed",payload=>{
        setTimeout(()=>{
            ensureNeedsReviewButtons();
            refreshNeedsReviewCounters();
            if(payload?.routeName==="expiry"){
                refreshNeedsReviewCounters();
            }
        },30);
    });
    AppEvents.on("receiving:updated",()=>setTimeout(refreshNeedsReviewCounters,30));
}


if(typeof AppEvents !== "undefined"){
    try{
        AppEvents.on?.("workspace:updated",()=>setTimeout(()=>ensurePcClearScreenButton?.(),20));
        AppEvents.on?.("receiving:updated",()=>setTimeout(()=>ensurePcClearScreenButton?.(),20));
        AppEvents.on?.("scan:processed",()=>setTimeout(()=>ensurePcClearScreenButton?.(),20));
    }catch(_){}
}
