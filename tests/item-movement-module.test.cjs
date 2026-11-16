"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync("js/receiving-history.js", "utf8");
const period = {from:"2026-11-01", to:"2026-11-16", source:"WAH001"};
const params = {p_pharmacy_id:"staging-pharmacy"};

test("standalone Item Movement searches registered Orders and imports through one scoped endpoint", async () => {
    const calls = [];
    const rows = [
        {number:"TO-1", source:"WAH001", received_date:"2026-11-04", code:"101", name:"Sample", quantity:"12", origin:"Orders"},
        {number:"TO-2", source:"WAH001", received_date:"2026-11-06", code:"101", name:"Sample", quantity:"4", origin:"Import"}
    ];
    const context = vm.createContext({window:{}, document:{readyState:"loading", addEventListener(){}},
        authRpc: async (name, args) => {calls.push([name,args]);return rows;}});
    vm.runInContext(source, context);
    const result = await context.pfhReadStandaloneMovement(params, period, "", "101", () => true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "search_pharmflow_item_movement_v1");
    assert.equal(calls[0][1].p_pharmacy_id, params.p_pharmacy_id);
    assert.equal(calls[0][1].p_source, "WAH001");
    assert.equal(context.pfhItemTotals(result.rows, true)[0][2], 16);
    const [, details] = context.pfhExportTables("item", result);
    assert.equal(details.columns.at(-1), "Recorded via");
    assert.equal(details.rows[0].at(-1), "Orders");
    assert.equal(details.rows[1].at(-1), "Import");
    assert.match(context.pfhRenderResult({type:"item", periods:[result]}), /Recorded via/);
});

test("standalone route and staged configuration are distinct from legacy Receiving History", () => {
    const html = fs.readFileSync("index.html", "utf8");
    const config = fs.readFileSync("js/config.js", "utf8");
    assert.match(html, /data-page="receiving"[\s\S]+?data-page="item-movement"/);
    assert.match(html, /id="page-item-movement"/);
    assert.match(config, /standaloneMovement: false/);
    assert.match(source, /standaloneMovement \? "discrepancy" : "item"/);
});
