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

    fastKeyThreshold:45,

    /* Phase 2C.10.6.1 — Zebra browser diagnostic proved that DataWedge
       inserts the COMPLETE GS1 payload in one beforeinput/input operation
       while keydown/keyup report key=Unidentified. Do not infer Zebra scans
       from key timing; consume the final input value atomically. */
    handheldInputTimer:null,
    handheldPendingRaw:""

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
            /*
               Do not reset scan feedback here. A successful scan
               immediately restores focus to the scanner input, and
               resetting to READY here would hide the green/red flash.
               setScanBoxState() owns the timed return to READY.
            */
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
        clearTimeout(ScannerEngine.inputTimer);

        const input=event.target;
        const value=toSafeString(input.value);

        if(!value){ return; }

        if(isZebraReceivingInput()){
            clearTimeout(ScannerEngine.handheldInputTimer);
            input.value="";
            processScannerValue(value);
            return;
        }

        if(shouldTreatAsBarcode(value,true)){
            processScannerValue(value);
        }else{
            triggerManualSearch(value);
        }

    }

}


function isZebraReceivingInput(){
    return !!(
        typeof isLikelyZebraDevice === "function" &&
        isLikelyZebraDevice()
    );
}

function queueZebraAtomicInput(input){
    if(!input) return;

    clearTimeout(ScannerEngine.handheldInputTimer);

    ScannerEngine.handheldInputTimer=setTimeout(()=>{
        /* Read the CURRENT input value, not a value captured by an earlier
           keyboard event. This matches the measured DataWedge event model. */
        const raw=toSafeString(input.value);
        if(!raw) return;

        ScannerEngine.handheldPendingRaw=raw;

        /* Clear immediately so the field cannot remain visually parked on
           the tail of the GS1 string and the next scan always has an empty
           target. */
        input.value="";

        Promise.resolve(processScannerValue(raw))
            .finally(()=>{
                ScannerEngine.handheldPendingRaw="";
            });
    },25);
}

/* =====================================================
   SMART INPUT
===================================================== */

function handleSmartScannerInput(event){

    const input=event.target;
    const value=toSafeString(input.value);

    clearTimeout(ScannerEngine.inputTimer);

    if(!value){
        clearSmartSearchResults();
        resetScannerTypingMetrics();
        return;
    }

    /* =========================================================
       ZEBRA HARDWARE PATH — ONE PATH ONLY
       Measured 20 Aug 2026:
       - keydown/keyup: key=Unidentified
       - beforeinput: insertText contains full GS1
       - input: final full GS1 value
       Therefore Handheld scan boundaries are based on the atomic INPUT value,
       never on key timing or barcode-length heuristics.
       ========================================================= */
    if(isZebraReceivingInput()){
        clearSmartSearchResults();
        queueZebraAtomicInput(input);
        return;
    }

    /* Desktop keeps its scan/search dual behavior. */
    const barcodeCandidate=shouldTreatAsBarcode(value,false);

    if(barcodeCandidate){
        ScannerEngine.inputTimer=setTimeout(()=>{
            processScannerValue(toSafeString(input.value)||value);
        },ScannerEngine.autoProcessDelay);
        return;
    }

    ScannerEngine.inputTimer=setTimeout(()=>{
        triggerManualSearch(toSafeString(input.value)||value);
    },ScannerEngine.searchDelay);
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
        /^\](?:C1|d2|Q3)/i.test(
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

async function processScannerValue(rawValue){

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

            return await receiveParsedBarcode(
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
                /(?:<GS>|\\u001D|\\x1D)/gi,
                "\x1D"
            )
            /*
               Some Android/Chrome/DataWedge paths render FNC1/GS as a visible
               control-picture or as the Unicode replacement character.
               Treat only these known separator representations as GS.
            */
            .replace(
                /[\u241D\uFFFD]+/g,
                "\x1D"
            )
            .replace(
                /[\x1C\x1E\x1F]+/g,
                "\x1D"
            )
            /*
               Zebra/DataWedge may expose the GS1 separator as ~, ~~
               or \~ depending on profile / browser keyboard handling.
               Arabic keyboard output may also surface the separator as
               the shadda mark (U+0651). Normalize all of these to FNC1/GS.
            */
            .replace(
                /\\?~+/g,
                "\x1D"
            )
            .replace(
                /\u0651+/g,
                "\x1D"
            )
            /*
               Strip common AIM symbology identifiers.
               ]C1 = GS1-128, ]d2 = GS1 DataMatrix, ]Q3 = GS1 QR.
            */
            .replace(
                /^\](?:C1|d2|Q3)/i,
                ""
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

    let gs1 =
        parseGS1ApplicationIdentifiers(
            raw
        );

    if(
        gs1.gtin &&
        (
            !gs1.expiry ||
            (!gs1.serial && toSafeString(gs1.lot||"").length>=18)
        )
    ){
        const recovered=recoverSeparatorlessMedicineGS1(raw);

        if(recovered.gtin){
            gs1={
                ...gs1,
                lot:recovered.lot || gs1.lot,
                expiry:recovered.expiry || gs1.expiry,
                serial:recovered.serial || gs1.serial
            };
        }
    }


    gs1=recoverMedicineFieldsFromCombinedLot(gs1);

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

function recoverMedicineFieldsFromCombinedLot(gs1){
    const lot=toSafeString(gs1?.lot||"");
    if(!lot) return gs1;

    /*
       Zebra can deliver the entire tail as AI10 when the FNC1 after Batch is
       stripped before JavaScript sees it. Recover only highly structured
       medicine tails containing a plausible AI17 date and AI21 serial.
       Example:
       2402761726113021KY5X4W2MWOQK
       -> Batch 240276 / Expiry 261130 / Serial KY5X4W2MWOQK
    */
    let match=lot.match(/^(.{1,20}?)17(\d{6})21(.{1,20})$/);

    if(
        match &&
        isPlausibleGS1ExpiryYYMMDD(match[2])
    ){
        return {
            ...gs1,
            lot:match[1],
            expiry:formatGS1Date(match[2]),
            serial:match[3]
        };
    }

    match=lot.match(/^(.{1,20}?)21(.{1,20}?)17(\d{6})$/);

    if(
        match &&
        isPlausibleGS1ExpiryYYMMDD(match[3])
    ){
        return {
            ...gs1,
            lot:match[1],
            serial:match[2],
            expiry:formatGS1Date(match[3])
        };
    }

    return gs1;
}


function recoverSeparatorlessMedicineGS1(value){
    const data=toSafeString(value).replace(/\x1D/g,"");
    const out={gtin:"",lot:"",expiry:"",serial:"",quantity:1};

    if(!/^01\d{14}/.test(data)){
        return out;
    }

    out.gtin=normalizeGTIN(data.slice(2,16));
    const tail=data.slice(16);

    let match=tail.match(/^10(.{1,20}?)17(\d{6})21(.{1,20})$/);
    if(match && isPlausibleGS1ExpiryYYMMDD(match[2])){
        out.lot=match[1];
        out.expiry=formatGS1Date(match[2]);
        out.serial=match[3];
        return out;
    }

    match=tail.match(/^10(.{1,20}?)21(.{1,20}?)17(\d{6})$/);
    if(match && isPlausibleGS1ExpiryYYMMDD(match[3])){
        out.lot=match[1];
        out.serial=match[2];
        out.expiry=formatGS1Date(match[3]);
        return out;
    }

    return {gtin:"",lot:"",expiry:"",serial:"",quantity:1};
}


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

function isPlausibleGS1ExpiryYYMMDD(value){
    const digits=toSafeString(value).replace(/\D/g,"");

    if(digits.length!==6){
        return false;
    }

    const month=Number(digits.slice(2,4));
    const day=Number(digits.slice(4,6));

    if(month<1 || month>12){
        return false;
    }

    /* GS1 may use day 00 to represent the last day/unspecified day of month. */
    return day>=0 && day<=31;
}


function findImplicitGS1VariableBoundary(data,startIndex,maxLength){
    /*
       Recovery fallback for scanner/browser paths that drop FNC1.
       Real GS separators always win. For separator-loss only, infer the next
       AI conservatively from a structurally valid downstream sequence.
    */
    const limit=Math.min(data.length,startIndex+maxLength);

    const hasPlausibleExpiryAfter=(from,maxAhead=22)=>{
        const stop=Math.min(data.length,from+maxAhead);
        for(let j=from;j<stop;j++){
            const tail=data.slice(j);
            if(
                tail.startsWith("17") &&
                /^17\d{6}/.test(tail) &&
                isPlausibleGS1ExpiryYYMMDD(tail.slice(2,8))
            ) return true;
        }
        return false;
    };

    for(let i=startIndex+1;i<limit;i++){
        const tail=data.slice(i);

        if(
            tail.startsWith("17") &&
            /^17\d{6}/.test(tail) &&
            isPlausibleGS1ExpiryYYMMDD(tail.slice(2,8))
        ) return i;

        /* Typical medicine sequence: AI10 lot -> AI21 serial -> AI17 expiry. */
        if(tail.startsWith("21") && hasPlausibleExpiryAfter(i+2,22)) return i;
    }

    return -1;
}

function readVariableGS1Field(
    data,
    startIndex,
    maxLength
){

    let endIndex =
        startIndex;


    const implicitBoundary =
        findImplicitGS1VariableBoundary(
            data,
            startIndex,
            maxLength
        );


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
        &&
        (
            implicitBoundary < 0 ||
            endIndex < implicitBoundary
        )
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