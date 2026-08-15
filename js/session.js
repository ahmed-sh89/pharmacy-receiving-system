"use strict";

/* =====================================================
   PHARMACY RECEIVING SYSTEM V3
   SESSION + ARCHIVE + INDEXEDDB ENGINE
===================================================== */


/* =====================================================
   SESSION ENGINE STATE
===================================================== */

const SessionEngine = {

    initialized:false,

    db:null,

    dbReady:false,

    dbPromise:null

};


/* =====================================================
   INITIALIZE SESSION ENGINE
===================================================== */

function initializeSession(){

    if(SessionEngine.initialized){
        return;
    }


    SessionEngine.initialized = true;


    initializeArchiveDatabase()
        .then(()=>{

            restoreHistoricalArchive();

        })
        .catch(error=>{

            Logger.error(
                "Archive database initialization failed",
                error
            );

            showToast(
                "Historical archive database unavailable",
                "warning"
            );

        });


    if(!AppState.session.id){

        AppState.session.id =
            createSessionId();

    }


    if(!AppState.session.createdAt){

        AppState.session.createdAt =
            nowISO();

    }


    ensureDeviceId();


    AppEvents.emit(
        "session:updated"
    );


    Logger.info(
        "Session module initialized"
    );

}


/* =====================================================
   CREATE RECEIVING SESSION
===================================================== */

function createReceivingSession(){

    AppState.session = {

        ...createEmptySession(),

        id:createSessionId(),

        deviceId:
            ensureDeviceId(),

        role:"LOCAL",

        createdAt:
            nowISO(),

        lastSave:
            null,

        pendingQueue:[]

    };


    saveWorkspaceSnapshot();


    AppEvents.emit(
        "session:updated"
    );


    showToast(
        "New session created",
        "success"
    );


    return AppState.session;

}


/* =====================================================
   INDEXEDDB INITIALIZATION
===================================================== */

function initializeArchiveDatabase(){

    if(SessionEngine.dbReady){

        return Promise.resolve(
            SessionEngine.db
        );

    }


    if(SessionEngine.dbPromise){

        return SessionEngine.dbPromise;

    }


    SessionEngine.dbPromise =
        new Promise(
            (
                resolve,
                reject
            )=>{

                if(
                    !("indexedDB" in window)
                ){

                    reject(
                        new Error(
                            "IndexedDB is not supported"
                        )
                    );

                    return;

                }


                const request =
                    indexedDB.open(
                        APP_CONFIG
                            .database
                            .name,

                        APP_CONFIG
                            .database
                            .version
                    );


                request.onupgradeneeded =
                    function(event){

                        const db =
                            event.target.result;


                        createArchiveStores(
                            db
                        );

                    };


                request.onsuccess =
                    function(event){

                        SessionEngine.db =
                            event.target.result;


                        SessionEngine.dbReady =
                            true;


                        SessionEngine.db
                            .onversionchange =
                            function(){

                                SessionEngine.db
                                    .close();

                                SessionEngine.dbReady =
                                    false;

                            };


                        resolve(
                            SessionEngine.db
                        );

                    };


                request.onerror =
                    function(){

                        reject(
                            request.error
                            ||
                            new Error(
                                "Unable to open IndexedDB"
                            )
                        );

                    };

            }
        );


    return SessionEngine.dbPromise;

}


/* =====================================================
   CREATE INDEXEDDB STORES
===================================================== */

function createArchiveStores(
    db
){

    const stores =
        APP_CONFIG
            .database
            .stores;


    if(
        !db.objectStoreNames
            .contains(
                stores.orders
            )
    ){

        const orderStore =
            db.createObjectStore(
                stores.orders,
                {
                    keyPath:"orderId"
                }
            );


        orderStore.createIndex(
            "closedAt",
            "closedAt",
            {
                unique:false
            }
        );

    }


    if(
        !db.objectStoreNames
            .contains(
                stores.transactions
            )
    ){

        const transactionStore =
            db.createObjectStore(
                stores.transactions,
                {
                    keyPath:"transactionId"
                }
            );


        transactionStore.createIndex(
            "itemCode",
            "itemCode",
            {
                unique:false
            }
        );


        transactionStore.createIndex(
            "dateTime",
            "dateTime",
            {
                unique:false
            }
        );


        transactionStore.createIndex(
            "orderId",
            "orderId",
            {
                unique:false
            }
        );

    }


    if(
        !db.objectStoreNames
            .contains(
                stores.sessions
            )
    ){

        db.createObjectStore(
            stores.sessions,
            {
                keyPath:"id"
            }
        );

    }


    if(
        !db.objectStoreNames
            .contains(
                stores.archive
            )
    ){

        db.createObjectStore(
            stores.archive,
            {
                keyPath:"id"
            }
        );

    }


    if(
        !db.objectStoreNames
            .contains(
                stores.metadata
            )
    ){

        db.createObjectStore(
            stores.metadata,
            {
                keyPath:"key"
            }
        );

    }

}


/* =====================================================
   DB TRANSACTION HELPER
===================================================== */

async function getDatabase(){

    if(
        SessionEngine.dbReady &&
        SessionEngine.db
    ){

        return SessionEngine.db;

    }


    return initializeArchiveDatabase();

}


/* =====================================================
   DB PUT
===================================================== */

async function dbPut(
    storeName,
    value
){

    const db =
        await getDatabase();


    return new Promise(
        (
            resolve,
            reject
        )=>{

            const transaction =
                db.transaction(
                    storeName,
                    "readwrite"
                );


            const store =
                transaction.objectStore(
                    storeName
                );


            const request =
                store.put(
                    deepClone(
                        value
                    )
                );


            request.onsuccess =
                function(){

                    resolve(
                        true
                    );

                };


            request.onerror =
                function(){

                    reject(
                        request.error
                    );

                };

        }
    );

}


/* =====================================================
   DB ADD MANY
===================================================== */

async function dbPutMany(
    storeName,
    values
){

    if(
        !Array.isArray(values) ||
        values.length === 0
    ){

        return true;

    }


    const db =
        await getDatabase();


    return new Promise(
        (
            resolve,
            reject
        )=>{

            const transaction =
                db.transaction(
                    storeName,
                    "readwrite"
                );


            const store =
                transaction.objectStore(
                    storeName
                );


            values.forEach(value=>{

                store.put(
                    deepClone(
                        value
                    )
                );

            });


            transaction.oncomplete =
                function(){

                    resolve(
                        true
                    );

                };


            transaction.onerror =
                function(){

                    reject(
                        transaction.error
                    );

                };

        }
    );

}


/* =====================================================
   DB GET ALL
===================================================== */

async function dbGetAll(
    storeName
){

    const db =
        await getDatabase();


    return new Promise(
        (
            resolve,
            reject
        )=>{

            const transaction =
                db.transaction(
                    storeName,
                    "readonly"
                );


            const store =
                transaction.objectStore(
                    storeName
                );


            const request =
                store.getAll();


            request.onsuccess =
                function(){

                    resolve(
                        request.result
                        ||
                        []
                    );

                };


            request.onerror =
                function(){

                    reject(
                        request.error
                    );

                };

        }
    );

}


/* =====================================================
   DB CLEAR STORE
===================================================== */

async function dbClearStore(
    storeName
){

    const db =
        await getDatabase();


    return new Promise(
        (
            resolve,
            reject
        )=>{

            const transaction =
                db.transaction(
                    storeName,
                    "readwrite"
                );


            const store =
                transaction.objectStore(
                    storeName
                );


            const request =
                store.clear();


            request.onsuccess =
                function(){

                    resolve(
                        true
                    );

                };


            request.onerror =
                function(){

                    reject(
                        request.error
                    );

                };

        }
    );

}


/* =====================================================
   ARCHIVE CURRENT ORDER
===================================================== */

async function closeAndArchiveCurrentOrder(){

    const workspace =
        AppState.workspace;


    if(
        !workspace ||
        workspace.orderData.length === 0
    ){

        showToast(
            "No current order to archive",
            "warning"
        );

        return false;

    }


    showLoading(
        "Closing and archiving current order..."
    );


    try{

        const closedAt =
            nowISO();


        const totalReceivedUnits =
            getCurrentOrderReceivedUnits();


        const archiveRecord = {

            orderId:
                workspace.orderId
                ||
                createOrderId(),

            orderName:
                workspace.orderName
                ||
                "Receiving Order",

            createdAt:
                workspace.createdAt
                ||
                closedAt,

            startedAt:
                workspace.startedAt
                ||
                workspace.createdAt
                ||
                closedAt,

            closedAt:
                closedAt,

            totalItems:
                workspace.orderData
                    .length,

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
                workspace
                    .receivingHistory
                    .length,

            totalReceivedUnits:
                totalReceivedUnits,

            orderFiles:
                deepClone(
                    workspace.orderFiles
                ),

            mappingFiles:
                deepClone(
                    workspace.mappingFiles
                ),

            items:
                deepClone(
                    workspace.orderData
                ),

            status:
                "Received",

            sessionId:
                AppState.session.id,

            deviceId:
                AppState.session.deviceId

        };


        /* Phase 2C.10.1: finalized archive is saved server-side BEFORE
           clearing this PC. This is the cross-PC authoritative copy. */
        if(
            typeof authRpc==="function" &&
            typeof AuthState!=="undefined" &&
            AuthState.context?.pharmacy_id
        ){
            const orderNumbers = Array.from(
                new Set(
                    (workspace.orderFiles||[])
                        .map(file=>String(file.documentId||file.orderNumber||"").trim())
                        .filter(Boolean)
                )
            );

            await authRpc("save_pharmflow_finalized_archive",{
                p_pharmacy_id:AuthState.context.pharmacy_id,
                p_archive_id:String(archiveRecord.orderId),
                p_order_numbers:orderNumbers,
                p_closed_at:closedAt,
                p_archive_payload:archiveRecord
            });
        }else{
            throw new Error("Cloud pharmacy context is unavailable. Archive was not cleared.");
        }


        const historicalTransactions =
            workspace
                .receivingHistory
                .map(transaction=>({

                    ...deepClone(
                        transaction
                    ),

                    orderId:
                        archiveRecord
                            .orderId

                }));


        await dbPut(
            APP_CONFIG
                .database
                .stores
                .orders,

            archiveRecord
        );


        await dbPutMany(
            APP_CONFIG
                .database
                .stores
                .transactions,

            historicalTransactions
        );


        await dbPut(
            APP_CONFIG
                .database
                .stores
                .sessions,

            {

                ...deepClone(
                    AppState.session
                ),

                id:
                    AppState.session.id
                    ||
                    createSessionId(),

                archivedAt:
                    closedAt,

                orderId:
                    archiveRecord
                        .orderId

            }
        );


        await restoreHistoricalArchive();


        clearCurrentWorkspace();


        startNewWorkspace();


        deleteWorkspaceSnapshot();


        saveWorkspaceSnapshot();


        AppEvents.emit(
            "archive:updated"
        );


        AppEvents.emit(
            "workspace:cleared"
        );


        navigateTo(
            "dashboard"
        );


        showToast(
            "Order archived successfully",
            "success"
        );


        return true;

    }
    catch(error){

        Logger.error(
            "Archive failed",
            error
        );


        showToast(
            "Unable to archive current order",
            "error"
        );


        return false;

    }
    finally{

        hideLoading();


        focusScannerInput();

    }

}


/* =====================================================
   RESTORE HISTORICAL ARCHIVE
===================================================== */

async function restoreHistoricalArchive(){
    try{
        let cloudOrders = null;

        if(
            navigator.onLine &&
            typeof authRpc==="function" &&
            typeof AuthState!=="undefined" &&
            AuthState.context?.pharmacy_id
        ){
            try{
                const rows=await authRpc("list_pharmflow_finalized_archives",{
                    p_pharmacy_id:AuthState.context.pharmacy_id
                });

                cloudOrders=(Array.isArray(rows)?rows:[])
                    .map(row=>row?.archive_payload)
                    .filter(Boolean);

                /* Once the cloud archive migration exists, it is authoritative.
                   Replace the browser's stale order store rather than merging it. */
                await dbClearStore(APP_CONFIG.database.stores.orders);

                for(const order of cloudOrders){
                    await dbPut(APP_CONFIG.database.stores.orders,order);
                }

            }catch(error){
                Logger.warn("Cloud finalized archive unavailable; using local cache",error);
                cloudOrders=null;
            }
        }

        const orders = cloudOrders !== null
            ? cloudOrders
            : await dbGetAll(APP_CONFIG.database.stores.orders);

        const transactions =
            await dbGetAll(
                APP_CONFIG.database.stores.transactions
            );

        AppState.archive.orders =
            (orders||[]).sort(
                (a,b)=>
                    new Date(b.closedAt||b.createdAt||0)
                    -
                    new Date(a.closedAt||a.createdAt||0)
            );

        AppState.archive.transactions =
            transactions.sort(
                (a,b)=>new Date(b.dateTime||0)-new Date(a.dateTime||0)
            );

        AppEvents.emit("archive:updated");

        Logger.info("Historical archive restored",{
            orders:AppState.archive.orders.length,
            transactions:AppState.archive.transactions.length,
            source:cloudOrders!==null ? "cloud" : "local-cache"
        });

        return true;
    }
    catch(error){
        Logger.error("Unable to restore archive",error);
        return false;
    }
}

/* =====================================================
   DELETE ALL HISTORY
===================================================== */

async function deleteAllHistoricalData(){

    /* Phase 2C.5.4.2: Historical deletion must be cloud + local.
       The old implementation only cleared this browser, leaving received
       Order Registry rows in Supabase and causing false duplicate blocks. */
    const phrase=window.prompt(
        "Type DELETE ALL HISTORICAL DATA to permanently remove all received order history for this pharmacy.\n\nGlobal GTIN Master, Returns Archive, users, and active uploaded orders are not affected.",
        ""
    );
    if(phrase!=="DELETE ALL HISTORICAL DATA"){
        /* Cancel is intentionally silent. A stale warning toast must never
           appear beside a successfully-clean Archive and imply data failure. */
        return false;
    }

    showLoading("Deleting historical data...");

    try{
        /* Supabase is authoritative across PCs. Delete finalized/received
           Order Registry + immutable source snapshots first. If cloud
           deletion fails, do NOT clear this browser and create split state. */
        if(typeof authRpc==="function" && typeof AuthState!=="undefined" && AuthState.context?.pharmacy_id){
            await authRpc("delete_all_pharmflow_received_history",{
                p_pharmacy_id:AuthState.context.pharmacy_id,
                p_confirmation:"DELETE ALL HISTORICAL DATA"
            });
            await authRpc("delete_all_pharmflow_finalized_archives",{
                p_pharmacy_id:AuthState.context.pharmacy_id,
                p_confirmation:"DELETE ALL HISTORICAL DATA"
            });
        }else{
            throw new Error("Pharmacy cloud context is unavailable. Sign in again before deleting historical data.");
        }

        await dbClearStore(APP_CONFIG.database.stores.orders);
        await dbClearStore(APP_CONFIG.database.stores.transactions);
        await dbClearStore(APP_CONFIG.database.stores.sessions);
        await dbClearStore(APP_CONFIG.database.stores.archive);

        AppState.archive.orders=[];
        AppState.archive.transactions=[];

        if(typeof refreshOrderLifecycleRegistry==="function"){
            await refreshOrderLifecycleRegistry();
        }
        if(typeof reconcileCloudWorkspaceAuthority==="function"){
            await reconcileCloudWorkspaceAuthority();
        }
        if(typeof syncGlobalMasterGTINFromCloud==="function"){
            try{ await syncGlobalMasterGTINFromCloud(); }catch(_){ }
        }
        if(typeof refreshMasterGTINUI==="function") refreshMasterGTINUI();
        if(typeof refreshItemTransferOrderOptions==="function"){
            await Promise.resolve(refreshItemTransferOrderOptions());
        }

        AppEvents.emit("archive:updated");

        showToast(
            "Historical data deleted successfully · Global GTIN Master remains active",
            "success"
        );

        return true;
    }catch(error){
        Logger.error("Historical data deletion failed",error);
        showToast(error.message||"Unable to delete historical data","error");
        return false;
    }finally{
        hideLoading();
    }
}


/* =====================================================
   PREPARE ZEBRA WORK FILE

   The PC exports only the current order and the GTIN
   mappings required for that order. Receiving quantities
   and transaction history are intentionally reset so the
   Zebra records only its own work. The PC later merges
   those transactions by unique Transaction ID.
===================================================== */

function prepareZebraWorkFile(){

    const items =
        AppState.workspace.orderData;

    if(!Array.isArray(items) || items.length === 0){

        showToast(
            "Load an order before preparing a Zebra file",
            "warning"
        );

        return false;
    }

    const orderCodes =
        new Set(
            items
                .map(item=>
                    normalizeItemCode(item.itemCode)
                )
                .filter(Boolean)
        );

    const zebraItems =
        items.map(item=>{

            const clean = deepClone(item);

            clean.receivedQty = 0;
            clean.remainingQty =
                toNumber(clean.orderedQty,0);
            clean.status =
                APP_CONFIG.statuses.pending;

            return clean;
        });

    const zebraMappings =
        AppState.workspace.mappingData
            .filter(mapping=>
                orderCodes.has(
                    normalizeItemCode(mapping.itemCode)
                )
            )
            .map(mapping=>
                deepClone(mapping)
            );

    const workFileId =
        createUniqueId("ZWORK");

    const payload = {

        type:
            APP_CONFIG.session.workFileType,

        version:
            APP_CONFIG.session.fileVersion,

        workFileId:
            workFileId,

        preparedAt:
            nowISO(),

        parentSessionId:
            AppState.session.id,

        orderId:
            AppState.workspace.orderId,

        orderName:
            AppState.workspace.orderName,

        orderFiles:
            deepClone(
                AppState.workspace.orderFiles || []
            ),

        orderData:
            zebraItems,

        mappingData:
            zebraMappings,

        instructions:{
            mode:"ZEBRA_OFFLINE",
            mergeByTransactionId:true,
            defaultScanQty:1
        }
    };

    const safeOrder =
        toSafeString(
            AppState.workspace.orderName ||
            AppState.workspace.orderId ||
            "Order"
        )
        .replace(/[^A-Za-z0-9_-]+/g,"_")
        .slice(0,50);

    const fileName =
        APP_CONFIG.session.workFilePrefix +
        "_" + safeOrder +
        "_" + dateOnlyISO() +
        APP_CONFIG.session.fileExtension;

    downloadJSON(
        payload,
        fileName
    );

    showToast(
        "Zebra work file prepared — " +
        zebraItems.length +
        " items",
        "success"
    );

    return payload;
}


/* =====================================================
   ZEBRA WORK FILE SELECTION
===================================================== */

async function handleZebraWorkFileSelection(event){

    const input = event.target;
    const files = Array.from(input.files || []);

    input.value = "";

    if(files.length === 0){
        return;
    }

    if(
        AppState.workspace.receivingHistory.length > 0
    ){

        const continueImport =
            window.confirm(
                "This device already has receiving activity. " +
                "Export the current Zebra Session first if you need it. " +
                "Continue and replace this local workspace?"
            );

        if(!continueImport){
            return false;
        }
    }

    showLoading(
        "Loading Zebra work file..."
    );

    try{

        const payload =
            await readJSONFile(files[0]);

        const result =
            importZebraWorkFile(payload);

        showToast(
            "Zebra order loaded — ready to scan",
            "success"
        );

        return result;
    }
    catch(error){

        Logger.error(
            "Zebra work file import failed",
            error
        );

        showToast(
            error && error.message
            ? error.message
            : "Invalid Zebra work file",
            "error"
        );

        return false;
    }
    finally{

        hideLoading();
        focusScannerInput();
    }
}


/* =====================================================
   IMPORT ZEBRA WORK FILE
===================================================== */

function importZebraWorkFile(payload){

    if(
        !payload ||
        payload.type !==
            APP_CONFIG.session.workFileType ||
        !Array.isArray(payload.orderData) ||
        !Array.isArray(payload.mappingData)
    ){

        throw new Error(
            "This is not a valid Zebra work file"
        );
    }

    const localDeviceId =
        ensureDeviceId();

    const workspace =
        createEmptyWorkspace();

    workspace.orderId =
        toSafeString(payload.orderId) ||
        createOrderId();

    workspace.orderName =
        toSafeString(payload.orderName);

    workspace.createdAt =
        nowISO();

    workspace.startedAt =
        nowISO();

    workspace.active = true;

    workspace.orderFiles =
        deepClone(payload.orderFiles || []);

    workspace.mappingFiles = [];

    workspace.orderData =
        payload.orderData.map(item=>{

            const clean = deepClone(item);

            clean.receivedQty = 0;
            clean.remainingQty =
                toNumber(clean.orderedQty,0);
            clean.status =
                APP_CONFIG.statuses.pending;

            return clean;
        });

    workspace.mappingData =
        deepClone(payload.mappingData);

    workspace.receivingHistory = [];
    workspace.lastScan = null;

    AppState.workspace = workspace;

    AppState.session = {

        ...createEmptySession(),

        id:
            createSessionId(),

        deviceId:
            localDeviceId,

        role:
            "ZEBRA",

        parentSessionId:
            toSafeString(
                payload.parentSessionId
            ),

        workFileId:
            toSafeString(
                payload.workFileId
            ),

        createdAt:
            nowISO(),

        lastSave:null,
        pendingQueue:[]
    };

    rebuildStateIndexes();
    recalculateStatistics();
    saveWorkspaceSnapshot();

    AppEvents.emit(
        "state:restored"
    );

    AppEvents.emit(
        "session:updated"
    );

    if(
        typeof setZebraInterfaceMode ===
        "function"
    ){

        setZebraInterfaceMode(true);
    }

    if(
        typeof navigateTo ===
        "function"
    ){

        navigateTo(
            "dashboard",
            {
                save:false,
                closeSidebar:true,
                focusScanner:true
            }
        );
    }

    return {
        items:workspace.orderData.length,
        mappings:workspace.mappingData.length,
        orderId:workspace.orderId
    };
}


/* =====================================================
   ZEBRA SESSION SUMMARY
===================================================== */

function getZebraSessionSummary(){

    const history =
        AppState.workspace.receivingHistory || [];

    const units =
        history.reduce(
            (sum,transaction)=>
                sum + toNumber(transaction.quantity,0),
            0
        );

    return {
        transactions:history.length,
        units:units,
        role:AppState.session.role,
        orderId:AppState.workspace.orderId
    };
}


/* =====================================================
   EXPORT ZEBRA SESSION
===================================================== */

function exportZebraSession(){

    const transactions =
        AppState.workspace
            .receivingHistory;


    if(
        !transactions ||
        transactions.length === 0
    ){

        showToast(
            "No receiving transactions to export",
            "warning"
        );

        return false;

    }


    const payload = {

        type:
            APP_CONFIG.session.sessionFileType,

        version:
            APP_CONFIG
                .session
                .fileVersion,

        exportedAt:
            nowISO(),

        sessionId:
            AppState.session.id,

        deviceId:
            AppState.session.deviceId,

        orderId:
            AppState.workspace.orderId,

        orderName:
            AppState.workspace.orderName,

        parentSessionId:
            AppState.session.parentSessionId,

        workFileId:
            AppState.session.workFileId,

        role:
            AppState.session.role,

        transactions:
            deepClone(
                transactions
            )

    };


    const fileName =
        APP_CONFIG
            .session
            .exportPrefix
        +
        "_"
        +
        dateOnlyISO()
        +
        "_"
        +
        toSafeString(
            AppState.session
                .deviceId
        )
        .replace(
            /[^A-Za-z0-9_-]/g,
            ""
        )
        +
        APP_CONFIG
            .session
            .fileExtension;


    downloadJSON(
        payload,
        fileName
    );


    showToast(
        "Zebra session exported",
        "success"
    );


    return true;

}


/* =====================================================
   ZEBRA FILE SELECTION
===================================================== */

async function handleZebraSessionSelection(
    event
){

    const input =
        event.target;


    const files =
        Array.from(
            input.files || []
        );


    input.value = "";


    if(files.length === 0){
        return;
    }


    const file =
        files[0];


    showLoading(
        "Merging Zebra session..."
    );


    try{

        const payload =
            await readJSONFile(
                file
            );


        const result =
            mergeZebraSessionData(
                payload
            );


        showToast(

            "Merge completed — New: " +
            result.imported +
            ", Duplicates/Skipped: " +
            result.skipped +
            ", Items updated: " +
            result.itemsUpdated,

            "success"

        );


        return result;

    }
    catch(error){

        Logger.error(
            "Zebra session merge failed",
            error
        );


        showToast(
            "Invalid Zebra session file",
            "error"
        );


        return false;

    }
    finally{

        hideLoading();


        focusScannerInput();

    }

}


/* =====================================================
   READ JSON FILE
===================================================== */

function readJSONFile(
    file
){

    return new Promise(
        (
            resolve,
            reject
        )=>{

            const reader =
                new FileReader();


            reader.onload =
                function(event){

                    try{

                        resolve(
                            JSON.parse(
                                event.target.result
                            )
                        );

                    }
                    catch(error){

                        reject(
                            error
                        );

                    }

                };


            reader.onerror =
                function(){

                    reject(
                        new Error(
                            "Unable to read session file"
                        )
                    );

                };


            reader.readAsText(
                file
            );

        }
    );

}


/* =====================================================
   MERGE ZEBRA SESSION
===================================================== */

function mergeZebraSessionData(
    payload
){

    if(
        !payload ||
        (
            payload.type &&
            payload.type !==
                APP_CONFIG.session.sessionFileType
        ) ||
        !Array.isArray(
            payload.transactions
        )
    ){

        throw new Error(
            "Invalid Zebra session format"
        );

    }


    if(
        payload.orderId &&
        AppState.workspace.orderId &&
        payload.orderId !==
            AppState.workspace.orderId
    ){

        throw new Error(
            "This Zebra session belongs to a different order"
        );

    }


    let imported = 0;

    let skipped = 0;

    let missingItems = 0;

    const affectedItems =
        new Set();


    payload.transactions
        .forEach(transaction=>{

            const transactionId =
                transaction
                    .transactionId;


            if(
                transactionId &&
                AppState.indexes
                    .transactionIds
                    .has(
                        transactionId
                    )
            ){

                skipped++;

                return;

            }


            const item =
                getItemByCode(
                    transaction.itemCode
                );


            if(!item){

                missingItems++;

                skipped++;

                return;

            }


            const quantity =
                toNumber(
                    transaction.quantity,
                    0
                );


            if(
                !Number.isFinite(quantity) ||
                quantity === 0
            ){

                skipped++;

                return;

            }


            const previousReceived =
                toNumber(
                    item.receivedQty,
                    0
                );


            item.receivedQty =
                Math.max(
                    0,
                    previousReceived +
                    quantity
                );


            item.remainingQty =
                calculateRemainingQty(
                    item.orderedQty,
                    item.receivedQty
                );


            item.status =
                calculateItemStatus(
                    item
                );


            const mergedTransaction =
                addReceivingTransaction({

                    ...transaction,

                    transactionId:
                        transactionId
                        ||
                        createTransactionId(),

                    orderId:
                        AppState.workspace
                            .orderId,

                    source:
                        APP_CONFIG
                            .transactionSources
                            .zebraMerge,

                    deviceId:
                        transaction.deviceId
                        ||
                        payload.deviceId
                        ||
                        "ZEBRA"

                });


            if(!mergedTransaction){

                item.receivedQty =
                    previousReceived;


                item.remainingQty =
                    calculateRemainingQty(
                        item.orderedQty,
                        item.receivedQty
                    );


                item.status =
                    calculateItemStatus(
                        item
                    );


                skipped++;

                return;

            }


            imported++;

            affectedItems.add(
                normalizeItemCode(
                    transaction.itemCode
                )
            );

        });


    recalculateStatistics();


    AppEvents.emit(
        "receiving:updated"
    );


    AppEvents.emit(
        "session:updated"
    );


    saveWorkspaceSnapshot();


    if(missingItems > 0){

        Logger.warn(
            "Zebra merge skipped missing items:",
            missingItems
        );

    }


    return {

        imported:
            imported,

        skipped:
            skipped,

        missingItems:
            missingItems,

        itemsUpdated:
            affectedItems.size,

        sourceDevice:
            payload.deviceId || "ZEBRA",

        sourceSession:
            payload.sessionId || ""

    };

}


/* =====================================================
   HISTORICAL SEARCHABLE ITEMS
===================================================== */

function getHistoricalSearchableItems(){

    const itemMap =
        new Map();


    /*
       Current order items
    */

    AppState.workspace
        .orderData
        .forEach(item=>{

            const code =
                normalizeItemCode(
                    item.itemCode
                );


            if(!code){
                return;
            }


            itemMap.set(
                code,
                {

                    itemCode:
                        code,

                    itemName:
                        toSafeString(
                            item.itemName
                        )

                }
            );

        });


    /*
       Historical transactions
    */

    AppState.archive
        .transactions
        .forEach(transaction=>{

            const code =
                normalizeItemCode(
                    transaction.itemCode
                );


            if(!code){
                return;
            }


            if(
                !itemMap.has(
                    code
                )
            ){

                itemMap.set(
                    code,
                    {

                        itemCode:
                            code,

                        itemName:
                            toSafeString(
                                transaction
                                    .itemName
                            )

                    }
                );

            }

        });


    return sortByItemName(
        Array.from(
            itemMap.values()
        )
    );

}


/* =====================================================
   SESSION SUMMARY
===================================================== */

function getSessionSummary(){

    return {

        sessionId:
            AppState.session.id,

        deviceId:
            AppState.session.deviceId,

        orderId:
            AppState.workspace.orderId,

        currentTransactions:
            AppState.workspace
                .receivingHistory
                .length,

        archivedOrders:
            AppState.archive
                .orders
                .length,

        archivedTransactions:
            AppState.archive
                .transactions
                .length

    };

}


/* =====================================================
   END SESSION ENGINE
===================================================== */

/* =====================================================
   PHASE 2C.5.3 — DELETE ONE ARCHIVED ORDER LOCALLY
===================================================== */
async function dbDeleteKey(storeName,key){
    const db=await getDatabase();
    return new Promise((resolve,reject)=>{
        const transaction=db.transaction(storeName,"readwrite");
        const store=transaction.objectStore(storeName);
        const request=store.delete(key);
        request.onsuccess=()=>resolve(true);
        request.onerror=()=>reject(request.error);
    });
}

async function dbDeleteWhere(storeName,predicate){
    const db=await getDatabase();
    return new Promise((resolve,reject)=>{
        const transaction=db.transaction(storeName,"readwrite");
        const store=transaction.objectStore(storeName);
        const request=store.openCursor();
        request.onsuccess=event=>{
            const cursor=event.target.result;
            if(!cursor){return;}
            try{
                if(predicate(cursor.value)){cursor.delete();}
                cursor.continue();
            }catch(error){reject(error);}
        };
        request.onerror=()=>reject(request.error);
        transaction.oncomplete=()=>resolve(true);
        transaction.onerror=()=>reject(transaction.error);
    });
}

async function deleteArchivedOrderLocalData(internalOrderId){
    const stores=APP_CONFIG.database.stores;
    await dbDeleteWhere(stores.transactions,row=>toSafeString(row&&row.orderId)===toSafeString(internalOrderId));
    await dbDeleteWhere(stores.sessions,row=>toSafeString(row&&row.orderId)===toSafeString(internalOrderId));
    await dbDeleteKey(stores.orders,internalOrderId);
    await restoreHistoricalArchive();
    AppEvents.emit("archive:updated");
    return true;
}
window.deleteArchivedOrderLocalData=deleteArchivedOrderLocalData;
