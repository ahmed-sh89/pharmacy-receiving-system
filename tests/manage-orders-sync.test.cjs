"use strict";
const fs=require("fs"),assert=require("assert");
const next=fs.readFileSync("js/pharmflow-next.js","utf8");
const excel=fs.readFileSync("js/excel.js","utf8");
const html=fs.readFileSync("index.html","utf8");

const saveStart=next.indexOf("const saved=await window.setHandheldAssignedOrderNumbers");
const saveEnd=next.indexOf("\n    });",saveStart);
const saveFlow=next.slice(saveStart,saveEnd);
assert(saveStart>=0 && saveEnd>saveStart,"assignment save flow must exist");
assert(saveFlow.indexOf("AppState.workspace.handheldOrderNumbers=chosen.slice()")>=0,"chosen assignment must remain visible during save");
assert(saveFlow.includes("if(saved===false)"),"failed authoritative assignment must explicitly rollback");
assert(saveFlow.includes("AppState.workspace.handheldOrderNumbers=previous"),"assignment failure must restore previous scope");

const uploadPaint=excel.indexOf("publishConfirmedOrderUpload();");
const successToast=excel.indexOf("showToast(",uploadPaint);
assert(uploadPaint>=0,"confirmed upload publish boundary must remain");
assert(excel.includes("order-upload-manifest-confirmed"),"orders must paint at manifest-confirmed boundary before lifecycle bookkeeping");
assert(excel.indexOf("requestAnimationFrame",uploadPaint)>uploadPaint && excel.indexOf("requestAnimationFrame",uploadPaint)<successToast,"confirmed order UI must paint before success toast");
assert(!next.includes("setInterval("),"fix must not add polling");

assert(html.includes("css/responsive.css?v=LOADER_CAPSULE3"),"capsule CSS must use a new deployment cache key");
assert(html.includes("js/excel.js?v=MANAGE_SYNC3"),"order upload fix must use a new deployment cache key");
assert(html.includes("js/pharmflow-next.js?v=MANAGE_SYNC3"),"assignment fix must use a new deployment cache key");

const css=fs.readFileSync("css/responsive.css","utf8");
assert(!css.includes("@media (prefers-reduced-motion:reduce){.pfBootCapsuleHalf"),"boot capsule must not be frozen by reduced-motion override");
console.log("Manage Orders synchronization safety gates: PASS");
