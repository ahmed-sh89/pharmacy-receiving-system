"use strict";

/* =====================================================
   PHARMACY RECEIVING SYSTEM V3
   APPLICATION CORE
===================================================== */


/* =====================================================
   APP RUNTIME
===================================================== */

const PharmacyApp = {

    initialized:false,

    autosaveTimer:null,

    modules:{

        state:false,

        router:false,

        ui:false,

        excel:false,

        masterGTIN:false,

        scanner:false,

        receiving:false,

        session:false,

        reports:false

    }

};


function applyBrandIdentity(){
    const brand=APP_CONFIG.brand||{}; const name=brand.name||APP_CONFIG.appName||"PharmFlow"; const tagline=brand.tagline||"Pharmacy Operations Platform";
    document.querySelectorAll("[data-brand-name]").forEach(el=>el.textContent=name);
    document.querySelectorAll("[data-brand-tagline]").forEach(el=>el.textContent=tagline);
    document.querySelectorAll(".pharmflowQuickAction[data-page]").forEach(button=>{ if(button.dataset.pharmflowBound==="1")return; button.dataset.pharmflowBound="1"; button.addEventListener("click",()=>{ if(typeof navigateTo==="function")navigateTo(button.dataset.page); }); });
}

/* =====================================================
   APPLICATION START
===================================================== */

window.addEventListener(
    "DOMContentLoaded",
    bootstrapMedryvo
);

async function bootstrapMedryvo(){
    try{
        applyBrandIdentity();
        document.body.classList.add("authLocked");

        if(typeof initializeAuth === "function"){
            await initializeAuth();

            if(typeof finishPendingAccessIfPossible === "function" && getSupabaseAccessToken()){
                await finishPendingAccessIfPossible().catch(()=>{});
            }

            if(typeof loadMyAppContext === "function" && getSupabaseAccessToken()){
                await loadMyAppContext().catch(()=>{});
            }

            if(typeof loadMyRegistrationStatus === "function" && getSupabaseAccessToken()){
                await loadMyRegistrationStatus().catch(()=>{});
            }

            if(typeof renderAuthState === "function"){
                renderAuthState();
            }

            if(typeof hasApplicationAccess === "function" && hasApplicationAccess()){
                document.body.classList.remove("authLocked");
                await startApplication();
            }
            return;
        }

        document.body.classList.remove("authLocked");
        await startApplication();
    }
    catch(error){
        console.error("PharmFlow authentication bootstrap failed", error);
        if(typeof setAuthMessage === "function"){
            setAuthMessage(error.message || "Unable to initialize secure access.", "error");
        }
    }
}

window.bootProtectedApplication = async function(){
    document.body.classList.remove("authLocked");
    await startApplication();
};


/* =====================================================
   MAIN INITIALIZATION
===================================================== */

async function startApplication(){

    if(PharmacyApp.initialized){
        return;
    }

    try{

        Logger.info(
            "Starting",
            APP_CONFIG.appName,
            APP_CONFIG.version
        );


        setInitialSystemStatus();


        initializeState();

        PharmacyApp.modules.state = true;

        /* Phase 2C.5.3.1: Supabase is authoritative across PCs.
           Validate any restored local workspace before exposing it. */
        if(typeof reconcileRestoredWorkspaceWithCloud === "function"){
            await reconcileRestoredWorkspaceWithCloud({reason:"startup"});
        }


        startRouter();

        PharmacyApp.modules.router = true;


        initializeUI();

        PharmacyApp.modules.ui = true;


        initializeOptionalModules();


        startAutosaveEngine();


        bindApplicationLifecycleEvents();


        refreshEntireUI();


        focusScannerInput();


        PharmacyApp.initialized = true;


        setSystemStatus(
            "READY",
            "ready"
        );


        Logger.info(
            "Application ready"
        );

    }
    catch(error){

        handleFatalStartupError(
            error
        );

    }

}


/* =====================================================
   INITIAL SYSTEM STATUS
===================================================== */

function setInitialSystemStatus(){

    const status =
        document.getElementById(
            "systemStatus"
        );


    if(!status){
        return;
    }


    status.textContent =
        "STARTING";


    status.className =
        "systemStatus warning";

}


/* =====================================================
   OPTIONAL MODULE INITIALIZATION
===================================================== */

function initializeOptionalModules(){

    /*
       Every module is checked before execution.
       This prevents one missing function from
       stopping the whole application.
    */


    initializeModuleSafely(
        "excel",
        "initializeExcel"
    );


    initializeModuleSafely(
        "masterGTIN",
        "initializeMasterGTIN"
    );


    initializeModuleSafely(
        "scanner",
        "initializeScanner"
    );


    initializeModuleSafely(
        "receiving",
        "initializeReceiving"
    );


    initializeModuleSafely(
        "supabase",
        "initializeSupabaseCloud"
    );


    initializeModuleSafely(
        "session",
        "initializeSession"
    );


    initializeModuleSafely(
        "reports",
        "initializeReports"
    );

    initializeModuleSafely(
        "orders",
        "initializeOrderLifecycle"
    );

}


/* =====================================================
   SAFE MODULE INITIALIZER
===================================================== */

function initializeModuleSafely(
    moduleName,
    functionName
){

    const initializer =
        window[functionName];


    if(
        typeof initializer !==
        "function"
    ){

        Logger.warn(
            moduleName +
            " module not initialized yet:",
            functionName +
            " is not available"
        );

        PharmacyApp.modules[
            moduleName
        ] = false;

        return false;

    }


    try{

        initializer();

        PharmacyApp.modules[
            moduleName
        ] = true;


        Logger.info(
            moduleName +
            " module initialized"
        );


        return true;

    }
    catch(error){

        PharmacyApp.modules[
            moduleName
        ] = false;


        Logger.error(
            moduleName +
            " module initialization failed",
            error
        );


        return false;

    }

}


/* =====================================================
   AUTOSAVE ENGINE
===================================================== */

function startAutosaveEngine(){

    stopAutosaveEngine();


    if(
        !APP_CONFIG.autosave.enabled ||
        !AppState.settings.autosaveEnabled
    ){

        Logger.info(
            "Autosave disabled"
        );

        return;

    }


    PharmacyApp.autosaveTimer =
        setInterval(
            function(){

                saveApplicationState(
                    false
                );

            },
            APP_CONFIG
                .autosave
                .intervalMs
        );


    Logger.info(
        "Autosave started",
        APP_CONFIG
            .autosave
            .intervalMs +
        "ms"
    );

}


/* =====================================================
   STOP AUTOSAVE
===================================================== */

function stopAutosaveEngine(){

    if(
        PharmacyApp.autosaveTimer
    ){

        clearInterval(
            PharmacyApp.autosaveTimer
        );


        PharmacyApp.autosaveTimer =
            null;

    }

}


/* =====================================================
   SAVE APPLICATION STATE
===================================================== */

function saveApplicationState(
    notifyUser = true
){

    try{

        const success =
            saveWorkspaceSnapshot();


        if(!success){

            if(notifyUser){

                showToast(
                    "Unable to save workspace",
                    "error"
                );

            }


            return false;

        }


        if(notifyUser){

            showToast(
                "Workspace saved",
                "success"
            );

        }


        refreshSessionUI();


        return true;

    }
    catch(error){

        Logger.error(
            "Save failed",
            error
        );


        if(notifyUser){

            showToast(
                "Save failed",
                "error"
            );

        }


        return false;

    }

}


/* =====================================================
   SAVE AFTER IMPORTANT CHANGE
===================================================== */

function saveAfterImportantChange(){

    if(
        !APP_CONFIG
            .autosave
            .saveAfterEveryTransaction
    ){

        return;

    }


    saveApplicationState(
        false
    );

}


/* =====================================================
   APPLICATION LIFECYCLE EVENTS
===================================================== */

function bindApplicationLifecycleEvents(){

    window.addEventListener(
        "beforeunload",
        function(){

            saveApplicationState(
                false
            );

        }
    );


    document.addEventListener(
        "visibilitychange",
        function(){

            if(
                document.visibilityState ===
                "hidden"
            ){

                saveApplicationState(
                    false
                );

            }

        }
    );


    window.addEventListener(
        "focus",
        function(){

            if(typeof reconcileRestoredWorkspaceWithCloud === "function"){
                reconcileRestoredWorkspaceWithCloud({reason:"window-focus",silent:true})
                    .then(result=>{
                        if(result && result.cleared && typeof refreshEntireUI === "function"){
                            refreshEntireUI();
                        }
                    })
                    .catch(()=>{});
            }

            if(
                AppRouter.currentRoute ===
                "dashboard" ||
                AppRouter.currentRoute ===
                "receiving"
            ){

                focusScannerInput();

            }

        }
    );


    AppEvents.on(
        "receiving:updated",
        function(){

            saveAfterImportantChange();

        }
    );


    AppEvents.on(
        "files:updated",
        function(){

            saveAfterImportantChange();

        }
    );


    AppEvents.on(
        "session:updated",
        function(){

            saveAfterImportantChange();

        }
    );

}


/* =====================================================
   MANUAL SAVE BUTTON
===================================================== */

function handleSaveNow(){

    saveApplicationState(
        true
    );

}


/* =====================================================
   CLOSE CURRENT ORDER
===================================================== */

function requestCloseCurrentOrder(){

    /* Phase 2C.4: legacy Close Current Order must never bypass the
       authoritative manual receiving finalization workflow. */
    if(typeof requestFinalizeReceiving === "function"){
        requestFinalizeReceiving();
        return;
    }

    showToast(
        "Use Finalize Receiving from the Receiving page",
        "warning"
    );
}


/* =====================================================
   RESET CURRENT WORKSPACE
===================================================== */

function requestResetWorkspace(){

    showConfirmModal(

        "Reset Current Workspace",

        "This will permanently discard the CURRENT UNFINALIZED order and its receiving workspace so the same Order Number can be uploaded again. Finalized historical orders and Global GTIN Master are not deleted.",

        function(){

            resetCurrentWorkspace();

        }

    );

}


/* =====================================================
   RESET WORKSPACE
===================================================== */

async function resetCurrentWorkspace(){

    /* Phase 2C.5.4.5
       Reset/close of an UNFINALIZED workspace is an intentional discard.
       Supabase must be cleared first so the order number does not remain as
       an orphan active registry record and falsely block a future upload.
       Finalized/received orders are protected by the RPC and remain history. */

    const activeOrderNumbers = (()=>{
        const seen = new Set();
        const values = [];
        const files = Array.isArray(AppState?.workspace?.orderFiles)
            ? AppState.workspace.orderFiles
            : [];
        files.forEach(file=>{
            const raw = file?.documentId || file?.orderNumber || "";
            const value = typeof normalizeOrderNumber === "function"
                ? normalizeOrderNumber(raw)
                : String(raw||"").trim().toUpperCase().replace(/\s+/g,"");
            if(value && !seen.has(value)){
                seen.add(value);
                values.push(value);
            }
        });
        return values;
    })();

    try{
        showLoading("Closing current workspace...");

        /* If this PC owns a live Handheld session, end it authoritatively
           before discarding the unfinished order. */
        if(
            AppState?.session?.cloud === true &&
            AppState?.session?.role === "PC" &&
            typeof leaveCloudSession === "function"
        ){
            const ended = await leaveCloudSession();
            if(ended === false){
                throw new Error("Unable to end the live session. Current workspace was not cleared.");
            }
        }

        if(activeOrderNumbers.length){
            if(
                typeof authRpc !== "function" ||
                typeof AuthState === "undefined" ||
                !AuthState.context?.pharmacy_id
            ){
                throw new Error("Pharmacy cloud context is unavailable. Sign in again before closing the current order.");
            }

            for(const orderNumber of activeOrderNumbers){
                await authRpc("discard_pharmflow_active_order",{
                    p_pharmacy_id:AuthState.context.pharmacy_id,
                    p_order_number:orderNumber,
                    p_confirmation:orderNumber
                });
            }
        }

        if(typeof resetOperationalStateToDefault === "function"){
            resetOperationalStateToDefault();
        }else{
            clearCurrentWorkspace();
            AppState.session = createEmptySession();
            ensureDeviceId();
            deleteWorkspaceSnapshot();
        }

        if(typeof ReceivingEngine!=="undefined"){
            ReceivingEngine.recentScans=[];
            ReceivingEngine.lastTransaction=null;
        }

        if(typeof refreshOrderLifecycleRegistry === "function"){
            await refreshOrderLifecycleRegistry();
        }

        refreshEntireUI();
        navigateTo("dashboard");
        showToast(
            activeOrderNumbers.length
                ? "Unfinalized order discarded — it can be uploaded again"
                : "Current workspace reset",
            "success"
        );
        focusScannerInput();
        return true;

    }
    catch(error){
        Logger.error("Workspace reset failed",error);
        showToast(
            error?.message || "Unable to reset workspace",
            "error"
        );
        return false;
    }
    finally{
        hideLoading();
    }

}



/* =====================================================
   DELETE ALL HISTORICAL DATA
===================================================== */

function requestDeleteAllHistory(){

    showConfirmModal(

        "Delete All Historical Data",

        "This will permanently delete all RECEIVED order history for this pharmacy from Supabase and this browser. Active uploaded orders, Global GTIN Master, Returns Archive, users, and other pharmacies are not affected. This action cannot be undone.",

        function(){

            if(
                typeof deleteAllHistoricalData ===
                "function"
            ){

                deleteAllHistoricalData();

            }
            else{

                showToast(
                    "Historical database module is not ready yet",
                    "warning"
                );

            }

        }

    );

}


/* =====================================================
   FILE BUTTON BINDINGS
===================================================== */

function bindCoreApplicationButtons(){

    document
        .getElementById(
            "btnSaveNow"
        )
        ?.addEventListener(
            "click",
            handleSaveNow
        );


    document
        .getElementById(
            "btnCloseCurrentOrder"
        )
        ?.addEventListener(
            "click",
            requestCloseCurrentOrder
        );


    document
        .getElementById(
            "btnResetWorkspace"
        )
        ?.addEventListener(
            "click",
            requestResetWorkspace
        );


    document
        .getElementById(
            "btnDeleteAllHistory"
        )
        ?.addEventListener(
            "click",
            requestDeleteAllHistory
        );


    document
        .getElementById(
            "btnLoadOrders"
        )
        ?.addEventListener(
            "click",
            function(){

                document
                    .getElementById(
                        "orderFileInput"
                    )
                    ?.click();

            }
        );


    document
        .getElementById(
            "btnUpdateMasterGTIN"
        )
        ?.addEventListener(
            "click",
            function(){
                if(typeof isSystemOwner === "function" && !isSystemOwner()){
                    showToast("System Owner access is required to update the Global Master GTIN","warning");
                    return;
                }
                document.getElementById("masterGTINFileInput")?.click();
            }
        );


    document
        .getElementById(
            "btnLoadMappings"
        )
        ?.addEventListener(
            "click",
            function(){

                document
                    .getElementById(
                        "mappingFileInput"
                    )
                    ?.click();

            }
        );


    document
        .getElementById(
            "btnPrepareZebraWork"
        )
        ?.addEventListener(
            "click",
            function(){

                if(
                    typeof prepareZebraWorkFile ===
                    "function"
                ){
                    prepareZebraWorkFile();
                }
                else{
                    showToast(
                        "Zebra preparation is not ready yet",
                        "warning"
                    );
                }
            }
        );


    document
        .getElementById(
            "btnLoadZebraWork"
        )
        ?.addEventListener(
            "click",
            function(){
                document
                    .getElementById(
                        "zebraWorkFileInput"
                    )
                    ?.click();
            }
        );


    document
        .getElementById(
            "btnMergeZebraSession"
        )
        ?.addEventListener(
            "click",
            function(){

                document
                    .getElementById(
                        "zebraSessionFileInput"
                    )
                    ?.click();

            }
        );


    document
        .getElementById(
            "btnCreateSession"
        )
        ?.addEventListener(
            "click",
            function(){

                if(
                    typeof createCloudReceivingSession ===
                    "function"
                ){
                    createCloudReceivingSession();
                }
                else{
                    showToast(
                        "Cloud session module is not ready yet",
                        "warning"
                    );
                }

            }
        );


    document
        .getElementById(
            "btnJoinCloudSession"
        )
        ?.addEventListener(
            "click",
            function(){
                const input = document.getElementById("cloudSessionCodeInput");
                if(typeof joinCloudReceivingSession === "function"){
                    joinCloudReceivingSession(input ? input.value : "");
                }
            }
        );


    document
        .getElementById("cloudSessionCodeInput")
        ?.addEventListener(
            "keydown",
            function(event){
                if(event.key === "Enter"){
                    event.preventDefault();
                    if(typeof joinCloudReceivingSession === "function"){
                        joinCloudReceivingSession(event.target.value);
                    }
                }
            }
        );


    document
        .getElementById("btnRefreshCloudNow")
        ?.addEventListener("click",function(){
            if(typeof flushCloudPendingQueue === "function"){ flushCloudPendingQueue(); }
            if(typeof refreshCloudSnapshot === "function"){ refreshCloudSnapshot(); }
        });


    document
        .getElementById("btnLeaveCloudSession")
        ?.addEventListener("click",function(){
            if(typeof leaveCloudSession === "function"){ leaveCloudSession(); }
        });


    document
        .getElementById(
            "btnExportZebraSession"
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
                else{

                    showToast(
                        "Session export is not ready yet",
                        "warning"
                    );

                }

            }
        );


    document
        .getElementById(
            "btnExportReports"
        )
        ?.addEventListener(
            "click",
            function(){

                if(
                    typeof exportAllReports ===
                    "function"
                ){

                    exportAllReports();

                }
                else{

                    showToast(
                        "Reports module is not ready yet",
                        "warning"
                    );

                }

            }
        );


    document
        .getElementById(
            "btnGenerateItemReport"
        )
        ?.addEventListener(
            "click",
            function(){

                if(
                    typeof generateItemReceivingReport ===
                    "function"
                ){

                    generateItemReceivingReport();

                }
                else{

                    showToast(
                        "Reports module is not ready yet",
                        "warning"
                    );

                }

            }
        );


    document
        .getElementById(
            "btnExportItemReport"
        )
        ?.addEventListener(
            "click",
            function(){

                if(
                    typeof exportCurrentItemReport ===
                    "function"
                ){

                    exportCurrentItemReport();

                }
                else{

                    showToast(
                        "Item report export is not ready yet",
                        "warning"
                    );

                }

            }
        );

}


/* =====================================================
   FILE INPUT BINDINGS
===================================================== */

function bindCoreFileInputs(){

    document
        .getElementById(
            "orderFileInput"
        )
        ?.addEventListener(
            "change",
            function(event){

                if(
                    typeof handleOrderFileSelection ===
                    "function"
                ){

                    handleOrderFileSelection(
                        event
                    );

                }

            }
        );


    document
        .getElementById(
            "masterGTINFileInput"
        )
        ?.addEventListener(
            "change",
            function(event){

                if(
                    typeof handleMasterGTINFileSelection ===
                    "function"
                ){

                    handleMasterGTINFileSelection(
                        event
                    );

                }

            }
        );


    document
        .getElementById(
            "mappingFileInput"
        )
        ?.addEventListener(
            "change",
            function(event){

                if(
                    typeof handleMappingFileSelection ===
                    "function"
                ){

                    handleMappingFileSelection(
                        event
                    );

                }

            }
        );


    document
        .getElementById(
            "zebraWorkFileInput"
        )
        ?.addEventListener(
            "change",
            function(event){

                if(
                    typeof handleZebraWorkFileSelection ===
                    "function"
                ){
                    handleZebraWorkFileSelection(
                        event
                    );
                }
            }
        );


    document
        .getElementById(
            "zebraSessionFileInput"
        )
        ?.addEventListener(
            "change",
            function(event){

                if(
                    typeof handleZebraSessionSelection ===
                    "function"
                ){

                    handleZebraSessionSelection(
                        event
                    );

                }

            }
        );

}


/* =====================================================
   REPORT SEARCH BINDING
===================================================== */

function bindReportSearch(){

    const input =
        document.getElementById(
            "reportItemSearch"
        );


    if(!input){
        return;
    }


    input.addEventListener(

        "input",

        debounce(
            function(){

                const query =
                    normalizeText(
                        input.value
                    );


                if(!query){

                    renderReportItemSearchResults(
                        []
                    );

                    AppState.ui
                        .selectedReportItem =
                        null;

                    return;

                }


                let items = [];


                if(
                    typeof getHistoricalSearchableItems ===
                    "function"
                ){

                    items =
                        getHistoricalSearchableItems();

                }
                else{

                    items =
                        getSearchableItems();

                }


                const results =
                    searchItems(
                        items,
                        query,
                        APP_CONFIG
                            .receiving
                            .searchResultLimit
                    );


                renderReportItemSearchResults(
                    results
                );

            },
            150
        )

    );

}


/* =====================================================
   BIND CORE EVENTS
===================================================== */

function bindCoreApplicationEvents(){

    bindCoreApplicationButtons();

    bindCoreFileInputs();

    bindReportSearch();

}


/* =====================================================
   MODULE STATUS
===================================================== */

function getApplicationModuleStatus(){

    return deepClone(
        PharmacyApp.modules
    );

}


/* =====================================================
   APPLICATION HEALTH
===================================================== */

function logApplicationHealth(){

    Logger.info(
        "Application health",
        {

            initialized:
                PharmacyApp.initialized,

            modules:
                getApplicationModuleStatus(),

            state:
                getStateDebugSnapshot()

        }
    );

}


/* =====================================================
   FATAL STARTUP ERROR
===================================================== */

function handleFatalStartupError(
    error
){

    PharmacyApp.initialized =
        false;


    Logger.error(
        "Fatal application startup error",
        error
    );


    try{

        setSystemStatus(
            "ERROR",
            "error"
        );

    }
    catch(ignore){

        const status =
            document.getElementById(
                "systemStatus"
            );


        if(status){

            status.textContent =
                "ERROR";


            status.className =
                "systemStatus error";

        }

    }


    const container =
        document.getElementById(
            "toastContainer"
        );


    if(container){

        const message =
            document.createElement(
                "div"
            );


        message.className =
            "toastMessage error";


        message.textContent =
            "Application startup failed. Please check the browser console.";


        container.appendChild(
            message
        );

    }

}


/* =====================================================
   FINAL STARTUP BINDING
===================================================== */

window.addEventListener(
    "load",
    function(){

        /*
           DOMContentLoaded initializes the app.
           This second listener binds core buttons
           after all scripts and resources exist.
        */

        try{

            bindCoreApplicationEvents();

            logApplicationHealth();

        }
        catch(error){

            Logger.error(
                "Core event binding failed",
                error
            );

        }

    }
);


/* =====================================================
   END APPLICATION CORE
===================================================== */

function enforceOwnerOnlyMasterGTINUI(){
 const btn=document.getElementById("btnUpdateMasterGTIN");
 const input=document.getElementById("masterGTINFileInput");
 const owner=(typeof isSystemOwner==="function" && isSystemOwner());
 if(btn){ btn.hidden=!owner; btn.setAttribute("aria-hidden",owner?"false":"true"); }
 if(input){ input.disabled=!owner; }
}
window.addEventListener("auth:context-ready",enforceOwnerOnlyMasterGTINUI);
setTimeout(enforceOwnerOnlyMasterGTINUI,500);


/* =====================================================
   PHASE 2C.6.2 — CONSISTENT LIVE DASHBOARD METRICS
===================================================== */
function calculateDashboardMetrics(){
    const items=Array.isArray(AppState?.workspace?.orderData)?AppState.workspace.orderData:[];
    const history=Array.isArray(AppState?.workspace?.receivingHistory)?AppState.workspace.receivingHistory:[];
    let completedItems=0, remainingItems=0, remainingUnits=0, overReceivedItems=0, manualItems=0;
    items.forEach(item=>{
        const ordered=Math.max(0,toNumber(item?.orderedQty,0));
        const received=Math.max(0,toNumber(item?.receivedQty,0));
        const remaining=Math.max(0,ordered-received);
        item.remainingQty=remaining;
        if(ordered>0 && received>=ordered) completedItems++;
        remainingUnits+=remaining;
        if(remaining>0) remainingItems++;
        if(received>ordered) overReceivedItems++;
        if(item?.manual===true && received>0) manualItems++;
    });
    const scannerName=toSafeString(APP_CONFIG?.transactionSources?.scanner||"SCANNER").toUpperCase();
    const totalScans=history.filter(tx=>{
        const source=toSafeString(tx?.source||"").toUpperCase();
        return toNumber(tx?.quantity,0)>0 && (source===scannerName || source.includes("SCAN")) && !source.includes("UNDO");
    }).length;
    return {totalItems:items.length,completedItems,remainingItems,remainingUnits,overReceivedItems,manualItems,totalScans};
}
function recalculateStatistics(){
    AppState.statistics=Object.assign(AppState.statistics||{},calculateDashboardMetrics());
    return AppState.statistics;
}
