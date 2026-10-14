/* Temporary Desktop Preview probe. Opt-in, memory-only, numeric stages. */
(function () {
  const allowed = new Set(['click','durable','sessionRequest','sessionResponse','reserveRequest','reserveResponse','saveRequest','saveResponse','acknowledged','reconciliationStart','projectionSessionStart','projectionSessionEnd','rowsRequest','rowsResponse','inventoryRequest','inventoryResponse','stateUpdated','rowDOM','greenFlash','visibleFrame','scannerFocus','finished']);
  let sample=null, panel=null, report=null;
  const clock=()=>performance.now();
  function enabled(){
    try{return location.hostname.endsWith('.vercel.app') && new URLSearchParams(location.search).get('expirySaveTiming')==='1' && new URL(getSupabaseProjectUrl()).hostname==='tovkcakucyagvbzvlnks.supabase.co' && !expiryIsHandheld();}catch(_){return false;}
  }
  function text(){
    if(!sample)return 'No Save sample yet.';
    let previous=0;
    const lines=sample.events.map(e=>{const delta=e.ms-previous;previous=e.ms;return `${e.stage}: +${delta.toFixed(1)} ms | click +${e.ms.toFixed(1)} ms`;});
    const visible=sample.events.find(e=>e.stage==='visibleFrame');
    return ['Expiry Save timing v1 (ms)','Numeric timing only; no item or account data.',...lines,'Click-to-visible-row: '+(visible?visible.ms.toFixed(1)+' ms (two-frame rendering boundary; not a physical screen measurement)':'not observed; hidden/filtered/review/failed or still pending')].join('\n');
  }
  function draw(){
    try{
      if(!enabled())return;
      if(!panel){
        panel=document.createElement('details');panel.id='expirySaveDiagnostic';panel.style.cssText='position:fixed;right:12px;bottom:12px;z-index:10000;width:360px;max-width:90vw;padding:8px;background:#fff;border:1px solid #bbc8d6;border-radius:8px;color:#22374e;font:12px system-ui;box-shadow:0 3px 12px #0002';
        const title=document.createElement('summary');title.textContent='Development · Save timings';panel.appendChild(title);
        report=document.createElement('textarea');report.readOnly=true;report.setAttribute('aria-label','Save timing report');report.style.cssText='width:100%;height:210px;box-sizing:border-box;font:11px monospace;margin-top:6px';panel.appendChild(report);
        const copy=document.createElement('button');copy.type='button';copy.textContent='Copy Timings';copy.onclick=async()=>{try{await navigator.clipboard.writeText(report.value);copy.textContent='Copied';}catch(_){report.focus();report.select();copy.textContent='Press Ctrl+C to copy';}};panel.appendChild(copy);document.body.appendChild(panel);
      }
      report.value=text();
    }catch(_){} // A diagnostic must never affect capture success or retry.
  }
  const api={
    begin(){try{if(!enabled())return null;sample={start:clock(),events:[]};api.mark('click',sample);return sample;}catch(_){return null;}},
    mark(stage,token=sample){try{if(!enabled() || !token || token!==sample || !allowed.has(stage) || token.events.length>=80)return;
      if(token.finished && !['visibleFrame','scannerFocus'].includes(stage))return;
      if(['visibleFrame','scannerFocus'].includes(stage) && token.events.some(e=>e.stage===stage))return;
      if(stage==='finished')token.finished=true;token.events.push({stage,ms:clock()-token.start});draw();}catch(_){}},
    paint(row){try{const token=sample;if(!token || !row || typeof requestAnimationFrame!=='function')return;api.mark('rowDOM',token);requestAnimationFrame(()=>requestAnimationFrame(()=>{if(row.isConnected && document.visibilityState==='visible' && row.getClientRects().length)api.mark('visibleFrame',token);}));}catch(_){}},
    reset(){sample=null;if(report)report.value='No Save sample yet.';},
    report:text
  };
  window.ExpirySaveDiagnostic=api;
})();
