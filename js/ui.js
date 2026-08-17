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
        category:"all"
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

}


/* =====================================================
   SMART SEARCH INPUT
===================================================== */

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
            getSearchableItems(),
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
            <div class="smartSearchResultQty">
                <span>${toNumber(item.receivedQty,0)} / ${toNumber(item.orderedQty,0)}</span>
                <small>Received</small>
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

        if(toNumber(item.receivedQty,0) > 0){
            const review=document.createElement("button");
            review.type="button";
            review.className="secondaryButton smartSearchReviewButton";
            review.textContent="Review / Adjust";
            review.style.flex="0 0 auto";
            review.style.padding="0 10px";
            review.addEventListener("click",function(event){
                event.preventDefault();
                event.stopPropagation();
                closeSmartScanSearch(false);
                openSearchedItemReview(item);
            });
            row.appendChild(review);
        }

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


    document
        .getElementById("btnReceivingSearch")
        ?.addEventListener(
            "click",
            openItemSearchModal
        );


    document.querySelectorAll("[data-receiving-issue]").forEach(input=>{
        input.addEventListener("change",function(){
            const selected=new Set(
                Array.from(document.querySelectorAll("[data-receiving-issue]:checked"))
                    .map(el=>el.value)
            );
            UI.receivingFilters.issues=selected;
            refreshReceivingIssueFilterLabel();
            refreshReceivingTable();
        });
    });

    document.getElementById("btnSelectAllReceivingIssues")?.addEventListener("click",function(event){
        event.preventDefault();
        document.querySelectorAll("[data-receiving-issue]").forEach(el=>{el.checked=true;});
        UI.receivingFilters.issues=new Set(["not_received","partial","received_any","over","manual"]);
        refreshReceivingIssueFilterLabel();
        refreshReceivingTable();
    });

    document.getElementById("btnClearReceivingIssues")?.addEventListener("click",function(event){
        event.preventDefault();
        document.querySelectorAll("[data-receiving-issue]").forEach(el=>{el.checked=false;});
        UI.receivingFilters.issues=new Set();
        refreshReceivingIssueFilterLabel();
        refreshReceivingTable();
    });

    document.getElementById("btnOkReceivingIssues")?.addEventListener("click",function(event){
        event.preventDefault();
        const details=document.getElementById("receivingIssueFilter");
        if(details){
            details.open=false;
        }
    });

    UI.elements.receivingCategoryFilter
        ?.addEventListener("change",function(event){
            UI.receivingFilters.category = event.target.value || "all";
            refreshReceivingTable();
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

}


/* =====================================================
   HEADER
===================================================== */

function refreshHeader(){

    // Approved compact Dashboard identity: show the signed-in pharmacy name.
    const dashboardActive = document.getElementById("page-dashboard")?.classList.contains("active");
    if(dashboardActive){
        const pharmacyName = (document.getElementById("accountPharmacyName")?.textContent || "Pharmacy").trim();
        setElementText(UI.elements.pageTitle, pharmacyName || "Pharmacy");
        setElementText(UI.elements.pageSubtitle, "Receiving Dashboard");
    }

    const hasActiveOrder = !!(
        AppState.workspace?.active === true &&
        (AppState.workspace?.orderData?.length || AppState.workspace?.orderFiles?.length)
    );

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

        if(hasActiveOrder && activeOrders.length>1 && picker){
            orderLabel.hidden=true;
            picker.hidden=false;

            const allSelected=
                selectedOrders.length===activeOrders.length;

            if(pickerLabel){
                pickerLabel.textContent=
                    allSelected
                        ? "All Orders"
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
                        <div class="headerOrderPickerTitle">
                            <strong>Select Orders</strong>
                            <span>Choose one or multiple active orders</span>
                        </div>

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
                                        <small>Include in Dashboard & Receiving</small>
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
                            >OK</button>
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
        overReceivedItems,
        manualItems,
        totalScans
    };
}

function refreshDashboard(){

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
        completed +
        " Completed"
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

    if(!scan){

        clearLastScanUI();

        refreshProfessionalLastScan(
            null
        );

        refreshLastScanQuantityControl();

        return;
    }

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

function getVisibleReceivingItemsForExport(){
    return Array.isArray(UI.receivingVisibleItems) ? UI.receivingVisibleItems.slice() : [];
}

/* =====================================================
   RECEIVING TABLE
===================================================== */

function refreshReceivingTable(){
    const tbody=UI.elements.receivingTableBody;if(!tbody)return;refreshReceivingCategoryFilter();tbody.innerHTML="";
    const issues=UI.receivingFilters.issues instanceof Set?UI.receivingFilters.issues:new Set(["not_received","partial","received_any","over","manual"]), categoryFilter=UI.receivingFilters.category||"all";
    const scope=typeof getSelectedReceivingOrderNumber==="function"?getSelectedReceivingOrderNumber():"ALL", active=typeof getActiveReceivingOrderNumbers==="function"?getActiveReceivingOrderNumbers():[], selectedOrders=typeof getSelectedReceivingOrderNumbers==="function"?getSelectedReceivingOrderNumbers():(scope==="ALL"?active:[scope].filter(Boolean)), allMode=selectedOrders.length>1;
    const hr=tbody.closest("table")?.querySelector("thead tr");if(hr){let h=hr.querySelector('[data-order-column="1"]');if(allMode&&!h){h=document.createElement("th");h.dataset.orderColumn="1";h.textContent="Order Number";const cells=hr.querySelectorAll("th");hr.insertBefore(h,cells[1]||null);}else if(!allMode&&h)h.remove();}
    let rows=[];if(typeof getPerOrderReceivingRows==="function"&&active.length){const orders=selectedOrders.length?selectedOrders:[active[0]].filter(Boolean);orders.forEach(orderNumber=>getPerOrderReceivingRows(orderNumber).forEach(r=>{const received=toNumber(r["Received Qty"],0),issue=r.issueKey||"",cat=toSafeString(r["Category"]||"").trim(),match=issues.has(issue)||(issues.has("received_any")&&received>0);if(match&&(categoryFilter==="all"||cat===categoryFilter))rows.push({orderNumber,itemCode:r["Item Number"],itemName:r["Item Name"],orderedQty:toNumber(r["Ordered Qty"],0),receivedQty:received,remainingQty:Math.max(0,toNumber(r["Ordered Qty"],0)-received),status:r["Issue Type"]==="Received"?"Completed":r["Issue Type"],category:r["Category"]||"",manual:r.issueKey==="manual"});}));}else{rows=(AppState.workspace.orderData||[]).filter(item=>{if(selectedOrders.length && !selectedOrders.some(order=>itemBelongsToOrderScope(item,order)))return false;const issue=getReceivingIssueKey(item),received=toNumber(item.receivedQty,0),cat=toSafeString(item.category||"").trim();return (issues.has(issue)||(issues.has("received_any")&&received>0))&&(categoryFilter==="all"||cat===categoryFilter);});}
    UI.receivingVisibleItems=rows.slice();const d=document.getElementById("rsDisplayedItems");if(d)d.textContent=rows.length;if(typeof refreshReceivingVerificationSummary==="function")refreshReceivingVerificationSummary();
    if(!(AppState.workspace.orderData||[]).length){tbody.innerHTML=`<tr><td colspan="${allMode?9:8}" class="tableEmptyState">No order items loaded.</td></tr>`;return;}if(!rows.length){tbody.innerHTML=`<tr><td colspan="${allMode?9:8}" class="tableEmptyState">No items match the selected filters.</td></tr>`;return;}
    rows.forEach((item,index)=>{const tr=createReceivingTableRow(item,index);if(allMode){const c=document.createElement("td");c.className="receivingOrderCell";c.innerHTML=`<span class="receivingOrderBadge">${escapeHTML(item.orderNumber||"")}</span>`;tr.insertBefore(c,tr.children[1]||null);}tr.dataset.orderNumber=item.orderNumber||"";tbody.appendChild(tr);});
}
function refreshReceivingCategoryFilter(){
    const select = UI.elements.receivingCategoryFilter;
    if(!select){ return; }

    const categories = Array.from(new Set(
        (AppState.workspace.orderData || [])
            .map(item=>toSafeString(item.category || "").trim())
            .filter(Boolean)
    )).sort((a,b)=>a.localeCompare(b));

    const current = UI.receivingFilters.category || "all";
    select.innerHTML = `<option value="all">All Categories</option>` +
        categories.map(category=>`<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join("");

    if(current !== "all" && categories.includes(current)){
        select.value = current;
    }
    else{
        UI.receivingFilters.category = "all";
        select.value = "all";
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

        <td>
            ${toNumber(
                item.remainingQty,
                0
            )}
        </td>

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
function getCurrentBatchQuantity(itemCode){
    const code = normalizeItemCode(itemCode);
    const deviceId = getCurrentDeviceId();

    if(!code || !deviceId){
        return 0;
    }

    const history = Array.isArray(AppState?.workspace?.receivingHistory)
        ? AppState.workspace.receivingHistory
        : [];

    const local = history
        .map((tx,index)=>({tx,index}))
        .filter(row=>toSafeString(row.tx?.deviceId||"")===deviceId)
        .sort((a,b)=>{
            const ta = new Date(a.tx?.dateTime||0).getTime();
            const tb = new Date(b.tx?.dateTime||0).getTime();
            return ta===tb ? a.index-b.index : ta-tb;
        });

    if(!local.length){
        return 0;
    }

    const lastCode = normalizeItemCode(local[local.length-1].tx?.itemCode);
    if(lastCode !== code){
        return 0;
    }

    let qty = 0;
    for(let i=local.length-1; i>=0; i--){
        const txCode = normalizeItemCode(local[i].tx?.itemCode);
        if(txCode !== code){
            break;
        }
        qty += toNumber(local[i].tx?.quantity,0);
    }

    return Math.max(0, qty);
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
    const thisDeviceQty = getCurrentBatchQuantity(item.itemCode);

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

    setElementText(
        UI.elements.sessionPageId,
        session.cloud === true
            ? "CONNECTED"
            : (AppState.workspace?.active === true ? "LOCAL" : "INACTIVE")
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


function handleConfirmOK(){

    const callback =
        UI.confirmCallback;

    closeConfirmModal();

    if(callback){
        callback();
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

    const container =
        UI.elements.toastContainer;

    if(!container){

        Logger.info(
            "Toast:",
            message
        );

        return;
    }

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

      <div class="lastScanQtyHint">

          Current local batch only. Scanning another item starts a new batch.

      </div>

  `;

  card.appendChild(
      controls
  );


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

      return;
  }

  const totalReceived =
      toNumber(
          item.receivedQty,
          0
      );

  const thisDeviceReceived =
      getCurrentBatchQuantity(
          item.itemCode
      );

  button.textContent =
      String(thisDeviceReceived);

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

    /* Phase 2B.4 one-time Zebra migration: previous builds could leave an old
       cloud/local order attached to this handheld indefinitely. Back it up once
       and clear it so the first screen is Modes, with no phantom Order Number. */
    const zebraMigrationKey = "PRS_V3_ZEBRA_PHASE2B4_CLEANED";
    let migrated = false;
    try{ migrated = localStorage.getItem(zebraMigrationKey) === "1"; }catch(_){ migrated = false; }

    const hasOldWorkspace = !!(
        AppState?.workspace?.orderId ||
        AppState?.workspace?.orderName ||
        (Array.isArray(AppState?.workspace?.orderData) && AppState.workspace.orderData.length > 0) ||
        (Array.isArray(AppState?.workspace?.receivingHistory) && AppState.workspace.receivingHistory.length > 0)
    );
    const isValidCloudZebra = AppState?.session?.role === "ZEBRA" && AppState?.session?.cloud === true && AppState?.session?.id && AppState?.session?.secret;

    if(!migrated){
        resetZebraWorkingState("phase2b4-one-time-stale-session-cleanup", {force:true});
        try{ localStorage.setItem(zebraMigrationKey,"1"); }catch(_){ }
    }else if(hasOldWorkspace && !isValidCloudZebra){
        resetZebraWorkingState("legacy-or-local-zebra-workspace", {force:true});
    }

    if(!document.getElementById("zebraHome")){
        const home = document.createElement("section");
        home.id = "zebraHome";
        home.className = "zebraHome";
        home.innerHTML = `
            <div class="zebraBrandRow">
                <img src="assets/pharmflow-mark.svg" alt="" aria-hidden="true">
                <div><strong>PharmFlow</strong><span>Handheld Workspace</span></div>
            </div>
            <div class="zebraModeIntro">
                <span>SELECT MODE</span>
                <h1>What are you working on?</h1>
                <p>Only the tools needed for the selected Handheld workflow will be shown.</p>
            </div>
            <div class="zebraModeCards">
                <button id="btnZebraReceivingMode" class="zebraModeCard" type="button">
                    <span class="zebraModeIcon">▥</span>
                    <div><strong>Receiving</strong><small>Join the PC session and count the order live.</small></div>
                </button>
                <button id="btnZebraExpiryMode" class="zebraModeCard" type="button">
                    <span class="zebraModeIcon">◷</span>
                    <div><strong>Expiry</strong><small>Scan products and capture quantity + expiry date.</small></div>
                </button>
            </div>
            <button id="btnZebraSignOut" class="zebraSignOut" type="button">Sign Out</button>
        `;
        document.querySelector(".mainContent")?.prepend(home);

        document.getElementById("btnZebraReceivingMode")?.addEventListener("click", function(){
            if(AppState.session?.role === "ZEBRA" && AppState.session?.cloud === true){
                setZebraReceivingMode();
            }else{
                setZebraJoinMode();
            }
        });
        document.getElementById("btnZebraExpiryMode")?.addEventListener("click", function(){
            setZebraExpiryMode();
        });
        document.getElementById("btnZebraSignOut")?.addEventListener("click", function(){
            const pending = Array.isArray(AppState?.session?.pendingQueue) ? AppState.session.pendingQueue.length : 0;
            if(pending > 0){
                showToast("Sync pending Handheld work before signing out","warning");
                return;
            }
            /* Signing out detaches this handheld from the old order/session. */
            resetZebraWorkingState("zebra-sign-out", {force:true});
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

    /* Never expose a restored order before cloud validation. New sign-in starts
       from Modes; validateRestoredZebraCloudSession() may resume a genuinely
       active session after Supabase confirms it. */
    setZebraHomeMode();
}

function clearZebraModeClasses(){
    document.body.classList.remove("zebraHomeActive","zebraJoinActive","zebraReceivingActive","zebraExpiryActive","zebraMode");
}
function setZebraHomeMode(){
    if(!isLikelyZebraDevice()){ return; }

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
function setZebraReceivingMode(){
    if(!isLikelyZebraDevice()){ return; }
    clearZebraModeClasses();
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

function getHandheldTotalScans(){
    return getHandheldDeviceScannerRows().length;
}

function ensureHandheldReceivingTools(){
    if(!isLikelyZebraDevice()) return;

    const page = document.getElementById("page-dashboard");
    if(!page) return;

    const oldHeader = document.getElementById("zebraQuickHeader");
    if(oldHeader){
        oldHeader.innerHTML = `
            <div class="zebraFinalHeader">
                <div class="zebraFinalTitle">
                    <strong>Receive Order</strong>
                    <span class="zebraConnectedDot">CONNECTED</span>
                </div>
                <button id="btnZebraModes" class="zebraModesButton" type="button">MODE</button>
            </div>
            <button id="btnHandheldTotalScans" class="handheldTotalScansButton" type="button">
                <span>TOTAL SCANS</span>
                <strong id="handheldTotalScansValue">0</strong>
            </button>
        `;
        document.getElementById("btnZebraModes")?.addEventListener("click", setZebraHomeMode);
        document.getElementById("btnHandheldTotalScans")?.addEventListener("click", openHandheldScansPanel);
    }

    refreshHandheldReceivingTools();
}

function refreshHandheldReceivingTools(){
    const value = document.getElementById("handheldTotalScansValue");
    if(value) value.textContent = String(getHandheldTotalScans());
}

function openHandheldScansPanel(){
    document.getElementById("handheldScansOverlay")?.remove();

    const recent = typeof getHandheldDeviceScannerRows === "function"
        ? getHandheldDeviceScannerRows()
        : [];

    const groups = new Map();
    recent.forEach(row => {
        if(row.undone) return;
        const key = String(row.itemCode || row.itemName || "");
        if(!groups.has(key)){
            groups.set(key,{
                itemCode:row.itemCode || "",
                itemName:row.itemName || "Item",
                qty:0,
                latest:null
            });
        }
        const group = groups.get(key);
        group.qty += Number(row.quantity || 1);
        if(!group.latest || String(row.dateTime || "") > String(group.latest.dateTime || "")){
            group.latest = row;
        }
    });

    const esc = value => typeof escapeHtml === "function"
        ? escapeHtml(String(value ?? ""))
        : String(value ?? "");

    const overlay = document.createElement("div");
    overlay.id = "handheldScansOverlay";
    overlay.className = "handheldScansOverlay";

    const rows = Array.from(groups.values());
    overlay.innerHTML = `
        <section class="handheldScansPanel">
            <header>
                <div><span>THIS HANDHELD</span><strong>Total Scans</strong></div>
                <button type="button" data-close>✕</button>
            </header>
            <div class="handheldScansCount">${getHandheldTotalScans()}</div>
            <div class="handheldScansList">
                ${rows.length ? rows.map(row => `
                    <div class="handheldScanItem">
                        <div>
                            <strong>${esc(row.itemName)}</strong>
                            <span>${esc(row.itemCode)} · Qty ${row.qty}</span>
                        </div>
                        <button type="button" class="handheldUndoItem"
                                data-undo-item="${esc(row.latest?.transactionId || "")}">
                            Undo Item
                        </button>
                    </div>
                `).join("") : `<div class="handheldScansEmpty">No scans from this Handheld yet.</div>`}
            </div>
            <button type="button" class="handheldPanelDone" data-close>Done</button>
        </section>
    `;

    document.body.appendChild(overlay);
    overlay.querySelectorAll("[data-close]").forEach(btn => btn.onclick = () => {
        overlay.remove();
        setTimeout(()=>focusScannerInput?.(),40);
    });

    overlay.querySelectorAll("[data-undo-item]").forEach(btn => {
        btn.onclick = () => {
            const transactionId = btn.getAttribute("data-undo-item");
            if(!transactionId) return;
            const ok = typeof undoRecentScannerTransaction === "function"
                ? undoRecentScannerTransaction(transactionId)
                : false;
            if(ok){
                refreshHandheldReceivingTools();
                openHandheldScansPanel();
            }
        };
    });
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
    const isZebra = AppState.session?.role === "ZEBRA" && AppState.session?.cloud === true;
    if(!isZebra){ return; }

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
    return items.filter(item=>itemBelongsToOrderScope(item));
}

function getKpiPanelItems(key){
    const items=getScopedOrderItems();
    if(key==="total") return items.slice();
    if(key==="completed") return items.filter(i=>{
        const o=toNumber(i.orderedQty,0),r=toNumber(i.receivedQty,0);
        return o>0 && r===o;
    });
    if(key==="remaining") return items.filter(i=>toNumber(i.remainingQty,0)>0);
    if(key==="over") return items.filter(i=>toNumber(i.receivedQty,0)>toNumber(i.orderedQty,0));
    if(key==="manual") return items.filter(i=>i.manual===true);
    return [];
}

function kpiTitle(key){
    return ({
        total:"Order Item Browser",
        completed:"Completed Items",
        remaining:"Remaining Items",
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
    overlay.querySelector("[data-close]").onclick=closeDashboardKpiPanel;
    overlay.addEventListener("click",event=>{if(event.target===overlay) closeDashboardKpiPanel();});
    renderDashboardKpiPanel(key,overlay.querySelector("[data-body]"));
}

function closeDashboardKpiPanel(){
    document.getElementById("dashboardKpiOverlay")?.remove();
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

    /* Always calculate totals in true chronological order.
       The stored history may be newest-first or oldest-first depending on
       the source/device, so array position must never decide the result. */
    const chronological=history.slice().sort((a,b)=>{
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

function getActivitySourceLabel(source){
    const value=toSafeString(source||"").toUpperCase();
    if(value.includes("UNDO")||value.includes("CORRECTION")) return "Correction";
    if(value.includes("MANUAL_ITEM")||value.includes("MANUAL_EXTRA")||value.includes("EXTRA_ITEM")) return "Manual Item";
    if(value.includes("SCAN")) return "Scanner";
    if(value.includes("SEARCH")) return "Manual Quantity";
    if(value.includes("MANUAL")||value.includes("EDIT")||value.includes("ADJUST")) return "Manual Quantity";
    return source||"Receiving";
}

function toggleHighPriority(itemCode, options={}){
    const item=typeof getItemByCode==="function"?getItemByCode(itemCode):null;
    if(!item) return null;
    item.highPriority=item.highPriority!==true;
    if(typeof saveApplicationState==="function") saveApplicationState("high-priority");
    if(options.refresh!==false) refreshOpenKpiPanel();
    if(options.toast!==false) showToast(`${item.itemName} — ${item.highPriority?"High Priority enabled":"High Priority removed"}`,"success");
    return item;
}

function renderItemBrowser(body, rows, options={}){
    const esc=value=>typeof escapeHtml==="function"?escapeHtml(toSafeString(value)):toSafeString(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
    const showPriority=options.showPriority===true;
    const receivedMode=options.receivedMode===true;
    const totalUnits=rows.reduce((sum,item)=>sum+Math.max(0,toNumber(item.receivedQty,0)),0);
    body.innerHTML=`
      <div class="phase263BrowserToolbar">
        <input class="phase263Search" type="search" placeholder="Search by Item Name / Item Number" aria-label="Search items">
        ${showPriority?'<button type="button" class="phase263Filter active" data-filter="all">All Items</button><button type="button" class="phase263Filter" data-filter="priority">★ High Priority</button>':''}
      </div>
      ${receivedMode?`<div class="phase263Summary"><b>Received Items: ${rows.length}</b><span>Total Received Units: <b>${totalUnits}</b></span></div>`:''}
      <div class="phase263TableWrap"><table class="quickKpiTable phase263Table"><thead><tr>${showPriority?'<th>Priority</th>':''}<th>Item Code</th><th>Item Name</th><th>Ordered</th><th>Received</th><th>Remaining</th><th>Status</th></tr></thead><tbody data-rows></tbody></table></div>`;
    const input=body.querySelector('.phase263Search');
    const tbody=body.querySelector('[data-rows]');
    let filter='all';
    const draw=()=>{
        const q=toSafeString(input?.value||'').trim().toLowerCase();
        let visible=rows.filter(item=>!q||toSafeString(item.itemName).toLowerCase().includes(q)||toSafeString(item.itemCode).toLowerCase().includes(q));
        if(showPriority&&filter==='priority') visible=visible.filter(item=>item.highPriority===true);
        visible.sort((a,b)=>(b.highPriority===true)-(a.highPriority===true)||toSafeString(a.itemName).localeCompare(toSafeString(b.itemName)));
        tbody.innerHTML=visible.length?visible.map(item=>`<tr class="${item.highPriority===true?'phase263PriorityRow':''}">${showPriority?`<td><button type="button" class="phase263Star ${item.highPriority===true?'active':''}" data-priority="${esc(item.itemCode)}" title="Toggle High Priority">${item.highPriority===true?'★':'☆'}</button></td>`:''}<td>${esc(item.itemCode)}</td><td><b>${esc(item.itemName)}</b></td><td>${esc(toNumber(item.orderedQty,0))}</td><td>${esc(toNumber(item.receivedQty,0))}</td><td>${esc(toNumber(item.remainingQty,0))}</td><td>${esc(item.status||'')}</td></tr>`).join(''):'<tr><td colspan="7" class="tableEmptyState">No matching items.</td></tr>';
        tbody.querySelectorAll('[data-priority]').forEach(btn=>btn.onclick=(event)=>{
            event.preventDefault();
            const wrap=body.querySelector('.phase263TableWrap');
            const savedTop=wrap?.scrollTop||0;
            const savedLeft=wrap?.scrollLeft||0;
            toggleHighPriority(btn.dataset.priority,{refresh:false});
            draw();
            const nextWrap=body.querySelector('.phase263TableWrap');
            if(nextWrap){nextWrap.scrollTop=savedTop;nextWrap.scrollLeft=savedLeft;}
        });
    };
    input?.addEventListener('input',draw);
    body.querySelectorAll('[data-filter]').forEach(btn=>btn.onclick=()=>{filter=btn.dataset.filter;body.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b===btn));draw();});
    draw();
}

function renderDashboardKpiPanel(key,body){
    if(!body) return;
    const esc=value=>typeof escapeHtml==="function"?escapeHtml(toSafeString(value)):toSafeString(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
    if(key==="scans"){
        const allRows=getReceivingActivityRows();
        const localDevice=(typeof ensureDeviceId==="function"?ensureDeviceId():AppState.session?.deviceId);
        const mode=body.dataset.scanDeviceMode||"this";
        const rows=mode==="all"?allRows:allRows.filter(r=>toSafeString(r.deviceId||"")===toSafeString(localDevice||""));
        if(!allRows.length){body.innerHTML='<div class="tableEmptyState">No receiving activity in the current workspace yet.</div>';return;}
        const recent=typeof getRecentScannerTransactions==="function"?getRecentScannerTransactions():[];
        const undoMap=new Map(recent.map(row=>[row.transactionId,row]));
        body.innerHTML=`<div class="phase263BrowserToolbar"><button type="button" class="phase263Filter ${mode==="this"?"active":""}" data-scan-device="this">This Device</button><button type="button" class="phase263Filter ${mode==="all"?"active":""}" data-scan-device="all">All Devices</button></div>${rows.length?`<div class="phase263TableWrap"><table class="quickKpiTable phase263Table"><thead><tr><th>Time</th><th>Item</th><th>Device</th><th>Source</th><th>Qty Change</th><th>Total After Action</th><th>Action</th></tr></thead><tbody>${rows.map(row=>{const undo=undoMap.get(row.transactionId);const q=toNumber(row.qtyChange,0);const device=toSafeString(row.deviceId||"Unknown");return `<tr><td>${esc(typeof formatDateTime==="function"?formatDateTime(row.dateTime):row.dateTime)}</td><td><b>${esc(row.itemName)}</b><br><span>${esc(row.itemCode)}</span></td><td>${esc(device===toSafeString(localDevice||"")?"This Device":device)}</td><td>${esc(getActivitySourceLabel(row.source))}</td><td class="${q<0?'phase263Negative':'phase263Positive'}">${q>0?'+':''}${esc(q)}</td><td><b>${esc(row.totalAfterAction)}</b></td><td>${undo?`<button class="quickUndoButton" data-undo="${esc(row.transactionId)}" ${undo.undone?'disabled':''}>${undo.undone?'Corrected':'Undo scan'}</button>`:'—'}</td></tr>`;}).join('')}</tbody></table></div>`:'<div class="tableEmptyState">No activity from this device yet.</div>'}`;
        body.querySelectorAll("[data-scan-device]").forEach(btn=>btn.onclick=()=>{body.dataset.scanDeviceMode=btn.dataset.scanDevice;renderDashboardKpiPanel("scans",body);});
        body.querySelectorAll("[data-undo]").forEach(btn=>btn.onclick=()=>{if(typeof undoRecentScannerTransaction==="function") undoRecentScannerTransaction(btn.dataset.undo);});
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
    body.innerHTML=`<div class="phase263TableWrap"><table class="quickKpiTable phase263Table"><thead><tr><th>Item Code</th><th>Item Name</th><th>Ordered</th><th>Received</th><th>Remaining</th><th>Status</th></tr></thead><tbody>${rows.map(item=>`<tr><td>${esc(item.itemCode)}</td><td><b>${esc(item.itemName)}</b></td><td>${esc(toNumber(item.orderedQty,0))}</td><td>${esc(toNumber(item.receivedQty,0))}</td><td>${esc(toNumber(item.remainingQty,0))}</td><td>${esc(item.status||"")}</td></tr>`).join('')}</tbody></table></div>`;
}

/* =====================================================
   PHASE 2C.6 FINAL - ONE-TAP ACCIDENTAL SCAN CORRECTION
===================================================== */
function refreshScanSafetyUI(){
    /* Phase 2C.6.3+: remove the risky dashboard Undo button. */
    document.querySelector("#lastScanCard .scanSafetyBar")?.remove();

    /* Always expose the two fast review workflows beside Search Item.
       Handlers are assigned every refresh AND backed by delegated binding
       below so a re-render can never leave a dead button. */
    const searchButton=document.getElementById("btnQuickSearch");
    if(!searchButton) return;

    let received=document.getElementById("btnReceivedItems");
    if(!received){
        received=document.createElement("button");
        received.type="button";
        received.id="btnReceivedItems";
        received.className=(searchButton.className||"")+" receivedItemsButton";
        received.innerHTML="✓ Received Items";
        searchButton.insertAdjacentElement("afterend",received);
    }
    received.onclick=()=>openDashboardKpiPanel("received");

    let priority=document.getElementById("btnOrderItemsPriority");
    if(!priority){
        priority=document.createElement("button");
        priority.type="button";
        priority.id="btnOrderItemsPriority";
        priority.className=(searchButton.className||"")+" priorityItemsButton";
        priority.innerHTML="★ Order Items";
        received.insertAdjacentElement("afterend",priority);
    }
    priority.onclick=()=>openDashboardKpiPanel("total");
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

async function loadNeedsReviewRows(workflow,orderId=null){
    const pharmacyId = getNeedsReviewPharmacyId();
    if(!pharmacyId || typeof authRpc !== "function") return [];

    return await authRpc("list_pharmacy_needs_review",{
        p_pharmacy_id:pharmacyId,
        p_workflow:workflow||null,
        p_order_id:orderId||null
    }) || [];
}
async function refreshNeedsReviewCounters(){
    if(typeof isLikelyZebraDevice==="function"&&isLikelyZebraDevice())return;
    try{
        const orderId=String(AppState?.workspace?.orderId||"");
        const [r,e]=await Promise.all([loadNeedsReviewRows("RECEIVING",orderId||null),loadNeedsReviewRows("EXPIRY",null)]);
        const rc=document.getElementById("receivingNeedsReviewCount"),ec=document.getElementById("expiryNeedsReviewCount");
        if(rc)rc.textContent=String(r.length); if(ec)ec.textContent=String(e.length);
        document.getElementById("btnReceivingNeedsReview")?.classList.toggle("hasItems",r.length>0);
        document.getElementById("btnExpiryNeedsReview")?.classList.toggle("hasItems",e.length>0);
    }catch(error){console.warn("Needs Review count failed",error);}
}
function ensureNeedsReviewButtons(){
    if(typeof isLikelyZebraDevice==="function"&&isLikelyZebraDevice())return;
    const search=document.getElementById("btnQuickSearch");
    if(search&&!document.getElementById("btnReceivingNeedsReview")){
        const b=document.createElement("button");b.type="button";b.id="btnReceivingNeedsReview";b.className=(search.className||"")+" needsReviewButton";
        b.innerHTML='Needs Review <strong id="receivingNeedsReviewCount">0</strong>';search.insertAdjacentElement("afterend",b);b.onclick=()=>openNeedsReviewPanel("RECEIVING");
    }
    const captured=document.getElementById("btnExpiryCaptured");
    if(captured&&!document.getElementById("btnExpiryNeedsReview")){
        const b=document.createElement("button");b.type="button";b.id="btnExpiryNeedsReview";b.className="expiryCapturedButton needsReviewButton";
        b.innerHTML='REVIEW <strong id="expiryNeedsReviewCount">0</strong>';captured.insertAdjacentElement("beforebegin",b);b.onclick=()=>openNeedsReviewPanel("EXPIRY");
    }
    refreshNeedsReviewCounters();
}
async function openNeedsReviewPanel(workflow){
    if(typeof isLikelyZebraDevice==="function"&&isLikelyZebraDevice())return;
    document.getElementById("needsReviewOverlay")?.remove();
    const orderId=workflow==="RECEIVING"?String(AppState?.workspace?.orderId||""):null;
    let rows=[];try{rows=await loadNeedsReviewRows(workflow,orderId);}catch(error){showToast?.(error?.message||"Unable to load Needs Review","error");return;}
    const esc=v=>typeof escapeHTML==="function"?escapeHTML(String(v??"")):String(v??"");
    const isExpiry=workflow==="EXPIRY";
    const overlay=document.createElement("div");overlay.id="needsReviewOverlay";overlay.className="needsReviewOverlay";
    overlay.innerHTML=`<button class="needsReviewScrim" data-close></button><aside class="needsReviewPanel"><header><div><span>${workflow}</span><h2>Needs Review</h2><p>${rows.length} pending</p></div><button class="needsReviewClose" data-close>✕</button></header><div class="needsReviewList">${
      rows.length?rows.map((row,i)=>`<section class="needsReviewRow" data-i="${i}"><div class="needsReviewInfo"><span>GTIN</span><strong>${esc(row.gtin)}</strong><small>${isExpiry?`Qty ${row.pending_quantity} · ${String(row.expiry_month).padStart(2,"0")}/${row.expiry_year} · ${esc(row.captured_by_name)}`:`${row.review_reason==="KNOWN_NOT_IN_ORDER" ? "Known item — Not in current order" : "GTIN not recognized"} · Pending Qty: ${row.pending_quantity}`}</small></div><input data-search placeholder="${isExpiry?"Search Global Master — Item Code / Item Name":"Search current order item"}"><div class="needsReviewMatches"></div><button class="needsReviewDelete" data-delete>Delete</button></section>`).join(""):`<div class="needsReviewEmpty">Nothing needs review.</div>`}</div></aside>`;
    document.body.appendChild(overlay);overlay.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>overlay.remove());
    const orderItems=Array.isArray(AppState?.workspace?.orderData)?AppState.workspace.orderData:[];
    overlay.querySelectorAll(".needsReviewRow").forEach(sec=>{
      const row=rows[Number(sec.dataset.i)],search=sec.querySelector("[data-search]"),matches=sec.querySelector(".needsReviewMatches");
      let seq=0;
      const render=async()=>{const my=++seq;const q=String(search.value||"").trim();let found=[];
        if(isExpiry){ found=q&&typeof searchGlobalMasterItems==="function"?await searchGlobalMasterItems(q,6):[]; }
        else { const lq=q.toLowerCase(); found=orderItems.filter(x=>!lq||String(x.itemName||"").toLowerCase().includes(lq)||String(x.itemCode||"").toLowerCase().includes(lq)).slice(0,6); }
        if(my!==seq)return;
        matches.innerHTML=found.map((x,i)=>`<button data-m="${i}"><span><strong>${esc(x.itemName)}</strong><small>${esc(x.itemCode)}${isExpiry&&x.gtinCount?` · ${x.gtinCount} GTIN${x.gtinCount>1?"s":""}`:""}</small></span><b>${isExpiry?"Add GTIN & Resolve":"Link"}</b></button>`).join("")||(isExpiry?'<small>Search the Global Master by Item Code or Item Name.</small>':'<small>Search current order. Manual item entry remains PC-only.</small>');
        matches.querySelectorAll("[data-m]").forEach(b=>b.onclick=async()=>{const item=found[Number(b.dataset.m)];b.disabled=true;try{
          const pharmacyId=getNeedsReviewPharmacyId();
          await authRpc("resolve_pharmacy_needs_review",{p_pharmacy_id:pharmacyId,p_review_id:row.review_id,p_item_code:item.itemCode,p_item_name:item.itemName});
          if(typeof savePharmacyLearnedGTIN==="function")await savePharmacyLearnedGTIN(row.gtin,item.itemCode,item.itemName);
          if(typeof addMappingRecord==="function")addMappingRecord({itemCode:item.itemCode,gtin:row.gtin,source:"PHARMACY_LEARNED"});
          if(workflow==="RECEIVING"&&typeof receiveOrderItem==="function")receiveOrderItem({item,quantity:Number(row.pending_quantity||1),gtin:row.gtin,lot:"",expiry:"",serial:"",source:APP_CONFIG.transactionSources.scanner,manual:item.manual===true});
          else if(isExpiry)await authRpc("save_pharmacy_expiry_capture_smart",{p_pharmacy_id:pharmacyId,p_item_code:item.itemCode,p_item_name:item.itemName,p_gtin:row.gtin,p_category:item.category||"",p_quantity:Number(row.pending_quantity),p_expiry_month:Number(row.expiry_month),p_expiry_year:Number(row.expiry_year),p_worker_id:row.worker_id,p_batch_no:"",p_sample_serial:"",p_device_id:row.device_id||"",p_source:row.source||"PC"});
          sec.remove();refreshNeedsReviewCounters();
        }catch(error){b.disabled=false;showToast?.(error?.message||"Unable to resolve","error");}});};
      search.oninput=()=>{clearTimeout(search._nrTimer);search._nrTimer=setTimeout(render,120);}; render();
      sec.querySelector("[data-delete]").onclick=async e=>{const b=e.currentTarget;if(b.dataset.c!=="1"){b.dataset.c="1";b.textContent="Confirm";setTimeout(()=>{if(b.isConnected){b.dataset.c="";b.textContent="Delete";}},2500);return;}
        try{const pharmacyId=getNeedsReviewPharmacyId();await authRpc("delete_pharmacy_needs_review",{p_pharmacy_id:pharmacyId,p_review_id:row.review_id});sec.remove();refreshNeedsReviewCounters();}catch(error){showToast?.(error?.message||"Unable to delete","error");}};
    });
}

window.refreshNeedsReviewCounters=refreshNeedsReviewCounters;
window.openNeedsReviewPanel=openNeedsReviewPanel;

function refreshOrderScopeControl(){
    const host=document.querySelector('.currentReceivingCard, .dashboardWorkspaceCard, .dashboardHeader') || document.querySelector('#dashboardPage');
    if(!host) return;
    let wrap=document.getElementById('orderScopeControl');
    if(!wrap){
        wrap=document.createElement('div'); wrap.id='orderScopeControl'; wrap.className='orderScopeControl';
        host.appendChild(wrap);
    }
    const files=Array.isArray(AppState.workspace?.orderFiles)?AppState.workspace.orderFiles:[];
    const orders=Array.from(new Set(files.map(f=>normalizeOrderNumber(f.documentId||f.orderNumber||'')).filter(Boolean)));
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
        const unifiedSearch=event.target.closest?.("#btnQuickSearch, #btnReceivingSearch");
        if(unifiedSearch){
            event.preventDefault();
            event.stopImmediatePropagation?.();
            openItemSearchModal();
            return;
        }
        const received=event.target.closest?.("#btnReceivedItems");
        if(received){event.preventDefault();openDashboardKpiPanel("received");return;}
        const priority=event.target.closest?.("#btnOrderItemsPriority");
        if(priority){event.preventDefault();openDashboardKpiPanel("total");}
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
    document.body.appendChild(overlay);overlay.querySelector('[data-close]').onclick=()=>overlay.remove();overlay.onclick=e=>{if(e.target===overlay)overlay.remove();};
}

async function requestRemoveActiveOrderFile(fileId){
    const files=Array.isArray(AppState?.workspace?.orderFiles)?AppState.workspace.orderFiles:[];
    const file=files.find(f=>f.id===fileId);if(!file)return;
    const orderNumber=typeof normalizeOrderNumber==="function"?normalizeOrderNumber(file.documentId||file.orderNumber||""):toSafeString(file.documentId||"");
    if(files.length<=1){showToast("Use Reset Current Workspace to discard the only active order","warning");return;}
    showConfirmModal("Remove Active Order",`Remove ${orderNumber||file.name} from the current workspace only? Other uploaded orders will remain. Physical scans already recorded are not silently deleted.`,async()=>{
        try{
            showLoading("Removing order...");
            const sourceRows=typeof getOriginalUploadedOrderSnapshot==="function"&&orderNumber?await getOriginalUploadedOrderSnapshot(orderNumber):[];
            if(orderNumber&&typeof authRpc==="function"&&typeof AuthState!=="undefined"&&AuthState.context?.pharmacy_id){await authRpc("discard_pharmflow_active_order",{p_pharmacy_id:AuthState.context.pharmacy_id,p_order_number:orderNumber,p_confirmation:orderNumber});}
            sourceRows.forEach(row=>{const code=normalizeItemCode(row.item_code||row.itemCode);const item=getItemByCode(code);if(!item)return;item.orderedQty=Math.max(0,toNumber(item.orderedQty,0)-toNumber(row.ordered_qty??row.orderedQty,0));if(typeof updateItemCalculatedFields==="function")updateItemCalculatedFields(item);});
            AppState.workspace.orderData=AppState.workspace.orderData.filter(item=>!(toNumber(item.orderedQty,0)<=0&&toNumber(item.receivedQty,0)<=0&&item.manual!==true));
            AppState.workspace.orderFiles=files.filter(f=>f.id!==fileId);
            if(typeof rebuildStateIndexes==="function")rebuildStateIndexes();
            const remaining=AppState.workspace.orderFiles.map(f=>normalizeOrderNumber(f.documentId||f.orderNumber||"")).filter(Boolean);
            AppState.workspace.orderName=remaining.length===1?remaining[0]:(remaining.length?remaining.join(" + "):"");
            recalculateStatistics();if(typeof saveApplicationState==="function")saveApplicationState("remove-order");refreshEntireUI();
            showToast(`${orderNumber||file.name} removed. ${remaining.length} active order(s) remain.`,"success");
        }catch(error){Logger.error("Remove active order failed",error);showToast(error?.message||"Unable to remove order","error");}finally{hideLoading();}
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
