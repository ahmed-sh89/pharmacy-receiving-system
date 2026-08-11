"use strict";

/* =====================================================
   PHARMACY RECEIVING SYSTEM V3
   SMART SCANNER + SEARCH ENGINE
===================================================== */

const ScannerEngine = {

    initialized:false,

    inputTimer:null,

    lastRawBarcode:"",
    lastScanTime:0,

    lastKeyTime:0,
    keyIntervals:[],

    processing:false,

    autoProcessDelay:130,
    searchDelay:220,

    fastKeyThreshold:45

};


/* =====================================================
   INITIALIZE
===================================================== */

function initializeScanner(){

    if(ScannerEngine.initialized){
        return;
    }

    const input =
        document.getElementById(
            "barcodeInput"
        );

    if(!input){

        Logger.warn(
            "Scanner input not found"
        );

        return;
    }

    /*
       The same box is now used for:
       1. GS1 / Barcode Scan
       2. Item Number search
       3. Item Name search
    */

    input.placeholder =
        "Scan barcode or search by Item Number / Item Name";

    input.setAttribute(
        "autocomplete",
        "off"
    );

    input.setAttribute(
        "spellcheck",
        "false"
    );


    input.addEventListener(
        "keydown",
        handleScannerKeydown
    );


    input.addEventListener(
        "input",
        handleSmartScannerInput
    );


    input.addEventListener(
        "paste",
        handleScannerPaste
    );


    input.addEventListener(
        "focus",
        function(){

            setScanBoxState(
                "ready"
            );

        }
    );


    ScannerEngine.initialized =
        true;


    Logger.info(
        "Smart Scanner module initialized"
    );

}


/* =====================================================
   KEY TIMING

   Scanner devices normally deliver characters much
   faster than a human can type. We use this to separate
   Scanner input from manual search.
===================================================== */

function handleScannerKeydown(event){

    const now =
        performance.now();


    if(
        ScannerEngine.lastKeyTime > 0 &&
        event.key.length === 1
    ){

        const interval =
            now -
            ScannerEngine.lastKeyTime;


        ScannerEngine.keyIntervals.push(
            interval
        );


        if(
            ScannerEngine
                .keyIntervals
                .length > 25
        ){

            ScannerEngine
                .keyIntervals
                .shift();

        }

    }


    if(event.key.length === 1){

        ScannerEngine.lastKeyTime =
            now;

    }


    /*
       Enter remains supported as a fallback,
       but it is no longer required.
    */

    if(event.key === "Enter"){

        event.preventDefault();


        clearTimeout(
            ScannerEngine.inputTimer
        );


        const input =
            event.target;


        const value =
            toSafeString(
                input.value
            );


        if(!value){
            return;
        }


        if(
            shouldTreatAsBarcode(
                value,
                true
            )
        ){

            processScannerValue(
                value
            );

        }
        else{

            triggerManualSearch(
                value
            );

        }

    }

}


/* =====================================================
   SMART INPUT
===================================================== */

function handleSmartScannerInput(event){

    const input =
        event.target;


    const value =
        toSafeString(
            input.value
        );


    clearTimeout(
        ScannerEngine.inputTimer
    );


    if(!value){

        clearSmartSearchResults();

        resetScannerTypingMetrics();

        return;

    }


    const barcodeCandidate =
        shouldTreatAsBarcode(
            value,
            false
        );


    /*
       Scanner:
       process automatically after the incoming
       characters stop for a very short period.
    */

    if(barcodeCandidate){

        ScannerEngine.inputTimer =
            setTimeout(
                function(){

                    processScannerValue(
                        value
                    );

                },
                ScannerEngine
                    .autoProcessDelay
            );


        return;

    }


    /*
       Human typing:
       use the exact same box for item search.
    */

    ScannerEngine.inputTimer =
        setTimeout(
            function(){

                triggerManualSearch(
                    value
                );

            },
            ScannerEngine
                .searchDelay
        );

}


/* =====================================================
   PASTE SUPPORT
===================================================== */

function handleScannerPaste(){

    /*
       Wait until browser has actually inserted
       the pasted value into the input.
    */

    setTimeout(
        function(){

            const input =
                document.getElementById(
                    "barcodeInput"
                );


            if(!input){
                return;
            }


            const value =
                toSafeString(
                    input.value
                );


            if(!value){
                return;
            }


            if(
                looksLikeStrongBarcode(
                    value
                )
            ){

                clearTimeout(
                    ScannerEngine.inputTimer
                );


                processScannerValue(
                    value
                );

            }

        },
        20
    );

}


/* =====================================================
   DECIDE: SCAN OR HUMAN SEARCH
===================================================== */

function shouldTreatAsBarcode(
    value,
    enterPressed = false
){

    const raw =
        toSafeString(
            value
        );


    if(!raw){
        return false;
    }


    /*
       Strong GS1 / DataMatrix patterns are always Scan.
    */

    if(
        looksLikeStrongBarcode(
            raw
        )
    ){

        return true;

    }


    /*
       Standard EAN / GTIN lengths are barcode scans.
       This avoids treating a normal 7-digit Item Number
       as a barcode during manual typing.
    */

    const digitsOnly =
        raw.replace(
            /\D/g,
            ""
        );


    if(
        /^\d+$/.test(raw)
        &&
        (
            digitsOnly.length === 8 ||
            digitsOnly.length === 12 ||
            digitsOnly.length === 13 ||
            digitsOnly.length === 14
        )
    ){

        return true;

    }


    /*
       If keys arrived extremely fast, it is almost
       certainly a hardware scanner.
    */

    if(
        isFastScannerTyping() &&
        raw.length >= 6
    ){

        return true;

    }


    /*
       Enter should NOT force an ordinary item name
       or short Item Number to become a barcode.
    */

    if(enterPressed){

        return false;

    }


    return false;

}


/* =====================================================
   STRONG BARCODE PATTERNS
===================================================== */

function looksLikeStrongBarcode(value){

    const raw =
        toSafeString(
            value
        );


    if(!raw){
        return false;
    }


    /*
       GS1 DataMatrix symbology identifier.
    */

    if(
        /^\]d2/i.test(
            raw
        )
    ){

        return true;

    }


    /*
       GS1 separator.
    */

    if(
        raw.includes(
            "\x1D"
        )
    ){

        return true;

    }


    /*
       Human readable GS1.
       Example:
       (01)01234567890128(17)280214
    */

    if(
        /\(01\)\d{14}/
            .test(
                raw
            )
    ){

        return true;

    }


    /*
       AI 01 + GTIN14.
    */

    if(
        /01\d{14}/
            .test(
                raw
            )
    ){

        return true;

    }


    /*
       Scanner format already used in this project.
       Example:
       JC10106287043583491~1021716~...
    */

    if(
        raw.includes("~")
        &&
        /\d{14}/.test(
            raw
        )
    ){

        return true;

    }


    /*
       Very long scanner payload.
    */

    if(
        raw.length >= 18
        &&
        /\d{8,}/.test(
            raw
        )
    ){

        return true;

    }


    return false;

}


/* =====================================================
   FAST SCANNER DETECTION
===================================================== */

function isFastScannerTyping(){

    const intervals =
        ScannerEngine
            .keyIntervals;


    if(
        intervals.length < 4
    ){

        return false;

    }


    const recent =
        intervals.slice(
            -12
        );


    const average =
        recent.reduce(
            (
                sum,
                value
            )=>
                sum + value,
            0
        )
        /
        recent.length;


    return (
        average <=
        ScannerEngine
            .fastKeyThreshold
    );

}


/* =====================================================
   PROCESS SCANNER VALUE
===================================================== */

function processScannerValue(rawValue){

    if(
        ScannerEngine.processing
    ){

        return false;

    }


    const input =
        document.getElementById(
            "barcodeInput"
        );


    const cleaned =
        cleanScannerInput(
            rawValue
        );


    /* Phase 2B.5 hard guard: Zebra Receiving is never allowed to become a
       local-only receiving workflow. After the PC ends a session, the cloud
       watcher clears the session; this guard prevents any later hardware scan
       from changing local quantities until a new PC session is joined. */
    if(
        typeof isLikelyZebraDevice === "function" &&
        isLikelyZebraDevice() &&
        !(
            AppState?.session?.role === "ZEBRA" &&
            AppState?.session?.cloud === true &&
            AppState?.session?.id &&
            AppState?.session?.secret
        )
    ){
        if(input){ input.value = ""; }
        if(typeof setZebraHomeMode === "function"){ setZebraHomeMode(); }
        showToast("Join an active PC session before scanning","warning");
        return false;
    }


    if(!cleaned){

        return false;

    }


    ScannerEngine.processing =
        true;


    clearSmartSearchResults();


    /*
       Clear immediately so the next Scan can arrive
       without waiting for UI rendering.
    */

    if(input){

        input.value = "";

    }


    try{

        if(
            isDuplicateImmediateScan(
                cleaned
            )
        ){

            Logger.warn(
                "Immediate duplicate scanner event ignored",
                cleaned
            );


            return false;

        }


        const parsed =
            parseGS1Barcode(
                cleaned
            );


        Logger.info(
            "Scanner parsed",
            parsed
        );


        AppEvents.emit(
            "scanner:parsed",
            parsed
        );


        if(
            typeof receiveParsedBarcode ===
            "function"
        ){

            return receiveParsedBarcode(
                parsed
            );

        }


        showToast(
            "Receiving engine is unavailable",
            "warning"
        );


        return false;

    }
    catch(error){

        Logger.error(
            "Scanner processing failed",
            error
        );


        setScanBoxState(
            "error"
        );


        showToast(
            "Unable to process barcode",
            "error"
        );


        return false;

    }
    finally{

        ScannerEngine.processing =
            false;


        resetScannerTypingMetrics();


        focusScannerInput();

    }

}


/* =====================================================
   MANUAL SEARCH FROM SCAN BOX
===================================================== */

function triggerManualSearch(value){

    const query =
        toSafeString(
            value
        );


    if(!query){

        clearSmartSearchResults();

        return;

    }


    /*
       ui.js replacement will implement this function.
    */

    if(
        typeof handleSmartScanSearchInput ===
        "function"
    ){

        handleSmartScanSearchInput(
            query
        );


        return;

    }


    /*
       Temporary compatibility with current UI until
       ui.js is replaced in the next steps.
    */

    const results =
        searchItems(
            getSearchableItems(),
            query,
            APP_CONFIG
                .receiving
                .searchResultLimit
        );


    if(
        typeof renderSmartScanSearchResults ===
        "function"
    ){

        renderSmartScanSearchResults(
            results,
            query
        );

    }

}


/* =====================================================
   CLEAR SEARCH RESULTS
===================================================== */

function clearSmartSearchResults(){

    if(
        typeof closeSmartScanSearch ===
        "function"
    ){

        closeSmartScanSearch(
            false
        );

    }

}


/* =====================================================
   DUPLICATE HARDWARE EVENT PROTECTION
===================================================== */

function isDuplicateImmediateScan(barcode){

    if(
        !APP_CONFIG
            .receiving
            .duplicateScanProtection
    ){

        return false;

    }


    const now =
        Date.now();


    const duplicate =
        barcode ===
            ScannerEngine
                .lastRawBarcode

        &&

        (
            now -
            ScannerEngine
                .lastScanTime
        )
        <
        APP_CONFIG
            .receiving
            .duplicateScanWindowMs;


    ScannerEngine.lastRawBarcode =
        barcode;


    ScannerEngine.lastScanTime =
        now;


    return duplicate;

}


/* =====================================================
   RESET TYPING METRICS
===================================================== */

function resetScannerTypingMetrics(){

    ScannerEngine.lastKeyTime =
        0;


    ScannerEngine.keyIntervals =
        [];

}


/* =====================================================
   CLEAN SCANNER INPUT
===================================================== */

function cleanScannerInput(value){

    let barcode =
        toSafeString(
            value
        );


    if(!barcode){
        return "";
    }


    barcode =
        barcode
            .replace(
                /[\r\n\t]/g,
                ""
            )
            .replace(
                /<GS>/gi,
                "\x1D"
            )
            .trim();


    return barcode;

}


/* =====================================================
   GS1 PARSER
===================================================== */

function parseGS1Barcode(rawBarcode){

    const raw =
        cleanScannerInput(
            rawBarcode
        );


    const result = {

        raw:raw,

        gtin:"",

        lot:"",

        expiry:"",

        serial:"",

        quantity:1,

        parsed:false,

        format:"UNKNOWN"

    };


    if(!raw){
        return result;
    }


    /*
       Plain GTIN / EAN
    */

    if(
        /^\d{8,14}$/
            .test(
                raw
            )
    ){

        result.gtin =
            normalizeGTIN(
                raw
            );


        result.parsed =
            true;


        result.format =
            "LINEAR";


        return result;

    }


    /*
       Standard GS1 parser
    */

    const gs1 =
        parseGS1ApplicationIdentifiers(
            raw
        );


    if(gs1.gtin){

        result.gtin =
            gs1.gtin;


        result.lot =
            gs1.lot;


        result.expiry =
            gs1.expiry;


        result.serial =
            gs1.serial;


        result.quantity =
            gs1.quantity;


        result.parsed =
            true;


        result.format =
            "GS1";


        return result;

    }


    /*
       Project scanner fallback
    */

    const fallbackGTIN =
        extractLikelyGTIN(
            raw
        );


    if(fallbackGTIN){

        result.gtin =
            fallbackGTIN;


        result.parsed =
            true;


        result.format =
            "FALLBACK";

    }


    return result;

}


/* =====================================================
   GS1 APPLICATION IDENTIFIERS
===================================================== */

function parseGS1ApplicationIdentifiers(value){

    const output = {

        gtin:"",
        lot:"",
        expiry:"",
        serial:"",
        quantity:1

    };


    let data =
        toSafeString(
            value
        );


    if(!data){
        return output;
    }


    data =
        data.replace(
            /^\]d2/i,
            ""
        );


    if(
        data.includes("(")
    ){

        return parseParenthesizedGS1(
            data
        );

    }


    let index = 0;


    while(
        index <
        data.length
    ){

        if(
            data[index] ===
            "\x1D"
        ){

            index++;

            continue;

        }


        const remaining =
            data.slice(
                index
            );


        /*
           AI 01
           GTIN = 14 digits
        */

        if(
            remaining.startsWith("01")
            &&
            /^01\d{14}/
                .test(
                    remaining
                )
        ){

            output.gtin =
                normalizeGTIN(
                    remaining.slice(
                        2,
                        16
                    )
                );


            index += 16;

            continue;

        }


        /*
           AI 17
           Expiry = YYMMDD
        */

        if(
            remaining.startsWith("17")
            &&
            /^17\d{6}/
                .test(
                    remaining
                )
        ){

            output.expiry =
                formatGS1Date(
                    remaining.slice(
                        2,
                        8
                    )
                );


            index += 8;

            continue;

        }


        /*
           AI 10
           Batch / LOT
        */

        if(
            remaining.startsWith("10")
        ){

            const field =
                readVariableGS1Field(
                    data,
                    index + 2,
                    20
                );


            output.lot =
                field.value;


            index =
                field.nextIndex;


            continue;

        }


        /*
           AI 21
           Serial
        */

        if(
            remaining.startsWith("21")
        ){

            const field =
                readVariableGS1Field(
                    data,
                    index + 2,
                    20
                );


            output.serial =
                field.value;


            index =
                field.nextIndex;


            continue;

        }


        /*
           AI 30
           Quantity
        */

        if(
            remaining.startsWith("30")
        ){

            const field =
                readVariableGS1Field(
                    data,
                    index + 2,
                    8
                );


            const qty =
                toInteger(
                    field.value,
                    1
                );


            output.quantity =
                qty > 0
                ?
                qty
                :
                1;


            index =
                field.nextIndex;


            continue;

        }


        /*
           AI 37
           Quantity / Count
        */

        if(
            remaining.startsWith("37")
        ){

            const field =
                readVariableGS1Field(
                    data,
                    index + 2,
                    8
                );


            const qty =
                toInteger(
                    field.value,
                    1
                );


            output.quantity =
                qty > 0
                ?
                qty
                :
                1;


            index =
                field.nextIndex;


            continue;

        }


        index++;

    }


    return output;

}


/* =====================================================
   PARENTHESIZED GS1
===================================================== */

function parseParenthesizedGS1(value){

    const output = {

        gtin:"",
        lot:"",
        expiry:"",
        serial:"",
        quantity:1

    };


    const matches =
        [
            ...value.matchAll(
                /\((\d{2,4})\)([^\(\)]*)/g
            )
        ];


    matches.forEach(match=>{

        const ai =
            match[1];


        const data =
            toSafeString(
                match[2]
            );


        switch(ai){

            case "01":

                output.gtin =
                    normalizeGTIN(
                        data.slice(
                            0,
                            14
                        )
                    );

                break;


            case "17":

                output.expiry =
                    formatGS1Date(
                        data.slice(
                            0,
                            6
                        )
                    );

                break;


            case "10":

                output.lot =
                    data;

                break;


            case "21":

                output.serial =
                    data;

                break;


            case "30":

            case "37":{

                const qty =
                    toInteger(
                        data,
                        1
                    );


                output.quantity =
                    qty > 0
                    ?
                    qty
                    :
                    1;

                break;

            }

        }

    });


    return output;

}


/* =====================================================
   VARIABLE GS1 FIELD
===================================================== */

function readVariableGS1Field(
    data,
    startIndex,
    maxLength
){

    let endIndex =
        startIndex;


    while(
        endIndex < data.length
        &&
        (
            endIndex -
            startIndex
        ) < maxLength
        &&
        data[endIndex] !==
        "\x1D"
    ){

        endIndex++;

    }


    const value =
        data.slice(
            startIndex,
            endIndex
        );


    if(
        data[endIndex] ===
        "\x1D"
    ){

        endIndex++;

    }


    return {

        value:value,

        nextIndex:
            endIndex

    };

}


/* =====================================================
   GS1 DATE
===================================================== */

function formatGS1Date(yyMMdd){

    const value =
        toSafeString(
            yyMMdd
        )
        .replace(
            /\D/g,
            ""
        );


    if(value.length !== 6){

        return value;

    }


    const year =
        Number(
            value.slice(
                0,
                2
            )
        );


    const month =
        value.slice(
            2,
            4
        );


    const day =
        value.slice(
            4,
            6
        );


    const fullYear =
        year >= 50
        ?
        1900 + year
        :
        2000 + year;


    return (
        String(fullYear)
        +
        "-"
        +
        month
        +
        "-"
        +
        day
    );

}


/* =====================================================
   FALLBACK GTIN EXTRACTION
===================================================== */

function extractLikelyGTIN(value){

    const raw =
        toSafeString(
            value
        );


    if(!raw){

        return "";

    }


    /*
       AI 01 + GTIN14
    */

    const ai01 =
        raw.match(
            /01(\d{14})/
        );


    if(ai01){

        return normalizeGTIN(
            ai01[1]
        );

    }


    /*
       Your current scanner string example contains:
       JC10106287043583491...
       Required GTIN:
       06287043583491
    */

    const fourteenGroups =
        raw.match(
            /\d{14}/g
        );


    if(
        fourteenGroups
        &&
        fourteenGroups.length > 0
    ){

        /*
           Prefer a GTIN already known in Mapping.
        */

        for(
            const candidate of
            fourteenGroups
        ){

            const normalized =
                normalizeGTIN(
                    candidate
                );


            if(
                AppState.indexes
                    .itemByGTIN
                    .has(
                        normalized
                    )
            ){

                return normalized;

            }

        }


        return normalizeGTIN(
            fourteenGroups[0]
        );

    }


    /*
       Search all long numeric runs for a known
       mapped GTIN substring.
    */

    const digitRuns =
        raw.match(
            /\d{14,}/g
        )
        ||
        [];


    for(
        const run of digitRuns
    ){

        for(
            let start = 0;
            start <=
                run.length - 14;
            start++
        ){

            const candidate =
                run.slice(
                    start,
                    start + 14
                );


            if(
                AppState.indexes
                    .itemByGTIN
                    .has(
                        candidate
                    )
            ){

                return candidate;

            }

        }

    }


    /*
       Last fallback
    */

    const general =
        raw.match(
            /(?:^|\D)(\d{8,13})(?:\D|$)/
        );


    if(general){

        return normalizeGTIN(
            general[1]
        );

    }


    return "";

}


/* =====================================================
   TEST HELPER
===================================================== */

function testBarcode(barcode){

    const result =
        parseGS1Barcode(
            barcode
        );


    Logger.info(
        "Barcode test result",
        result
    );


    return result;

}


/* =====================================================
   RESET DUPLICATE STATE
===================================================== */

function resetScannerDuplicateProtection(){

    ScannerEngine.lastRawBarcode =
        "";


    ScannerEngine.lastScanTime =
        0;


    resetScannerTypingMetrics();

}


/* =====================================================
   END SMART SCANNER
===================================================== */