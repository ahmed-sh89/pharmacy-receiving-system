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

        const button =
            document.createElement(
                "button"
            );

        button.type =
            "button";

        button.className =
            "smartSearchResult";

        button.innerHTML = `

            <div class="smartSearchResultMain">

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

            <div class="smartSearchResultQty">

                <span>
                    ${toNumber(
                        item.receivedQty,
                        0
                    )}
                    /
                    ${toNumber(
                        item.orderedQty,
                        0
                    )}
                </span>

                <small>
                    Received
                </small>

            </div>

        `;

        button.addEventListener(
            "click",
            function(){

                selectSmartScanItem(
                    item
                );

            }
        );

        fragment.appendChild(
            button
        );

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

    setElementText(
        UI.elements.headerOrderId,
        AppState.workspace.orderName
        ||
        AppState.workspace.orderId
        ||
        "No Order"
    );


    setElementText(
        UI.elements.headerSessionId,
        AppState.session.id
        ||
        "Local"
    );

}


/* =====================================================
   DASHBOARD
===================================================== */

function refreshDashboard(){

    recalculateStatistics();

    const stats =
        AppState.statistics;


    setElementText(
        UI.elements.statTotalItems,
        stats.totalItems
    );


    setElementText(
        UI.elements.statCompleted,
        stats.completedItems
    );


    setElementText(
        UI.elements.statRemaining,
        stats.remainingItems
    );


    setElementText(
        UI.elements.statOver,
        stats.overReceivedItems
    );


    setElementText(
        UI.elements.statManual,
        stats.manualItems
    );


    setElementText(
        UI.elements.statScans,
        stats.totalScans
    );


    refreshProgress();

}


/* =====================================================
   PROGRESS
===================================================== */

function refreshProgress(){

    const total =
        AppState.statistics
            .totalItems;

    const completed =
        AppState.statistics
            .completedItems;

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


/* =====================================================
   RECEIVING TABLE
===================================================== */

function refreshReceivingTable(){

    const tbody =
        UI.elements.receivingTableBody;

    if(!tbody){
        return;
    }

    tbody.innerHTML =
        "";

    const items =
        AppState.workspace.orderData;

    if(items.length === 0){

        tbody.innerHTML = `

            <tr>

                <td
                    colspan="7"
                    class="tableEmptyState"
                >
                    No order items loaded.
                </td>

            </tr>

        `;

        return;
    }

    const fragment =
        document.createDocumentFragment();

    items.forEach(
        (
            item,
            index
        )=>{

            fragment.appendChild(
                createReceivingTableRow(
                    item,
                    index
                )
            );

        }
    );

    tbody.appendChild(
        fragment
    );

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

                increaseItemQuantity(
                    item.itemCode,
                    1
                );

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

                decreaseItemQuantity(
                    item.itemCode,
                    1
                );

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

                openQuantityEditPrompt(
                    item
                );

            }
        );


    return row;

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

        modal =
            document.createElement(
                "div"
            );

        modal.id =
            "quantityAdjustmentModal";

        modal.className =
            "quantityAdjustmentModal";

        modal.innerHTML = `

            <div class="quantityAdjustmentCard">

                <div class="quantityAdjustmentHeader">
                    <div>
                        <span class="sectionEyebrow">QUANTITY</span>
                        <h3 id="quantityAdjustmentItemName">-</h3>
                    </div>
                    <button type="button" id="btnCloseQuantityAdjustment" class="iconButton">✕</button>
                </div>

                <div class="quantityCurrentTotal">
                    <span>Current Received</span>
                    <strong id="quantityAdjustmentCurrent">0</strong>
                </div>

                <label class="quantityAdjustmentLabel" for="quantityAdjustmentInput">
                    Quantity
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

                <p class="quantityAdjustmentHelp">
                    <strong>Add Quantity</strong> adds to what was already received.
                    Use <strong>Correct Total</strong> only when you want to replace the final received total.
                </p>

                <div class="quantityAdjustmentActions">
                    <button type="button" id="btnQuantityAdd" class="primaryButton">
                        + Add Quantity
                    </button>
                    <button type="button" id="btnQuantitySetTotal" class="secondaryButton">
                        Correct Total
                    </button>
                </div>

            </div>

        `;

        document.body.appendChild(
            modal
        );

        document
            .getElementById(
                "btnCloseQuantityAdjustment"
            )
            ?.addEventListener(
                "click",
                closeQuantityAdjustmentModal
            );

        modal.addEventListener(
            "click",
            function(event){
                if(event.target === modal){
                    closeQuantityAdjustmentModal();
                }
            }
        );

    }

    modal.dataset.itemCode =
        item.itemCode;

    setElementText(
        document.getElementById(
            "quantityAdjustmentItemName"
        ),
        item.itemName
    );

    setElementText(
        document.getElementById(
            "quantityAdjustmentCurrent"
        ),
        toNumber(
            item.receivedQty,
            0
        )
    );

    const input =
        document.getElementById(
            "quantityAdjustmentInput"
        );

    if(input){
        input.value = "1";
    }

    const addButton =
        document.getElementById(
            "btnQuantityAdd"
        );

    const setButton =
        document.getElementById(
            "btnQuantitySetTotal"
        );

    addButton.onclick =
        function(){

            const code =
                modal.dataset.itemCode;

            const quantity =
                toNumber(
                    input?.value,
                    0
                );

            if(quantity <= 0){
                showToast(
                    "Enter a quantity greater than zero",
                    "warning"
                );
                return;
            }

            const transaction =
                addItemReceivedQuantity(
                    code,
                    quantity,
                    "MANUAL_ADD"
                );

            if(transaction){
                closeQuantityAdjustmentModal();
            }

        };

    setButton.onclick =
        function(){

            const code =
                modal.dataset.itemCode;

            const total =
                toNumber(
                    input?.value,
                    -1
                );

            if(total < 0){
                showToast(
                    "Enter a valid total quantity",
                    "warning"
                );
                return;
            }

            const transaction =
                setItemReceivedQuantity(
                    code,
                    total
                );

            if(transaction){
                closeQuantityAdjustmentModal();
            }

        };

    modal.classList.add(
        "open"
    );

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

            <small>
                ${toInteger(
                    file.rows,
                    0
                )}
                rows
            </small>

        `;

        container.appendChild(
            element
        );

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

    if(!status || status.installed !== true){

        setElementText(
            UI.elements.masterGTINStatus,
            "Not installed"
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
                "Update Master GTIN once. Mapping files will then be optional for normal orders.";
            UI.elements.masterGTINNotice.className =
                "masterGTINNotice";
        }

        return;
    }

    setElementText(
        UI.elements.masterGTINStatus,
        "Ready"
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
                "Master GTIN is active for the current order. Mapping file is not required.";

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
        session.id || "Local"
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


function renderArchiveTable(orders){

    const tbody =
        UI.elements.archiveTableBody;

    if(!tbody){
        return;
    }

    tbody.innerHTML =
        "";

    if(
        !orders ||
        orders.length === 0
    ){

        tbody.innerHTML = `

            <tr>

                <td
                    colspan="5"
                    class="tableEmptyState"
                >
                    No archived orders yet.
                </td>

            </tr>

        `;

        return;
    }

    orders.forEach(order=>{

        const row =
            document.createElement(
                "tr"
            );

        row.innerHTML = `

            <td>
                ${escapeHTML(
                    order.orderId
                )}
            </td>

            <td>
                ${escapeHTML(
                    formatDate(
                        order.closedAt
                        ||
                        order.createdAt
                    )
                )}
            </td>

            <td>
                ${toInteger(
                    order.totalItems,
                    0
                )}
            </td>

            <td>
                ${toNumber(
                    order.totalReceivedUnits,
                    0
                )}
            </td>

            <td>

                <span
                    class="archiveStatus completed"
                >
                    ${escapeHTML(
                        order.status || "Closed"
                    )}
                </span>

            </td>

        `;

        tbody.appendChild(
            row
        );

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
            function(){

                selectSmartScanItem(
                    item
                );

                closeItemSearchModal();

            }
        );

        container.appendChild(
            button
        );

    });

}


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

    if(
        document.querySelector(
            ".modalOverlay.open"
        )
    ){
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
        "flashError"
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

    setTimeout(()=>{

        card.classList.remove(
            "scanSuccess",
            "scanError"
        );

    },700);

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

          Quick Quantity Adjustment

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

          Tap the number to add quantity or correct the total.

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

  if(!button){
      return;
  }

  const item =
      getCurrentLastScanItem();

  if(!item){

      button.textContent =
          "0";

      return;
  }

  button.textContent =
      String(
          toNumber(
              item.receivedQty,
              0
          )
      );

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
        "📋 Order Status Report";

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

                if(difference < 0){
                    reportStatus =
                        "shortage";
                }
                else if(difference > 0){
                    reportStatus =
                        "over";
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
                        <h2>Order Status Report</h2>
                        <p>
                            Current shortage and over-received quantities.
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
            tr.classList.add(
                "rowOver"
            );
        }
        else if(rowData.reportStatus === "shortage"){
            tr.classList.add(
                "orderStatusShortageRow"
            );
        }
        else{
            tr.classList.add(
                "rowCompleted"
            );
        }

        let differenceHTML =
            '<strong class="differenceComplete">0</strong>';

        let statusHTML =
            '<span class="statusBadge statusCompleted">Complete</span>';

        if(rowData.difference < 0){

            differenceHTML =
                `<strong class="differenceShortage">${rowData.difference}</strong>`;

            statusHTML =
                `<span class="statusBadge statusShortage">Shortage ${Math.abs(rowData.difference)}</span>`;

        }
        else if(rowData.difference > 0){

            differenceHTML =
                `<strong class="differenceOver">+${rowData.difference}</strong>`;

            statusHTML =
                `<span class="statusBadge statusOver">Over +${rowData.difference}</span>`;

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
   ZEBRA OFFLINE INTERFACE
===================================================== */

function initializeZebraInterface(){

    if(
        document.getElementById(
            "zebraQuickHeader"
        )
    ){
        return;
    }

    const page =
        document.getElementById(
            "page-dashboard"
        );

    if(!page){
        return;
    }

    const header =
        document.createElement("section");

    header.id =
        "zebraQuickHeader";

    header.className =
        "zebraQuickHeader";

    header.innerHTML = `
        <div class="zebraQuickHeaderMain">
            <div>
                <span class="zebraModeEyebrow">ZEBRA OFFLINE RECEIVING</span>
                <strong id="zebraQuickOrder">No order loaded</strong>
            </div>
            <span id="zebraQuickDevice" class="zebraDeviceBadge">ZEBRA</span>
        </div>
        <div class="zebraQuickStats">
            <div><span>Scans</span><strong id="zebraQuickScans">0</strong></div>
            <div><span>Net Qty</span><strong id="zebraQuickUnits">0</strong></div>
            <div><span>Items</span><strong id="zebraQuickItems">0</strong></div>
        </div>
        <button id="btnZebraQuickExport" class="primaryButton zebraQuickExport" type="button">
            Export Zebra Session
        </button>
    `;

    page.insertBefore(
        header,
        page.firstChild
    );

    document
        .getElementById(
            "btnZebraQuickExport"
        )
        ?.addEventListener(
            "click",
            function(){
                if(
                    typeof exportZebraSession ===
                    "function"
                ){
                    exportZebraSession();
                }
            }
        );
}


function setZebraInterfaceMode(enabled){

    initializeZebraInterface();

    document.body.classList.toggle(
        "zebraMode",
        enabled === true
    );

    refreshZebraInterface();
}


function refreshZebraInterface(){

    const isZebra =
        AppState.session.role ===
        "ZEBRA";

    document.body.classList.toggle(
        "zebraMode",
        isZebra
    );

    if(!isZebra){
        return;
    }

    const history =
        AppState.workspace.receivingHistory || [];

    const netUnits =
        history.reduce(
            (sum,transaction)=>
                sum + toNumber(transaction.quantity,0),
            0
        );

    const touchedItems =
        new Set(
            history
                .map(transaction=>
                    normalizeItemCode(
                        transaction.itemCode
                    )
                )
                .filter(Boolean)
        );

    setElementText(
        document.getElementById(
            "zebraQuickOrder"
        ),
        AppState.workspace.orderName ||
        AppState.workspace.orderId ||
        "Order"
    );

    setElementText(
        document.getElementById(
            "zebraQuickDevice"
        ),
        AppState.session.deviceId ||
        "ZEBRA"
    );

    setElementText(
        document.getElementById(
            "zebraQuickScans"
        ),
        history.length
    );

    setElementText(
        document.getElementById(
            "zebraQuickUnits"
        ),
        netUnits
    );

    setElementText(
        document.getElementById(
            "zebraQuickItems"
        ),
        touchedItems.size
    );
}

/* =====================================================
   END SMART UI
===================================================== */