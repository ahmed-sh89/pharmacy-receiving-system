// Keep the original pre-fix harness untouched. Select baseline runtime from Git
// or current runtime with post-fix assertions; fixtures and sequencing stay identical.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const baseline='c4e3d97a7db4094885624ec074aa36f3284de0bc';
const before=process.argv.includes('--before');
let source=fs.readFileSync(new URL('./receiving-authority-prefix-repro.mjs',import.meta.url),'utf8');
source=source.replace("const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');",`const root = ${JSON.stringify(root)};`);
source=source.replace('rpcNames:','rpcCount: calls.length, rpcNames:');
if(before){
  source=source.replace("assert.equal(sample().received, 11);", "assert.equal(sample().received, 0); run('rebuildReceivingQuantitiesFromLedger();');");
  source="import {execFileSync} from 'node:child_process';\n"+source;
  source=source.replace("fs.readFileSync(path.join(root, file), 'utf8')",`execFileSync('git',['show','${baseline}:'+file],{cwd:root,encoding:'utf8'})`);
}else{
  source=source.replace("readyState: 'loading',", "readyState: 'loading', documentElement:{dataset:{}},");
  source=source.replace("'js/reports.js', 'js/orders.js', 'cloud-workspace.js'", "'js/reports.js', 'js/orders.js', 'supabase.js', 'cloud-workspace.js', 'js/app.js'");
  source=source.replaceAll('afterStale.received, 0','afterStale.received, 11')
    .replaceAll('afterStale.history, staleCount','afterStale.history, count')
    .replaceAll('afterStale.ids, staleCount','afterStale.ids, count')
    .replaceAll('afterStale.completedItems, 0','afterStale.completedItems, 1')
    .replaceAll('afterStale.remainingItems, 1','afterStale.remainingItems, 0')
    .replaceAll('persisted.workspace.receivingHistory.length, staleCount','persisted.workspace.receivingHistory.length, count')
    .replaceAll('persisted.workspace.orderData[0].receivedQty, 0','persisted.workspace.orderData[0].receivedQty, 11')
    .replaceAll('paints.some(p => p.received === 0)','paints.every(p => p.received === 11)')
    .replaceAll('afterEmptyDelta.received, 0','afterEmptyDelta.received, 11')
    .replaceAll('afterEmptyDelta.history, staleCount','afterEmptyDelta.history, count')
    .replaceAll('PRE-FIX BUG REPRODUCED','POST-FIX ROLLBACK PREVENTED');
}
await import('data:text/javascript;base64,'+Buffer.from(source+'\n//# sourceURL=receiving-evidence-'+(before?'before':'after')+'.mjs').toString('base64'));
