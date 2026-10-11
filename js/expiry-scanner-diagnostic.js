/* Opt-in, bounded scanner transport diagnostics. Payload characters are never retained. */
(function(){
  if(typeof window==="undefined"||typeof document==="undefined")return;
  const enabled=new URLSearchParams(location.search).get("expiryScannerDiagnostics")==="1"&&
    /tovkcakucyagvbzvlnks/i.test(String(typeof getSupabaseProjectUrl==="function"?getSupabaseProjectUrl():document.documentElement.dataset.supabaseUrl||""));
  if(!enabled)return;
  const button=document.getElementById("expiryScannerDiagnosticToggle"),input=document.getElementById("expiryBarcodeInput");
  if(!button||!input)return;
  button.hidden=false;
  const MAX=64,WINDOW_MS=10000;
  let active=false,started=0,timer=0,events=[];
  function summarize(type,event){
    const value=String(input.value||"");
    const gs=[];for(let i=0;i<value.length;i++)if(value.charCodeAt(i)===29)gs.push(i);
    const prefix=value.match(/^\]([A-Za-z][0-9])/);
    const controls=[],separators=[];for(let i=0;i<value.length;i++){const c=value.charCodeAt(i);if(c<32||c===127)controls.push({offset:i,type:c===29?"GS":c===9?"TAB":c===13?"CR":c===10?"LF":"CONTROL"});if([29,0x241d,0xfffd,0x1c,0x1e,0x1f,0x7e,0x0651].includes(c))separators.push({offset:i,code:c===29?"GS":"U+"+c.toString(16).toUpperCase().padStart(4,"0")});}
    return {t:Math.round(performance.now()-started),type,keyClass:event?.key?(event.key==="Enter"?"ENTER":event.key==="Tab"?"TAB":event.key==="Unidentified"?"UNIDENTIFIED":"OTHER"):undefined,
      inputType:event?.inputType||undefined,dataLength:typeof event?.data==="string"?event.data.length:undefined,valueLength:value.length,
      aim:prefix?prefix[0]:null,gsCount:gs.length,gsOffsets:gs.slice(0,16),separatorMarkers:separators.slice(0,16),controls:controls.slice(0,16)};
  }
  function finish(){active=false;clearTimeout(timer);button.textContent="Copy sanitized metadata";button.dataset.mode="copy";}
  function capture(type,event){
    if(!active)return;
    // Keep the final frame even for per-character TC26 input bursts.
    if(events.length>=MAX)events.shift();
    events.push(summarize(type,event));
    clearTimeout(timer);timer=setTimeout(finish,Math.min(500,Math.max(0,WINDOW_MS-(performance.now()-started))));
  }
  button.addEventListener("click",async()=>{
    if(button.dataset.mode==="copy"){
      try{await navigator.clipboard.writeText(JSON.stringify({version:1,durationMs:Math.round(performance.now()-started),events}));}catch(_){}button.dataset.mode="start";button.textContent="Capture scanner metadata";return;
    }
    events=[];started=performance.now();active=true;button.dataset.mode="copy";button.textContent="Capturing metadata…";
    capture("start",null);clearTimeout(timer);timer=setTimeout(finish,WINDOW_MS);
    try{input.focus({preventScroll:true});}catch(_){input.focus?.();}
  });
  // Observe before the document-level Handheld owner stops target listeners.
  ["beforeinput","input","keydown","paste"].forEach(type=>document.addEventListener(type,event=>{
    if(event.target===input)capture(type,event);
  },true));
  window.expiryRecordScannerOutcome=category=>{
    if(!active)return;
    if(!["GS1_ACCEPTED","IDENTIFIER_ACCEPTED","GS1_REJECTED"].includes(category))return;
    if(events.length>=MAX)events.shift();
    events.push({t:Math.round(performance.now()-started),type:"parser",category});
  };
})();
