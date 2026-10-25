const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('js/supabase.js','utf8');
function fn(name){const a=src.search(new RegExp('(?:async )?function '+name+'\\('));return src.slice(a,src.indexOf('\n}',a)+2);}
test('retired transports reject before fetch and do not touch retained queues',async()=>{
 let fetched=0;const session={cloud:true,id:'legacy-fixture',secret:'synthetic-only',pendingQueue:[{id:1}]};
 const ctx={AppState:{session},fetch:()=>{fetched++;throw Error('Unexpected network');},AbortController,setTimeout,clearTimeout};vm.createContext(ctx);
 vm.runInContext(src.slice(src.indexOf('const LEGACY_RECEIVING_RPC_NAMES'),src.indexOf('function initializeSupabaseCloud'))+fn('cloudRpc'),ctx);
 const names=vm.runInContext('LEGACY_RECEIVING_RPC_NAMES',ctx);
 for(const name of names)await assert.rejects(ctx.cloudRpc(name,{}),/LEGACY_RECEIVING_RETIRED/);
 assert.equal(fetched,0);assert.equal(session.pendingQueue.length,1);assert.equal(session.id,'legacy-fixture');
});
test('startup, URL join, restore, direct create/join and polling remain dormant',async()=>{
 const ctx={CloudSyncEngine:{initialized:false},stopCloudPolling(){ctx.stopped=true;},setTimeout(){throw Error('Legacy timer');},AppEvents:{on(){throw Error('Legacy listener');}}};vm.createContext(ctx);
 for(const name of ['initializeSupabaseCloud','isCloudSessionActive','createCloudReceivingSession','joinCloudReceivingSession','handleCloudJoinFromURL','validateRestoredZebraCloudSession','startCloudPolling'])vm.runInContext(fn(name),ctx);
 ctx.initializeSupabaseCloud();assert(ctx.stopped);assert.equal(ctx.isCloudSessionActive(),false);
 for(const name of ['createCloudReceivingSession','joinCloudReceivingSession','handleCloudJoinFromURL','validateRestoredZebraCloudSession','startCloudPolling'])assert.equal(await ctx[name](),false);
});
