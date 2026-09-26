"use strict";

/* =====================================================
   PHARMACY RECEIVING SYSTEM V3
   EXCEL IMPORT ENGINE
===================================================== */

const ExcelEngine = {
    initialized:false,
    orderImportRunning:false,
    mappingImportRunning:false,
    maxHeaderScanRows:60
};

/* Publish one structural UI update only after the active-order manifest has
   been authoritatively confirmed.  This reuses existing UI events and adds
   neither polling nor a competing local state source. */
function publishConfirmedOrderUpload(){
    /* Render the confirmed workspace first. Manage Orders is a live overlay
       whose Handheld Assignment is derived from the active-order scope; firing
       its event before the base UI refresh can leave the overlay showing the
       pre-upload scope until it is reopened. */
    refreshEntireUI?.();
    AppEvents.emit("receiving:updated",{source:"order-upload-confirmed"});
    AppEvents.emit("files:updated",{source:"order-upload-confirmed"});

    /* One next-frame confirmation covers DOM work queued by refreshEntireUI
       without polling. It is intentionally a single UI refresh signal. */
    const publishFinalScope=()=>AppEvents.emit(
        "files:updated",
        {source:"order-upload-confirmed-rendered"}
    );
    if(typeof requestAnimationFrame==="function"){
        requestAnimationFrame(publishFinalScope);
    }else{
        setTimeout(publishFinalScope,0);
    }
}


/* =====================================================
   INITIALIZE
===================================================== */

function initializeExcel(){

    if(ExcelEngine.initialized){
        return;
    }

    if(typeof XLSX === "undefined"){

        Logger.error(
            "SheetJS XLSX library is not available"
        );

        showToast(
            "Excel library failed to load",
            "error"
        );

        return;
    }

    ExcelEngine.initialized = true;

    Logger.info(
        "Excel module initialized"
    );
}


/* =====================================================
   ORDER FILE SELECTION
===================================================== */

async function handleOrderFileSelection(event){

    const input = event.target;

    const files =
        Array.from(
            input.files || []
        );

    input.value = "";

    if(files.length === 0){
        return;
    }

    if(ExcelEngine.orderImportRunning){

        showToast(
            "Order import already running",
            "warning"
        );

        return;
    }

    if(
        files.length >
        APP_CONFIG.import.maxFilesPerImport
    ){

        showToast(
            "Too many files selected",
            "error"
        );

        return;
    }

    ExcelEngine.orderImportRunning =
        true;

    showLoading(
        "Importing order files..."
    );

    let preImportWorkspace=null;

    try{

        /* Phase 2C.10.4.1 — first synchronize the server generation fence.
           A second PC may have performed Reset after this browser last synced.
           We must adopt that generation BEFORE any new local Order is parsed. */
        if(typeof syncWorkspaceGenerationBeforeStructuralWrite==="function"){
            await syncWorkspaceGenerationBeforeStructuralWrite();
        }

        /* Merge against latest server-authoritative Active Order Manifest.
           Server-empty is authoritative after Reset. */
        if(typeof pullActiveOrderManifest==="function"){
            await pullActiveOrderManifest({clearIfMissing:true});
        }

        preImportWorkspace =
            typeof deepClone==="function"
                ? deepClone(AppState.workspace)
                : JSON.parse(JSON.stringify(AppState.workspace));

        const attemptedOrderNumbers=[];

        let importedRows = 0;
        let skippedRows = 0;
        let importedFiles = 0;
        let duplicateFiles = 0;

        /* Batch upload is a single structural operation. Parse and validate
           every selected workbook BEFORE mutating AppState so a bad third/fourth
           file can never leave the first files partially staged. Workbooks are
           parsed concurrently to keep 5+ order selection responsive. */
        const preparedFiles=await Promise.all(files.map(async file=>{
            validateExcelFile(file);
            const workbook=await readExcelWorkbook(file);
            const orderMeta=
                typeof inspectOrderWorkbookMetadata==="function"
                    ? inspectOrderWorkbookMetadata(workbook,file)
                    : (typeof inspectOrderFileMetadata==="function"
                        ? await inspectOrderFileMetadata(file)
                        : null);
            const orderNumber=normalizeOrderNumber(orderMeta?.orderNumber||"");
            if(!orderNumber){
                throw new Error("Order Number could not be detected in "+file.name);
            }
            return {file,workbook,orderMeta,orderNumber};
        }));

        const selectedOrderNumbers=preparedFiles.map(entry=>entry.orderNumber);
        const duplicateOrderNumbers=selectedOrderNumbers.filter(
            (orderNumber,index)=>selectedOrderNumbers.indexOf(orderNumber)!==index
        );
        if(duplicateOrderNumbers.length){
            throw new Error(
                "Duplicate Order Number selected in this batch: "+
                [...new Set(duplicateOrderNumbers)].join(", ")
            );
        }

        /* Lifecycle checks may require explicit operator recovery for an old
           active/completed order, so keep these deterministic and ordered. No
           local order rows have been changed yet. */
        for(const entry of preparedFiles){
            attemptedOrderNumbers.push(entry.orderNumber);
            if(typeof assertOrderNumberCanUpload==="function"){
                await assertOrderNumberCanUpload(entry.orderNumber);
            }
        }

        for(const entry of preparedFiles){
            const result=await importOrderFile(
                entry.file,
                entry.orderMeta,
                entry.workbook
            );

            importedRows+=result.importedRows;
            skippedRows+=result.skippedRows;
            if(result.duplicateFile) duplicateFiles++;
            if(result.success) importedFiles++;
        }

        /* Every non-duplicate selected file must now exist in the local batch
           before any manifest write. This turns silent partial imports into a
           safe rollback instead of presenting an incomplete order set. */
        const expectedImportedFiles=preparedFiles.length-duplicateFiles;
        if(importedFiles!==expectedImportedFiles){
            throw new Error(
                "Batch import was incomplete ("+importedFiles+" of "+
                expectedImportedFiles+" new order files staged). No partial batch will be kept."
            );
        }

        rebuildStateIndexes();

        if(
            typeof applyMasterGTINToCurrentOrder ===
            "function" &&
            typeof hasMasterGTIN ===
            "function" &&
            hasMasterGTIN()
        ){

            await applyMasterGTINToCurrentOrder({
                silent:true
            });

        }

        recalculateStatistics();

        /* Phase 2C.10.2.8:
           Active Order Files must be committed locally before cloud sync.
           Without this, PC2 can hydrate an older/empty workspace. */
        saveWorkspaceSnapshot?.();

        AppEvents.emit(
            "files:updated"
        );

        AppEvents.emit(
            "receiving:updated"
        );

        if(importedRows > 0){

            /* Phase 2C.10.3.9 — upload is not considered complete until the
               complete Active Order Manifest is verified on Supabase. Retry
               transient failures here instead of making the operator upload
               the same file a second time (which creates a false duplicate
               lifecycle conflict). */
            if(typeof saveActiveOrderManifest==="function"){
                let manifestSaved=false;
                let lastError=null;

                for(let attempt=1; attempt<=3 && !manifestSaved; attempt++){
                    try{
                        manifestSaved=await saveActiveOrderManifest({silent:true});
                    }catch(error){
                        lastError=error;
                    }
                    if(!manifestSaved && attempt<3){
                        await new Promise(resolve=>setTimeout(resolve,450*attempt));
                    }
                }

                if(!manifestSaved){
                    /* A save may have committed but its verification response
                       may have been interrupted. Pull once and verify by Order
                       Number before declaring failure. */
                    try{
                        if(typeof syncWorkspaceGenerationBeforeStructuralWrite==="function"){
                            await syncWorkspaceGenerationBeforeStructuralWrite();
                        }
                        if(typeof pullActiveOrderManifest==="function"){
                            await pullActiveOrderManifest({clearIfMissing:false});
                        }

                        const serverNumbers=new Set(
                            (AppState.workspace.orderFiles||[])
                                .map(file=>normalizeOrderNumber(
                                    file?.documentId||file?.orderNumber||""
                                ))
                                .filter(Boolean)
                        );

                        manifestSaved=
                            attemptedOrderNumbers.length>0 &&
                            attemptedOrderNumbers.every(n=>serverNumbers.has(n));
                    }catch(_){ }
                }

                if(!manifestSaved){
                    /* No partial local Order is allowed to survive a failed
                       authoritative commit. Restore the exact pre-import
                       workspace so retrying does not create a false duplicate
                       or misleading local-only state. */
                    AppState.workspace=
                        typeof deepClone==="function"
                            ? deepClone(preImportWorkspace)
                            : JSON.parse(JSON.stringify(preImportWorkspace));

                    rebuildStateIndexes();
                    recalculateStatistics();
                    saveWorkspaceSnapshot?.();
                    AppEvents.emit("files:updated",{source:"import-rollback"});
                    AppEvents.emit("receiving:updated",{source:"import-rollback"});
                    refreshEntireUI?.();

                    const reason=
                        (typeof PharmFlowCloudWorkspace!=="undefined" &&
                         PharmFlowCloudWorkspace.lastManifestSaveError)
                            ? PharmFlowCloudWorkspace.lastManifestSaveError
                            : (lastError?.message||"Server manifest verification failed");

                    throw new Error(
                        "Order upload was rolled back safely because Supabase did not verify it. "+
                        "Nothing was registered as Uploaded. Reason: "+reason
                    );
                }
            }

            /* Commit lifecycle + immutable source snapshots only after the
               authoritative manifest exists. Retry transient RPC failures. */
            const activeFiles=Array.isArray(AppState.workspace.orderFiles)
                ? AppState.workspace.orderFiles : [];
            for(const fileRecord of activeFiles){
                const orderNumber=normalizeOrderNumber(fileRecord.documentId||fileRecord.orderNumber||"");
                if(!orderNumber) continue;
                const existing=typeof getOrderLifecycleRecord==="function"
                    ? await getOrderLifecycleRecord(orderNumber).catch(()=>null) : null;
                if(existing) continue;
                const meta={orderNumber,orderDate:fileRecord.orderDate||null,fromWarehouse:fileRecord.fromWarehouse||"",
                    toWarehouse:fileRecord.toWarehouse||"",fileName:fileRecord.name||""};
                let committed=false,lastCommitError=null;
                for(let attempt=1;attempt<=3 && !committed;attempt++){
                    try{
                        await registerUploadedOrder(meta,Number(fileRecord.rows||0));
                        if(typeof saveOriginalUploadedOrderSnapshot==="function" && Array.isArray(fileRecord.sourceRows) && fileRecord.sourceRows.length){
                            await saveOriginalUploadedOrderSnapshot(orderNumber,fileRecord.sourceRows);
                        }
                        committed=true;
                    }catch(error){
                        lastCommitError=error;
                        if(attempt<3) await new Promise(resolve=>setTimeout(resolve,450*attempt));
                    }
                }
                if(!committed){
                    throw new Error("Order "+orderNumber+" is active and synchronized, but its registry/source commit is pending: "+(lastCommitError?.message||"server error"));
                }
            }

            /* Manifest verification is complete. Reconcile the derived
               Global Master projection against that final workspace before the
               open Manage Orders modal is published. */
            if(typeof reconcileMasterGTINCurrentOrder==="function"){
                await reconcileMasterGTINCurrentOrder();
            }
            publishConfirmedOrderUpload();

            showToast(
                importedFiles +
                " order file(s) uploaded and synchronized — " +
                importedRows +
                " rows",
                "success"
            );

        }
        else if(duplicateFiles > 0){

            showToast(
                "Selected order file already imported",
                "warning"
            );

        }
        else{

            showToast(
                "No valid order rows were found",
                "warning"
            );

        }

        Logger.info(
            "Order import completed",
            {
                importedFiles,
                importedRows,
                skippedRows,
                duplicateFiles
            }
        );

    }
    catch(error){

        /* Any failure before authoritative completion restores the exact
           workspace that existed before this batch. The snapshot is declared
           inside try only after server reconciliation, so guard access for
           very-early validation failures. */
        try{
            if(typeof preImportWorkspace!=="undefined" && preImportWorkspace){
                AppState.workspace=
                    typeof deepClone==="function"
                        ? deepClone(preImportWorkspace)
                        : JSON.parse(JSON.stringify(preImportWorkspace));
                rebuildStateIndexes();
                recalculateStatistics();
                saveWorkspaceSnapshot?.();
                AppEvents.emit("files:updated",{source:"import-batch-rollback"});
                AppEvents.emit("receiving:updated",{source:"import-batch-rollback"});
                refreshEntireUI?.();
            }
        }catch(rollbackError){
            Logger.error("Order batch rollback failed",rollbackError);
        }

        Logger.error(
            "Order import failed",
            error
        );

        showToast(
            error.message ||
            "Unable to import order files",
            "error"
        );

    }
    finally{

        ExcelEngine.orderImportRunning =
            false;

        hideLoading();

        focusScannerInput();

    }
}


/* =====================================================
   MAPPING FILE SELECTION
===================================================== */

async function handleMappingFileSelection(event){

    const input = event.target;

    const files =
        Array.from(
            input.files || []
        );

    input.value = "";

    if(files.length === 0){
        return;
    }

    if(ExcelEngine.mappingImportRunning){

        showToast(
            "Mapping import already running",
            "warning"
        );

        return;
    }

    if(
        files.length >
        APP_CONFIG.import.maxFilesPerImport
    ){

        showToast(
            "Too many files selected",
            "error"
        );

        return;
    }

    ExcelEngine.mappingImportRunning =
        true;

    showLoading(
        "Importing mapping files..."
    );

    try{

        let importedRows = 0;
        let skippedRows = 0;
        let importedFiles = 0;
        let duplicateFiles = 0;

        for(const file of files){

            const result =
                await importMappingFile(
                    file
                );

            importedRows +=
                result.importedRows;

            skippedRows +=
                result.skippedRows;

            if(result.duplicateFile){
                duplicateFiles++;
            }

            if(result.success){
                importedFiles++;
            }
        }

        rebuildStateIndexes();

        AppEvents.emit(
            "files:updated"
        );

        if(importedRows > 0){

            showToast(
                importedFiles +
                " mapping file(s) imported — " +
                importedRows +
                " rows",
                "success"
            );

        }
        else if(duplicateFiles > 0){

            showToast(
                "Selected mapping file already imported",
                "warning"
            );

        }
        else{

            showToast(
                "No valid mapping rows were found",
                "warning"
            );

        }

        Logger.info(
            "Mapping import completed",
            {
                importedFiles,
                importedRows,
                skippedRows,
                duplicateFiles
            }
        );

    }
    catch(error){

        Logger.error(
            "Mapping import failed",
            error
        );

        showToast(
            error.message ||
            "Unable to import mapping files",
            "error"
        );

    }
    finally{

        ExcelEngine.mappingImportRunning =
            false;

        hideLoading();

        focusScannerInput();

    }
}


/* =====================================================
   IMPORT ORDER FILE
===================================================== */

async function importOrderFile(file, preflightMeta = null, preloadedWorkbook = null){

    const result = {
        success:false,
        duplicateFile:false,
        importedRows:0,
        skippedRows:0
    };

    validateExcelFile(
        file
    );

    if(
        isFileAlreadyImported(
            "order",
            file
        )
    ){

        result.duplicateFile =
            true;

        return result;
    }

    const workbook =
        preloadedWorkbook ||
        await readExcelWorkbook(
            file
        );

    let validRowsInFile = 0;

    /* Phase 2C.2: immutable source-order snapshot.
       These rows are kept separate from receiving quantities and are the
       authoritative source for future business reports. */
    const sourceOrderRows = [];

    let detectedOrderId =
        preflightMeta && preflightMeta.orderNumber
        ? normalizeOrderNumber(preflightMeta.orderNumber)
        : "";

    workbook.SheetNames
        .forEach(sheetName=>{

            const worksheet =
                workbook.Sheets[
                    sheetName
                ];

            const matrix =
                worksheetToMatrix(
                    worksheet
                );

            if(matrix.length === 0){
                return;
            }

            if(!detectedOrderId){

                detectedOrderId =
                    extractDocumentId(
                        matrix,
                        [
                            "to number",
                            "transfer id",
                            "transfer number",
                            "order number",
                            "order id"
                        ]
                    );

            }

            const headerInfo =
                findOrderHeaderRow(
                    matrix
                );

            if(!headerInfo){

                Logger.warn(
                    "Order sheet skipped — header row not detected:",
                    file.name,
                    sheetName
                );

                result.skippedRows +=
                    Math.max(
                        0,
                        matrix.length - 1
                    );

                return;
            }

            for(
                let rowIndex =
                    headerInfo.rowIndex + 1;

                rowIndex < matrix.length;

                rowIndex++
            ){

                const row =
                    matrix[rowIndex];

                if(
                    isMatrixRowEmpty(
                        row
                    )
                ){
                    continue;
                }

                const item =
                    parseOrderMatrixRow(
                        row,
                        headerInfo.columns
                    );

                if(!item){

                    result.skippedRows++;

                    continue;
                }

                /* Keep an untouched copy BEFORE receiving mutates workspace data. */
                sourceOrderRows.push({
                    itemCode:item.itemCode,
                    itemName:item.itemName,
                    orderedQty:item.orderedQty,
                    category:item.category || "",
                    sourceSheet:sheetName,
                    sourceRow:rowIndex + 1
                });

                /* Phase 2C.7: preserve per-order membership even when the same
                   Item Code exists in more than one uploaded order. */
                item.orderNumbers = Array.from(new Set([
                    ...(Array.isArray(item.orderNumbers) ? item.orderNumbers : []),
                    normalizeOrderNumber(detectedOrderId || "")
                ].filter(Boolean)));

                const mergedItem = upsertOrderItem(
                    item
                );
                if(mergedItem){
                    mergedItem.orderNumbers = Array.from(new Set([
                        ...(Array.isArray(mergedItem.orderNumbers) ? mergedItem.orderNumbers : []),
                        normalizeOrderNumber(detectedOrderId || "")
                    ].filter(Boolean)));
                }

                result.importedRows++;

                validRowsInFile++;

            }

        });

    if(validRowsInFile > 0){

        registerImportedFile(
            "order",
            file,
            validRowsInFile,
            {
                documentId:
                    detectedOrderId,
                orderDate:
                    preflightMeta ? preflightMeta.orderDate : "",
                fromWarehouse:
                    preflightMeta ? preflightMeta.fromWarehouse : "",
                toWarehouse:
                    preflightMeta ? preflightMeta.toWarehouse : "",

                sourceRows:
                    sourceOrderRows
            }
        );

        /* Phase 2C.10.4.0: lifecycle registration is deliberately deferred
           until AFTER the complete Active Order Manifest is server-verified.
           This prevents a failed first upload from becoming a false
           "Already Uploaded" on retry. The sourceRows stay staged on the
           order-file record and are committed after manifest verification. */

        if(detectedOrderId){

            AppState.workspace
                .orderName =
                detectedOrderId;

        }

        if(
            !AppState.workspace
                .startedAt
        ){

            AppState.workspace
                .startedAt =
                nowISO();

        }

        AppState.workspace.active =
            true;

        const activeImportedOrders=[
            ...new Set(
                (AppState.workspace.orderFiles||[])
                    .map(file=>normalizeOrderNumber(
                        file?.documentId || file?.orderNumber || ""
                    ))
                    .filter(Boolean)
            )
        ];

        /* Multi-order default is always ALL.
           A specific order remains selectable afterwards by the operator. */
        /* Phase 2C.10.3.9 — ALL ORDERS is the authoritative default after
           adding an order. Keep both the modern multi-select state and the
           legacy scalar state aligned so Dashboard/Receiving cannot remain
           silently scoped to the previously selected order. */
        AppState.workspace.selectedOrderNumbers=activeImportedOrders.slice();

        if(activeImportedOrders.length>1){
            AppState.workspace.selectedOrderNumber="ALL";
            AppState.workspace.orderName="All Orders";
        }
        else if(activeImportedOrders.length===1){
            AppState.workspace.selectedOrderNumber=activeImportedOrders[0];
            AppState.workspace.orderName=activeImportedOrders[0];
        }

        result.success =
            true;
    }

    return result;
}


/* =====================================================
   IMPORT MAPPING FILE
===================================================== */

async function importMappingFile(file){

    const result = {
        success:false,
        duplicateFile:false,
        importedRows:0,
        skippedRows:0
    };

    validateExcelFile(
        file
    );

    if(
        isFileAlreadyImported(
            "mapping",
            file
        )
    ){

        result.duplicateFile =
            true;

        return result;
    }

    const workbook =
        await readExcelWorkbook(
            file
        );

    let validRowsInFile = 0;

    let detectedDocumentId = "";

    workbook.SheetNames
        .forEach(sheetName=>{

            const worksheet =
                workbook.Sheets[
                    sheetName
                ];

            const matrix =
                worksheetToMatrix(
                    worksheet
                );

            if(matrix.length === 0){
                return;
            }

            if(!detectedDocumentId){

                detectedDocumentId =
                    extractDocumentId(
                        matrix,
                        [
                            "transfer id",
                            "to number",
                            "transfer number",
                            "order number",
                            "order id"
                        ]
                    );

            }

            const headerInfo =
                findMappingHeaderRow(
                    matrix
                );

            if(!headerInfo){

                Logger.warn(
                    "Mapping sheet skipped — header row not detected:",
                    file.name,
                    sheetName
                );

                result.skippedRows +=
                    Math.max(
                        0,
                        matrix.length - 1
                    );

                return;
            }

            for(
                let rowIndex =
                    headerInfo.rowIndex + 1;

                rowIndex < matrix.length;

                rowIndex++
            ){

                const row =
                    matrix[rowIndex];

                if(
                    isMatrixRowEmpty(
                        row
                    )
                ){
                    continue;
                }

                const mapping =
                    parseMappingMatrixRow(
                        row,
                        headerInfo.columns
                    );

                if(!mapping){

                    result.skippedRows++;

                    continue;
                }

                const added =
                    addMappingRecord(
                        mapping
                    );

                if(added){

                    result.importedRows++;

                    validRowsInFile++;

                }
                else{

                    result.skippedRows++;

                }

            }

        });

    if(validRowsInFile > 0){

        registerImportedFile(
            "mapping",
            file,
            validRowsInFile,
            {
                documentId:
                    detectedDocumentId
            }
        );

        result.success =
            true;
    }

    return result;
}


/* =====================================================
   READ WORKBOOK
===================================================== */

function readExcelWorkbook(file){

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

                        const workbook =
                            XLSX.read(
                                event.target.result,
                                {
                                    type:"array",
                                    cellDates:true,
                                    cellText:true,
                                    cellNF:true
                                }
                            );

                        resolve(
                            workbook
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
                            "Unable to read file: " +
                            file.name
                        )
                    );

                };

            reader.readAsArrayBuffer(
                file
            );

        }
    );
}


/* =====================================================
   WORKSHEET TO MATRIX

   raw:false is intentional:
   barcode values are read as displayed text so a GTIN
   beginning with zero is not intentionally converted
   through Number().
===================================================== */

function worksheetToMatrix(
    worksheet
){

    if(!worksheet){
        return [];
    }

    return XLSX.utils
        .sheet_to_json(
            worksheet,
            {
                header:1,
                defval:"",
                raw:false,
                blankrows:false
            }
        );
}


/* =====================================================
   HEADER NORMALIZATION
===================================================== */

function normalizeExcelHeader(value){

    return normalizeText(
        value
    )
    .replace(
        /[_.\-\/\\]+/g,
        " "
    )
    .replace(
        /\s+/g,
        " "
    )
    .trim();
}


function buildNormalizedAliasSet(
    aliases
){

    return new Set(
        aliases.map(
            alias=>
                normalizeExcelHeader(
                    alias
                )
        )
    );
}


function findHeaderColumn(
    row,
    aliases
){

    const aliasSet =
        buildNormalizedAliasSet(
            aliases
        );

    for(
        let index = 0;
        index < row.length;
        index++
    ){

        const value =
            normalizeExcelHeader(
                row[index]
            );

        if(!value){
            continue;
        }

        if(
            aliasSet.has(
                value
            )
        ){

            return index;

        }

    }

    return -1;
}


/* =====================================================
   FIND ORDER HEADER ROW

   Your real Order file:
   row 15 -> Item Number | Item Name | ... | Quantity
===================================================== */

function findOrderHeaderRow(
    matrix
){

    const limit =
        Math.min(
            matrix.length,
            ExcelEngine
                .maxHeaderScanRows
        );

    for(
        let rowIndex = 0;
        rowIndex < limit;
        rowIndex++
    ){

        const row =
            matrix[rowIndex]
            ||
            [];

        const itemCode =
            findHeaderColumn(
                row,
                APP_CONFIG
                    .orderColumns
                    .itemCode
            );

        const itemName =
            findHeaderColumn(
                row,
                APP_CONFIG
                    .orderColumns
                    .itemName
            );

        const orderedQty =
            findHeaderColumn(
                row,
                APP_CONFIG
                    .orderColumns
                    .orderedQty
            );

        const category =
            findHeaderColumn(
                row,
                ["category","item category","product category","classification"]
            );

        if(
            itemCode >= 0 &&
            orderedQty >= 0
        ){

            return {
                rowIndex:
                    rowIndex,

                columns:{
                    itemCode:
                        itemCode,

                    itemName:
                        itemName,

                    orderedQty:
                        orderedQty,
                    category:
                        category
                }
            };

        }

    }

    return null;
}


/* =====================================================
   FIND MAPPING HEADER ROW

   Your real Barcode file:
   row 16 -> Item Number | Barcode | ... | Shipped QTY
===================================================== */

function findMappingHeaderRow(
    matrix
){

    const limit =
        Math.min(
            matrix.length,
            ExcelEngine
                .maxHeaderScanRows
        );

    for(
        let rowIndex = 0;
        rowIndex < limit;
        rowIndex++
    ){

        const row =
            matrix[rowIndex]
            ||
            [];

        const itemCode =
            findHeaderColumn(
                row,
                APP_CONFIG
                    .mappingColumns
                    .itemCode
            );

        const gtin =
            findHeaderColumn(
                row,
                APP_CONFIG
                    .mappingColumns
                    .gtin
            );

        if(
            itemCode >= 0 &&
            gtin >= 0
        ){

            return {
                rowIndex:
                    rowIndex,

                columns:{
                    itemCode:
                        itemCode,

                    gtin:
                        gtin
                }
            };

        }

    }

    return null;
}


/* =====================================================
   PARSE ORDER DATA ROW
===================================================== */

function parseOrderMatrixRow(
    row,
    columns
){

    const itemCode =
        normalizeItemCode(
            row[
                columns.itemCode
            ]
        );

    if(!itemCode){
        return null;
    }

    const itemName =
        columns.itemName >= 0
        ?
        toSafeString(
            row[
                columns.itemName
            ]
        )
        :
        "";

    const orderedQty =
        parseExcelNumber(
            row[
                columns.orderedQty
            ]
        );

    const category =
        columns.category >= 0
        ? toSafeString(row[columns.category])
        : "";

    if(
        !Number.isFinite(
            orderedQty
        )
        ||
        orderedQty <= 0
    ){

        return null;

    }

    return {
        itemCode:
            itemCode,

        itemName:
            itemName
            ||
            itemCode,

        orderedQty:
            orderedQty,

        receivedQty:
            0,

        remainingQty:
            orderedQty,

        category:
            category,

        manual:
            false
    };
}


/* =====================================================
   PARSE MAPPING DATA ROW
===================================================== */

function parseMappingMatrixRow(
    row,
    columns
){

    const itemCode =
        normalizeItemCode(
            row[
                columns.itemCode
            ]
        );

    const gtin =
        normalizeBarcodeFromExcel(
            row[
                columns.gtin
            ]
        );

    if(
        !itemCode ||
        !gtin
    ){

        return null;

    }

    return {
        itemCode:
            itemCode,

        gtin:
            gtin
    };
}


/* =====================================================
   EXCEL NUMBER PARSER
===================================================== */

function parseExcelNumber(
    value
){

    if(
        typeof value ===
        "number"
    ){

        return value;

    }

    const text =
        toSafeString(
            value
        )
        .replace(
            /,/g,
            ""
        )
        .trim();

    if(!text){
        return NaN;
    }

    const number =
        Number(
            text
        );

    return Number.isFinite(
        number
    )
    ?
    number
    :
    NaN;
}


/* =====================================================
   BARCODE NORMALIZATION

   Never intentionally convert a barcode through Number()
   because leading zero is meaningful.
===================================================== */

function normalizeBarcodeFromExcel(
    value
){

    let text =
        toSafeString(
            value
        );

    if(!text){
        return "";
    }

    text =
        text
            .replace(
                /\s+/g,
                ""
            )
            .replace(
                /^'+/,
                ""
            );

    if(
        /^\d+(?:\.\d+)?[eE][+-]?\d+$/
            .test(
                text
            )
    ){

        const numeric =
            Number(
                text
            );

        if(
            Number.isFinite(
                numeric
            )
        ){

            text =
                numeric.toLocaleString(
                    "fullwide",
                    {
                        useGrouping:false,
                        maximumFractionDigits:0
                    }
                );

        }

    }

    return text.replace(
        /\D/g,
        ""
    );
}


/* =====================================================
   GET TRANSFER / ORDER ID FROM COVER AREA
===================================================== */

function extractDocumentId(
    matrix,
    labelAliases
){

    const aliasSet =
        buildNormalizedAliasSet(
            labelAliases
        );

    const limit =
        Math.min(
            matrix.length,
            ExcelEngine
                .maxHeaderScanRows
        );

    for(
        let rowIndex = 0;
        rowIndex < limit;
        rowIndex++
    ){

        const row =
            matrix[rowIndex]
            ||
            [];

        for(
            let columnIndex = 0;
            columnIndex < row.length;
            columnIndex++
        ){

            const label =
                normalizeExcelHeader(
                    row[
                        columnIndex
                    ]
                );

            if(
                !aliasSet.has(
                    label
                )
            ){

                continue;

            }

            for(
                let next =
                    columnIndex + 1;

                next < row.length;

                next++
            ){

                const value =
                    toSafeString(
                        row[next]
                    );

                if(value){
                    return value;
                }

            }

        }

    }

    return "";
}


/* =====================================================
   EMPTY ROW
===================================================== */

function isMatrixRowEmpty(
    row
){

    if(
        !Array.isArray(
            row
        )
    ){

        return true;

    }

    return !row.some(
        value=>
            toSafeString(
                value
            ) !== ""
    );
}


/* =====================================================
   FILE VALIDATION
===================================================== */

function validateExcelFile(
    file
){

    if(!file){

        throw new Error(
            "Invalid file"
        );

    }

    const extension =
        getFileExtension(
            file.name
        );

    const allowed = [

        ...APP_CONFIG
            .import
            .orderExtensions,

        ...APP_CONFIG
            .import
            .mappingExtensions

    ];

    if(
        !allowed.includes(
            extension
        )
    ){

        throw new Error(
            "Unsupported Excel file: " +
            file.name
        );

    }

    return true;
}


function getFileExtension(
    fileName
){

    const name =
        toSafeString(
            fileName
        );

    const index =
        name.lastIndexOf(
            "."
        );

    if(index < 0){
        return "";
    }

    return name
        .slice(
            index
        )
        .toLowerCase();
}


/* =====================================================
   DUPLICATE FILE PROTECTION
===================================================== */

function isFileAlreadyImported(
    type,
    file
){

    const list =
        type === "mapping"
        ?
        AppState.workspace
            .mappingFiles
        :
        AppState.workspace
            .orderFiles;

    return list.some(
        record=>

            record.name ===
                file.name

            &&

            record.size ===
                file.size

            &&

            record.lastModified ===
                file.lastModified
    );
}


/* =====================================================
   REGISTER IMPORTED FILE
===================================================== */

function registerImportedFile(
    type,
    file,
    rows,
    extra = {}
){

    const target =
        type === "mapping"
        ?
        AppState.workspace
            .mappingFiles
        :
        AppState.workspace
            .orderFiles;

    const record = {

        id:
            createUniqueId(
                type === "mapping"
                ?
                "MAPFILE"
                :
                "ORDFILE"
            ),

        name:
            file.name,

        size:
            file.size,

        lastModified:
            file.lastModified,

        importedAt:
            nowISO(),

        rows:
            rows,

        sourceRows:
            Array.isArray(extra.sourceRows)
                ? deepClone(extra.sourceRows)
                : [],

        documentId:
            toSafeString(
                extra.documentId
            ),

        orderDate:
            toSafeString(extra.orderDate),

        fromWarehouse:
            toSafeString(extra.fromWarehouse),

        toWarehouse:
            toSafeString(extra.toWarehouse)

    };

    target.push(
        record
    );

    return record;
}


/* =====================================================
   ITEMS WITHOUT MAPPING
===================================================== */

function getItemsWithoutMapping(){

    const mappedCodes =
        new Set(

            AppState.workspace
                .mappingData
                .map(
                    mapping=>

                        normalizeItemCode(
                            mapping.itemCode
                        )

                )

        );

    return AppState.workspace
        .orderData
        .filter(
            item=>

                !mappedCodes.has(

                    normalizeItemCode(
                        item.itemCode
                    )

                )
        );
}


/* =====================================================
   DUPLICATE GTIN
===================================================== */

function getDuplicateGTINs(){

    const gtinMap =
        new Map();

    AppState.workspace
        .mappingData
        .forEach(mapping=>{

            const gtin =
                normalizeGTIN(
                    mapping.gtin
                );

            const itemCode =
                normalizeItemCode(
                    mapping.itemCode
                );

            if(!gtin){
                return;
            }

            if(
                !gtinMap.has(
                    gtin
                )
            ){

                gtinMap.set(
                    gtin,
                    new Set()
                );

            }

            gtinMap
                .get(gtin)
                .add(itemCode);

        });

    const duplicates =
        [];

    gtinMap.forEach(
        (
            itemCodes,
            gtin
        )=>{

            if(
                itemCodes.size > 1
            ){

                duplicates.push({

                    gtin:
                        gtin,

                    itemCodes:
                        Array.from(
                            itemCodes
                        )

                });

            }

        }
    );

    return duplicates;
}


/* =====================================================
   IMPORT HEALTH
===================================================== */

function getExcelImportHealth(){

    return {

        orderFiles:
            AppState.workspace
                .orderFiles
                .length,

        mappingFiles:
            AppState.workspace
                .mappingFiles
                .length,

        orderItems:
            AppState.workspace
                .orderData
                .length,

        mappings:
            AppState.workspace
                .mappingData
                .length,

        missingMappings:
            getItemsWithoutMapping()
                .length,

        duplicateGTINs:
            getDuplicateGTINs()
                .length

    };
}


/* =====================================================
   END EXCEL ENGINE
===================================================== */
