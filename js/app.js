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

    const workspace =
        AppState.workspace;


    if(
        workspace.orderData.length ===
        0
    ){

        showToast(
            "No current order to close",
            "warning"
        );

        return;

    }


    showConfirmModal(

        "Close Current Order",

        "The current order will be archived and the workspace will be cleared. Historical receiving data will remain available.",

        function(){

            if(
                typeof closeAndArchiveCurrentOrder ===
                "function"
            ){

                closeAndArchiveCurrentOrder();

            }
            else{

                showToast(
                    "Archive module is not ready yet",
                    "warning"
                );

            }

        }

    );

}


/* =====================================================
   RESET CURRENT WORKSPACE
===================================================== */

function requestResetWorkspace(){

    showConfirmModal(

        "Reset Current Workspace",

        "This will clear the current order and current receiving workspace. Historical archived data will not be deleted.",

        function(){

            resetCurrentWorkspace();

        }

    );

}


/* =====================================================
   RESET WORKSPACE
===================================================== */

function resetCurrentWorkspace(){

    try{

        clearCurrentWorkspace();

        startNewWorkspace();

        deleteWorkspaceSnapshot();

        saveApplicationState(
            false
        );


        refreshEntireUI();


        navigateTo(
            "dashboard"
        );


        showToast(
            "Current workspace reset",
            "success"
        );


        focusScannerInput();

    }
    catch(error){

        Logger.error(
            "Workspace reset failed",
            error
        );


        showToast(
            "Unable to reset workspace",
            "error"
        );

    }

}


/* =====================================================
   DELETE ALL HISTORICAL DATA
===================================================== */

function requestDeleteAllHistory(){

    showConfirmModal(

        "Delete All Historical Data",

        "This will permanently delete all archived orders and historical receiving transactions from this browser. This action cannot be undone.",

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

                document
                    .getElementById(
                        "masterGTINFileInput"
                    )
                    ?.click();

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