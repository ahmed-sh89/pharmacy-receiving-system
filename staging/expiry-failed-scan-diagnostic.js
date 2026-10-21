/* Temporary Staging Desktop diagnostic. No persistence or automatic transport. */
(function(){
  if('__PHARMFLOW_STAGING_DIAGNOSTIC_BUILD__'!=='staging-preview')return;
  if(!/^pharmflow-test(?:-|\.)/.test(location.hostname) ||
    String(typeof getSupabaseProjectUrl==='function'?getSupabaseProjectUrl():'')!=='https://tovkcakucyagvbzvlnks.supabase.co')return;
  let pending=null,actions=null;
  const desktop=()=>typeof expiryIsHandheld==='function' && !expiryIsHandheld();
  const controls=value=>{
    const result=[];
    for(let offset=0;offset<value.length;offset++){
      const code=value.charCodeAt(offset);
      if(code<32 || code===127)result.push({offset,code,label:code===29?'GS':code===13?'CR':code===10?'LF':code===9?'TAB':'CONTROL'});
    }
    return result;
  };
  const escaped=value=>JSON.stringify(value).replace(/[\u0000-\u001f\u007f-\uffff]/g,char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0'));
  function clear(){pending=null;actions?.remove();actions=null;}
  function capture(raw,error){
    clear();
    const status=document.getElementById('expiryDesktopStatus');
    if(!desktop() || !status || !error?.expiryScanDiagnostic)return;
    const input=String(raw??''),normalized=cleanScannerInput(input);
    // Strings, including separators and leading zeros, remain exact in JSON.
    pending={version:1,kind:'EXPIRY_GS1_PARSER_REJECTION',rawInput:input,rawEscaped:escaped(input),
      rawLength:input.length,rawControls:controls(input),normalizedInput:normalized,
      normalizedEscaped:escaped(normalized),normalizedControls:controls(normalized),
      parserMessage:error.message,parserFailure:JSON.parse(JSON.stringify(error.expiryScanDiagnostic))};
    if(!document.getElementById('expiryFailedScanDiagnosticStyle')){
      const style=document.createElement('style');style.id='expiryFailedScanDiagnosticStyle';
      style.textContent=`#expiryDesktopStatus .expiryFailedScanActions{display:inline-flex;align-items:center;gap:5px;margin-left:8px;vertical-align:middle}
        #expiryDesktopStatus .expiryFailedScanActions button{min-height:28px;margin:0;padding:3px 8px;border:1px solid #e6b9c0;border-radius:6px;background:#fff;color:inherit;font-family:inherit;font-size:11px;font-weight:600;line-height:1.3;cursor:pointer;white-space:nowrap;box-shadow:none}
        #expiryDesktopStatus .expiryFailedScanActions button:hover{background:#fce9ed}
        #expiryDesktopStatus .expiryFailedScanActions button:focus-visible{outline:2px solid var(--exp-ink,#294968);outline-offset:2px}
        body.zebraDevice .expiryFailedScanActions{display:none!important}`;
      document.head.appendChild(style);
    }
    actions=document.createElement('span');actions.className='expiryFailedScanActions';
    const copy=document.createElement('button');copy.type='button';copy.textContent='Copy Diagnostic';
    copy.addEventListener('click',async()=>{
      if(!pending || !desktop())return clear();
      const snapshot=pending;
      copy.disabled=true;
      try{
        await navigator.clipboard.writeText(JSON.stringify(snapshot,null,2));
        if(pending!==snapshot)return;
        clear();
        // Keep the parser error visible; copying must never imply resolution.
        status.appendChild(document.createTextNode(' · Diagnostic copied'));
        document.getElementById('expiryBarcodeInput')?.focus({preventScroll:true});
      }catch(_){if(pending===snapshot){copy.disabled=false;copy.textContent='Retry Copy';}}
    });
    const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent='×';dismiss.setAttribute('aria-label','Dismiss scan error');
    dismiss.addEventListener('click',()=>{clear();setExpiryStatus('ready','READY TO SCAN');focusExpiryScanner();});
    actions.append(copy,dismiss);status.appendChild(actions);
  }
  window.expiryFailedScanDiagnostic={capture,clear};
  const input=document.getElementById('expiryBarcodeInput');
  input?.addEventListener('input',clear);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')clear();},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
  // Navigation/account controls dismiss the in-memory diagnostic immediately.
  document.addEventListener('click',event=>{if(actions && !actions.contains(event.target))clear();},true);
  window.addEventListener('pagehide',clear);
})();
