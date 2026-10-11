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
 timers.at(-1)();await button.click();assert.equal(copied.version,3);const d=copied.events.at(-1).failure;assert.equal(d.reason,'VARIABLE_LENGTH');assert.equal(d.fields[0].ai,'01');assert.equal(d.fields[1].ai,null);assert.equal(d.fields[1].offset,null);assert.equal(d.fields[1].boundary,null);assert.ok(!JSON.stringify(copied).includes('SECRET'));assert.ok(!JSON.stringify(copied).includes('00123456789012'));
});

test('In-app diagnostic is available without URL edits, remains opt-in, and excludes Production',async()=>{
 function load(host,project){const input={value:'PRIVATE'},button={hidden:true,dataset:{},addEventListener(t,f){this.click=f;}},handlers={};let copied;
 const c={location:{hostname:host,search:''},getSupabaseProjectUrl:()=>project,performance:{now:()=>0},setTimeout:()=>1,clearTimeout(){},navigator:{clipboard:{writeText:async text=>{copied=JSON.parse(text);}}},document:{getElementById:id=>id==='expiryBarcodeInput'?input:button,addEventListener:(t,f)=>handlers[t]=f}};c.window=c;vm.runInNewContext(source,c);return {input,button,handlers,c,copied:()=>copied};}
 const h=load('pharmflow-test-git-feature-expiry-stage1-115007-fhyh2xtskz-3504.vercel.app','https://tovkcakucyagvbzvlnks.supabase.co');assert.equal(h.button.hidden,false);assert.equal(h.button.textContent,'Diagnose one scan');h.handlers.input({target:h.input,data:'PRIVATE'});h.c.expiryRecordScannerOutcome('GS1_REJECTED');assert.equal(h.copied(),undefined);
 await h.button.click();await h.button.click();assert.equal(h.copied().events.length,1);assert.ok(!JSON.stringify(h.copied()).includes('PRIVATE'));
 for(const [host,project] of [['ahmed-sh89.github.io','https://tovkcakucyagvbzvlnks.supabase.co'],['pharmflow-test.vercel.app','https://zznoshzcyxmtwfbznjyr.supabase.co']]){const p=load(host,project);assert.equal(p.button.hidden,true);assert.equal(p.c.expiryRecordScannerOutcome,undefined);}
});

function diagnosticRuntime(){
 const handlers={},input={value:''},button={hidden:true,dataset:{},addEventListener(t,f){this.click=f;}},timers=[];let copied;
 const c={location:{hostname:'pharmflow-test.vercel.app'},getSupabaseProjectUrl:()=> 'https://tovkcakucyagvbzvlnks.supabase.co',performance:{now:()=>0},setTimeout:f=>{timers.push(f);return timers.length;},clearTimeout(){},navigator:{clipboard:{writeText:async s=>{copied=JSON.parse(s);}}},document:{getElementById:id=>id==='expiryBarcodeInput'?input:button,addEventListener:(t,f)=>handlers[t]=f}};c.window=c;
 vm.runInNewContext(source,c);vm.runInNewContext(fs.readFileSync('js/expiry-operation.js','utf8')+'\nthis.adapter=ExpiryOperation;',c);
 return {c,button,timers,copied:()=>copied};
}

test('Version 2 TC26 envelope is reproduced without pretending synthetic content is Dompy',async()=>{
 const h=diagnosticRuntime();await h.button.click();
 // Both possibilities fit EVERY reported observation: an additional AI 11,
 // or a numeric non-AI prefix. Neither is evidence of the physical content.
 const prefix='010012345678901210ABCDEF\x1d';
 const examples=[['11'+'290101'+'17290131'+'21'+'X'.repeat(13),'OTHER_STANDARD_AI','11'],['05'+'X'.repeat(29),'NUMERIC_UNCLASSIFIED',null]];
 for(const [tail,classification,code] of examples){const scan=prefix+tail;assert.equal(scan.length,56);assert.equal(scan.indexOf('\x1d'),24);assert.equal(scan.split('\x1d').length-1,1);
  assert.throws(()=>h.c.adapter.scanFacts(scan,true),e=>{const d=e.expiryScanDiagnostic;
   assert.equal(d.reason,'UNSUPPORTED_AI');assert.equal(d.stage,'AI');assert.equal(d.offset,25);assert.equal(d.normalizedLength,56);
   assert.deepEqual(JSON.parse(JSON.stringify(d.fields)),[{ai:'01',offset:0,length:14,boundary:'FIXED'},{ai:'10',offset:16,length:6,boundary:'GS'}]);
   assert.equal(d.nextAI.classification,classification);assert.equal(d.nextAI.code,code);assert.equal(d.nextAI.candidateOnly,true);assert.equal(d.nextAI.remainingLength,31);
   h.c.expiryRecordScannerOutcome('GS1_REJECTED',d);return true;
  });
 }
 h.timers.at(-1)();await h.button.click();const copied=JSON.stringify(h.copied());assert.equal(h.copied().version,3);assert.ok(!copied.includes('00123456789012'));assert.ok(!copied.includes('ABCDEF'));assert.ok(!copied.includes('290101'));assert.ok(!copied.includes('XXXXX'));
});

for(const [suffix,classification,code,framed] of [
 ['11PRIVATE','OTHER_STANDARD_AI','11',false],['91PRIVATE','OTHER_STANDARD_AI','91',false],
 ['240PRIVATE','OTHER_STANDARD_AI','240',false],['3103PRIVATE','OTHER_STANDARD_AI','3103',false],
 ['(11)PRIVATE','OTHER_STANDARD_AI','11',true],['17PRIVATE','SUPPORTED_AI','17',false],
 [']d2PRIVATE','AIM_PREFIX',null,false],['05PRIVATE','NUMERIC_UNCLASSIFIED',null,false],
 ['\u200bPRIVATE','NON_AI_PREFIX',null,false],['\x00PRIVATE','NON_AI_PREFIX',null,false],
 [' PRIVATE','NON_AI_PREFIX',null,false],['1','INCOMPLETE_AI',null,false]
])test('Rejection prefix classification '+classification+' '+(code||'without values'),()=>{
 const h=diagnosticRuntime(),d=h.c.expiryDescribeScannerAI(suffix,25);
 assert.equal(d.classification,classification);assert.equal(d.code,code);assert.equal(d.framed,framed);assert.equal(d.offset,25);assert.equal(d.candidateOnly,true);
 assert.ok(!JSON.stringify(d).includes('PRIVATE'));assert.ok(!JSON.stringify(d).includes('\u200b'));
});

test('Next-AI sanitizer discards noncatalogue codes, values and untrusted shape fields',async()=>{
 const h=diagnosticRuntime();await h.button.click();
 for(const code of ['SECRET','05','00123456789012'])h.c.expiryRecordScannerOutcome('GS1_REJECTED',{stage:'AI',reason:'UNSUPPORTED_AI',offset:25,nextAI:{classification:'NUMERIC_UNCLASSIFIED',code,offset:25,remainingLength:31,prefixClasses:['SECRET','DIGIT','SECRET'],raw:'SECRET',batch:'SECRET'}});
 h.timers.at(-1)();await h.button.click();const text=JSON.stringify(h.copied());assert.ok(!text.includes('SECRET'));assert.ok(!text.includes('00123456789012'));for(const e of h.copied().events.filter(e=>e.failure)){assert.equal(e.failure.nextAI.code,null);assert.equal(e.failure.nextAI.candidateOnly,true);assert.equal(e.failure.nextAI.prefixClasses.length,2);}
});

test('Rejection-only instrumentation leaves every supported accepted fact and error unchanged',()=>{
 const h=diagnosticRuntime(),gs='\x1d',gtin='00123456789012';
 const scans=['01'+gtin+'1729013110ABCDEF'+gs+'21SERIAL','01'+gtin+'10ABCDEF'+gs+'1729013121SERIAL','21SERIAL'+gs+'10ABCDEF'+gs+'01'+gtin+'17290131','(21)SERIAL(10)ABCDEF(17)290131(01)'+gtin,'0000123'];
 for(const scan of scans)assert.equal(JSON.stringify(h.c.adapter.scanFacts(scan,true)),JSON.stringify(h.c.adapter.scanFacts(scan,false)));
 for(const scan of ['01'+gtin+'10'+'X'.repeat(21),'01'+gtin+'17301331','(01)'+gtin+'(10)A(10)B']){let before,after;try{h.c.adapter.scanFacts(scan);}catch(e){before=e.message;assert.equal(e.expiryScanDiagnostic,undefined);}try{h.c.adapter.scanFacts(scan,true);}catch(e){after=e.message;}assert.equal(before,after);}
});
