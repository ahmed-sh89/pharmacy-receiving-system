"use strict";
(function(){
  const PF={version:"B10CLEAN5",flashTimer:0,ordersAnchor:null,initialized:false,suppressPriorityToast:false,successOrders:new Set()};
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const modalLayers=[];
  const modalStack={
    open(element){
      if(!element)return;
      const existing=modalLayers.indexOf(element);
      if(existing>=0)modalLayers.splice(existing,1);
      modalLayers.push(element);
      element.classList.add('pfnModalLayer');
      element.style.setProperty('--pfn-modal-depth',String(modalLayers.length-1));
    },
    close(element){
      const index=modalLayers.indexOf(element);
      if(index>=0)modalLayers.splice(index,1);
      element?.classList.remove('pfnModalLayer');
      element?.style.removeProperty('--pfn-modal-depth');
      modalLayers.forEach((layer,i)=>layer.style.setProperty('--pfn-modal-depth',String(i)));
    },
    top(){return modalLayers.at(-1)||null;}
  };
  window.PharmFlowModalStack=modalStack;

  function installModalStackObserver(){
    const sync=()=>{
      modalLayers.slice().forEach(layer=>{if(!layer.isConnected||layer.matches('.modalOverlay:not(.open)'))modalStack.close(layer);});
      document.querySelectorAll('.modalOverlay.open').forEach(layer=>{if(!modalLayers.includes(layer))modalStack.open(layer);});
    };
    new MutationObserver(sync).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    sync();
  }

  function flash(kind){
    const card=$('lastScanCard');
    if(!card)return;

    /* Scan/Search feedback has one authoritative renderer in ui.js.  Keeping
       the field flash there prevents legacy child backgrounds and duplicate
       controllers from producing partial/competing visual states. */
    try{
      if(typeof window.triggerScanFieldFlash==='function'){
        window.triggerScanFieldFlash(kind==='success'?'success':'error');
      }
    }catch(_){}

    clearTimeout(PF.flashTimer);
    card.classList.remove('pfnLastScanFlashSuccess','pfnLastScanFlashError');
    card.classList.add(kind==='success'?'pfnLastScanFlashSuccess':'pfnLastScanFlashError');
    PF.flashTimer=setTimeout(()=>{
      card.classList.remove('pfnLastScanFlashSuccess','pfnLastScanFlashError');
    },700);
  }

  function scannerTx(tx){
    const configured=String(window.APP_CONFIG?.transactionSources?.scanner||'SCANNER').toUpperCase();
    return String(tx?.source||'').toUpperCase()===configured;
  }

  async function maybeShowPerfectReceiving(tx){
    if(!scannerTx(tx))return;
    const selected=typeof getSelectedReceivingOrderNumbers==='function'?getSelectedReceivingOrderNumbers():[];
    if(selected.length!==1)return;
    const order=selected[0];
    const rows=typeof getPerOrderReceivingRows==='function'?getPerOrderReceivingRows(order):[];
    if(!rows.length)return;
    const exact=rows.every(row=>row.issueKey==='received_any' && Number(row['Ordered Qty']||0)===Number(row['Received Qty']||0));
    if(!exact){PF.successOrders.delete(order);return;}
    try{
      if(typeof nrV2List==='function'){
        const pending=await nrV2List('RECEIVING',null);
        if(Array.isArray(pending)&&pending.length)return;
      }
    }catch(_){return;}
    if(PF.successOrders.has(order))return;
    PF.successOrders.add(order);
    showPerfectReceivingOverlay(order);
  }

  function showPerfectReceivingOverlay(order){
    $('pfnReceivingSuccessOverlay')?.remove();
    const overlay=document.createElement('div');
    overlay.id='pfnReceivingSuccessOverlay';
    overlay.className='pfnReceivingSuccessOverlay';
    overlay.innerHTML=`<section class="pfnReceivingSuccessCard" role="dialog" aria-modal="true" aria-label="Receiving complete">
      <div class="pfnSuccessIcon">✓</div>
      <span class="pfnSuccessEyebrow">RECEIVING COMPLETE</span>
      <h2>Order matched successfully</h2>
      <strong>${esc(order)}</strong>
      <p>All ordered quantities have been received with no discrepancies or pending review items.</p>
      <div class="pfnSuccessActions"><button type="button" data-dashboard>Back to Dashboard</button><button type="button" class="primary" data-complete>Complete Receiving</button></div>
    </section>`;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-dashboard]').onclick=()=>{overlay.remove();focusScannerInput?.();};
    overlay.querySelector('[data-complete]').onclick=()=>{overlay.remove();requestFinalizeReceiving?.();};
  }

  function installFlash(){
    if(window.AppEvents?.on){
      try{AppEvents.on('receiving:transaction',tx=>{if(scannerTx(tx))flash('success');setTimeout(()=>maybeShowPerfectReceiving(tx),80);});}catch(_){}
    }
    if(typeof window.showToast==='function'&&!window.showToast.__pfnCleanWrapped){
      const original=window.showToast;
      const wrapped=function(message,type,duration){
        try{if(PF.suppressPriorityToast)return;if(window.ScannerEngine?.processing===true&&(type==='error'||type==='warning'))flash('error');}catch(_){}
        return original.apply(this,arguments);
      };
      wrapped.__pfnCleanWrapped=true;window.showToast=wrapped;
    }
  }

  function renderHandheldAssignment(overlay){
    const page=$('page-files'),body=overlay?.querySelector('.pfnModalBody');if(!page||!body)return;
    const active=typeof getActiveReceivingOrderNumbers==='function'?getActiveReceivingOrderNumbers():[];
    const assigned=Array.isArray(AppState?.workspace?.handheldOrderNumbers)
      ? AppState.workspace.handheldOrderNumbers
        .map(order=>String(order||'').trim().toUpperCase())
        .filter(order=>active.includes(order))
      : [];
    const assignment=body.querySelector('.pfnHandheldAssignment')||document.createElement('section');assignment.className='pfnHandheldAssignment';
    assignment.innerHTML=`<div class="pfnHandheldAssignmentHeading"><div><span>HANDHELD ASSIGNMENT</span><h3>Assign orders to Handheld</h3><p>Active Orders are managed here; only checked orders appear on the Handheld.</p></div><button type="button" data-assign-all>Select all</button></div><div class="pfnHandheldOrderGrid">${active.map(order=>`<label><input type="checkbox" value="${esc(order)}" ${assigned.includes(order)?'checked':''}><span>${esc(order)}</span></label>`).join('')||'<p>No active orders available.</p>'}</div><div class="pfnHandheldAssignmentActions"><span data-assignment-status>${active.length?`${assigned.length} orders assigned`:'No active orders'}</span><button type="button" class="primary" data-save-assignment>Assign to Handheld</button></div>`;
    if(!assignment.isConnected) body.insertBefore(assignment,page);
    assignment.querySelector('[data-assign-all]')?.addEventListener('click',()=>assignment.querySelectorAll('input').forEach(input=>input.checked=true));
    assignment.querySelector('[data-save-assignment]')?.addEventListener('click',async event=>{
      const chosen=[...assignment.querySelectorAll('input:checked')].map(input=>input.value);
      if(!chosen.length){showToast?.('Select at least one active order','warning');return;}
      event.currentTarget.disabled=true;
      const saved=await window.setHandheldAssignedOrderNumbers?.(chosen);
      event.currentTarget.disabled=false;
      if(saved) assignment.querySelector('[data-assignment-status]').textContent=`${chosen.length} orders assigned`;
    });
  }

  function refreshOpenManageOrders(){
    const overlay=$('pfnOrdersOverlay');
    if(overlay) renderHandheldAssignment(overlay);
  }

  function openOrders(){
    const page=$('page-files');if(!page||$('pfnOrdersOverlay'))return;
    PF.ordersAnchor=document.createComment('pfn-orders-anchor');page.parentNode.insertBefore(PF.ordersAnchor,page);
    const overlay=document.createElement('div');overlay.id='pfnOrdersOverlay';overlay.className='pfnCenterOverlay';
    overlay.innerHTML='<section class="pfnCenterModal pfnOrdersModal" role="dialog" aria-modal="true"><header class="pfnModalHeader"><div><span>ORDER MANAGEMENT</span><h2>Manage Orders</h2></div><button type="button" data-close>✕</button></header><div class="pfnModalBody"></div></section>';
    document.body.appendChild(overlay);modalStack.open(overlay);
    const body=overlay.querySelector('.pfnModalBody');
    body.appendChild(page);page.classList.add('active','pfnEmbeddedPage');page.hidden=false;
    renderHandheldAssignment(overlay);
    overlay.querySelector('[data-close]').onclick=closeOrders;overlay.addEventListener('click',e=>{if(e.target===overlay)closeOrders();});
  }

  function closeOrders(){
    const overlay=$('pfnOrdersOverlay'),page=$('page-files');
    if(page&&PF.ordersAnchor?.parentNode){page.classList.remove('active','pfnEmbeddedPage');PF.ordersAnchor.parentNode.insertBefore(page,PF.ordersAnchor);PF.ordersAnchor.remove();PF.ordersAnchor=null;}
    modalStack.close(overlay);overlay?.remove();try{focusScannerInput?.();}catch(_){}
  }

  function openAdjustReceiving(){
    $('pfnAdjustOverlay')?.remove();
    const overlay=document.createElement('div');overlay.id='pfnAdjustOverlay';overlay.className='pfnCenterOverlay pfnAdjustOverlay';
    overlay.innerHTML=`<section class="pfnCenterModal pfnAdjustModal" role="dialog" aria-modal="true" aria-label="Receiving adjustment">
      <header class="pfnModalHeader"><div><span>RECEIVING CORRECTION</span><h2>Adjust Received Quantity</h2></div><button type="button" data-close>✕</button></header>
      <div class="pfnAdjustBody">
        <label class="pfnAdjustSearchLabel">Find Item<input type="search" data-search placeholder="Search by Item Name, Item Number or GTIN" autocomplete="off"></label>
        <div class="pfnAdjustResults" data-results></div>
        <section class="pfnAdjustSelection" data-selection hidden>
          <div class="pfnAdjustItem"><span>SELECTED ITEM</span><strong data-name></strong><small data-meta></small></div>
          <div class="pfnAdjustCurrent"><span>Received — All Devices</span><strong data-current>0</strong></div>
          <label class="pfnAdjustQtyLabel">Receiving Adjustment</label>
          <div class="pfnAdjustStepper"><button type="button" data-minus>−</button><input type="number" min="0" step="1" inputmode="numeric" data-qty><button type="button" data-plus>+</button></div>
          <label class="pfnAdjustReason">Reason<select data-reason><option value="Correction">Correction</option><option value="Counting Error">Counting Error</option><option value="Other">Other</option></select></label>
          <div class="pfnAdjustActions"><button type="button" data-cancel>Cancel</button><button type="button" class="primary" data-save>Save Adjustment</button></div>
        </section>
      </div>
    </section>`;
    document.body.appendChild(overlay);
    let selected=null;
    const search=overlay.querySelector('[data-search]'),results=overlay.querySelector('[data-results]'),selection=overlay.querySelector('[data-selection]'),qty=overlay.querySelector('[data-qty]');
    const close=()=>{overlay.remove();focusScannerInput?.();};
    overlay.querySelectorAll('[data-close],[data-cancel]').forEach(b=>b.onclick=close);overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    const items=()=>typeof getSearchableItems==='function'?getSearchableItems():(window.AppState?.workspace?.orderData||[]);
    const render=()=>{
      const q=String(search.value||'').trim().toLowerCase();if(!q){results.innerHTML='';return;}
      const matches=items().filter(item=>[item.itemName,item.itemCode,item.gtin,item.GTIN].some(v=>String(v||'').toLowerCase().includes(q))).slice(0,8);
      results.innerHTML=matches.length?matches.map((item,i)=>`<button type="button" data-i="${i}"><span><strong>${esc(item.itemName)}</strong><small>Item ${esc(item.itemCode)}</small></span><b>Received ${Number(item.receivedQty||0)}</b></button>`).join(''):'<div class="pfnAdjustEmpty">No matching item.</div>';
      results.querySelectorAll('[data-i]').forEach(btn=>btn.onclick=()=>{
        selected=matches[Number(btn.dataset.i)];selection.hidden=false;results.innerHTML='';search.value='';
        overlay.querySelector('[data-name]').textContent=selected.itemName||'';overlay.querySelector('[data-meta]').textContent=`Item ${selected.itemCode||''} · Ordered ${Number(selected.orderedQty||0)}`;
        overlay.querySelector('[data-current]').textContent=String(Number(selected.receivedQty||0));qty.value=String(Number(selected.receivedQty||0));qty.focus();qty.select();
      });
    };
    search.oninput=render;
    overlay.querySelector('[data-minus]').onclick=()=>{qty.value=String(Math.max(0,Number(qty.value||0)-1));};
    overlay.querySelector('[data-plus]').onclick=()=>{qty.value=String(Math.max(0,Number(qty.value||0)+1));};
    overlay.querySelector('[data-save]').onclick=()=>{
      if(!selected)return;const target=Number(qty.value);if(!Number.isFinite(target)||target<0){showToast?.('Enter a valid quantity','warning');return;}
      const reason=overlay.querySelector('[data-reason]').value||'Correction';
      const tx=typeof setItemReceivedQuantity==='function'?setItemReceivedQuantity(selected.itemCode,target,reason):false;
      if(tx)close();
    };
    setTimeout(()=>search.focus(),30);
  }

  function bindSidebar(){
    const menu=$('btnMenu'),close=$('btnCloseSidebar'),sidebar=$('sidebar'),overlay=$('sidebarOverlay');if(!menu||!sidebar)return;
    const setCollapsed=collapsed=>{document.body.classList.toggle('pfnSidebarCollapsed',collapsed);menu.setAttribute('aria-expanded',String(!collapsed));try{localStorage.setItem('PHARMFLOW_SIDEBAR_COLLAPSED',collapsed?'1':'0');}catch(_){}};
    let remembered=false;try{remembered=localStorage.getItem('PHARMFLOW_SIDEBAR_COLLAPSED')==='1';}catch(_){}setCollapsed(remembered);
    menu.addEventListener('click',e=>{if(window.innerWidth>900){e.preventDefault();e.stopPropagation();setCollapsed(!document.body.classList.contains('pfnSidebarCollapsed'));}});
    close?.addEventListener('click',e=>{if(window.innerWidth>900){e.preventDefault();e.stopPropagation();setCollapsed(true);}});overlay?.addEventListener('click',()=>{if(window.innerWidth>900)setCollapsed(true);});
    const finePointer=window.matchMedia?.('(hover:hover) and (pointer:fine)');
    let collapseTimer=0;
    const desktopHover=()=>window.innerWidth>900&&Boolean(finePointer?.matches)&&!document.body.classList.contains('zebraDevice');
    const openForPointer=()=>{if(!desktopHover())return;clearTimeout(collapseTimer);setCollapsed(false);};
    const closeAfterPointerLeaves=()=>{if(!desktopHover())return;clearTimeout(collapseTimer);collapseTimer=setTimeout(()=>setCollapsed(true),140);};
    menu.addEventListener('pointerenter',openForPointer);
    menu.addEventListener('pointerleave',closeAfterPointerLeaves);
    sidebar.addEventListener('pointerenter',openForPointer);
    sidebar.addEventListener('pointerleave',closeAfterPointerLeaves);
  }

  function bind(){
    $('pfnManageOrders')?.addEventListener('click',openOrders);
    $('btnReceivedItems')?.addEventListener('click',()=>window.openDashboardKpiPanel?.('received'));
    $('btnAdjustReceiving')?.addEventListener('click',openAdjustReceiving);
    $('btnReceivingReportAction')?.addEventListener('click',()=>{if(typeof window.navigateTo==='function'){window.navigateTo('receiving');return;}document.querySelector('.sidebarItem[data-page="receiving"]')?.click();});
    bindSidebar();
    if(typeof AppEvents!=="undefined"&&AppEvents?.on){
      AppEvents.on('files:updated',event=>{if(event?.source==='order-upload-confirmed')refreshOpenManageOrders();});
    }
    document.addEventListener('keydown',event=>{
      if(event.key!=='Escape')return;
      const top=modalStack.top();
      if(!top)return;
      const closeControl=top.querySelector('[data-close],[data-cancel],.quickKpiClose,#btnCloseSearch,#btnCloseManualItem,#btnConfirmCancel');
      if(!closeControl)return;
      event.preventDefault();event.stopImmediatePropagation();
      closeControl.click();
    },true);
  }

  function init(){if(PF.initialized)return;PF.initialized=true;document.body.classList.add('pfNextMode','pfnCleanReceiving');installModalStackObserver();bind();installFlash();}
  document.addEventListener('DOMContentLoaded',init);if(document.readyState!=='loading')init();
  window.PharmFlowNext=PF;
})();
