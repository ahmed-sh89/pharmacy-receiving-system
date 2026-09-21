const assert=require("node:assert/strict");
const fs=require("node:fs");
const test=require("node:test");

test("High Priority receipt has one compact printable layout without forcing paper size",()=>{
    const source=fs.readFileSync("ui.js","utf8");
    assert.match(source,/@page\{margin:0\}/);
    assert.doesNotMatch(source,/@page\{size:80mm auto;margin:0\}/);
    assert.match(source,/class="highPriorityReceipt"/);
    assert.match(source,/\.highPriorityReceipt\{width:80mm;max-width:100%;margin:0;padding:\.5mm 1\.5mm 1\.5mm\}/);
    assert.match(source,/th\.qty,td\.qty\{width:14mm/);
    assert.match(source,/th:last-child,td:last-child\{border-right:0\}/);
    assert.doesNotMatch(source,/th\.qty::after,td\.qty::after/);
    assert.match(source,/td\.name\{overflow:hidden;text-overflow:ellipsis\}/);
});
