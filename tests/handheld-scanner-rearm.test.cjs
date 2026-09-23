const assert=require("node:assert/strict");
const fs=require("node:fs");
const test=require("node:test");
const vm=require("node:vm");

function extractFunction(source,name){
    const asyncStart=source.indexOf(`async function ${name}(`);
    const start=asyncStart>=0?asyncStart:source.indexOf(`function ${name}(`);
    assert.notEqual(start,-1,`${name} must exist`);
    const bodyStart=source.indexOf("{",start);
    let depth=0,quote="",escaped=false;
    for(let index=bodyStart;index<source.length;index+=1){
        const character=source[index];
        if(quote){if(escaped) escaped=false;else if(character==="\\") escaped=true;else if(character===quote) quote="";continue;}
        if(character==='"'||character==="'"||character==='`'){quote=character;continue;}
        if(character==="{") depth+=1;
        if(character==="}"&&!--depth) return source.slice(start,index+1);
    }
    throw new Error(`${name} has no closing brace`);
}

function runtime({parser,queue}={}){
    const calls=[];
    const context={HandheldRuntime:{receivingBusy:false},hhReceivingSessionReady:()=>true,hhSetVisualState:(state,label)=>calls.push(["state",state,label]),cleanScannerInput:value=>String(value||"").trim(),parseGS1Barcode:parser,receiveParsedBarcode:async parsed=>({received:parsed.gtin}),Logger:{error:()=>{}},showToast:()=>{},hhRefreshReadyState:()=>calls.push(["ready"]),hhFocusActiveScanner:()=>calls.push(["focus"]),setTimeout:callback=>{callback();return 1;},window:{PharmFlowReceivingScanQueue:{enqueue:queue}}};
    vm.runInNewContext(extractFunction(fs.readFileSync("js/handheld-runtime.js","utf8"),"hhProcessReceiving"),context);
    return {context,calls};
}

test("normal → unresolved 3/4-digit → normal accepts every scan and re-arms the Handheld",async()=>{
    const queued=[];
    const {context,calls}=runtime({parser:raw=>/^\d{8,14}$/.test(raw)?{raw,gtin:raw}:{raw,gtin:""},queue:async(raw,parsed)=>{queued.push({raw,parsed});return {accepted:true};}});
    await context.hhProcessReceiving("0123456789012",{value:"first"});
    await context.hhProcessReceiving("1234",{value:"short"});
    await context.hhProcessReceiving("0123456789013",{value:"last"});
    assert.deepEqual(JSON.parse(JSON.stringify(queued.map(entry=>entry.raw))),["0123456789012","1234","0123456789013"]);
    assert.equal(queued[1].parsed.gtin,"1234");
    assert.equal(queued[1].parsed.capturedCode,true);
    assert.equal(context.HandheldRuntime.receivingBusy,false);
    assert.equal(calls.filter(entry=>entry[0]==="ready").length,3);
    assert.equal(calls.filter(entry=>entry[0]==="focus").length,3);
});

test("hardware alphanumeric identifiers stay exact candidates without changing manual search behavior",async()=>{
    const queued=[];
    const {context}=runtime({parser:raw=>({raw,gtin:""}),queue:async(raw,parsed)=>{queued.push({raw,parsed});return {accepted:true};}});
    await context.hhProcessReceiving("U0030",{value:"U0030"});
    await context.hhProcessReceiving("S00110",{value:"S00110"});
    await context.hhProcessReceiving("1234A",{value:"1234A"});
    assert.deepEqual(JSON.parse(JSON.stringify(queued.map(entry=>entry.raw))),["U0030","S00110","1234A"]);
    assert.deepEqual(JSON.parse(JSON.stringify(queued.map(entry=>entry.parsed.identifierDisplay))),["U0030","S00110","1234A"]);
    assert.deepEqual(JSON.parse(JSON.stringify(queued.map(entry=>entry.parsed.gtin))),["U0030","S00110","1234A"]);
});

test("mapped short code stays an exact candidate and unsupported input routes to Needs Review",()=>{
    const source=fs.readFileSync("js/receiving-release.js","utf8");
    const receiving=fs.readFileSync("js/receiving.js","utf8");
    assert.match(source,/const parsed=row\.parsed\|\|\(typeof parseGS1Barcode/);
    assert.match(source,/receiveUnrecognizedHandheldScan\(clean\)/);
    assert.match(receiving,/async function receiveUnrecognizedHandheldScan\(raw\)/);
    assert.match(receiving,/reason:"UNSUPPORTED_BARCODE"/);
});

test("parser exception releases busy state and leaves the next scan usable",async()=>{
    let first=true;const queued=[];
    const {context,calls}=runtime({parser:raw=>{if(first){first=false;throw new Error("forced parser failure");}return {raw,gtin:raw};},queue:async(raw,parsed)=>{queued.push({raw,parsed});return {accepted:true};}});
    await context.hhProcessReceiving("BAD",{value:"BAD"});
    await context.hhProcessReceiving("0123456789012",{value:"good"});
    assert.equal(context.HandheldRuntime.receivingBusy,false);
    assert.deepEqual(JSON.parse(JSON.stringify(queued.map(entry=>entry.raw))),["0123456789012"]);
    assert.equal(calls.filter(entry=>entry[0]==="focus").length,2);
});

function createIndexedDb(records){
    const finish=transaction=>queueMicrotask(()=>transaction.oncomplete?.());
    const storeFor=transaction=>({put(row){const i=records.findIndex(entry=>entry.transactionId===row.transactionId);if(i>=0)records[i]=structuredClone(row);else records.push(structuredClone(row));finish(transaction);},delete(id){const i=records.findIndex(entry=>entry.transactionId===id);if(i>=0)records.splice(i,1);finish(transaction);},index(){return {openCursor(){const request={};const rows=records.slice().sort((a,b)=>a.sequence-b.sequence);let i=0;const advance=()=>queueMicrotask(()=>{const row=rows[i++];request.result=row?{value:structuredClone(row),continue:advance}:null;request.onsuccess?.();});advance();return request;}};}});
    const database={objectStoreNames:{contains:()=>true},transaction(){const transaction={oncomplete:null,onerror:null,objectStore:()=>storeFor(transaction)};return transaction;}};
    return {open(){const request={result:database};queueMicrotask(()=>request.onsuccess?.());return request;}};
}

test("persisted bad head recovers without losing or duplicating later accepted transactions",async()=>{
    const rows=[{transactionId:"bad",scope:"P::HH",sequence:1,raw:"1234",state:"accepted"},{transactionId:"good-1",scope:"P::HH",sequence:2,raw:"0123456789012",state:"accepted"},{transactionId:"good-2",scope:"P::HH",sequence:3,raw:"0123456789013",state:"accepted"}];
    const handlers=new Map(),received=[],unresolved=[],rearms=[];
    const source=fs.readFileSync("js/receiving-release.js","utf8").replace("window.PharmFlowReceivingScanQueue={enqueue,resume:run};","window.PharmFlowReceivingScanQueue={enqueue,resume:run};");
    const context={window:{addEventListener:()=>{},hhRefreshReadyState:()=>rearms.push("ready"),hhRepairScannerFocus:reason=>rearms.push(reason)},AuthState:{context:{pharmacy_id:"P"}},ensureDeviceId:()=>"HH",crypto:{randomUUID:()=>"new"},indexedDB:createIndexedDb(rows),IDBKeyRange:{bound:()=>null},navigator:{onLine:true},AppState:{workspace:{receivingHistory:[]}},cleanScannerInput:value=>String(value||"").trim(),parseGS1Barcode:raw=>/^\d{8,14}$/.test(raw)?{raw,gtin:raw}:{raw,gtin:""},receiveUnrecognizedHandheldScan:async raw=>{unresolved.push(raw);return true;},receiveParsedBarcode:async(parsed,{transactionId})=>{received.push(transactionId);context.AppState.workspace.receivingHistory.push({transactionId,cloudSynced:false});return true;},Logger:{warn:()=>{}},AppEvents:{on:(event,handler)=>handlers.set(event,handler)},document:{readyState:"loading",addEventListener:()=>{}},setTimeout:()=>0};
    vm.runInNewContext(source,context);
    await context.window.PharmFlowReceivingScanQueue.resume();
    assert.deepEqual(unresolved,["1234"]);
    assert.deepEqual(received,["good-1","good-2"]);
    assert.equal(rows.some(row=>row.transactionId==="bad"),false);
    assert.deepEqual(rows.map(row=>[row.transactionId,row.state]),[["good-1","awaitingConfirmation"],["good-2","awaitingConfirmation"]]);
    assert.deepEqual(rearms,["ready","receiving-queue-recovery"]);
    await handlers.get("receiving:cloud-confirmed")({transactionId:"good-1"});
    await handlers.get("receiving:cloud-confirmed")({transactionId:"good-2"});
    assert.deepEqual(rows,[]);
    assert.deepEqual(received,["good-1","good-2"]);
});

test("PC scanner remains outside the Handheld queue transport",()=>{
    const scanner=fs.readFileSync("js/scanner.js","utf8");
    const release=fs.readFileSync("js/receiving-release.js","utf8");
    assert.match(scanner,/return await receiveParsedBarcode\(\s*parsed\s*\);/);
    assert.doesNotMatch(scanner,/PharmFlowReceivingScanQueue/);
    assert.match(release,/window\.hhRefreshReadyState\?\.\(\);/);
});
