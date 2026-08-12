"use strict";

/* =====================================================
   PHARMACY RECEIVING SYSTEM V3
   APPLICATION STATE
===================================================== */

const AppState = {

    /* =================================================
       CURRENT WORKSPACE
    ================================================= */

    workspace:{

        orderId:null,

        orderName:"",

        createdAt:null,

        startedAt:null,

        closedAt:null,

        active:false,

        orderFiles:[],

        mappingFiles:[],

        orderData:[],

        mappingData:[],

        receivingHistory:[],

        lastScan:null

    },


    /* =================================================
       INDEXES
    ================================================= */

    indexes:{

        itemByCode:new Map(),

        itemByGTIN:new Map(),

        transactionIds:new Set()

    },


    /* =================================================
       SESSION
    ================================================= */

    session:{

        id:null,

        deviceId:null,

        role:"LOCAL",

        cloud:false,

        code:"",

        secret:"",

        cloudTotalScans:0,

        parentSessionId:null,

        workFileId:null,

        createdAt:null,

        lastSave:null,

        pendingQueue:[]

    },


    /* =================================================
       DASHBOARD
    ================================================= */

    statistics:{

        totalItems:0,

        completedItems:0,

        remainingItems:0,

        overReceivedItems:0,

        manualItems:0,

        totalScans:0

    },


    /* =================================================
       HISTORICAL DATA
    ================================================= */

    archive:{

        orders:[],

        transactions:[]

    },


    /* =================================================
       SETTINGS
    ================================================= */

    settings:{

        allowOverReceiving:
            APP_CONFIG.receiving.allowOverReceiving,

        autofocusScanner:
            APP_CONFIG.receiving.autofocusScanner,

        duplicateScanProtection:
            APP_CONFIG.receiving.duplicateScanProtection,

        autosaveEnabled:
            APP_CONFIG.autosave.enabled

    },


    /* =================================================
       UI STATE
    ================================================= */

    ui:{

        currentPage:"dashboard",

        sidebarOpen:false,

        sidebarCollapsed:false,

        loading:false,

        selectedReportItem:null

    }

};


/* =====================================================
   CREATE EMPTY WORKSPACE
===================================================== */

function createEmptyWorkspace(){

    return {

        orderId:null,

        orderName:"",

        createdAt:null,

        startedAt:null,

        closedAt:null,

        active:false,

        orderFiles:[],

        mappingFiles:[],

        orderData:[],

        mappingData:[],

        receivingHistory:[],

        lastScan:null

    };

}


/* =====================================================
   CREATE EMPTY SESSION
===================================================== */

function createEmptySession(){

    return {

        id:null,

        deviceId:null,

        role:"LOCAL",

        cloud:false,

        code:"",

        secret:"",

        cloudTotalScans:0,

        parentSessionId:null,

        workFileId:null,

        createdAt:null,

        lastSave:null,

        pendingQueue:[]

    };

}


/* =====================================================
   RESET STATISTICS
===================================================== */

function resetStatistics(){

    AppState.statistics.totalItems = 0;

    AppState.statistics.completedItems = 0;

    AppState.statistics.remainingItems = 0;

    AppState.statistics.overReceivedItems = 0;

    AppState.statistics.manualItems = 0;

    AppState.statistics.totalScans = 0;

}


/* =====================================================
   RECALCULATE STATISTICS
===================================================== */

function recalculateStatistics(){

    const items =
        AppState.workspace.orderData;

    AppState.statistics.totalItems =
        items.length;

    AppState.statistics.completedItems =
        items.filter(item=>
            item.status ===
            APP_CONFIG.statuses.completed
        ).length;

    AppState.statistics.remainingItems =
        items.filter(item=>
            toNumber(
                item.remainingQty,
                0
            ) > 0
        ).length;

    AppState.statistics.overReceivedItems =
        items.filter(item=>
            item.status ===
            APP_CONFIG.statuses.over
        ).length;

    AppState.statistics.manualItems =
        items.filter(item=>
            item.manual === true
        ).length;

    AppState.statistics.totalScans =
        AppState.session && AppState.session.cloud === true
        ? toNumber(AppState.session.cloudTotalScans,AppState.workspace.receivingHistory.length)
        : AppState.workspace.receivingHistory.length;

}


/* =====================================================
   REBUILD INDEXES
===================================================== */

function rebuildStateIndexes(){

    AppState.indexes.itemByCode.clear();

    AppState.indexes.itemByGTIN.clear();

    AppState.indexes.transactionIds.clear();


    AppState.workspace.orderData
        .forEach(item=>{

            const itemCode =
                normalizeItemCode(
                    item.itemCode
                );

            if(itemCode){

                AppState.indexes
                    .itemByCode
                    .set(
                        itemCode,
                        item
                    );

            }

        });


    AppState.workspace.mappingData
        .forEach(mapping=>{

            const itemCode =
                normalizeItemCode(
                    mapping.itemCode
                );

            const gtin =
                normalizeGTIN(
                    mapping.gtin
                );

            if(
                itemCode &&
                gtin
            ){

                AppState.indexes
                    .itemByGTIN
                    .set(
                        gtin,
                        itemCode
                    );

            }

        });


    AppState.workspace.receivingHistory
        .forEach(transaction=>{

            if(transaction.transactionId){

                AppState.indexes
                    .transactionIds
                    .add(
                        transaction.transactionId
                    );

            }

        });

}


/* =====================================================
   START NEW WORKSPACE
===================================================== */

function startNewWorkspace(){

    AppState.workspace =
        createEmptyWorkspace();

    AppState.workspace.orderId =
        createOrderId();

    AppState.workspace.createdAt =
        nowISO();

    AppState.workspace.active =
        true;

    resetStatistics();

    rebuildStateIndexes();

    AppEvents.emit(
        "workspace:created",
        deepClone(
            AppState.workspace
        )
    );

}


/* =====================================================
   CLEAR CURRENT WORKSPACE
   DOES NOT DELETE ARCHIVE
===================================================== */

function clearCurrentWorkspace(){

    AppState.workspace =
        createEmptyWorkspace();

    resetStatistics();

    rebuildStateIndexes();

    AppEvents.emit(
        "workspace:cleared"
    );

}

/* =====================================================
   RESET OPERATIONAL STATE TO TRUE DEFAULT
   Clears only this device's current working state.
   Historical archive and Global GTIN are untouched.
===================================================== */

function resetOperationalStateToDefault(){

    const deviceId =
        ensureDeviceId();

    AppState.workspace =
        createEmptyWorkspace();

    AppState.session = {
        ...createEmptySession(),
        deviceId:deviceId
    };

    resetStatistics();
    rebuildStateIndexes();

    deleteWorkspaceSnapshot();

    AppEvents.emit(
        "workspace:cleared"
    );

    AppEvents.emit(
        "session:updated"
    );

    return true;

}

window.resetOperationalStateToDefault =
    resetOperationalStateToDefault;


/* =====================================================
   ADD OR UPDATE ORDER ITEM
===================================================== */

function upsertOrderItem(item){

    const itemCode =
        normalizeItemCode(
            item.itemCode
        );

    if(!itemCode){
        return null;
    }

    const existing =
        AppState.indexes
            .itemByCode
            .get(itemCode);

    const orderedQty =
        toNumber(
            item.orderedQty,
            0
        );

    if(existing){

        if(!existing.category && item.category){
            existing.category = toSafeString(item.category);
        }

        existing.orderedQty +=
            orderedQty;

        existing.remainingQty =
            calculateRemainingQty(
                existing.orderedQty,
                existing.receivedQty
            );

        existing.status =
            calculateItemStatus(
                existing
            );

        return existing;

    }


    const newItem = {

        itemCode:itemCode,

        itemName:
            toSafeString(
                item.itemName
            ),

        category:
            toSafeString(
                item.category || ""
            ),

        orderedQty:
            orderedQty,

        receivedQty:
            toNumber(
                item.receivedQty,
                0
            ),

        remainingQty:0,

        status:
            APP_CONFIG.statuses.pending,

        manual:
            item.manual === true

    };


    newItem.remainingQty =
        calculateRemainingQty(
            newItem.orderedQty,
            newItem.receivedQty
        );

    newItem.status =
        calculateItemStatus(
            newItem
        );


    AppState.workspace
        .orderData
        .push(newItem);


    AppState.indexes
        .itemByCode
        .set(
            itemCode,
            newItem
        );


    return newItem;

}


/* =====================================================
   ADD MAPPING
===================================================== */

function addMappingRecord(mapping){

    const itemCode =
        normalizeItemCode(
            mapping.itemCode
        );

    const gtin =
        normalizeGTIN(
            mapping.gtin
        );

    if(
        !itemCode ||
        !gtin
    ){

        return false;

    }


    const exists =
        AppState.workspace
            .mappingData
            .some(record=>
                normalizeItemCode(
                    record.itemCode
                ) === itemCode &&
                normalizeGTIN(
                    record.gtin
                ) === gtin
            );


    if(!exists){

        AppState.workspace
            .mappingData
            .push({

                itemCode:itemCode,

                gtin:gtin,

                source:
                    toSafeString(
                        mapping.source
                    ) || "MAPPING_FILE"

            });

    }


    AppState.indexes
        .itemByGTIN
        .set(
            gtin,
            itemCode
        );


    return true;

}


/* =====================================================
   FIND ITEM BY CODE
===================================================== */

function getItemByCode(itemCode){

    return (
        AppState.indexes
            .itemByCode
            .get(
                normalizeItemCode(
                    itemCode
                )
            )
        ||
        null
    );

}


/* =====================================================
   FIND ITEM BY GTIN
===================================================== */

function getItemByGTIN(gtin){

    const normalizedGTIN =
        normalizeGTIN(gtin);

    const itemCode =
        AppState.indexes
            .itemByGTIN
            .get(
                normalizedGTIN
            );

    if(!itemCode){
        return null;
    }

    return getItemByCode(
        itemCode
    );

}


/* =====================================================
   ADD RECEIVING TRANSACTION
===================================================== */

function addReceivingTransaction(
    transaction
){

    const transactionId =
        transaction.transactionId
        ||
        createTransactionId();


    if(
        AppState.indexes
            .transactionIds
            .has(transactionId)
    ){

        return false;

    }


    const record = {

        transactionId:
            transactionId,

        orderId:
            transaction.orderId
            ||
            AppState.workspace.orderId,

        dateTime:
            transaction.dateTime
            ||
            nowISO(),

        itemCode:
            normalizeItemCode(
                transaction.itemCode
            ),

        itemName:
            toSafeString(
                transaction.itemName
            ),

        gtin:
            normalizeGTIN(
                transaction.gtin
            ),

        quantity:
            toNumber(
                transaction.quantity,
                1
            ),

        lot:
            toSafeString(
                transaction.lot
            ),

        expiry:
            toSafeString(
                transaction.expiry
            ),

        serial:
            toSafeString(
                transaction.serial
            ),

        source:
            transaction.source
            ||
            APP_CONFIG
                .transactionSources
                .scanner,

        deviceId:
            transaction.deviceId
            ||
            AppState.session.deviceId,

        manual:
            transaction.manual === true,

        cloudTransactionId:
            transaction.cloudTransactionId || null,

        cloudSynced:
            transaction.cloudSynced === true

    };


    AppState.workspace
        .receivingHistory
        .unshift(record);


    AppState.indexes
        .transactionIds
        .add(
            transactionId
        );


    return record;

}


/* =====================================================
   SET LAST SCAN
===================================================== */

function setLastScan(data){

    AppState.workspace.lastScan = {

        ...data,

        scanTime:
            data.scanTime
            ||
            nowISO()

    };

}


/* =====================================================
   ENSURE DEVICE ID
===================================================== */

function ensureDeviceId(){

    let deviceId =
        storageGet(
            APP_CONFIG
                .storageKeys
                .deviceId,
            null
        );


    if(!deviceId){

        deviceId =
            createDeviceId();

        storageSet(
            APP_CONFIG
                .storageKeys
                .deviceId,
            deviceId
        );

    }


    AppState.session.deviceId =
        deviceId;


    return deviceId;

}


/* =====================================================
   SERIALIZE WORKSPACE
===================================================== */

function serializeCurrentWorkspace(){

    return {

        workspace:
            deepClone(
                AppState.workspace
            ),

        session:
            deepClone(
                AppState.session
            ),

        settings:
            deepClone(
                AppState.settings
            ),

        statistics:
            deepClone(
                AppState.statistics
            )

    };

}


/* =====================================================
   RESTORE WORKSPACE
===================================================== */

function restoreWorkspaceState(data){

    if(!data){
        return false;
    }


    if(data.workspace){

        AppState.workspace = {

            ...createEmptyWorkspace(),

            ...data.workspace

        };

    }


    if(data.session){

        AppState.session = {

            ...createEmptySession(),

            ...data.session

        };

    }


    if(data.settings){

        AppState.settings = {

            ...AppState.settings,

            ...data.settings

        };

    }


    ensureDeviceId();

    rebuildStateIndexes();

    recalculateStatistics();

    AppEvents.emit(
        "state:restored"
    );


    return true;

}


/* =====================================================
   SAVE LIGHTWEIGHT WORKSPACE
===================================================== */

function saveWorkspaceSnapshot(){

    const snapshot =
        serializeCurrentWorkspace();


    const success =
        storageSet(
            APP_CONFIG
                .storageKeys
                .currentWorkspace,
            snapshot
        );


    if(success){

        AppState.session.lastSave =
            nowISO();

        AppEvents.emit(
            "workspace:saved",
            AppState.session.lastSave
        );

    }


    return success;

}


/* =====================================================
   LOAD WORKSPACE SNAPSHOT
===================================================== */

function loadWorkspaceSnapshot(){

    const snapshot =
        storageGet(
            APP_CONFIG
                .storageKeys
                .currentWorkspace,
            null
        );


    if(!snapshot){
        return false;
    }


    return restoreWorkspaceState(
        snapshot
    );

}


/* =====================================================
   DELETE CURRENT SNAPSHOT
===================================================== */

function deleteWorkspaceSnapshot(){

    return storageRemove(
        APP_CONFIG
            .storageKeys
            .currentWorkspace
    );

}


/* =====================================================
   GET SEARCHABLE ITEMS
===================================================== */

function getSearchableItems(){

    return AppState.workspace
        .orderData;

}


/* =====================================================
   STATE DEBUG SNAPSHOT
===================================================== */

function getStateDebugSnapshot(){

    return {

        workspace:
            deepClone(
                AppState.workspace
            ),

        statistics:
            deepClone(
                AppState.statistics
            ),

        session:
            deepClone(
                AppState.session
            ),

        indexSizes:{

            itemByCode:
                AppState.indexes
                    .itemByCode
                    .size,

            itemByGTIN:
                AppState.indexes
                    .itemByGTIN
                    .size,

            transactionIds:
                AppState.indexes
                    .transactionIds
                    .size

        }

    };

}


/* =====================================================
   INITIALIZE STATE
===================================================== */

function initializeState(){

    ensureDeviceId();

    const restored =
        loadWorkspaceSnapshot();


    if(!restored){

        /* A fresh/sign-in state must be truly empty. A workspace/order is
           created only by an actual receiving workflow, not by page startup. */
        AppState.workspace = createEmptyWorkspace();
        AppState.session = createEmptySession();
        resetStatistics();
        rebuildStateIndexes();

    }


    recalculateStatistics();

    Logger.info(
        "State initialized",
        getStateDebugSnapshot()
    );

}


/* =====================================================
   END STATE
===================================================== */