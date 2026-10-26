/* Canonical logical month selection. Expired remains an unbounded interval. */
(function(){
 const number=m=>Number(m.slice(0,4))*12+Number(m.slice(5));
 const code=n=>Math.floor((n-1)/12)+'-'+String((n-1)%12+1).padStart(2,'0');
 const months=p=>Array.from({length:p.to-p.from+1},(_,i)=>code(p.from+i));
 const has=(s,m)=>s.months.includes(m)||(s.expiredThrough!=null&&number(m)<=s.expiredThrough&&!(s.excludedMonths||[]).includes(m));
 // Origin tags are UI provenance, not a second selection/filter pipeline.
 function set(s,m,on,source='manual'){
  const prior=has(s,m),tagged=(s.kpiMonths||[]).includes(m);
  s.kpiMonths=(s.kpiMonths||[]).filter(v=>v!==m);
  if(source==='kpi'&&on&&(!prior||tagged))s.kpiMonths.push(m);
  s.months=s.months.filter(v=>v!==m);s.excludedMonths=(s.excludedMonths||[]).filter(v=>v!==m);
  if(s.expiredThrough!=null&&number(m)<=s.expiredThrough){if(!on)s.excludedMonths.push(m);else if(source==='manual')s.months.push(m);}
  else if(on)s.months.push(m);
 }
 function state(s,p){if(p.from==null){if(s.expiredThrough!=null)return s.expiredThrough>=p.to&&!(s.excludedMonths||[]).some(m=>number(m)<=p.to)?'true':'mixed';return s.months.some(m=>number(m)<=p.to)?'mixed':'false';}const a=months(p),n=a.filter(m=>has(s,m)).length;return n===a.length?'true':n?'mixed':'false';}
 function toggle(s,p,source='kpi'){const on=state(s,p)!=='true';if(p.from==null){s.expiredThrough=on?p.to:null;s.kpiExpired=on&&source==='kpi';s.excludedMonths=[];if(!on){s.months=s.months.filter(m=>number(m)>p.to);s.kpiMonths=(s.kpiMonths||[]).filter(m=>number(m)>p.to);}}else months(p).forEach(m=>set(s,m,on,source));}
 const legacyHasKpis=s=>!!s.kpiExpired||(s.kpiMonths||[]).some(m=>s.months.includes(m));
 function legacyClearKpis(s){s.months=s.months.filter(m=>!(s.kpiMonths||[]).includes(m));if(s.kpiExpired){delete s.expiredThrough;delete s.excludedMonths;}delete s.kpiExpired;delete s.kpiMonths;}
 const groupService=()=>window.PharmFlowClassificationFilters;
 const normalizeGroup=value=>groupService()?.normalizeGroup(value)||"";
 const displayGroup=value=>normalizeGroup(value)==="Mom & Baby"?"Mom and Baby":groupService()?.displayGroup(value)||"";
 function rowGroup(row){const raw=String(row?.group_name??'').trim(),group=normalizeGroup(raw);return {group,label:group?displayGroup(group):'—'};}
 function hasCanonicalGroupContract(payload){const approved=groupService()?.approvedGroups||[];return approved.length===6&&Array.isArray(payload?.groups)&&payload.groups.length===approved.length&&approved.every((group,i)=>payload.groups[i]===group)&&typeof payload?.has_unassigned_group==='boolean'&&Array.isArray(payload?.rows)&&payload.rows.every(row=>Object.prototype.hasOwnProperty.call(row,'group_name'));}
 function assertCanonicalGroupContract(payload){if(!hasCanonicalGroupContract(payload))throw new Error('Canonical Group data is unavailable from the Expiry Inventory service. Refresh after the Group backend contract is installed.');return payload;}
 function assertCanonicalGroupRows(rows){if(!Array.isArray(rows)||rows.some(row=>!Object.prototype.hasOwnProperty.call(row,'group_name')))throw new Error('Canonical Group data is unavailable from the Expiry report service. Refresh after the Group backend contract is installed.');return rows;}
 function manualWire(s,available=[]){const f={search:s.search.trim(),groups:[...new Set((s.groups||[]).map(normalizeGroup).filter(Boolean))],include_unassigned:!!s.includeUnassigned,months:[...s.months]};if(s.operators?.length)f.operators=[...new Set(s.operators)];if(s.expiredThrough!=null){if(!f.months.length&&!(s.excludedMonths||[]).length)f.to=s.expiredThrough;else{f.months=[...new Set([...available.filter(m=>has(s,m)),...f.months])];if(!f.months.length){f.from=s.expiredThrough+1;f.to=s.expiredThrough;}}}return f;}
 const hasKpis=s=>(s.kpiKeys||[]).length>0||legacyHasKpis(s);
 function clearKpis(s){legacyClearKpis(s);s.kpiKeys=[];delete s.kpiReference;}
 function selectKpi(s,key,add,reference){
  if(key!=='ALL'&&!['EXPIRED','NEXT1','NEXT2','NEXT3','NEXT4','NEXT5','NEXT6'].includes(key))return;
  const previous=s.kpiKeys||[];legacyClearKpis(s);
  s.kpiKeys=key==='ALL'?[]:add?[...new Set([...previous,key])]:[key];s.kpiReference=reference;
 }
 const kpiState=(s,key)=>key==='ALL'?(hasKpis(s)?'false':'true'):(s.kpiKeys||[]).includes(key)?'true':'false';
 function matches(r,f){
  const n=Number(r.expiry_year)*12+Number(r.expiry_month),m=code(n),g=normalizeGroup(r.group_name);
  return (!f.search||[r.item_name,r.item_code,r.identifier_display,r.batch_no].some(v=>String(v||'').toLowerCase().includes(f.search.toLowerCase()))) &&
   (!(f.groups?.length||f.include_unassigned)||(f.groups||[]).includes(g)||f.include_unassigned&&!g) &&
   (!f.operators?.length||f.operators.includes(r.first_operator_name)) && (!f.months?.length||f.months.includes(m)) &&
   (f.from==null||n>=f.from)&&(f.to==null||n<=f.to);
 }
 function needsFacets(s){return s.expiredThrough!=null&&(s.months.length||s.excludedMonths?.length)||(s.kpiKeys||[]).includes('EXPIRED')&&s.kpiKeys.length>1;}
 function wire(s,available=[]){
  const f=manualWire(s,available),keys=s.kpiKeys||[];if(!keys.length)return f;
  const ref=s.kpiReference,expired=keys.includes('EXPIRED');
  if(!Number.isInteger(ref))throw Error('Inventory month reference unavailable');
  if(expired&&keys.length===1&&!f.months.length){f.to=Math.min(f.to??ref,ref);return f;}
  const future=keys.filter(k=>k!=='EXPIRED').map(k=>code(ref+Number(k.slice(4))));
  const candidates=[...new Set([...available,...(f.months||[]),...future])];
  const dates=candidates.filter(m=>{const n=number(m);return (expired&&n<=ref||future.includes(m))&&(!f.months.length||f.months.includes(m))&&(f.from==null||n>=f.from)&&(f.to==null||n<=f.to);});
  f.months=dates;delete f.from;delete f.to;if(!dates.length){f.from=ref+1;f.to=ref;}return f;
 }
 const buckets=ref=>[{key:'EXPIRED',from:null,to:ref},...Array.from({length:6},(_,i)=>({key:'NEXT'+(i+1),from:ref+i+1,to:ref+i+1}))];
 window.ExpiryInventoryFilters={number,code,months,has,set,state,toggle,hasKpis,clearKpis,wire,buckets,normalizeGroup,displayGroup,rowGroup,selectKpi,kpiState,matches,needsFacets,hasCanonicalGroupContract,assertCanonicalGroupContract,assertCanonicalGroupRows};
})();
