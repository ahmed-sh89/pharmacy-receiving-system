const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const current=fs.readFileSync('ui.js','utf8'),prior=cp.execFileSync('git',['show','2b7bc31:ui.js'],{encoding:'utf8'});
function handlers(s){const a=s.indexOf('function renderItemBrowser(');return s.slice(s.indexOf('    const input=',a),s.indexOf('function ',s.indexOf('    const input=',a)));}
test('order/group/quantity/search/priority/print/clear handlers unchanged',()=>assert.equal(handlers(current),handlers(prior)));
test('title and existing close control share the filter row; legacy layout owner removed',()=>{
 assert(current.includes('filters.prepend(title)'));assert(current.includes('filters.append(close)'));
 assert(!fs.readFileSync('css/pharmflow-next.css','utf8').includes('.pfnOrderBrowserControls'));
 const css=fs.readFileSync('css/receiving-order-toolbar.css','utf8');assert(css.includes('@media(max-width:700px)'));assert(css.includes('font-weight:600;line-height:1;white-space:nowrap;flex-shrink:0'));
});
