"use strict";

/* =====================================================
   PHARMACY RECEIVING SYSTEM V3
   UTILITIES
===================================================== */


/* =====================================================
   BASIC HELPERS
===================================================== */

function toSafeString(value){

    if(value === null || value === undefined){
        return "";
    }

    return String(value).trim();

}


function normalizeText(value){

    return toSafeString(value)
        .toLowerCase()
        .replace(/\s+/g," ")
        .trim();

}


function normalizeItemCode(value){

    return toSafeString(value)
        .replace(/\s+/g,"")
        .toUpperCase();

}


function normalizeGTIN(value){

    return toSafeString(value)
        .replace(/[^\d]/g,"");

}


function toNumber(value, fallback = 0){

    const number = Number(value);

    if(Number.isFinite(number)){
        return number;
    }

    return fallback;

}


function toInteger(value, fallback = 0){

    const number = parseInt(value,10);

    if(Number.isFinite(number)){
        return number;
    }

    return fallback;

}


/* =====================================================
   DATE HELPERS
===================================================== */

function nowISO(){

    return new Date().toISOString();

}


function formatDateTime(value){

    if(!value){
        return "-";
    }

    const date = new Date(value);

    if(Number.isNaN(date.getTime())){
        return "-";
    }

    return date.toLocaleString();

}


function formatDate(value){

    if(!value){
        return "-";
    }

    const date = new Date(value);

    if(Number.isNaN(date.getTime())){
        return "-";
    }

    return date.toLocaleDateString();

}


function dateOnlyISO(value = new Date()){

    const date = new Date(value);

    if(Number.isNaN(date.getTime())){
        return "";
    }

    const year = date.getFullYear();

    const month = String(
        date.getMonth() + 1
    ).padStart(2,"0");

    const day = String(
        date.getDate()
    ).padStart(2,"0");

    return `${year}-${month}-${day}`;

}


function isDateInsideRange(value, fromDate, toDate){

    const date = new Date(value);

    if(Number.isNaN(date.getTime())){
        return false;
    }

    let from = null;
    let to = null;

    if(fromDate){

        from = new Date(
            fromDate + "T00:00:00"
        );

    }

    if(toDate){

        to = new Date(
            toDate + "T23:59:59.999"
        );

    }

    if(
        from &&
        date < from
    ){
        return false;
    }

    if(
        to &&
        date > to
    ){
        return false;
    }

    return true;

}


/* =====================================================
   ID GENERATION
===================================================== */

function createUniqueId(prefix = "ID"){

    if(
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
    ){

        return (
            prefix +
            "-" +
            crypto.randomUUID()
        );

    }

    return (
        prefix +
        "-" +
        Date.now().toString(36).toUpperCase() +
        "-" +
        Math.random()
            .toString(36)
            .slice(2,10)
            .toUpperCase()
    );

}


function createOrderId(){

    const stamp = new Date()
        .toISOString()
        .replace(/[-:TZ.]/g,"")
        .slice(0,14);

    return (
        "ORD-" +
        stamp +
        "-" +
        Math.random()
            .toString(36)
            .slice(2,6)
            .toUpperCase()
    );

}


function createSessionId(){

    return createUniqueId("SES");

}


function createTransactionId(){

    return createUniqueId("TX");

}


function createDeviceId(){

    return createUniqueId("DEV");

}


/* =====================================================
   HTML SAFETY
===================================================== */

function escapeHTML(value){

    return toSafeString(value)

        .replace(/&/g,"&amp;")

        .replace(/</g,"&lt;")

        .replace(/>/g,"&gt;")

        .replace(/"/g,"&quot;")

        .replace(/'/g,"&#039;");

}


/* =====================================================
   STORAGE HELPERS
===================================================== */

function storageSet(key,value){

    try{

        localStorage.setItem(
            key,
            JSON.stringify(value)
        );

        return true;

    }
    catch(error){

        console.error(
            "Storage write failed:",
            key,
            error
        );

        return false;

    }

}


function storageGet(key,fallback = null){

    try{

        const value =
            localStorage.getItem(key);

        if(value === null){
            return fallback;
        }

        return JSON.parse(value);

    }
    catch(error){

        console.error(
            "Storage read failed:",
            key,
            error
        );

        return fallback;

    }

}


function storageRemove(key){

    try{

        localStorage.removeItem(key);

        return true;

    }
    catch(error){

        console.error(
            "Storage remove failed:",
            key,
            error
        );

        return false;

    }

}


/* =====================================================
   FILE HELPERS
===================================================== */

function downloadBlob(blob,fileName){

    const url =
        URL.createObjectURL(blob);

    const link =
        document.createElement("a");

    link.href = url;

    link.download = fileName;

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    setTimeout(()=>{

        URL.revokeObjectURL(url);

    },1000);

}


function downloadJSON(data,fileName){

    const blob = new Blob(

        [
            JSON.stringify(
                data,
                null,
                2
            )
        ],

        {
            type:"application/json;charset=utf-8"
        }

    );

    downloadBlob(
        blob,
        fileName
    );

}


/* =====================================================
   COLLECTION HELPERS
===================================================== */

function uniqueBy(array,keySelector){

    const map = new Map();

    array.forEach(item=>{

        const key = keySelector(item);

        if(!map.has(key)){
            map.set(key,item);
        }

    });

    return Array.from(
        map.values()
    );

}


function sortByItemName(array){

    return [...array].sort(
        (a,b)=>
            toSafeString(a.itemName)
                .localeCompare(
                    toSafeString(b.itemName)
                )
    );

}


/* =====================================================
   SEARCH HELPERS
===================================================== */

function itemMatchesSearch(item,searchText){

    const query =
        normalizeText(searchText);

    if(query === ""){
        return true;
    }

    const itemCode =
        normalizeText(
            item.itemCode
        );

    const itemName =
        normalizeText(
            item.itemName
        );

    return (
        itemCode.includes(query) ||
        itemName.includes(query)
    );

}


function searchItems(items,searchText,limit = 30){

    const query =
        normalizeText(searchText);

    if(query === ""){
        return [];
    }

    const results = [];

    for(const item of items){

        if(
            itemMatchesSearch(
                item,
                query
            )
        ){

            results.push(item);

        }

        if(
            results.length >= limit
        ){
            break;
        }

    }

    return results;

}


/* =====================================================
   QUANTITY HELPERS
===================================================== */

function calculateRemainingQty(
    orderedQty,
    receivedQty
){

    const ordered =
        toNumber(
            orderedQty,
            0
        );

    const received =
        toNumber(
            receivedQty,
            0
        );

    return Math.max(
        0,
        ordered - received
    );

}


function calculateItemStatus(item){

    if(item.manual === true){
        return "Manual";
    }

    const ordered =
        toNumber(
            item.orderedQty,
            0
        );

    const received =
        toNumber(
            item.receivedQty,
            0
        );

    if(received <= 0){
        return "Pending";
    }

    if(received < ordered){
        return "Receiving";
    }

    if(received === ordered){
        return "Completed";
    }

    return "Over";

}


/* =====================================================
   DEBOUNCE
===================================================== */

function debounce(
    callback,
    delay = 250
){

    let timer = null;

    return function(...args){

        clearTimeout(timer);

        timer = setTimeout(
            ()=>{
                callback.apply(
                    this,
                    args
                );
            },
            delay
        );

    };

}


/* =====================================================
   EVENT BUS
===================================================== */

const AppEvents = {

    listeners:new Map(),

    on(eventName,callback){

        if(
            !this.listeners.has(eventName)
        ){

            this.listeners.set(
                eventName,
                new Set()
            );

        }

        this.listeners
            .get(eventName)
            .add(callback);

        return ()=>{

            this.off(
                eventName,
                callback
            );

        };

    },

    off(eventName,callback){

        const set =
            this.listeners.get(eventName);

        if(!set){
            return;
        }

        set.delete(callback);

        if(set.size === 0){

            this.listeners.delete(
                eventName
            );

        }

    },

    emit(eventName,payload){

        const set =
            this.listeners.get(eventName);

        if(!set){
            return;
        }

        [...set].forEach(callback=>{

            try{

                callback(payload);

            }
            catch(error){

                console.error(
                    "Event handler error:",
                    eventName,
                    error
                );

            }

        });

    }

};


/* =====================================================
   SIMPLE LOGGER
===================================================== */

const Logger = {

    enabled:true,

    info(...args){

        if(this.enabled){
            console.log(
                "[PRS]",
                ...args
            );
        }

    },

    warn(...args){

        if(this.enabled){
            console.warn(
                "[PRS]",
                ...args
            );
        }

    },

    error(...args){

        console.error(
            "[PRS]",
            ...args
        );

    }

};


/* =====================================================
   VALIDATION HELPERS
===================================================== */

function isValidItemCode(value){

    return (
        normalizeItemCode(value)
            .length > 0
    );

}


function isValidQuantity(value){

    const qty =
        Number(value);

    return (
        Number.isFinite(qty) &&
        qty > 0
    );

}


function isValidGTIN(value){

    const gtin =
        normalizeGTIN(value);

    return (
        gtin.length >= 8 &&
        gtin.length <= 14
    );

}


/* =====================================================
   CLONE
===================================================== */

function deepClone(value){

    if(
        typeof structuredClone ===
        "function"
    ){

        return structuredClone(value);

    }

    return JSON.parse(
        JSON.stringify(value)
    );

}


/* =====================================================
   END OF UTILS
===================================================== */