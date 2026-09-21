const assert=require("node:assert/strict");
const fs=require("node:fs");
const test=require("node:test");

test("desktop Order Item Browser keeps filters in one compact toolbar",()=>{
    const source=fs.readFileSync("ui.js","utf8");
    assert.match(source,/<label class="pfnBrowserSearchField"><span>Search<\/span><input class="phase263Search pfnWideSearch"/);
    assert.match(source,/data-priority-filter>High Priority<\/button><button type="button" class="pfnHighPriorityFilter" data-print-priority hidden>Print<\/button><button type="button" class="pfnHighPriorityFilter" data-clear-priority hidden>Clear High Priority/);

    const css=fs.readFileSync("css/pharmflow-next.css","utf8");
    assert.match(css,/@media \(min-width:901px\)\{\s*body:not\(\.zebraDevice\) \.pfnOrderBrowserControls/);
    assert.match(css,/grid-template-columns:minmax\(155px,\.85fr\) minmax\(160px,\.9fr\) minmax\(240px,1\.45fr\) auto minmax\(170px,\.9fr\)!important/);
    assert.match(css,/\.pfnOrderBrowserControls \.pfnBrowserControlRow\{display:contents!important\}/);
    assert.match(css,/\.pfnOrderBrowserControls \[data-print-priority\]\{grid-column:4!important;grid-row:2!important/);
    assert.match(css,/\.pfnOrderBrowserControls \.pfnWideSearch\{[\s\S]*border:2px solid #8fb3d2!important/);
    assert.match(css,/\.pfnOrderBrowserControls \.pfnWideSearch:focus\{border-color:#1476c9!important/);
});

test("Order Item Browser row selection is visual-only and does not invoke priority actions",()=>{
    const source=fs.readFileSync("ui.js","utf8");
    assert.match(source,/let selectedRowKey=""/);
    assert.match(source,/pfnBrowserRowSelected/);
    assert.match(source,/tbody\?\.addEventListener\('click',event=>\{\s*if\(event\.target\.closest\('button,a,input,select,summary,label'\)\)return;\s*selectBrowserRow/);
    assert.match(source,/tbody\?\.addEventListener\('keydown',event=>/);
    assert.match(source,/data-mark="SHORT"/);
    assert.match(source,/data-mark="NEW"/);

    const css=fs.readFileSync("css/pharmflow-next.css","utf8");
    assert.match(css,/tr\.pfnMobileItemCard:hover td\{background:#d4eaff!important/);
    assert.match(css,/tr\.pfnBrowserRowSelected td\{background:#bfe1fb!important/);
});
