const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
const source=fs.readFileSync('staging/expiry-failed-scan-diagnostic.js','utf8');
function runtime({built=true,handheld=false,host='pharmflow-test.vercel.app',project='https://tovkcakucyagvbzvlnks.supabase.co',clipboard}={}){
 const {document,window}=parseHTML('<html><head></head><body><input id="expiryBarcodeInput"><div id="expiryDesktopStatus" class="expiryDesktopStatus error">Invalid GS1 scan</div><button id="outside">Outside</button></body></html>');
 let copied=null;const events={};
 const c={document,location:{hostname:host},expiryIsHandheld:()=>handheld,getSupabaseProjectUrl:()=>project,toSafeString:v=>String(v??''),navigator:{clipboard:{writeText:clipboard|| (async text=>{copied=JSON.parse(text);})}},addEventListener:(n,f)=>events[n]=f,focusExpiryScanner(){},setExpiryStatus(){c.expiryFailedScanDiagnostic.clear();document.getElementById('expiryDesktopStatus').textContent='READY TO SCAN';}};c.window=c;vm.createContext(c);
 const scanner=fs.readFileSync('js/scanner.js','utf8');vm.runInContext(scanner.slice(scanner.indexOf('function cleanScannerInput'),scanner.indexOf('/* =====================================================\n   GS1 PARSER'))+fs.readFileSync('js/expiry-operation.js','utf8')+'\nthis.adapter=ExpiryOperation;',c);
 vm.runInContext(built?source.replace('__PHARMFLOW_STAGING_DIAGNOSTIC_BUILD__','staging-preview'):source,c);
 return {c,document,window,events,copied:()=>copied,buttons:()=>[...document.querySelectorAll('.expiryFailedScanActions button')]};
}
const raw=']d2010500016701939110SA7991124020117270228\r';
function reject(h,input=raw){let error;try{h.c.adapter.scanFacts(input,true);}catch(e){error=e;}assert.ok(error);h.c.expiryFailedScanDiagnostic?.capture(input,error);return error;}
test('Failed scan copies exact pre-normalized input, escaped controls, normalization and parser reason once',async()=>{
 const h=runtime();reject(h);assert.equal(h.buttons()[0].textContent,'Copy Diagnostic');h.buttons()[0].click();await new Promise(setImmediate);
 const d=h.copied();assert.equal(d.rawInput,raw);assert.equal(d.rawControls[0].code,13);assert.equal(d.rawControls[0].offset,raw.length-1);assert.ok(d.rawEscaped.includes('\\r'));assert.equal(d.normalizedInput,raw.slice(3,-1));assert.equal(d.parserFailure.reason,'VARIABLE_LENGTH');assert.equal(d.kind,'EXPIRY_GS1_PARSER_REJECTION');assert.equal(h.buttons().length,0);
 assert.match(h.document.getElementById('expiryDesktopStatus').textContent,/Invalid GS1 scan.*Diagnostic copied/);
});
test('Control offsets and leading-zero GTIN remain exact, including a GS and non-ASCII framing',async()=>{
 const h=runtime();const input=']d20105000167019391\x1d10SA799\x1d10X';reject(h,input);h.buttons()[0].click();await new Promise(setImmediate);const d=h.copied();assert.equal(d.rawInput,input);assert.equal(d.rawControls[0].offset,input.indexOf('\x1d'));assert.ok(d.rawEscaped.includes('\\u001d'));assert.equal(d.parserFailure.reason,'DUPLICATE_AI');
});
test('Next input, Escape, dismissal, outside click, page hide and explicit status clear release payload',()=>{
 for(const action of ['input','escape','dismiss','outside','pagehide','clear']){const h=runtime();reject(h);const oldCopy=h.buttons()[0];
  if(action==='input')h.document.getElementById('expiryBarcodeInput').dispatchEvent(new h.window.Event('input'));
  if(action==='escape'){const e=new h.window.Event('keydown');e.key='Escape';h.document.dispatchEvent(e);}
  if(action==='dismiss')h.buttons()[1].click();
  if(action==='outside')h.document.getElementById('outside').click();
  if(action==='pagehide')h.events.pagehide();
  if(action==='clear')h.c.expiryFailedScanDiagnostic.clear();
  assert.equal(h.buttons().length,0,action);oldCopy.click();assert.equal(h.copied(),null,action);
 }
});
test('Clipboard failure retains a deliberate retry; an async copy cannot clear the next diagnostic',async()=>{
 const bad=runtime({clipboard:async()=>{throw Error('denied')}});reject(bad);bad.buttons()[0].click();await new Promise(setImmediate);assert.equal(bad.buttons()[0].textContent,'Retry Copy');assert.equal(bad.buttons()[0].disabled,false);
 let finish;const h=runtime({clipboard:()=>new Promise(r=>finish=r)});reject(h);h.buttons()[0].click();h.c.expiryFailedScanDiagnostic.clear();reject(h,']d2011234');finish();await new Promise(setImmediate);assert.equal(h.buttons()[0].textContent,'Copy Diagnostic');
});
test('Raw source and non-Staging environments stay inert; Handheld never exposes diagnostic controls',()=>{
 for(const opts of [{built:false},{host:'ahmed-sh89.github.io'},{project:'https://example.supabase.co'}]){const h=runtime(opts);assert.equal(h.c.expiryFailedScanDiagnostic,undefined);}
 const h=runtime({handheld:true});reject(h);assert.equal(h.buttons().length,0);assert.equal(h.copied(),null);
 assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB|authRpc|fetch\(|console\.|sendBeacon/);
 assert.doesNotMatch(fs.readFileSync('index.html','utf8'),/expiry-failed-scan-diagnostic/);
});
test('Successful scans and item-not-found never capture a diagnostic; parser behavior remains unchanged',()=>{
 const h=runtime();for(const input of ['01050001670193911727020010SA799',']d20105000167019391112402011727022810SA799','UNKNOWN-ITEM']){const f=h.c.adapter.scanFacts(input,true);assert.ok(f.identifier);assert.equal(h.buttons().length,0);}
 const expiry=fs.readFileSync('js/expiry.js','utf8');assert.match(expiry,/setExpiryStatus\("error",error.message\);window.expiryFailedScanDiagnostic\?\.capture\(rawValue,error\)/);
});
test('Build gate emits a script only for the approved Preview branch, never Production or a browser flag',async()=>{
 const saved={VERCEL_ENV:process.env.VERCEL_ENV,VERCEL_GIT_COMMIT_REF:process.env.VERCEL_GIT_COMMIT_REF};
 try{for(const [environment,branch,expected] of [['preview','fix/staging-preview-splash-css-path',1],['production','fix/staging-preview-splash-css-path',0],['preview','main',0],['','fix/staging-preview-splash-css-path',0]]){
  process.env.VERCEL_ENV=environment;process.env.VERCEL_GIT_COMMIT_REF=branch;
  const {default:config}=await import('../vite.config.js?gate='+encodeURIComponent(environment+branch));
  const plugin=config.plugins.find(p=>p.name==='pharmflow-staging-failed-scan-diagnostic');assert.equal(plugin.transformIndexHtml().length,expected);
 }}finally{for(const [key,value] of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
