const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function transport(source=fs.readFileSync('js/handheld-runtime.js','utf8')){
 const timers=new Map(),calls=[];let seq=0,mode='EXPIRY';
 const c={document:{readyState:'loading',addEventListener(){}},window:{addEventListener(){}},setTimeout(fn,ms){timers.set(++seq,{fn,ms});return seq;},clearTimeout(id){timers.delete(id);}};
 vm.createContext(c);vm.runInContext(source,c);
 c.hhIsDevice=()=>true;c.hhMode=()=>mode;
 c.hhProcessExpiry=(raw,input)=>{calls.push(['expiry',raw]);input.value='';};c.hhProcessReceiving=(raw)=>calls.push(['receiving',raw]);
 const input={id:'expiryBarcodeInput',value:'',isConnected:true};
 return {c,input,calls,setMode(v){mode=v;input.id=v==='RECEIVING'?'barcodeInput':'expiryBarcodeInput';},emit(value){input.value=value;c.hhCaptureInput({target:input,stopImmediatePropagation(){},stopPropagation(){}});},flush(){for(const [id,t] of [...timers])if(t.ms===90){timers.delete(id);t.fn();}}};
}
test('TC26 per-character GS1 input waits for the complete burst, without Enter or duplicate processing',()=>{
 const t=transport(),raw='01040652720729771727083110SYNTH-BATCH\x1d21SYNTH-SERIAL';
 for(let i=1;i<=raw.length;i++)t.emit(raw.slice(0,i));
 assert.equal(t.calls.length,0);t.flush();t.flush();assert.deepEqual(t.calls,[['expiry',raw]]);assert.equal(t.input.value,'');
});
test('Single-insertion identifiers remain exact and a departed Expiry screen cannot process a delayed scan',()=>{
 for(const raw of ['U0030','S00110','1234A','001234',']d201040652720729771727083110LOT']){
  const t=transport();t.emit(raw);t.flush();assert.deepEqual(t.calls,[['expiry',raw]]);
 }
 const t=transport();t.emit('U0030');t.setMode('IDLE');t.flush();assert.equal(t.calls.length,0);
});
test('Receiving keeps its existing immediate input boundary',()=>{
 const t=transport();t.setMode('RECEIVING');t.emit('001234');assert.deepEqual(t.calls,[['receiving','001234']]);t.flush();assert.equal(t.calls.length,1);
});
test('Starting candidate reproduces the premature first-character lookup',()=>{
 const baseline=require('node:child_process').execFileSync('git',['show','09640864:js/handheld-runtime.js'],{encoding:'utf8'});
 const t=transport(baseline);t.emit('0');assert.deepEqual(t.calls,[['expiry','0']]);
});
