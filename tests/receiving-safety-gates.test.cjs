"use strict";
const fs=require("fs"),assert=require("assert");
const receiving=fs.readFileSync("js/receiving.js","utf8");
const migration=fs.readFileSync("PHASE2C1164_NEEDS_REVIEW_AUTO_ALLOCATED_CONSTRAINTS.sql","utf8");

const start=receiving.indexOf("async function quickResolveUnrecognizedGTIN");
const end=receiving.indexOf("function openKnownNotInOrderPC",start);
assert(start>=0&&end>start,"known-item classifier must exist");
const body=receiving.slice(start,end);

assert(body.includes('return openKnownNotInOrderPC(parsed,masterRecord,selectedOrders);'),
  "PC known-not-in-order scan must require the exception confirmation UI");
assert(!body.includes("if(selectedOrders.length!==1)"),
  "single selected Order must not bypass known-not-in-order confirmation");
assert(!body.includes("prepareManualExtraItem(masterRecord.itemCode"),
  "scan classification must not create an Extra item before confirmation");
assert(!body.includes("manual:true"),
  "scan classification must not directly create a manual receipt");

assert(migration.includes("resolution_type in ('LINK_ORDER_ITEM','AUTO_ALLOCATED')"),
  "intent constraint must accept AUTO_ALLOCATED");
assert(migration.includes("resolution_type in ('LINK_ORDER_ITEM','ADD_UNORDERED','AUTO_ALLOCATED')"),
  "review constraint must accept AUTO_ALLOCATED without removing legacy values");

console.log("Receiving safety gates: PASS");
