"use strict";
const fs=require("fs");
const assert=require("assert");
const ui=fs.readFileSync("ui.js","utf8");
const start=ui.indexOf("async function requestRemoveActiveOrderFile(fileId){");
const end=ui.indexOf("/* PharmFlow 2C.9",start);
assert(start>=0 && end>start,"Close Order handler must exist");
const flow=ui.slice(start,end);

assert(ui.includes(">Close Order</button>"),"Manage Orders must use the existing PharmFlow button style with Close Order label");
assert(flow.includes('"Close Order"'),"Close Order confirmation must be explicit");
assert(flow.includes("syncReceivingStructureAfterChange"),"Close Order must persist through canonical structural authority");
assert(flow.includes("verifyActiveOrderManifestMatchesLocal"),"Close Order must verify server manifest");
assert(!flow.includes('authRpc("discard_pharmflow_active_order"'),"Close Order must not use destructive discard RPC");
assert(!flow.includes("AppState.workspace.receivingHistory="),"Close Order must not delete receiving history");
assert(!flow.includes("nrV2Delete("),"Close Order must not delete Needs Review evidence");
assert(!flow.includes("receivedQty=Math.max"),"Close Order must not subtract received quantities");
assert(flow.includes("handheldOrderNumbers"),"Close Order must prune Handheld assignment");

console.log("Close Order safety gates: PASS");
