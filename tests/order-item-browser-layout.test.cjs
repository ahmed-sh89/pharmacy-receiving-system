const assert=require("node:assert/strict");
const fs=require("node:fs");
const test=require("node:test");

test("desktop Order Item Browser keeps filters aligned and search actions compact",()=>{
    const source=fs.readFileSync("ui.js","utf8");
    assert.match(source,/<div class="pfnBrowserActionRow"><label class="pfnBrowserSearchField"><span>Search<\/span><input class="phase263Search pfnWideSearch"/);
    assert.match(source,/pfnBrowserPriorityActions"><button type="button" class="pfnHighPriorityFilter" data-priority-filter>High Priority<\/button>/);

    const css=fs.readFileSync("css/pharmflow-next.css","utf8");
    assert.match(css,/\/\* Desktop Receiving surfaces — consolidated 2026-09-25 \*\//);
    assert.match(css,/\.pfnOrderBrowserControls \.pfnBrowserControlRow\{position:static;display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
    assert.match(css,/\.pfnOrderBrowserControls \.pfnBrowserControlRow select,body:not\(\.zebraDevice\) \.pfnOrderBrowserControls \[data-group-filter\]>summary\{box-sizing:border-box;width:100%;height:40px;min-height:40px/);
    assert.match(css,/\.pfnOrderBrowserControls \[data-group-filter\]>\.pfnUnifiedMultiSelectMenu\{top:calc\(100% \+ 4px\);bottom:auto;left:64px;right:0;width:auto/);
    assert.match(css,/\.pfnOrderBrowserControls \.pfnBrowserActionRow\{display:grid;grid-template-columns:minmax\(0,1fr\) max-content/);
});

test("Receiving search quantities stay compact and order picker footer is balanced",()=>{
    const css=fs.readFileSync("css/pharmflow-next.css","utf8");
    assert.match(css,/\.pfnSearchQtySplit>span\{display:inline-flex;align-items:center;justify-content:center;gap:5px/);
    assert.match(css,/\.headerOrderPickerMenu\{position:absolute;top:calc\(100% \+ 5px\);bottom:auto;left:0;z-index:200;width:240px/);
    assert.match(css,/\.headerOrderPickerActions\{display:grid;grid-template-columns:auto auto auto;justify-content:start/);
});

test("Order Item Browser row selection is immediate visual-only and preserves priority states",()=>{
    const source=fs.readFileSync("ui.js","utf8");
    assert.match(source,/let selectedRowKey=""/);
    assert.match(source,/pfnBrowserRowSelected/);
    assert.match(source,/tbody\?\.addEventListener\('click',event=>\{\s*if\(event\.target\.closest\('button,a,input,select,summary,label'\)\)return;\s*selectBrowserRow/);
    assert.match(source,/data-mark="SHORT"/);
    assert.match(source,/data-mark="NEW"/);

    const css=fs.readFileSync("css/pharmflow-next.css","utf8");
    assert.match(css,/\.pfnCleanWorklist \.phase263Table tbody tr:not\(\.pfnBrowserRowSelected\):hover td\{background:#d9ebfa!important;color:#123f67!important\}/);
    assert.match(css,/\.pfnCleanWorklist \.phase263Table tbody tr\.pfnBrowserRowSelected td,body:not\(\.zebraDevice\) \.pfnCleanWorklist \.phase263Table tbody tr\.pfnBrowserRowSelected:hover td\{background:#1f67a6!important;color:#fff!important;transition:none!important\}/);
    assert.match(css,/\.pfnCleanWorklist \.phase263Table tbody tr\.pfnBrowserRowSelected \.pfnPriorityMark\.active\.short\{background:#ff9800!important/);
    assert.match(css,/\.pfnCleanWorklist \.phase263Table tbody tr\.pfnBrowserRowSelected \.pfnPriorityMark\.active\.new\{background:#fff!important;color:#174f7b!important\}/);
});
