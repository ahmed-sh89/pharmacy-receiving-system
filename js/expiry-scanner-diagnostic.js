/* Opt-in, bounded scanner transport diagnostics. Payload characters are never retained. */
(function(){
  if(typeof window==="undefined"||typeof document==="undefined")return;
  // Visible Staging control; recording still starts only on explicit click.
  const enabled=/^pharmflow-test(?:-|\.)/.test(String(location.hostname||"")) &&
    /tovkcakucyagvbzvlnks/i.test(String(typeof getSupabaseProjectUrl==="function"?getSupabaseProjectUrl():document.documentElement.dataset.supabaseUrl||""));
  if(!enabled)return;
  const button=document.getElementById("expiryScannerDiagnosticToggle"),input=document.getElementById("expiryBarcodeInput");
  if(!button||!input)return;
  button.hidden=false;
  button.textContent="Diagnose one scan";
  button.title="Staging only: capture one scan's sanitized structure in memory, then copy it. No barcode values are recorded.";

  // Diagnostic prefix classification ONLY, not a parser or permission to save.
  // GS1 public AI catalogue, retrieved 2026-10-11:
  // https://ref.gs1.org/ai/GS1_Application_Identifiers.jsonld
  // Ranges preserve code width; only registered AI codes may be copied.
  const aiRanges={
    2:[[0,3],[10,13],[15,17],[20,22],[30,30],[37,37],[90,99]],
    3:[[235,235],[240,243],[250,251],[253,255],[400,403],[410,417],[420,427],[710,717]],
    4:[[3100,3105],[3110,3115],[3120,3125],[3130,3135],[3140,3145],[3150,3155],[3160,3165],[3200,3205],[3210,3215],[3220,3225],[3230,3235],[3240,3245],[3250,3255],[3260,3265],[3270,3275],[3280,3285],[3290,3295],[3300,3305],[3310,3315],[3320,3325],[3330,3335],[3340,3345],[3350,3355],[3360,3365],[3370,3375],[3400,3405],[3410,3415],[3420,3425],[3430,3435],[3440,3445],[3450,3455],[3460,3465],[3470,3475],[3480,3485],[3490,3495],[3500,3505],[3510,3515],[3520,3525],[3530,3535],[3540,3545],[3550,3555],[3560,3565],[3570,3575],[3600,3605],[3610,3615],[3620,3625],[3630,3635],[3640,3645],[3650,3655],[3660,3665],[3670,3675],[3680,3685],[3690,3695],[3900,3943],[3950,3955],[4300,4326],[4330,4333],[7001,7011],[7020,7023],[7030,7041],[7230,7242],[7250,7259],[8001,8014],[8017,8020],[8026,8026],[8030,8030],[8040,8043],[8110,8112],[8200,8200]]
  };
  const registeredAI=code=>typeof code==="string" && /^\d{2,4}$/.test(code) &&
    aiRanges[code.length]?.some(([start,end])=>Number(code)>=start && Number(code)<=end);
  const prefixClasses=["DIGIT","LETTER","GS","CONTROL","SPACE","FRAME","OTHER"];
  const aiClasses=["SUPPORTED_AI","OTHER_STANDARD_AI","AIM_PREFIX","NUMERIC_UNCLASSIFIED","NON_AI_PREFIX","INCOMPLETE_AI"];
  const classifyCharacter=c=>/^[0-9]$/.test(c)?"DIGIT":/^[A-Za-z]$/.test(c)?"LETTER":c==="\x1d"?"GS":c.charCodeAt(0)<32||c.charCodeAt(0)===127?"CONTROL":/\s/.test(c)?"SPACE":/[()[\]]/.test(c)?"FRAME":"OTHER";
  window.expiryDescribeScannerAI=(remainder,offset)=>{
    // The temporary argument is inspected synchronously; never retained.
    const framed=remainder[0]==="(";
    const frame=framed?remainder.match(/^\((\d{2,4})\)/):null;
    let code=frame?.[1]||null;
    if(!framed)for(const width of [2,3,4]){const candidate=remainder.slice(0,width);if(registeredAI(candidate)){code=candidate;break;}}
    if(!registeredAI(code))code=null;
    const classification=code?(["01","17","10","21"].includes(code)?"SUPPORTED_AI":"OTHER_STANDARD_AI"):
      /^\][A-Za-z][0-9]/.test(remainder)?"AIM_PREFIX":remainder.length<2?"INCOMPLETE_AI":
      /^\d{2}/.test(remainder)?"NUMERIC_UNCLASSIFIED":"NON_AI_PREFIX";
    return {classification,code,candidateOnly:true,offset,framed,remainingLength:remainder.length,
      prefixClasses:Array.from(remainder.slice(0,2),classifyCharacter)};
  };
  function safeNextAI(detail){
    if(!detail || !aiClasses.includes(detail.classification))return undefined;
    const number=value=>Number.isSafeInteger(value)&&value>=0?value:null;
    return {classification:detail.classification,code:registeredAI(detail.code)?detail.code:null,candidateOnly:true,
      offset:number(detail.offset),framed:detail.framed===true,remainingLength:number(detail.remainingLength),
      prefixClasses:Array.isArray(detail.prefixClasses)?detail.prefixClasses.slice(0,2).map(c=>prefixClasses.includes(c)?c:"OTHER"):[]};
  }

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
      try{await navigator.clipboard.writeText(JSON.stringify({version:3,durationMs:Math.round(performance.now()-started),events}));}catch(_){button.textContent="Copy failed — retry";return;}active=false;clearTimeout(timer);events=[];button.dataset.mode="start";button.textContent="Diagnose one scan";return;
    }
    events=[];started=performance.now();active=true;button.dataset.mode="copy";button.textContent="Capturing metadata…";
    capture("start",null);clearTimeout(timer);timer=setTimeout(finish,WINDOW_MS);
    try{input.focus({preventScroll:true});}catch(_){input.focus?.();}
  });
  // Observe before the document-level Handheld owner stops target listeners.
  ["beforeinput","input","keydown","paste"].forEach(type=>document.addEventListener(type,event=>{
    if(event.target===input)capture(type,event);
  },true));
  function parserDetail(detail){
    if(!detail || !["AI","FIELD","DATE","REQUIRED"].includes(detail.stage) ||
      !["UNSUPPORTED_AI_OR_FRAME","UNSUPPORTED_AI","DUPLICATE_AI","FIXED_LENGTH","FIXED_NON_DIGIT","VARIABLE_LENGTH","INVALID_EXPIRY","GTIN_MISSING"].includes(detail.reason))return undefined;
    const number=value=>Number.isSafeInteger(value)&&value>=0?value:null;
    const ai=value=>["01","17","10","21"].includes(value)?value:null;
    const boundary=value=>["FIXED","GS","END","AI_FRAME"].includes(value)?value:null;
    return {stage:detail.stage,reason:detail.reason,offset:number(detail.offset),ai:ai(detail.ai),
      ...(detail.stage==="AI"?{nextAI:safeNextAI(detail.nextAI)}:{}),
      valueLength:number(detail.valueLength),boundary:boundary(detail.boundary),normalizedLength:number(detail.normalizedLength),
      gsCount:number(detail.gsCount),gsOffsets:Array.isArray(detail.gsOffsets)?detail.gsOffsets.slice(0,16).map(number):[],
      fields:Array.isArray(detail.fields)?detail.fields.slice(0,16).map(field=>({ai:ai(field.ai),offset:number(field.offset),length:number(field.length),boundary:boundary(field.boundary)})):[]};
  }
  window.expiryRecordScannerOutcome=(category,detail)=>{
    if(!active)return;
    if(!["GS1_ACCEPTED","IDENTIFIER_ACCEPTED","GS1_REJECTED"].includes(category))return;
    if(events.length>=MAX)events.shift();
    events.push({t:Math.round(performance.now()-started),type:"parser",category,...(category==="GS1_REJECTED"?{failure:parserDetail(detail)}:{})});
  };
})();
