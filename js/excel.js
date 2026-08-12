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

    try{

        let importedRows = 0;
        let skippedRows = 0;
        let importedFiles = 0;
        let duplicateFiles = 0;

        for(const file of files){

            const orderMeta =
                typeof inspectOrderFileMetadata === "function"
                ? await inspectOrderFileMetadata(file)
                : null;

            if(orderMeta && typeof assertOrderNumberCanUpload === "function"){
                await assertOrderNumberCanUpload(orderMeta.orderNumber);
            }

            const result =
                await importOrderFile(
                    file,
                    orderMeta
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

        AppEvents.emit(
            "files:updated"
        );

        AppEvents.emit(
            "receiving:updated"
        );

        if(importedRows > 0){

            showToast(
                importedFiles +
                " order file(s) imported — " +
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

async function importOrderFile(file, preflightMeta = null){

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

                upsertOrderItem(
                    item
                );

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
                    preflightMeta ? preflightMeta.toWarehouse : ""
            }
        );

        if(preflightMeta && typeof registerUploadedOrder === "function"){
            await registerUploadedOrder(preflightMeta, validRowsInFile);

            if(typeof saveOriginalUploadedOrderSnapshot === "function"){
                await saveOriginalUploadedOrderSnapshot(
                    preflightMeta.orderNumber,
                    sourceOrderRows
                );
            }
        }

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