"use strict";
const fs=require("fs"),assert=require("assert");
const next=fs.readFileSync("js/pharmflow-next.js","utf8");
const excel=fs.readFileSync("js/excel.js","utf8");
const html=fs.readFileSync("index.html","utf8");

const saveStart=next.indexOf("const saved=await window.setHandheldAssignedOrderNumbers");
const saveEnd=next.indexOf("\n    });",saveStart);
const saveFlow=next.slice(saveStart,saveEnd);
assert(saveStart>=0 && saveEnd>saveStart,"assignment save flow must exist");
assert(saveFlow.indexOf("if(saved)")>=0 && saveFlow.indexOf("AppState.workspace.handheldOrderNumbers=chosen.slice()")>saveFlow.indexOf("if(saved)"),"confirmed assignment must be applied locally only after save");
assert(saveFlow.indexOf("renderHandheldAssignment(overlay)")>saveFlow.indexOf("AppState.workspace.handheldOrderNumbers=chosen.slice()"),"assignment repaint must use confirmed local state");

const uploadPaint=excel.indexOf("publishConfirmedOrderUpload();");
const successToast=excel.indexOf("showToast(",uploadPaint);
assert(uploadPaint>=0,"confirmed upload publish boundary must remain");
assert(excel.indexOf("requestAnimationFrame",uploadPaint)>uploadPaint && excel.indexOf("requestAnimationFrame",uploadPaint)<successToast,"confirmed order UI must paint before success toast");
assert(!next.includes("setInterval("),"fix must not add polling");

assert(html.includes("css/responsive.css?v=LOADER_CAPSULE2"),"capsule CSS must use a new deployment cache key");
assert(html.includes("js/excel.js?v=MANAGE_SYNC2"),"order upload fix must use a new deployment cache key");
assert(html.includes("js/pharmflow-next.js?v=MANAGE_SYNC2"),"assignment fix must use a new deployment cache key");

console.log("Manage Orders synchronization safety gates: PASS");
