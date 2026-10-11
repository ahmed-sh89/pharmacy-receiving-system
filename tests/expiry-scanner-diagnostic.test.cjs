const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('js/expiry-scanner-diagnostic.js','utf8');
const markup=fs.readFileSync('index.html','utf8');

test('scanner metadata diagnostic is Staging gated, opt-in, bounded, and memory only',()=>{
 assert.match(source,/pharmflow-test/);assert.match(source,/button.addEventListener\("click"/);assert.match(source,/tovkcakucyagvbzvlnks/);
 assert.match(source,/const MAX=64,WINDOW_MS=10000/);assert.match(source,/events=\[\]/);
 assert.match(source,/valueLength:value\.length/);assert.match(source,/gsOffsets:gs\.slice/);assert.match(source,/aim:prefix\?prefix\[0\]/);assert.match(source,/separatorMarkers:separators\.slice/);
 assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB|authRpc|fetch\(/);
 assert.match(markup,/id="expiryScannerDiagnosticToggle"[^>]*hidden/);
});

const vm=require('node:vm');
test('document capture retains final per-character frame and sanitized parser outcome',async()=>{
 const handlers={},input={value:''},button={hidden:true,dataset:{},addEventListener(t,f){this.click=f;}},timers=[];let copied;
 const c={URLSearchParams,location:{hostname:'pharmflow-test.vercel.app',search:''},getSupabaseProjectUrl:()=> 'https://tovkcakucyagvbzvlnks.supabase.co',performance:{now:()=>0},setTimeout:f=>{timers.push(f);return timers.length;},clearTimeout(){},navigator:{clipboard:{writeText:async s=>{copied=JSON.parse(s);}}},document:{getElementById:id=>id==='expiryBarcodeInput'?input:button,addEventListener:(t,f)=>handlers[t]=f}};c.window=c;
 vm.runInNewContext(source,c);await button.click();
 const raw=']d201001234567890121727083110SYNTHETIC-LOT\x1d21SYNTHETIC-SERIAL';
 for(let i=0;i<100;i++){input.value=i===99?raw:'X'.repeat(i);handlers.input({target:input,inputType:'insertText',data:'X'});}
 c.expiryRecordScannerOutcome('GS1_REJECTED');c.expiryRecordScannerOutcome(raw);
 timers.at(-1)();await button.click();
 assert.equal(copied.events.length,64);const frame=copied.events.at(-2);assert.equal(frame.valueLength,raw.length);assert.equal(frame.gsCount,1);assert.equal(frame.controls[0].type,'GS');assert.equal(frame.controls[0].offset,raw.indexOf('\x1d'));assert.equal(copied.events.at(-1).category,'GS1_REJECTED');assert.ok(!JSON.stringify(copied).includes('SYNTHETIC'));assert.ok(!JSON.stringify(copied).includes('00123456789012'));
 assert.ok(handlers.beforeinput&&handlers.keydown&&handlers.paste);
});

test('Parser failure output uses a structural allowlist, discarding arbitrary strings and raw properties',async()=>{
 const handlers={},input={value:''},button={hidden:true,dataset:{},addEventListener(t,f){this.click=f;}},timers=[];let copied;
 const c={URLSearchParams,location:{hostname:'pharmflow-test.vercel.app',search:''},getSupabaseProjectUrl:()=> 'https://tovkcakucyagvbzvlnks.supabase.co',performance:{now:()=>0},setTimeout:f=>{timers.push(f);return timers.length;},clearTimeout(){},navigator:{clipboard:{writeText:async s=>{copied=JSON.parse(s);}}},document:{getElementById:id=>id==='expiryBarcodeInput'?input:button,addEventListener:(t,f)=>handlers[t]=f}};c.window=c;
 vm.runInNewContext(source,c);await button.click();
 c.expiryRecordScannerOutcome('GS1_REJECTED',{stage:'FIELD',reason:'VARIABLE_LENGTH',offset:25,ai:'10',valueLength:29,boundary:'END',normalizedLength:56,gsCount:1,gsOffsets:[24],fields:[{ai:'01',offset:0,length:14,boundary:'FIXED'},{ai:'SECRET',offset:'SECRET',length:29,boundary:'SECRET'}],raw:'SECRET',gtin:'00123456789012',serial:'SECRET'});
 timers.at(-1)();await button.click();assert.equal(copied.version,2);const d=copied.events.at(-1).failure;assert.equal(d.reason,'VARIABLE_LENGTH');assert.equal(d.fields[0].ai,'01');assert.equal(d.fields[1].ai,null);assert.equal(d.fields[1].offset,null);assert.equal(d.fields[1].boundary,null);assert.ok(!JSON.stringify(copied).includes('SECRET'));assert.ok(!JSON.stringify(copied).includes('00123456789012'));
});

test('In-app diagnostic is available without URL edits, remains opt-in, and excludes Production',async()=>{
 function load(host,project){const input={value:'PRIVATE'},button={hidden:true,dataset:{},addEventListener(t,f){this.click=f;}},handlers={};let copied;
 const c={location:{hostname:host,search:''},getSupabaseProjectUrl:()=>project,performance:{now:()=>0},setTimeout:()=>1,clearTimeout(){},navigator:{clipboard:{writeText:async text=>{copied=JSON.parse(text);}}},document:{getElementById:id=>id==='expiryBarcodeInput'?input:button,addEventListener:(t,f)=>handlers[t]=f}};c.window=c;vm.runInNewContext(source,c);return {input,button,handlers,c,copied:()=>copied};}
 const h=load('pharmflow-test-git-feature-expiry-stage1-115007-fhyh2xtskz-3504.vercel.app','https://tovkcakucyagvbzvlnks.supabase.co');assert.equal(h.button.hidden,false);assert.equal(h.button.textContent,'Diagnose one scan');h.handlers.input({target:h.input,data:'PRIVATE'});h.c.expiryRecordScannerOutcome('GS1_REJECTED');assert.equal(h.copied(),undefined);
 await h.button.click();await h.button.click();assert.equal(h.copied().events.length,1);assert.ok(!JSON.stringify(h.copied()).includes('PRIVATE'));
 for(const [host,project] of [['ahmed-sh89.github.io','https://tovkcakucyagvbzvlnks.supabase.co'],['pharmflow-test.vercel.app','https://zznoshzcyxmtwfbznjyr.supabase.co']]){const p=load(host,project);assert.equal(p.button.hidden,true);assert.equal(p.c.expiryRecordScannerOutcome,undefined);}
});
