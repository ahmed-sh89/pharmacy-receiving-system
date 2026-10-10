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
    const controls=[],separators=[];for(let i=0;i<value.length;i++){const c=value.charCodeAt(i);if(c<32||c===127)controls.push(c===29?"GS":c===9?"TAB":c===13?"CR":c===10?"LF":"CONTROL");if([29,0x241d,0xfffd,0x1c,0x1e,0x1f,0x7e,0x0651].includes(c))separators.push({offset:i,code:c===29?"GS":"U+"+c.toString(16).toUpperCase().padStart(4,"0")});}
    return {t:Math.round(performance.now()-started),type,keyClass:event?.key?(event.key==="Enter"?"ENTER":event.key==="Tab"?"TAB":"OTHER"):undefined,
      inputType:event?.inputType||undefined,dataLength:typeof event?.data==="string"?event.data.length:undefined,valueLength:value.length,
      aim:prefix?prefix[0]:null,gsCount:gs.length,gsOffsets:gs.slice(0,16),separatorMarkers:separators.slice(0,16),controls:controls.slice(0,16)};
  }
  function finish(){active=false;clearTimeout(timer);button.textContent="Copy sanitized metadata";button.dataset.mode="copy";}
  function capture(type,event){if(!active||events.length>=MAX)return;events.push(summarize(type,event));clearTimeout(timer);timer=setTimeout(finish,500);if(events.length>=MAX)finish();}
  button.addEventListener("click",async()=>{
    if(button.dataset.mode==="copy"){
      try{await navigator.clipboard.writeText(JSON.stringify({version:1,durationMs:Math.round(performance.now()-started),events}));}catch(_){}button.dataset.mode="start";button.textContent="Capture scanner metadata";return;
    }
    events=[];started=performance.now();active=true;button.dataset.mode="copy";button.textContent="Capturing metadata…";
    capture("start",null);timer=setTimeout(finish,WINDOW_MS);
  });
  ["beforeinput","input","keydown","paste"].forEach(type=>input.addEventListener(type,event=>capture(type,event),true));
})();
