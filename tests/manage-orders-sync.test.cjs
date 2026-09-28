"use strict";
const fs=require("fs"),assert=require("assert");
const next=fs.readFileSync("js/pharmflow-next.js","utf8");
const excel=fs.readFileSync("js/excel.js","utf8");
assert(next.includes("renderHandheldAssignment(overlay);"),"confirmed assignment must repaint the open modal");
const saveStart=next.indexOf("const saved=await window.setHandheldAssignedOrderNumbers");
const saveEnd=next.indexOf("\n    });",saveStart);
const saveFlow=next.slice(saveStart,saveEnd);
assert(saveFlow.indexOf("if(saved)")>=0 && saveFlow.indexOf("AppState.workspace.handheldOrderNumbers=chosen.slice()")>saveFlow.indexOf("if(saved)"),"confirmed assignment must be applied locally only after save");\nassert(saveFlow.indexOf("renderHandheldAssignment(overlay)")>saveFlow.indexOf("AppState.workspace.handheldOrderNumbers=chosen.slice()"),"assignment repaint must use confirmed local state");
assert(excel.includes('publishConfirmedOrderUpload();'),"confirmed upload publish boundary must remain");
const uploadPaint=excel.indexOf('publishConfirmedOrderUpload();');
const successToast=excel.indexOf('showToast(',uploadPaint);
assert(excel.indexOf('requestAnimationFrame',uploadPaint)>uploadPaint && excel.indexOf('requestAnimationFrame',uploadPaint)<successToast,"confirmed order UI must paint before success toast");
assert(!next.includes("setInterval("),"fix must not add polling");
console.log("Manage Orders synchronization safety gates: PASS");
\nconst html=fs.readFileSync("index.html","utf8");\nassert(html.includes("css/responsive.css?v=LOADER_CAPSULE2"),"capsule CSS must use a new deployment cache key");\nassert(html.includes("js/excel.js?v=MANAGE_SYNC2"),"order upload fix must use a new deployment cache key");\nassert(html.includes("js/pharmflow-next.js?v=MANAGE_SYNC2"),"assignment fix must use a new deployment cache key");\n