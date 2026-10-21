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
 const hasKpis=s=>!!s.kpiExpired||(s.kpiMonths||[]).some(m=>s.months.includes(m));
 function clearKpis(s){s.months=s.months.filter(m=>!(s.kpiMonths||[]).includes(m));if(s.kpiExpired){delete s.expiredThrough;delete s.excludedMonths;}delete s.kpiExpired;delete s.kpiMonths;}
 const groupService=()=>window.PharmFlowClassificationFilters;
 const normalizeGroup=value=>groupService()?.normalizeGroup(value)||"";
 const displayGroup=value=>normalizeGroup(value)==="Mom & Baby"?"Mom and Baby":groupService()?.displayGroup(value)||"";
 function rowGroup(row){const raw=String(row?.group_name??'').trim(),group=normalizeGroup(raw);return {group,label:group?displayGroup(group):'—'};}
 function hasCanonicalGroupContract(payload){const approved=groupService()?.approvedGroups||[];return approved.length===6&&Array.isArray(payload?.groups)&&payload.groups.length===approved.length&&approved.every((group,i)=>payload.groups[i]===group)&&typeof payload?.has_unassigned_group==='boolean'&&Array.isArray(payload?.rows)&&payload.rows.every(row=>Object.prototype.hasOwnProperty.call(row,'group_name'));}
 function assertCanonicalGroupContract(payload){if(!hasCanonicalGroupContract(payload))throw new Error('Canonical Group data is unavailable from the Expiry Inventory service. Refresh after the Group backend contract is installed.');return payload;}
 function assertCanonicalGroupRows(rows){if(!Array.isArray(rows)||rows.some(row=>!Object.prototype.hasOwnProperty.call(row,'group_name')))throw new Error('Canonical Group data is unavailable from the Expiry report service. Refresh after the Group backend contract is installed.');return rows;}
 function wire(s,available=[]){const f={search:s.search.trim(),groups:[...new Set((s.groups||[]).map(normalizeGroup).filter(Boolean))],include_unassigned:!!s.includeUnassigned,months:[...s.months]};if(s.operators?.length)f.operators=[...new Set(s.operators)];if(s.expiredThrough!=null){if(!f.months.length&&!(s.excludedMonths||[]).length)f.to=s.expiredThrough;else{f.months=[...new Set([...available.filter(m=>has(s,m)),...f.months])];if(!f.months.length){f.from=s.expiredThrough+1;f.to=s.expiredThrough;}}}return f;}
 const buckets=ref=>[{key:'EXPIRED',from:null,to:ref},{key:'NEXT1',from:ref+1,to:ref+1},{key:'NEXT2',from:ref+2,to:ref+3},{key:'NEXT6',from:ref+4,to:ref+6}];
 window.ExpiryInventoryFilters={number,code,months,has,set,state,toggle,hasKpis,clearKpis,wire,buckets,normalizeGroup,displayGroup,rowGroup,hasCanonicalGroupContract,assertCanonicalGroupContract,assertCanonicalGroupRows};
})();
