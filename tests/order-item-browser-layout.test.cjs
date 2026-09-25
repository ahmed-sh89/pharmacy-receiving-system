const assert=require("node:assert/strict");
const fs=require("node:fs");
const test=require("node:test");

test("desktop Order Item Browser keeps Row 2 search and priority actions in one compact toolbar",()=>{
    const source=fs.readFileSync("ui.js","utf8");
    assert.match(source,/<div class="pfnBrowserActionRow"><label class="pfnBrowserSearchField"><span>Search<\/span><input class="phase263Search pfnWideSearch"/);
    assert.match(source,/pfnBrowserPriorityActions"><button type="button" class="pfnHighPriorityFilter" data-priority-filter>High Priority<\/button><button type="button" class="pfnHighPriorityFilter" data-print-priority hidden>Print<\/button><button type="button" class="pfnHighPriorityFilter" data-clear-priority hidden>Clear High Priority/);
    assert.match(source,/if\(printPriority\)printPriority\.hidden=!priorityOnly;\s*if\(clearPriority\)clearPriority\.hidden=!priorityOnly;/);

    const css=fs.readFileSync("css/pharmflow-next.css","utf8");
    assert.match(css,/\/\* Desktop Receiving surfaces — consolidated 2026-09-25 \*\//);
    assert.match(css,/\.pfnOrderBrowserControls \.pfnBrowserControlRow\{position:absolute;top:10px;right:52px;display:grid;grid-template-columns:210px 210px 230px/);
    assert.match(css,/\.pfnOrderBrowserControls \.pfnBrowserControlRow select,body:not\(\.zebraDevice\) \.pfnOrderBrowserControls \[data-group-filter\]>summary\{box-sizing:border-box;width:100%;height:38px;min-height:38px/);
    assert.match(css,/\.pfnOrderBrowserControls \[data-group-filter\]>\.pfnUnifiedMultiSelectMenu\{top:calc\(100% \+ 4px\);bottom:auto;left:0;right:auto;width:210px/);
    assert.match(css,/\.pfnOrderBrowserControls \.pfnBrowserActionRow\{display:grid;grid-template-columns:minmax\(0,1fr\) max-content;align-items:center;gap:10px/);
    assert.match(css,/\.pfnOrderBrowserControls \.pfnWideSearch\{box-sizing:border-box;width:100%;height:42px\}/);
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
    assert.match(css,/\.pfnCleanWorklist \.phase263Table tbody tr:hover td\{background:#d9ebfa!important;color:#123f67!important\}/);
    assert.match(css,/tr\.pfnBrowserRowSelected td\{background:#1f67a6!important;color:#fff!important\}/);
    assert.match(css,/tr\.pfnBrowserRowSelected \.pfnPriorityMark\.active\.short\{background:#ff9800!important/);
    assert.match(css,/tr\.pfnBrowserRowSelected \.pfnPriorityMark\.active\.new\{background:#fff!important;color:#174f7b!important\}/);
});
