const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
const {parseHTML}=require('linkedom');
const baseline='cbd249427dbe8a0acfd6426ef8eede2f2f4e5f29';
const read=(p,old=false)=>old?cp.execFileSync('git',['show',`${baseline}:${p}`],{encoding:'utf8'}):fs.readFileSync(p,'utf8');
function fn(source,name){const start=source.indexOf(`async function ${name}(`);assert(start>=0);return source.slice(start,source.indexOf('\n}',start)+2);}
function device({ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64)',platform='Win32',width=1920,height=1080,touch=0,search='',stored={},blocked=false}={}){
 const {document}=parseHTML('<html><body></body></html>');const values=new Map(Object.entries(stored));let writes=0;
 const c={window:{location:{search},screen:{width,height}},navigator:{userAgent:ua,platform,maxTouchPoints:touch},localStorage:{getItem(k){if(blocked)throw Error('denied');return values.get(k)||null;},setItem(k,v){writes++;values.set(k,v);}},document,URLSearchParams};
 vm.createContext(c);vm.runInContext(read('index.html').match(/<script>\s*(\"use strict\";[\s\S]*?window\.PharmFlowDeviceMode[\s\S]*?)<\/script>/)[1],c);
 const ui=read('ui.js'),at=ui.indexOf('function isLikelyZebraDevice(){');vm.runInContext(ui.slice(at,ui.indexOf('\n}',at)+2),c);
 return {c,document,values,get writes(){return writes;}};
}
test('baseline emulated Android persists a flag that subsequently forces Windows Handheld',()=>{
 const html=read('index.html',true),inline=html.match(/<script>\s*(\(function\(\)\{[\s\S]*?\}\)\(\);)\s*<\/script>/)[1];
 const values=new Map(),{document}=parseHTML('<html><body></body></html>');const c={navigator:{userAgent:'Android',maxTouchPoints:1},screen:{width:390,height:844},innerWidth:390,innerHeight:844,location:{search:''},URLSearchParams,document,localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}};
 vm.createContext(c);vm.runInContext(inline,c);assert.equal(values.get('PHARMFLOW_HANDHELD_DEVICE'),'1');
 c.navigator={userAgent:'Windows NT 10.0',maxTouchPoints:0};c.screen={width:1920,height:1080};document.body.className='';vm.runInContext(inline,c);assert(document.body.classList.contains('zebraDevice'));
});
for(const stored of [{},{PHARMFLOW_HANDHELD_DEVICE:'1'}])test(`Windows ignores legacy auto flag (${JSON.stringify(stored)}) across reloads`,()=>{
 for(let i=0;i<3;i++){const d=device({stored});assert.equal(d.c.isLikelyZebraDevice(),false);assert(!d.document.body.classList.contains('zebraDevice'));assert.equal(d.writes,0);}
});
test('narrow touchscreen Windows and Android UA with an unchanged Windows platform stay Desktop',()=>{
 for(const ua of ['Windows NT 10.0','Android'])assert.equal(device({ua,width:390,height:844,touch:5}).c.isLikelyZebraDevice(),false);
});
test('full Android emulation never persists detection; disabling it restores Desktop with the same storage',()=>{
 const emulated=device({ua:'Android',platform:'Linux armv8l',width:390,height:844,touch:1});assert.equal(emulated.c.isLikelyZebraDevice(),true);assert.equal(emulated.writes,0);
 const desktop=device({stored:Object.fromEntries(emulated.values)});assert.equal(desktop.c.isLikelyZebraDevice(),false);
});
for(const ua of ['Zebra TC26 Android','Symbol MC3300 Android','Enterprise Browser Android','Mozilla/5.0 (Linux; Android 11)'])test(`synthetic hardware signals: ${ua}`,()=>{
 const d=device({ua,platform:'Linux armv8l',width:360,height:640,touch:1});assert(d.c.isLikelyZebraDevice());assert(d.document.body.classList.contains('zebraDevice'));assert.equal(d.writes,0);
});
for(const options of [{search:'?handheld=1'},{stored:{PHARMFLOW_HANDHELD_TEST_MODE:'1'}}])test(`explicit Handheld remains supported: ${JSON.stringify(options)}`,()=>{
 const d=device(options);assert.equal(d.c.window.PharmFlowDeviceMode.classify(),'explicit');assert(d.c.isLikelyZebraDevice());assert(d.document.body.classList.contains('zebraDevice'));assert.equal(d.writes,0);
});
test('blocked storage does not stop explicit URL or Zebra detection',()=>{
 assert(device({blocked:true,search:'?handheld=1'}).c.isLikelyZebraDevice());assert(device({blocked:true,ua:'Zebra TC26',platform:'Linux'}).c.isLikelyZebraDevice());
});
test('early and operational policy share the same implementation; no auto flag reads/writes remain in loaded paths',()=>{
 const html=read('index.html');assert(html.indexOf('window.PharmFlowDeviceMode')<html.indexOf('src="ui.js'));
 for(const p of ['index.html','ui.js'])assert(!read(p).includes('getItem("PHARMFLOW_HANDHELD_DEVICE")')&&!read(p).includes('setItem("PHARMFLOW_HANDHELD_DEVICE"'));
});
async function boot(old,{session=true,delay=0,pending=''}={}){
 const calls=[],stages=[];const {document}=parseHTML('<html><body></body></html>');
 const c={window:{},document,console,AuthState:{mustChangePassword:false,ownerExists:true},getSupabaseAccessToken:()=>session?'synthetic-token':'',localStorage:{getItem:()=>pending||null,removeItem(){}},applyBrandIdentity(){},initializeAuth:async()=>calls.push('session'),claimAssignedAdminIfAvailable:async()=>calls.push('assignment'),loadPublicSetupStatus:async()=>{},completePendingOwnerSetup:async()=>{},submitPendingRegistration:async()=>calls.push('submit'),redeemPendingInvite:async()=>calls.push('invite'),loadMyAppContext:async()=>calls.push('context+permissions'),loadMyRegistrationStatus:async()=>{calls.push('registration');await new Promise(r=>setTimeout(r,delay));},renderAuthState:()=>calls.push('render'),hasApplicationAccess:()=>session,startApplication:async()=>calls.push('authority+workspace'),setAuthMessage(){},showAuthenticationStartupFailure(){throw Error('unexpected boot failure');}};
 vm.createContext(c);vm.runInContext(fn(read('js/auth.js',old),'finishPendingAccessIfPossible'),c);
 for(const n of ['initializeAuth','finishPendingAccessIfPossible','loadMyAppContext','loadMyRegistrationStatus','startApplication']){const original=c[n];c[n]=async(...args)=>{const start=performance.now();try{return await original(...args);}finally{stages.push({name:n,ms:performance.now()-start});}};}
 c.AUTH_PENDING_OWNER_KEY='owner';c.AUTH_PENDING_REGISTRATION_KEY='registration';c.AUTH_PENDING_INVITE_KEY='invite';
 vm.runInContext(fn(read('js/app.js',old),'bootstrapMedryvo'),c);const start=performance.now();await c.bootstrapMedryvo();return {calls,stages,ms:performance.now()-start};
}
test('real bootstrap + pending-access owner removes exactly one registration read, preserving authority order',async()=>{
 const before=await boot(true),after=await boot(false);
 assert.equal(before.calls.filter(x=>x==='registration').length,2);assert.equal(after.calls.filter(x=>x==='registration').length,1);
 assert.deepEqual(after.calls,['session','assignment','context+permissions','registration','render','authority+workspace']);
});
test('signed-out reload makes no protected startup calls',async()=>{
 assert.deepEqual((await boot(false,{session:false})).calls,['session','render']);
});
test('non-bootstrap pending access callers retain the default registration refresh',async()=>{
 let reads=0;const c={AuthState:{},getSupabaseAccessToken:()=>true,claimAssignedAdminIfAvailable:async()=>{},localStorage:{getItem:()=>null},AUTH_PENDING_OWNER_KEY:'o',AUTH_PENDING_REGISTRATION_KEY:'r',AUTH_PENDING_INVITE_KEY:'i',loadMyRegistrationStatus:async()=>reads++};vm.createContext(c);vm.runInContext(fn(read('js/auth.js'),'finishPendingAccessIfPossible'),c);await c.finishPendingAccessIfPossible();assert.equal(reads,1);
});
test('controlled before/after timings are one network round trip saved, not a live 30–60s resolution claim',async()=>{
 const samples=[];for(let i=0;i<3;i++){const before=await boot(true,{delay:60}),after=await boot(false,{delay:60});samples.push({beforeMs:Math.round(before.ms),afterMs:Math.round(after.ms)});}
 console.log('SYNTHETIC_REGISTRATION_TIMINGS',JSON.stringify({delayPerRegistrationMs:60,samples}));
});
test('Staging timing observer preserves promise identity and rejected/successful results',async()=>{
 const {document}=parseHTML('<html><body></body></html>');let callback;
 const pending=Promise.resolve('same-result');const c={window:{addEventListener:(name,fn)=>callback=fn,initializeAuth:()=>pending},document,location:{href:'https://offline.test'},URL,performance:{now:()=>100,getEntriesByType:()=>[]}};
 vm.createContext(c);vm.runInContext(read('staging/startup-timing.js'),c);callback();assert.equal(c.window.initializeAuth(),pending);assert.equal(await c.window.initializeAuth(),'same-result');
 await Promise.resolve();const snapshot=c.window.PharmFlowStartupTimings.snapshot();assert.equal(snapshot.spans[0].stage,'initializeAuth');assert(!JSON.stringify(snapshot).includes('same-result'));
});
