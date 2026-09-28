"use strict";
const fs=require("fs");
const assert=require("assert");

const app=fs.readFileSync("js/app.js","utf8");
const cloud=fs.readFileSync("cloud-workspace.js","utf8");

assert(
  !app.includes('await ensureGlobalMasterGTINReady({forceCloud:true,silent:true});'),
  "first UI render must not wait for the full Global GTIN Master sync"
);
assert(
  !cloud.includes("__PHARMFLOW_STARTUP_PERF") &&
  !cloud.includes("markStartupPerf("),
  "temporary startup diagnostic instrumentation must not ship"
);
assert(
  app.includes('ensureGlobalMasterGTINReady({forceCloud:true,silent:true})'),
  "authoritative Global GTIN Master sync must still run"
);
assert(
  cloud.includes("const bootstrapped=await bootstrapActiveOrdersOnEmptyDevice();"),
  "empty-device startup must retain authoritative manifest/ledger bootstrap"
);
assert(
  cloud.includes("bootstrapped===true") &&
  cloud.includes("PharmFlowCloudWorkspace.hydratedPharmacyId===pharmacyId"),
  "successful authoritative bootstrap must be reusable in the same restore pass"
);
assert(
  cloud.includes("await pullActiveOrderManifestAuthority({clearIfMissing:true});") &&
  cloud.includes("await pullCloudWorkspaceTransactions();"),
  "normal hydrated refresh path must preserve manifest and receiving synchronization"
);

console.log("Startup performance safety gates: PASS");
