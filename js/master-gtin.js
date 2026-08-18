"use strict";

/* =====================================================
   PHARMACY RECEIVING SYSTEM V3
   MASTER GTIN DATABASE ENGINE

   Purpose:
   - Import the system-wide GTIN master file once.
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
    storagePointerKey:"pharmacy_master_gtin_active_db_v2",
    databasePrefix:"pharmacy_master_gtin_v2_",
    metadata:{
        installed:false,
        fileName:"",
        updatedAt:null,
        itemCount:0,
        duplicateGTINCount:0,
        cloudVersion:""
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
           device cache. Pull the system-wide database after auth
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

        /* Phase 2B.9.1: large masters are uploaded in chunks to a staging
           import and committed atomically. This avoids oversized RPC payloads
           and keeps the previous Global GTIN active until the whole file is ready. */
        const cloudCommit = await uploadGlobalMasterGTINInChunks(
            parsed.records,
            file.name
        );

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
                parsed.duplicateGTINCount,
            cloudVersion:
                cloudCommit && cloudCommit.version
                ? String(cloudCommit.version)
                : ""
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

    validateMasterGTINExcelFile(file);

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer,{
        type:"array",
        cellDates:false,
        cellText:true,
        cellNF:true
    });

    /* Preserve every unique Item Number + GTIN pair. One item can legitimately
       have more than one barcode, and the central master must not discard them. */
    const recordMap = new Map();
    const gtinOwners = new Map();

    for(const sheetName of workbook.SheetNames){
        const worksheet = workbook.Sheets[sheetName];
        if(!worksheet || !worksheet["!ref"]){ continue; }

        const decoded = XLSX.utils.decode_range(worksheet["!ref"]);
        const range = {
            s:{r:decoded.s.r,c:0},
            e:{r:decoded.e.r,c:Math.min(decoded.e.c,24)}
        };
        const matrix = XLSX.utils.sheet_to_json(worksheet,{
            header:1,
            defval:"",
            raw:false,
            range:range,
            blankrows:false
        });
        if(matrix.length < 2){ continue; }

        const header = findMasterGTINHeader(matrix);
        if(!header){ continue; }

        for(let rowIndex=header.rowIndex+1; rowIndex<matrix.length; rowIndex++){
            const row = matrix[rowIndex] || [];
            const gtin = normalizeBarcodeFromExcel(row[header.gtin]);
            const itemCode = normalizeItemCode(row[header.itemCode]);
            const itemName = toSafeString(row[header.itemName]);
            const category = header.category >= 0 ? toSafeString(row[header.category]) : "";
            if(!gtin || !itemCode){ continue; }

            const key = itemCode + "|" + gtin;
            recordMap.set(key,{itemCode,gtin,itemName,category});

            if(!gtinOwners.has(gtin)){ gtinOwners.set(gtin,new Set()); }
            gtinOwners.get(gtin).add(itemCode);
        }
    }

    let duplicateGTINCount = 0;
    gtinOwners.forEach(itemCodes=>{ if(itemCodes.size > 1){ duplicateGTINCount++; } });

    return {
        records:Array.from(recordMap.values()),
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
                    "ean",
                    "ean13",
                    "ean 13",
                    "ean14",
                    "ean 14",
                    "upc",
                    "data matrix",
                    "datamatrix",
                    "product barcode",
                    "item barcode"
                ].includes(value)
            );

        const itemCode =
            normalized.findIndex(value=>
                [
                    "item number",
                    "item no",
                    "item code",
                    "item",
                    "itemnumber",
                    "itemcode",
                    "sku",
                    "material",
                    "material number",
                    "material no",
                    "product code",
                    "product number",
                    "article",
                    "article number"
                ].includes(value)
            );

        const itemName =
            normalized.findIndex(value=>
                [
                    "name",
                    "item name",
                    "description",
                    "material description",
                    "product description",
                    "item description"
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
    if(!MasterGTINEngine.db || !MasterGTINEngine.metadata.installed){ return false; }
    const code=normalizeItemCode(itemCode);
    if(!code){ return false; }
    const records=await getMasterGTINRecordsByItemCodes(MasterGTINEngine.db,[code]);
    if(records.length===0){ return false; }

    const orderItem=AppState.indexes.itemByCode.get(code);
    const categoryRecord=records.find(record=>record.category);
    if(orderItem && categoryRecord){ orderItem.category=categoryRecord.category; }

    let added=false;
    for(const record of records){
        const conflict=AppState.workspace.mappingData.some(mapping=>
            normalizeGTIN(mapping.gtin)===record.gtin && normalizeItemCode(mapping.itemCode)!==code
        );
        if(conflict){ continue; }
        const exists=AppState.workspace.mappingData.some(mapping=>
            normalizeGTIN(mapping.gtin)===record.gtin && normalizeItemCode(mapping.itemCode)===code
        );
        if(!exists){
            AppState.workspace.mappingData.push({itemCode:code,gtin:record.gtin,source:"MASTER"});
            added=true;
        }
    }
    if(added){ rebuildStateIndexes(); AppEvents.emit("files:updated"); }
    return added || records.length>0;
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

        const request = indexedDB.open(dbName,1);
        request.onupgradeneeded = function(event){
            const db = event.target.result;
            if(!db.objectStoreNames.contains(MasterGTINEngine.recordsStore)){
                const store = db.createObjectStore(MasterGTINEngine.recordsStore,{keyPath:"key"});
                store.createIndex("itemCode","itemCode",{unique:false});
                store.createIndex("gtin","gtin",{unique:false});
            }
            if(!db.objectStoreNames.contains(MasterGTINEngine.metaStore)){
                db.createObjectStore(MasterGTINEngine.metaStore,{keyPath:"key"});
            }
        };
        request.onsuccess = ()=>resolve(request.result);
        request.onerror = ()=>reject(request.error || new Error("Unable to open Master GTIN database"));
    });
}

async function writeMasterGTINRecords(db,records){
    const batchSize = 2000;
    for(let start=0; start<records.length; start+=batchSize){
        const batch = records.slice(start,start+batchSize);
        await new Promise((resolve,reject)=>{
            const tx = db.transaction(MasterGTINEngine.recordsStore,"readwrite");
            const store = tx.objectStore(MasterGTINEngine.recordsStore);
            batch.forEach(record=>{
                const itemCode = normalizeItemCode(record.itemCode);
                const gtin = normalizeGTIN(record.gtin);
                if(!itemCode || !gtin){ return; }
                store.put({
                    ...record,
                    itemCode,
                    gtin,
                    key:itemCode + "|" + gtin
                });
            });
            tx.oncomplete=()=>resolve();
            tx.onerror=()=>reject(tx.error || new Error("Unable to write Master GTIN records"));
            tx.onabort=()=>reject(tx.error || new Error("Master GTIN write was aborted"));
        });
    }
}

function writeMasterGTINMetadata(db,metadata){
    return new Promise((resolve,reject)=>{
        const tx=db.transaction(MasterGTINEngine.metaStore,"readwrite");
        tx.objectStore(MasterGTINEngine.metaStore).put({key:"master",...metadata});
        tx.oncomplete=()=>resolve();
        tx.onerror=()=>reject(tx.error);
        tx.onabort=()=>reject(tx.error);
    });
}

function readMasterGTINMetadata(db){
    return new Promise((resolve,reject)=>{
        const tx=db.transaction(MasterGTINEngine.metaStore,"readonly");
        const request=tx.objectStore(MasterGTINEngine.metaStore).get("master");
        request.onsuccess=()=>resolve(request.result || null);
        request.onerror=()=>reject(request.error);
    });
}

function getMasterGTINRecordsByItemCodes(db,itemCodes){
    return new Promise((resolve,reject)=>{
        const codes=Array.from(new Set((itemCodes||[]).map(normalizeItemCode).filter(Boolean)));
        if(codes.length===0){ resolve([]); return; }
        const tx=db.transaction(MasterGTINEngine.recordsStore,"readonly");
        const store=tx.objectStore(MasterGTINEngine.recordsStore);
        const index=store.index("itemCode");
        const results=[];
        let remaining=codes.length;
        let failed=false;

        codes.forEach(code=>{
            const request=index.getAll(code);
            request.onsuccess=()=>{
                if(Array.isArray(request.result)){ results.push(...request.result); }
                remaining--;
                if(remaining===0 && !failed){ resolve(results); }
            };
            request.onerror=()=>{
                if(failed){ return; }
                failed=true;
                reject(request.error);
            };
        });
    });
}

/* =====================================================
   DIRECT GLOBAL GTIN LOOKUP
   Phase 2B.8

   Receiving must not depend only on mappingData having
   already been projected into the current workspace.
   The central Global GTIN cache can resolve a scanned
   GTIN directly and then attach it to the current order.
===================================================== */

async function getPharmacyLearnedGTINRecord(gtin){
    const normalized=normalizeGTIN(gtin);
    if(!normalized || typeof authRpc!=="function" || typeof AuthState==="undefined" || !AuthState.context?.pharmacy_id){ return null; }
    try{
        const rows=await authRpc("resolve_pharmacy_learned_gtin",{p_pharmacy_id:AuthState.context.pharmacy_id,p_gtin:normalized});
        const row=Array.isArray(rows)?rows[0]:rows;
        if(!row || !row.item_code){ return null; }
        return {gtin:normalized,itemCode:row.item_code,itemName:row.item_name||"",source:"PHARMACY_LEARNED"};
    }catch(error){ Logger.warn("Local learned GTIN lookup failed",error); return null; }
}

async function savePharmacyLearnedGTIN(gtin,itemCode,itemName){
    const normalized=normalizeGTIN(gtin), code=normalizeItemCode(itemCode), name=toSafeString(itemName).trim();
    if(!normalized || !code || !name){ throw new Error("GTIN, Item Code and Item Name are required"); }
    if(typeof authRpc!=="function" || !AuthState?.context?.pharmacy_id){ throw new Error("Pharmacy context is unavailable"); }
    const result=await authRpc("learn_pharmacy_gtin",{p_pharmacy_id:AuthState.context.pharmacy_id,p_gtin:normalized,p_item_code:code,p_item_name:name});
    addMappingRecord({itemCode:code,gtin:normalized,source:"PHARMACY_LEARNED"});
    return Array.isArray(result)?result[0]:result;
}

const PharmFlowGTINScanCache = {
    records:new Map(),
    learnedMissUntil:new Map(),
    maxRecords:750
};

function cacheGTINScanRecord(gtin,record){
    if(!gtin || !record) return;
    if(PharmFlowGTINScanCache.records.size >= PharmFlowGTINScanCache.maxRecords){
        const first=PharmFlowGTINScanCache.records.keys().next().value;
        if(first) PharmFlowGTINScanCache.records.delete(first);
    }
    PharmFlowGTINScanCache.records.set(gtin,record);
}

function getCurrentOrderItemCodes(){
    return new Set(
        (AppState?.workspace?.orderData||[])
            .map(item=>normalizeItemCode(item?.itemCode))
            .filter(Boolean)
    );
}

async function getLocalGlobalMasterGTINRecord(gtin){
    const normalized=normalizeGTIN(gtin);
    if(!normalized) return null;

    if(typeof ensureGlobalMasterGTINReady==="function" && !MasterGTINEngine.db){
        try{
            await ensureGlobalMasterGTINReady();
        }catch(error){
            Logger.warn("Global GTIN cache unavailable during scan",error);
        }
    }

    if(!MasterGTINEngine.db) return null;

    const variants=
        typeof createGTINVariants==="function"
            ? createGTINVariants(normalized)
            : [normalized];

    if(!variants.includes(normalized)) variants.unshift(normalized);

    const currentOrderCodes=getCurrentOrderItemCodes();

    for(const candidate of variants){
        const records=await new Promise((resolve,reject)=>{
            const tx=MasterGTINEngine.db.transaction(
                MasterGTINEngine.recordsStore,
                "readonly"
            );
            const index=tx.objectStore(MasterGTINEngine.recordsStore).index("gtin");
            const request=index.getAll(candidate);
            request.onsuccess=()=>resolve(
                Array.isArray(request.result) ? request.result : []
            );
            request.onerror=()=>reject(request.error);
        });

        if(!records.length) continue;

        const inOrder=records.filter(record=>
            currentOrderCodes.has(normalizeItemCode(record?.itemCode))
        );

        const candidates=inOrder.length ? inOrder : records;
        const owners=new Set(
            candidates
                .map(record=>normalizeItemCode(record?.itemCode))
                .filter(Boolean)
        );

        if(owners.size===1){
            return candidates[0];
        }

        Logger.warn(
            "Ambiguous Global GTIN belongs to multiple item numbers",
            candidate,
            Array.from(owners)
        );
        return null;
    }

    return null;
}

async function getMasterGTINRecordByGTIN(gtin){
    const normalized=normalizeGTIN(gtin);
    if(!normalized) return null;

    /*
       Phase 2C.10.5.2 PERFORMANCE RULE:
       Normal Receiving must not wait for a Supabase RPC on every scan.

       1. Session cache.
       2. Local IndexedDB copy of the authoritative Global Master.
       3. Only if no Global Master match exists, try pharmacy-learned aliases.
    */
    const cached=PharmFlowGTINScanCache.records.get(normalized);
    if(cached) return cached;

    let globalRecord=null;
    try{
        globalRecord=await getLocalGlobalMasterGTINRecord(normalized);
    }catch(error){
        Logger.warn("Local Global GTIN lookup failed",error);
    }

    if(globalRecord){
        cacheGTINScanRecord(normalized,globalRecord);
        return globalRecord;
    }

    /*
       Learned aliases are expected to be the minority path. A short negative
       cache prevents repeated network waits when an unknown barcode is scanned
       more than once during the same receiving run.
    */
    const missUntil=Number(
        PharmFlowGTINScanCache.learnedMissUntil.get(normalized)||0
    );

    if(missUntil > Date.now()){
        return null;
    }

    const learned=await getPharmacyLearnedGTINRecord(normalized);

    if(learned){
        cacheGTINScanRecord(normalized,learned);
        return learned;
    }

    PharmFlowGTINScanCache.learnedMissUntil.set(
        normalized,
        Date.now()+120000
    );

    return null;
}

window.clearPharmFlowGTINScanCache=function(){
    PharmFlowGTINScanCache.records.clear();
    PharmFlowGTINScanCache.learnedMissUntil.clear();
};

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

async function uploadGlobalMasterGTINInChunks(records,sourceFile){
    const beginResult=await authRpc("begin_global_master_gtin_import",{
        p_source_file:toSafeString(sourceFile || "")
    });
    const beginRow=Array.isArray(beginResult)?beginResult[0]:beginResult;
    const importId=typeof beginRow === "string" ? beginRow : (beginRow && (beginRow.import_id || beginRow.id));
    if(!importId){ throw new Error("Unable to start Global GTIN update"); }

    const chunkSize=750;
    for(let start=0; start<records.length; start+=chunkSize){
        const chunk=records.slice(start,start+chunkSize);
        await authRpc("append_global_master_gtin_import",{
            p_import_id:importId,
            p_records:chunk
        });
        if(typeof setLoadingText === "function"){
            setLoadingText("Uploading Global GTIN " + Math.min(start+chunk.length,records.length) + " / " + records.length + "...");
        }
    }

    const commitResult=await authRpc("commit_global_master_gtin_import",{
        p_import_id:importId
    });
    const row=Array.isArray(commitResult)?commitResult[0]:commitResult;
    return row || {version:String(importId),item_count:records.length};
}

async function getGlobalMasterGTINCloudMeta(){
    if(typeof authRpc !== "function" || typeof AuthState === "undefined" || !AuthState.context || !AuthState.context.pharmacy_id){
        return null;
    }
    const result=await authRpc("get_global_master_gtin_meta",{});
    const row=Array.isArray(result)?result[0]:result;
    return row || null;
}

async function syncGlobalMasterGTINFromCloud(options = {}){
    if(typeof authRpc !== "function" || typeof AuthState === "undefined" || !AuthState.context || !AuthState.context.pharmacy_id){
        return false;
    }

    const meta=await getGlobalMasterGTINCloudMeta();
    const cloudCount=meta ? Number(meta.item_count || 0) : 0;
    const cloudVersion=meta ? String(meta.version || "") : "";

    if(!meta || cloudCount===0){
        if(options.allowEmpty===true){
            const previousDbName=MasterGTINEngine.dbName;
            if(MasterGTINEngine.db){ MasterGTINEngine.db.close(); }
            MasterGTINEngine.db=null;
            MasterGTINEngine.dbName=null;
            MasterGTINEngine.metadata={installed:false,fileName:"",updatedAt:null,itemCount:0,duplicateGTINCount:0,cloudVersion:""};
            localStorage.removeItem(MasterGTINEngine.storagePointerKey);
            if(previousDbName){ deleteMasterGTINDatabase(previousDbName); }
        }
        return false;
    }

    if(
        options.forceDownload!==true &&
        MasterGTINEngine.db &&
        MasterGTINEngine.metadata.installed &&
        String(MasterGTINEngine.metadata.cloudVersion || "")===cloudVersion &&
        Number(MasterGTINEngine.metadata.itemCount || 0)===cloudCount
    ){
        if(AppState.workspace.orderData && AppState.workspace.orderData.length>0){
            await applyMasterGTINToCurrentOrder({silent:true});
        }
        return true;
    }

    const pageSize=1000;
    const records=[];
    for(let offset=0; offset<cloudCount; offset+=pageSize){
        const pageResult=await authRpc("get_global_master_gtin_page",{
            p_offset:offset,
            p_limit:pageSize
        });
        const rows=Array.isArray(pageResult)?pageResult:[];
        rows.forEach(row=>{
            const itemCode=normalizeItemCode(row.item_code);
            const gtin=normalizeGTIN(row.gtin);
            if(itemCode && gtin){
                records.push({
                    itemCode,
                    gtin,
                    itemName:toSafeString(row.item_name || ""),
                    category:toSafeString(row.category || "")
                });
            }
        });
        if(typeof setLoadingText === "function" && options.silent!==true){
            setLoadingText("Syncing Global GTIN " + Math.min(offset+rows.length,cloudCount) + " / " + cloudCount + "...");
        }
        if(rows.length===0){ break; }
    }

    if(records.length!==cloudCount){
        throw new Error("Global GTIN sync incomplete: received " + records.length + " of " + cloudCount + " records");
    }

    const previousDbName=MasterGTINEngine.dbName;
    const newDbName=MasterGTINEngine.databasePrefix + "cloud_" + Date.now();
    const newDb=await openMasterGTINDatabase(newDbName);
    await writeMasterGTINRecords(newDb,records);

    const metadata={
        installed:true,
        fileName:toSafeString(meta.source_file || "Supabase Global GTIN"),
        updatedAt:meta.updated_at || nowISO(),
        itemCount:records.length,
        duplicateGTINCount:0,
        cloudVersion
    };
    await writeMasterGTINMetadata(newDb,metadata);
    localStorage.setItem(MasterGTINEngine.storagePointerKey,newDbName);
    if(MasterGTINEngine.db){ MasterGTINEngine.db.close(); }
    MasterGTINEngine.db=newDb;
    MasterGTINEngine.dbName=newDbName;
    MasterGTINEngine.metadata=metadata;
    if(previousDbName && previousDbName!==newDbName){ deleteMasterGTINDatabase(previousDbName); }

    if(AppState.workspace.orderData && AppState.workspace.orderData.length>0){
        await applyMasterGTINToCurrentOrder({silent:true});
    }
    AppEvents.emit("masterGTIN:updated",getMasterGTINStatus());
    return true;
}

async function ensureGlobalMasterGTINReady(options = {}){
    const forceCloud=options.forceCloud===true;
    try{
        const meta=await getGlobalMasterGTINCloudMeta();
        const cloudVersion=meta ? String(meta.version || "") : "";
        const cloudCount=meta ? Number(meta.item_count || 0) : 0;
        const cacheCurrent=!!(
            MasterGTINEngine.db && MasterGTINEngine.metadata.installed &&
            cloudVersion && String(MasterGTINEngine.metadata.cloudVersion || "")===cloudVersion &&
            Number(MasterGTINEngine.metadata.itemCount || 0)===cloudCount
        );
        if(!cacheCurrent){
            return await syncGlobalMasterGTINFromCloud({allowEmpty:forceCloud,silent:options.silent===true});
        }
        if(AppState.workspace.orderData && AppState.workspace.orderData.length>0){
            await applyMasterGTINToCurrentOrder({silent:true});
        }
        return true;
    }
    catch(error){
        Logger.warn("Global GTIN cloud sync failed",error);
        if(!MasterGTINEngine.db){ throw error; }
        return true;
    }
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


/* =====================================================
   PHASE 2C.9.7 — GLOBAL MASTER ITEM SEARCH
   Used by Expiry Needs Review. This intentionally searches
   the Global Master cache, never the current order.
===================================================== */
async function searchGlobalMasterItems(query, limit = 8){
    const q=toSafeString(query).trim().toLowerCase();
    if(!q){ return []; }
    if(typeof ensureGlobalMasterGTINReady === "function"){
        try{ await ensureGlobalMasterGTINReady(); }catch(_){ }
    }
    if(!MasterGTINEngine.db){ return []; }

    const exactCode=normalizeItemCode(query);
    if(exactCode){
        const exact=await getMasterGTINRecordsByItemCodes(MasterGTINEngine.db,[exactCode]);
        if(exact.length){
            const first=exact[0];
            return [{itemCode:first.itemCode,itemName:first.itemName||"",category:first.category||"",gtinCount:new Set(exact.map(x=>x.gtin)).size}];
        }
    }

    return await new Promise((resolve,reject)=>{
        const tx=MasterGTINEngine.db.transaction(MasterGTINEngine.recordsStore,"readonly");
        const req=tx.objectStore(MasterGTINEngine.recordsStore).openCursor();
        const found=new Map();
        req.onsuccess=()=>{
            const cursor=req.result;
            if(!cursor || found.size>=limit){ resolve(Array.from(found.values())); return; }
            const r=cursor.value||{};
            const code=toSafeString(r.itemCode);
            const name=toSafeString(r.itemName);
            if((code.toLowerCase().includes(q)||name.toLowerCase().includes(q))&&!found.has(code)){
                found.set(code,{itemCode:code,itemName:name,category:toSafeString(r.category||""),gtinCount:1});
            }
            cursor.continue();
        };
        req.onerror=()=>reject(req.error);
    });
}
window.searchGlobalMasterItems=searchGlobalMasterItems;
