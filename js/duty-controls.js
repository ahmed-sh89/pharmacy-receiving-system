/* Reusable Duty controls. Calendar design follows Historical Receiving Reports;
   Receiving's component/state/styles remain unchanged. No date library or cloud state. */
(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const iso=d=>d.toISOString().slice(0,10),date=v=>new Date(v+'T12:00:00Z');
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const format=v=>v?new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(date(v)):'Select date';
 function openPopover(popup,trigger,matchWidth=false){
  popup.showPopover?.({source:trigger});
  if(!trigger.getBoundingClientRect||!popup.getBoundingClientRect)return;
  const rect=trigger.getBoundingClientRect(),scale=Number(root.getComputedStyle?.(popup).getPropertyValue('--duty-preview-scale'))||1;
  const width=root.innerWidth,height=root.innerHeight;
  if(matchWidth){popup.style.minWidth='0';popup.style.width=rect.width/scale+'px';}
  const room=Math.max(rect.top,height-rect.bottom)-12;
  popup.style.maxHeight=Math.max(34,Math.min(matchWidth?255:440,room/scale))+'px';
  const box=popup.getBoundingClientRect();
  popup.style.left=Math.max(8,Math.min(rect.left,width-box.width-8))/scale+'px';
  popup.style.top=Math.max(8,rect.bottom+box.height+8<=height?rect.bottom+4:rect.top-box.height-4)/scale+'px';
 }
 function dateField({id,name,label,value,min,max,attributes=''}){
  return `<label class="duty-calendar-field"><span>${esc(label)}</span><button type="button" class="duty-calendar-trigger" data-calendar-for="${esc(id)}" aria-label="${esc(label)} date" aria-haspopup="dialog">${format(value)}<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18"/></svg></button><input type="hidden" id="${esc(id)}" name="${esc(name)}" value="${esc(value)}" min="${esc(min)}" max="${esc(max)}" ${attributes}></label>`;
 }
 function bindCalendars(host){
  for(const trigger of host.querySelectorAll('[data-calendar-for]'))trigger.onclick=()=>{
   const doc=host.ownerDocument,input=doc.getElementById(trigger.dataset.calendarFor);if(!input)return;
   const page=host.closest('#page-duty')||host;page.querySelector('.duty-calendar-popover')?.remove();
   const popup=doc.createElement('div');popup.className='duty-calendar-popover';popup.setAttribute('popover','auto');popup.setAttribute('role','dialog');popup.setAttribute('aria-label',trigger.getAttribute('aria-label')+' calendar');page.append(popup);
   const current=input.value||today(),min=input.getAttribute('min')||'',max=input.getAttribute('max')||'';let cursor=current.slice(0,7);
   const allowed=value=>(!min||value>=min)&&(!max||value<=max);
   const close=()=>{popup.remove();if(trigger.isConnected)trigger.focus();};
   const choose=value=>{if(!allowed(value))return;input.value=value;close();input.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}));if(trigger.isConnected)trigger.firstChild.textContent=format(input.value);};
   function render(){
    const first=date(cursor+'-01'),year=first.getUTCFullYear(),month=first.getUTCMonth(),days=new Date(Date.UTC(year,month+1,0)).getUTCDate();
    const title=new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(first);
    const cells=Array.from({length:first.getUTCDay()},()=>'<span></span>').join('')+Array.from({length:days},(_,i)=>{const value=cursor+'-'+String(i+1).padStart(2,'0');return `<button type="button" data-duty-date="${value}" aria-label="${value}" aria-pressed="${value===input.value}" class="${value===today()?'is-today':''}" ${allowed(value)?'':'disabled'}>${i+1}</button>`;}).join('');
    popup.innerHTML=`<div class="duty-calendar-head"><button type="button" data-calendar-nav="-1" aria-label="Previous calendar month">‹</button><strong aria-live="polite">${title}</strong><button type="button" data-calendar-nav="1" aria-label="Next calendar month">›</button></div><div class="duty-calendar-week">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<span>${d}</span>`).join('')}</div><div class="duty-calendar-grid">${cells}</div><div class="duty-calendar-foot"><button type="button" data-calendar-today ${allowed(today())?'':'disabled'}>Today</button><button type="button" data-calendar-close>Close</button></div>`;
    for(const b of popup.querySelectorAll('[data-calendar-nav]'))b.onclick=()=>{cursor=iso(new Date(Date.UTC(year,month+Number(b.dataset.calendarNav),1))).slice(0,7);render();popup.querySelector(`[data-calendar-nav="${b.dataset.calendarNav}"]`)?.focus();};
    for(const b of popup.querySelectorAll('[data-duty-date]'))b.onclick=()=>choose(b.dataset.dutyDate);
    popup.querySelector('[data-calendar-today]').onclick=()=>choose(today());popup.querySelector('[data-calendar-close]').onclick=close;
   }
   popup.onkeydown=e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}
    const value=e.target.dataset.dutyDate;if(!value)return;
    const d=date(value),delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-d.getUTCDay(),End:6-d.getUTCDay()}[e.key];
    if(delta===undefined)return;e.preventDefault();d.setUTCDate(d.getUTCDate()+delta);let next=iso(d);if(min&&next<min)next=min;if(max&&next>max)next=max;
    if(next.slice(0,7)!==cursor){cursor=next.slice(0,7);render();}popup.querySelector(`[data-duty-date="${next}"]`)?.focus();
   };
   render();openPopover(popup,trigger);popup.querySelector('[aria-pressed=true]:not(:disabled),[data-duty-date]:not(:disabled)')?.focus();
   popup.addEventListener('toggle',e=>{if(e.newState==='closed')popup.remove();});
  };
 }
 // One viewport owner for both Duty workspaces; table/grid CSS receives the remainder.
 let viewportHost=null,headerObserver=null;
 function fitViewport(host){
  if(!root.requestAnimationFrame)return;
  const entering=viewportHost!==host;viewportHost=host;
  root.requestAnimationFrame(()=>{
   if(!host.isConnected)return;
   const page=host.closest('#page-duty');if(!page||!page.getBoundingClientRect().width)return;
   if(entering)root.scrollTo?.({top:0,left:0,behavior:'instant'});
   const scale=Number(root.getComputedStyle(page).getPropertyValue('--duty-preview-scale'))||1;
   const top=page.getBoundingClientRect().top,bottom=Number.parseFloat(root.getComputedStyle(page.parentElement).paddingBottom)||0;
   page.style.setProperty('--duty-viewport-height',Math.max(0,(root.innerHeight-top-Math.max(12,bottom*scale+4))/scale)+'px');
   if(!headerObserver&&root.ResizeObserver){const header=host.ownerDocument.querySelector('.topBar');if(header){headerObserver=new root.ResizeObserver(()=>{if(viewportHost?.isConnected)fitViewport(viewportHost);});headerObserver.observe(header);}}
  });
 }
 root.addEventListener?.('resize',()=>{if(viewportHost?.isConnected)fitViewport(viewportHost);});
 root.visualViewport?.addEventListener('resize',()=>{if(viewportHost?.isConnected)fitViewport(viewportHost);});
 root.DutyControls={today,dateField,bindCalendars,openPopover,fitViewport};
})(typeof window==='undefined'?globalThis:window);
