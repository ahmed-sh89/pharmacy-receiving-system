"use strict";
const fs=require("fs"),assert=require("assert");
const next=fs.readFileSync("js/pharmflow-next.js","utf8");
const excel=fs.readFileSync("js/excel.js","utf8");
const html=fs.readFileSync("index.html","utf8");
const css=fs.readFileSync("css/responsive.css","utf8");

const renderStart=next.indexOf("function renderHandheldAssignment");
const renderEnd=next.indexOf("function refreshOpenManageOrders",renderStart);
const renderFlow=next.slice(renderStart,renderEnd);
assert(renderStart>=0 && renderEnd>renderStart,"assignment renderer must exist");
assert(renderFlow.includes("assignment.dataset.activeSignature===signature"),"same active-order structure must preserve live checkbox DOM");
assert(!renderFlow.includes("renderHandheldAssignment(overlay);"),"assignment save must not recursively rebuild its own live form");
assert(renderFlow.includes("input.checked=chosen.includes(input.value)"),"confirmed assignment must update existing controls in place");

const manifestPaint=excel.indexOf("The Active Order Manifest has now been verified");
const lifecycle=excel.indexOf("Commit lifecycle + immutable source snapshots",manifestPaint);
assert(manifestPaint>=0 && lifecycle>manifestPaint,"confirmed order list must paint before lifecycle/source bookkeeping");
const paintBlock=excel.slice(manifestPaint,lifecycle);
assert(paintBlock.includes("refreshFileLists?.()"),"confirmed orders must directly paint embedded Manage Orders file list");
assert(!paintBlock.includes('AppEvents.emit("files:updated"'),"manifest-confirmed paint must not trigger assignment form rebuild");

assert(html.includes("css/responsive.css?v=LOADER_CAPSULE3"),"capsule CSS deployment key must remain current");
assert(html.includes("js/excel.js?v=MANAGE_SYNC4"),"order upload root fix must use current deployment key");
assert(html.includes("js/pharmflow-next.js?v=MANAGE_SYNC4"),"assignment root fix must use current deployment key");
assert(!css.includes("@media (prefers-reduced-motion:reduce){.pfBootCapsuleHalf"),"boot capsule must not freeze");

console.log("Manage Orders root-cause safety gates: PASS");
