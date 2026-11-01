const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const current=fs.readFileSync('ui.js','utf8'),prior=cp.execFileSync('git',['show','4978f12e9daf92eb60205e140583b0e3aa758f49:ui.js'],{encoding:'utf8'});
function handlers(s){const a=s.indexOf('function renderItemBrowser(');return s.slice(s.indexOf('    const input=',a),s.indexOf('function ',s.indexOf('    const input=',a)));}
test('remaining order/quantity and Priority persistence handlers preserved',()=>{for(const [start,end] of [['    const bindSingleFilter=','    bindSingleFilter(orderFilter'],["    priorityFilter?.addEventListener","    printPriority?.addEventListener"]]){const section=s=>s.slice(s.indexOf(start,s.indexOf('function renderItemBrowser(')),s.indexOf(end,s.indexOf(start,s.indexOf('function renderItemBrowser('))));assert.equal(section(current),section(prior));}const body=handlers(current);assert(!body.includes('selectedGroups'));assert(!body.includes('groupFilter'));assert(current.includes('<th>Group</th>'));});
test('title and existing close control share the filter row; legacy layout owner removed',()=>{
 assert(current.includes('filters.prepend(title)'));assert(current.includes('filters.append(close)'));
 assert(!fs.readFileSync('css/pharmflow-next.css','utf8').includes('.pfnOrderBrowserControls'));
 const css=fs.readFileSync('css/receiving-order-toolbar.css','utf8');assert(css.includes('@media(max-width:700px)'));assert(css.includes('font-weight:600;line-height:1;white-space:nowrap;flex-shrink:0'));
});
