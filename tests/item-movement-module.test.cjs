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

test("one item shows the original item name in details and a copyable code in the card", () => {
    const context = vm.createContext({window:{}, document:{readyState:"loading", addEventListener(){}}});
    vm.runInContext(source, context);
    const item = {item_code:"1013239", item_name:"Klavox & Co.", movement_date:"2026-09-14",
        order_number:"TO-000478674", movement_source:"WAH001", movement_origin:"Import", movement_quantity:17};
    const other = {...item, order_number:"TO-000471830", movement_quantity:13};
    const html = context.pfhRenderResult({type:"item",periods:[{...period,standalone:true,movement:true,rows:[item,other]}]});
    assert.match(html, /Total qty<\/span><strong title="30">30<\/strong><\/span>/);
    assert.match(html, /Movement Details <span class="pfhMovementCount">· 2 movements<\/span>/);
    assert.doesNotMatch(html.slice(0, html.indexOf('class="pfhMovementDetails"')), /2 movements/);
    assert.equal((html.match(/Klavox &amp; Co\./g) || []).length, 3);
    assert.match(html, /data-pfh-copy-code="1013239"[^>]*aria-label="Copy item code 1013239"/);
    assert.match(html, />Item Name<\/th>/);
    assert.match(html, />Klavox &amp; Co\.<\/td>/);
    assert.match(html, /data-pfh-movement-item="1013239"><h4>Movement Details/);
    assert.doesNotMatch(html, />Item Code<|data-pfh-movement-toggle/);
});

test("multi-item details stay scoped to their item and remember the open group after a render", () => {
    const context = vm.createContext({window:{}, document:{readyState:"loading", addEventListener(){}}});
    vm.runInContext(source, context);
    const item = {item_code:"101",item_name:"First",order_number:"TO-1",movement_date:"2026-11-04",
        movement_quantity:12,movement_source:"WAH001",movement_origin:"Orders"};
    const second = {...item,item_code:"102",item_name:"Second",order_number:"TO-2",movement_quantity:4};
    const result = {type:"item",periods:[{...period,standalone:true,movement:true,rows:[item,second]}]};
    const closed = context.pfhRenderResult(result, () => "");
    assert.equal((closed.match(/aria-expanded="false"/g) || []).length, 2);
    const html = context.pfhRenderResult(result, () => "", "102");
    assert.match(html, /aria-controls="pfhMovementDetails0" aria-expanded="false"/);
    assert.match(html, /aria-controls="pfhMovementDetails1" aria-expanded="true"/);
    const [firstGroup, secondGroup] = html.split("</article>");
    assert.match(firstGroup, /TO-1/);
    assert.match(firstGroup, /Movement Details <span class="pfhMovementCount">· 1 movement<\/span>/);
    assert.doesNotMatch(firstGroup, /TO-2/);
    assert.match(secondGroup, /TO-2/);
});

test("compact movement actions preserve dates and export selections when clearing a search", () => {
    const html = fs.readFileSync("index.html", "utf8");
    const section = html.slice(html.indexOf('id="receivingHistoryContent"'), html.indexOf('id="pftDialog"'));
    assert.match(section, /id="pfhMovementList"[^>]+aria-controls="pfhExportList"/);
    assert.match(section, /id="pfhMovementClear"[^>]+type="button"/);
    assert.match(section, /id="pfhMovementAdd"[^>]+type="button"/);
    assert.match(section, /id="pfhResultsPeriod"/);
    const clear = source.slice(source.indexOf('movementClear.addEventListener'), source.indexOf('movementAdd.addEventListener'));
    assert.match(clear, /\["item", "order", "source"\]/);
    assert.doesNotMatch(clear, /"from"|"to"|selection =|form\.reset/);
    assert.match(source, /result\.type === "item" && !singleMovementItem \? index/);
});

test("opening a movement card closes the previously expanded card", () => {
    const context = vm.createContext({window:{}, document:{readyState:"loading", addEventListener(){}}});
    vm.runInContext(source, context);
    const card = expanded => {
        const details = {hidden: !expanded};
        let value = String(expanded);
        return {details, getAttribute: () => value, setAttribute: (_, next) => {value = next;},
            closest: () => ({querySelector: () => details})};
    };
    const first = card(true), second = card(false);
    const list = {querySelector: () => [first,second].find(button => button.getAttribute() === "true")};
    context.pfhToggleMovementItem(list, second);
    assert.equal(first.details.hidden, true);
    assert.equal(first.getAttribute(), "false");
    assert.equal(second.details.hidden, false);
    assert.equal(second.getAttribute(), "true");
    context.pfhToggleMovementItem(list, second);
    assert.equal(second.details.hidden, true);
});
