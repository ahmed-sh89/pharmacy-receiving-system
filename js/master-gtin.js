"use strict";

/* =====================================================
   PHARMACY RECEIVING SYSTEM V3
   MASTER GTIN DATABASE ENGINE

   Purpose:
   - Import the pharmacy-wide GTIN master file once.
   - Store it in IndexedDB (not localStorage) because the
     file can contain tens of thousands of items.
   - Automatically map only the items in the current order.
   - Keep the legacy Mapping File import as an optional
     fallback.
===================================================== */

const MasterGTINEngine = {
    initialized:false,
    db:null,
    dbName:null,
    recordsStore:"records",
    metaStore:"metadata",
    storagePointerKey:"pharmacy_master_gtin_active_db_v1",
    databasePrefix:"pharmacy_master_gtin_v1_",
    metadata:{
        installed:false,
        fileName:"",
        updatedAt:null,
        itemCount:0,
        duplicateGTINCount:0
    },
    currentOrder:{
        matchedItems:0,
        missingItems:0,
        conflictGTINs:0
    }
};


/* =====================================================
   INITIALIZE
===================================================== */

async function initializeMasterGTIN(){

    if(MasterGTINEngine.initialized){
        return;
    }

    MasterGTINEngine.initialized = true;

    try{

        const activeDbName =
            localStorage.getItem(
                MasterGTINEngine.storagePointerKey
            );

        if(activeDbName){

            MasterGTINEngine.dbName =
                activeDbName;

            MasterGTINEngine.db =
                await openMasterGTINDatabase(
                    activeDbName
                );

            const metadata =
                await readMasterGTINMetadata(
                    MasterGTINEngine.db
                );

            if(metadata){

                MasterGTINEngine.metadata = {
                    ...MasterGTINEngine.metadata,
                    ...metadata,
                    installed:true
                };

            }

        }

        /* Supabase is the source of truth. IndexedDB is only a fast
           device cache. Pull the pharmacy-wide database after auth
           context is available; if offline, the last local cache remains usable. */
        if(typeof authRpc === "function" && typeof AuthState !== "undefined" && AuthState.context && AuthState.context.pharmacy_id){
            try{ await syncGlobalMasterGTINFromCloud(); }
            catch(error){ Logger.warn("Global GTIN sync unavailable; using local cache",error); }
        }

        if(
            MasterGTINEngine.metadata.installed &&
            AppState.workspace.orderData.length > 0
        ){

            await applyMasterGTINToCurrentOrder({
                silent:true
            });

        }

        AppEvents.on(
            "workspace:cleared",
            function(){

                MasterGTINEngine.currentOrder = {
                    matchedItems:0,
                    missingItems:0,
                    conflictGTINs:0
                };

                AppEvents.emit(
                    "masterGTIN:updated",
                    getMasterGTINStatus()
                );

            }
        );

        AppEvents.emit(
            "masterGTIN:updated",
            getMasterGTINStatus()
        );

        Logger.info(
            "Master GTIN module initialized",
            getMasterGTINStatus()
        );

    }
    catch(error){

        Logger.error(
            "Master GTIN initialization failed",
            error
        );

        showToast(
            "Master GTIN database could not be opened",
            "warning"
        );

    }
}


/* =====================================================
   FILE INPUT HANDLER
===================================================== */

async function handleMasterGTINFileSelection(event){

    const input = event.target;

    const file =
        input.files &&
        input.files[0]
        ? input.files[0]
        : null;

    input.value = "";

    if(!file){
        return;
    }

    if(typeof XLSX === "undefined"){

        showToast(
            "Excel library is not available",
            "error"
        );

        return;
    }

    showLoading(
        "Updating Master GTIN database..."
    );

    try{

        const parsed =
            await parseMasterGTINFile(
                file
            );

        if(parsed.records.length === 0){

            throw new Error(
                "No valid GTIN records were found"
            );

        }

        if(typeof authRpc !== "function" || typeof AuthState === "undefined" || !AuthState.context || !AuthState.context.pharmacy_id){
            throw new Error("Pharmacy access is required to update Global GTIN");
        }

        /* Write Supabase first. A failed cloud update must never be
           presented as a successful global update. */
        await authRpc("replace_pharmacy_master_gtin",{
            p_pharmacy_id:AuthState.context.pharmacy_id,
            p_records:parsed.records
        });

        const previousDbName =
            MasterGTINEngine.dbName;

        const newDbName =
            MasterGTINEngine.databasePrefix +
            Date.now();

        const newDb =
            await openMasterGTINDatabase(
                newDbName
            );

        await writeMasterGTINRecords(
            newDb,
            parsed.records
        );

        const metadata = {
            installed:true,
            fileName:file.name,
            updatedAt:nowISO(),
            itemCount:parsed.records.length,
            duplicateGTINCount:
                parsed.duplicateGTINCount
        };

        await writeMasterGTINMetadata(
            newDb,
            metadata
        );

        /*
           Only switch the active database AFTER the new
           copy has been written successfully. This keeps
           the previous Master intact if an import fails.
        */
        localStorage.setItem(
            MasterGTINEngine.storagePointerKey,
            newDbName
        );

        if(MasterGTINEngine.db){
            MasterGTINEngine.db.close();
        }

        MasterGTINEngine.db =
            newDb;

        MasterGTINEngine.dbName =
            newDbName;

        MasterGTINEngine.metadata =
            metadata;

        if(AppState.workspace.orderData.length > 0){

            await applyMasterGTINToCurrentOrder({
                silent:true
            });

        }

        AppEvents.emit(
            "masterGTIN:updated",
            getMasterGTINStatus()
        );

        AppEvents.emit(
            "files:updated"
        );

        showToast(
            "Global GTIN updated — " +
            parsed.records.length.toLocaleString() +
            " items",
            "success"
        );

        if(
            previousDbName &&
            previousDbName !== newDbName
        ){

            deleteMasterGTINDatabase(
                previousDbName
            );

        }

    }
    catch(error){

        Logger.error(
            "Master GTIN update failed",
            error
        );

        showToast(
            error.message ||
            "Unable to update Master GTIN",
            "error"
        );

    }
    finally{

        hideLoading();
        focusScannerInput();

    }
}


/* =====================================================
   PARSE MASTER FILE

   Expected master columns supplied by the pharmacy:
   Barcode | ITEM NUMBER | Name | ...
===================================================== */

async function parseMasterGTINFile(file){

    validateMasterGTINExcelFile(
        file
    );

    const buffer =
        await file.arrayBuffer();

    const workbook =
        XLSX.read(
            buffer,
            {
                type:"array",
                cellDates:false,
                cellText:true,
                cellNF:true
            }
        );

    const records = [];

    const seenItemCodes =
        new Set();

    const gtinOwners =
        new Map();

    for(const sheetName of workbook.SheetNames){

        const worksheet =
            workbook.Sheets[sheetName];

        if(!worksheet || !worksheet["!ref"]){
            continue;
        }

        const decoded =
            XLSX.utils.decode_range(
                worksheet["!ref"]
            );

        /*
           Read a practical header/data window so Category can
           be imported together with Barcode, Item Number and Name.
           The pharmacy master can contain 50k+ rows, so we still
           cap the inspected columns for good mobile performance.
        */
        const range = {
            s:{r:decoded.s.r,c:0},
            e:{r:decoded.e.r,c:Math.min(decoded.e.c,24)}
        };

        const matrix =
            XLSX.utils.sheet_to_json(
                worksheet,
                {
                    header:1,
                    defval:"",
                    raw:false,
                    range:range,
                    blankrows:false
                }
            );

        if(matrix.length < 2){
            continue;
        }

        const header =
            findMasterGTINHeader(
                matrix
            );

        if(!header){
            continue;
        }

        for(
            let rowIndex = header.rowIndex + 1;
            rowIndex < matrix.length;
            rowIndex++
        ){

            const row =
                matrix[rowIndex];

            const gtin =
                normalizeBarcodeFromExcel(
                    row[header.gtin]
                );

            const itemCode =
                normalizeItemCode(
                    row[header.itemCode]
                );

            const itemName =
                toSafeString(
                    row[header.itemName]
                );

            const category =
                header.category >= 0
                ? toSafeString(row[header.category])
                : "";

            if(!gtin || !itemCode){
                continue;
            }

            /*
               Item Number is the primary key. If the same
               Item Number is accidentally repeated in a
               file, keep the last valid row as the latest.
            */
            if(seenItemCodes.has(itemCode)){

                const previousIndex =
                    records.findIndex(
                        record=>
                            record.itemCode === itemCode
                    );

                if(previousIndex >= 0){

                    records[previousIndex] = {
                        itemCode:itemCode,
                        gtin:gtin,
                        itemName:itemName,
                        category:category
                    };

                }

            }
            else{

                seenItemCodes.add(
                    itemCode
                );

                records.push({
                    itemCode:itemCode,
                    gtin:gtin,
                    itemName:itemName,
                    category:category
                });

            }

            if(!gtinOwners.has(gtin)){
                gtinOwners.set(gtin,new Set());
            }

            gtinOwners
                .get(gtin)
                .add(itemCode);

        }

        if(records.length > 0){
            break;
        }

    }

    let duplicateGTINCount = 0;

    gtinOwners.forEach(itemCodes=>{

        if(itemCodes.size > 1){
            duplicateGTINCount++;
        }

    });

    return {
        records:records,
        duplicateGTINCount:
            duplicateGTINCount
    };
}


function findMasterGTINHeader(matrix){

    const limit =
        Math.min(
            matrix.length,
            20
        );

    for(let rowIndex = 0; rowIndex < limit; rowIndex++){

        const row =
            matrix[rowIndex] || [];

        const normalized =
            row.map(value=>
                normalizeText(value)
                    .replace(/[^a-z0-9]+/g," ")
                    .trim()
            );

        const gtin =
            normalized.findIndex(value=>
                [
                    "barcode",
                    "bar code",
                    "gtin",
                    "ean"
                ].includes(value)
            );

        const itemCode =
            normalized.findIndex(value=>
                [
                    "item number",
                    "item no",
                    "item code",
                    "item"
                ].includes(value)
            );

        const itemName =
            normalized.findIndex(value=>
                [
                    "name",
                    "item name",
                    "description"
                ].includes(value)
            );

        const category =
            normalized.findIndex(value=>
                [
                    "category",
                    "item category",
                    "product category",
                    "department",
                    "group",
                    "item group",
                    "classification"
                ].includes(value)
            );

        if(gtin >= 0 && itemCode >= 0){

            return {
                rowIndex:rowIndex,
                gtin:gtin,
                itemCode:itemCode,
                itemName:
                    itemName >= 0
                    ? itemName
                    : itemCode,
                category:category
            };

        }

    }

    return null;
}


function validateMasterGTINExcelFile(file){

    const name =
        toSafeString(
            file.name
        ).toLowerCase();

    if(
        !name.endsWith(".xlsx") &&
        !name.endsWith(".xls")
    ){

        throw new Error(
            "Master GTIN must be an Excel file"
        );

    }
}


/* =====================================================
   APPLY MASTER TO CURRENT ORDER
===================================================== */

async function applyMasterGTINToCurrentOrder(
    options = {}
){

    if(
        !MasterGTINEngine.db ||
        !MasterGTINEngine.metadata.installed
    ){

        return {
            matchedItems:0,
            missingItems:
                AppState.workspace.orderData.length,
            conflictGTINs:0
        };

    }

    const items =
        AppState.workspace.orderData;

    if(items.length === 0){

        MasterGTINEngine.currentOrder = {
            matchedItems:0,
            missingItems:0,
            conflictGTINs:0
        };

        return MasterGTINEngine.currentOrder;
    }

    const itemCodes =
        Array.from(
            new Set(
                items.map(item=>
                    normalizeItemCode(
                        item.itemCode
                    )
                ).filter(Boolean)
            )
        );

    const records =
        await getMasterGTINRecordsByItemCodes(
            MasterGTINEngine.db,
            itemCodes
        );

    const orderCodeSet =
        new Set(itemCodes);

    const gtinOwners =
        new Map();

    records.forEach(record=>{

        if(!orderCodeSet.has(record.itemCode)){
            return;
        }

        if(!gtinOwners.has(record.gtin)){
            gtinOwners.set(record.gtin,new Set());
        }

        gtinOwners
            .get(record.gtin)
            .add(record.itemCode);

    });

    const conflictingGTINs =
        new Set();

    gtinOwners.forEach((codes,gtin)=>{

        if(codes.size > 1){
            conflictingGTINs.add(gtin);
        }

    });

    /*
       Refresh only MASTER-created mappings. Optional
       legacy mapping files remain untouched as fallback.
    */
    AppState.workspace.mappingData =
        AppState.workspace.mappingData.filter(
            mapping=>
                mapping.source !== "MASTER"
        );

    let matchedItems = 0;

    const matchedCodes =
        new Set();

    records.forEach(record=>{

        if(conflictingGTINs.has(record.gtin)){
            return;
        }

        AppState.workspace.mappingData.push({
            itemCode:record.itemCode,
            gtin:record.gtin,
            source:"MASTER"
        });

        const orderItem = AppState.indexes.itemByCode.get(record.itemCode);
        if(orderItem && record.category){
            orderItem.category = record.category;
        }

        matchedCodes.add(
            record.itemCode
        );

    });

    matchedItems =
        matchedCodes.size;

    MasterGTINEngine.currentOrder = {
        matchedItems:matchedItems,
        missingItems:
            Math.max(
                0,
                itemCodes.length - matchedItems
            ),
        conflictGTINs:
            conflictingGTINs.size
    };

    rebuildStateIndexes();

    AppEvents.emit(
        "masterGTIN:order-applied",
        getMasterGTINStatus()
    );

    AppEvents.emit(
        "files:updated"
    );

    if(
        options.silent !== true &&
        matchedItems > 0
    ){

        showToast(
            "Master GTIN matched " +
            matchedItems +
            " order item(s)",
            "success"
        );

    }

    return MasterGTINEngine.currentOrder;
}


async function applyMasterGTINForItemCode(itemCode){

    if(
        !MasterGTINEngine.db ||
        !MasterGTINEngine.metadata.installed
    ){
        return false;
    }

    const code =
        normalizeItemCode(
            itemCode
        );

    if(!code){
        return false;
    }

    const records =
        await getMasterGTINRecordsByItemCodes(
            MasterGTINEngine.db,
            [code]
        );

    if(records.length === 0){
        return false;
    }

    const record =
        records[0];

    const orderItem = AppState.indexes.itemByCode.get(code);
    if(orderItem && record.category){
        orderItem.category = record.category;
    }

    const conflict =
        AppState.workspace.mappingData.some(mapping=>
            normalizeGTIN(mapping.gtin) === record.gtin &&
            normalizeItemCode(mapping.itemCode) !== code
        );

    if(conflict){
        return false;
    }

    const exists =
        AppState.workspace.mappingData.some(mapping=>
            normalizeGTIN(mapping.gtin) === record.gtin &&
            normalizeItemCode(mapping.itemCode) === code
        );

    if(!exists){

        AppState.workspace.mappingData.push({
            itemCode:code,
            gtin:record.gtin,
            source:"MASTER"
        });

        rebuildStateIndexes();
        AppEvents.emit("files:updated");

    }

    return true;
}


/* =====================================================
   INDEXEDDB HELPERS
===================================================== */

function openMasterGTINDatabase(dbName){

    return new Promise((resolve,reject)=>{

        if(!("indexedDB" in window)){
            reject(new Error("IndexedDB is not supported"));
            return;
        }

        const request =
            indexedDB.open(
                dbName,
                1
            );

        request.onupgradeneeded =
            function(event){

                const db =
                    event.target.result;

                if(!db.objectStoreNames.contains(
                    MasterGTINEngine.recordsStore
                )){

                    const store =
                        db.createObjectStore(
                            MasterGTINEngine.recordsStore,
                            {
                                keyPath:"itemCode"
                            }
                        );

                    store.createIndex(
                        "gtin",
                        "gtin",
                        {
                            unique:false
                        }
                    );

                }

                if(!db.objectStoreNames.contains(
                    MasterGTINEngine.metaStore
                )){

                    db.createObjectStore(
                        MasterGTINEngine.metaStore,
                        {
                            keyPath:"key"
                        }
                    );

                }

            };

        request.onsuccess =
            ()=>resolve(request.result);

        request.onerror =
            ()=>reject(
                request.error ||
                new Error("Unable to open Master GTIN database")
            );

    });
}


async function writeMasterGTINRecords(db,records){

    const batchSize = 2000;

    for(
        let start = 0;
        start < records.length;
        start += batchSize
    ){

        const batch =
            records.slice(
                start,
                start + batchSize
            );

        await new Promise((resolve,reject)=>{

            const tx =
                db.transaction(
                    MasterGTINEngine.recordsStore,
                    "readwrite"
                );

            const store =
                tx.objectStore(
                    MasterGTINEngine.recordsStore
                );

            batch.forEach(record=>{
                store.put(record);
            });

            tx.oncomplete =
                ()=>resolve();

            tx.onerror =
                ()=>reject(
                    tx.error ||
                    new Error("Unable to write Master GTIN records")
                );

            tx.onabort =
                ()=>reject(
                    tx.error ||
                    new Error("Master GTIN write was aborted")
                );

        });

    }
}


function writeMasterGTINMetadata(db,metadata){

    return new Promise((resolve,reject)=>{

        const tx =
            db.transaction(
                MasterGTINEngine.metaStore,
                "readwrite"
            );

        tx.objectStore(
            MasterGTINEngine.metaStore
        ).put({
            key:"master",
            ...metadata
        });

        tx.oncomplete = ()=>resolve();
        tx.onerror = ()=>reject(tx.error);
        tx.onabort = ()=>reject(tx.error);

    });
}


function readMasterGTINMetadata(db){

    return new Promise((resolve,reject)=>{

        const tx =
            db.transaction(
                MasterGTINEngine.metaStore,
                "readonly"
            );

        const request =
            tx.objectStore(
                MasterGTINEngine.metaStore
            ).get("master");

        request.onsuccess =
            ()=>resolve(request.result || null);

        request.onerror =
            ()=>reject(request.error);

    });
}


function getMasterGTINRecordsByItemCodes(
    db,
    itemCodes
){

    return new Promise((resolve,reject)=>{

        if(itemCodes.length === 0){
            resolve([]);
            return;
        }

        const tx =
            db.transaction(
                MasterGTINEngine.recordsStore,
                "readonly"
            );

        const store =
            tx.objectStore(
                MasterGTINEngine.recordsStore
            );

        const results = [];
        let remaining = itemCodes.length;
        let failed = false;

        itemCodes.forEach(itemCode=>{

            const request =
                store.get(itemCode);

            request.onsuccess =
                function(){

                    if(request.result){
                        results.push(request.result);
                    }

                    remaining--;

                    if(remaining === 0 && !failed){
                        resolve(results);
                    }

                };

            request.onerror =
                function(){

                    if(failed){
                        return;
                    }

                    failed = true;
                    reject(request.error);

                };

        });

    });
}


function deleteMasterGTINDatabase(dbName){

    try{
        indexedDB.deleteDatabase(dbName);
    }
    catch(error){
        Logger.warn(
            "Unable to remove old Master GTIN database",
            error
        );
    }
}


/* =====================================================
   GLOBAL SUPABASE SYNC
===================================================== */

async function syncGlobalMasterGTINFromCloud(){
    if(typeof authRpc !== "function" || !AuthState.context || !AuthState.context.pharmacy_id){
        return false;
    }

    const result = await authRpc("get_pharmacy_master_gtin",{
        p_pharmacy_id:AuthState.context.pharmacy_id
    });
    const rows = Array.isArray(result) ? result : [];
    if(rows.length === 0){ return false; }

    const records = rows.map(row=>({
        itemCode:normalizeItemCode(row.item_code),
        gtin:normalizeGTIN(row.gtin),
        itemName:toSafeString(row.item_name || ""),
        category:toSafeString(row.category || "")
    })).filter(row=>row.itemCode && row.gtin);

    if(records.length === 0){ return false; }

    const previousDbName = MasterGTINEngine.dbName;
    const newDbName = MasterGTINEngine.databasePrefix + "cloud_" + Date.now();
    const newDb = await openMasterGTINDatabase(newDbName);
    await writeMasterGTINRecords(newDb,records);

    const updatedAt = rows.reduce((latest,row)=>{
        const value = row.updated_at || null;
        return !latest || (value && value > latest) ? value : latest;
    },null);
    const metadata = {
        installed:true,
        fileName:"Supabase Global GTIN",
        updatedAt:updatedAt || nowISO(),
        itemCount:records.length,
        duplicateGTINCount:0
    };
    await writeMasterGTINMetadata(newDb,metadata);
    localStorage.setItem(MasterGTINEngine.storagePointerKey,newDbName);
    if(MasterGTINEngine.db){ MasterGTINEngine.db.close(); }
    MasterGTINEngine.db = newDb;
    MasterGTINEngine.dbName = newDbName;
    MasterGTINEngine.metadata = metadata;
    if(previousDbName && previousDbName !== newDbName){ deleteMasterGTINDatabase(previousDbName); }
    return true;
}

/* =====================================================
   STATUS
===================================================== */

function getMasterGTINStatus(){

    return {
        ...MasterGTINEngine.metadata,
        currentOrder:{
            ...MasterGTINEngine.currentOrder
        }
    };
}


function hasMasterGTIN(){
    return MasterGTINEngine.metadata.installed === true;
}


/* =====================================================
   END MASTER GTIN ENGINE
===================================================== */
