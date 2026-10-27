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

  function assignmentScope(){return window.activeOrderAuthorityScope?.()||'';}
  function assignmentModel(){
    const scope=assignmentScope();
    if(PF.assignmentModel?.scope!==scope){
      PF.assignmentModel={scope,confirmed:new Set(),pending:new Map(),queue:[],running:false};
    }
    return PF.assignmentModel;
  }
  function syncAssignmentAuthority(){
    const model=assignmentModel(),active=new Set(getActiveReceivingOrderNumbers());
    // Called only for an authoritative Manifest application/readback, never an
    // optimistic AppState proposal or an unrelated UI/permission repaint.
    model.confirmed=new Set((AppState?.workspace?.handheldOrderNumbers||[])
      .map(order=>String(order||'').trim().toUpperCase()).filter(order=>active.has(order)));
  }
  function paintAssignment(){renderHandheldAssignment($('pfnOrdersOverlay'));}
  function renderHandheldAssignment(overlay){
    const page=$('page-files'),body=overlay?.querySelector('.pfnModalBody');if(!page||!body)return;
    const active=typeof getActiveReceivingOrderNumbers==='function'?getActiveReceivingOrderNumbers():[];
    const model=assignmentModel();
    const assignment=body.querySelector('.pfnHandheldAssignment')||document.createElement('section');
    assignment.className='pfnHandheldAssignment';
    if(!assignment.isConnected){
      assignment.innerHTML='<div class="pfnHandheldAssignmentHeading"><div><span>STEP 2 · HANDHELD ASSIGNMENT</span><h3>Assign to Handheld</h3></div><button type="button" data-assign-all>Select All</button></div><div class="pfnHandheldAssignmentActions"><span data-assignment-status role="status" aria-live="polite"></span></div><div class="pfnHandheldOrderGrid"></div>';
      const layout=page.querySelector('.twoColumnLayout');if(layout)layout.insertAdjacentElement('afterend',assignment);else body.appendChild(assignment);
      assignment.onchange=event=>{
        if(event.target?.matches('input[type="checkbox"]'))queueAssignment([{orderNumber:event.target.value,assigned:event.target.checked}]);
      };
      assignment.querySelector('[data-assign-all]').onclick=()=>queueAssignment(getActiveReceivingOrderNumbers().map(orderNumber=>({orderNumber,assigned:true})),true);
    }
    const ready=overlay.dataset.ordersReady==='true';
    const writable=window.PharmFlowPermissions?.allowed('RECEIVING',true)===true;
    assignment.hidden=!ready;
    const grid=assignment.querySelector('.pfnHandheldOrderGrid');
    const rows=new Map([...grid.children].map(row=>[row.dataset.assignmentOrder,row]));
    for(const [order,row] of rows)if(!active.includes(order))row.remove();
    for(const order of active){
      let row=rows.get(order);
      if(!row){
        row=document.createElement('label');row.className='pfnAssignmentOrder';row.dataset.assignmentOrder=order;
        row.innerHTML=`<input type="checkbox" value="${esc(order)}" aria-label="Assign ${esc(order)} to Handheld"><span class="pfnAssignmentOrderId">${esc(order)}</span><span class="pfnAssignmentOrderStatus"><span data-assignment-icon aria-hidden="true"></span><span data-order-assignment-status></span></span>`;
        grid.appendChild(row);
      }
      const pending=model.pending.get(order),confirmed=model.confirmed.has(order);
      const input=row.querySelector('input');
      input.checked=pending?pending.assigned:confirmed;
      input.disabled=!!pending||!ready||!writable;
      row.classList.toggle('isAssigned',confirmed);
      row.classList.toggle('isSaving',!!pending);
      row.setAttribute('aria-busy',String(!!pending));
      const status=pending?'saving':confirmed?'assigned':'unassigned';
      if(row.dataset.assignmentState!==status){
        row.dataset.assignmentState=status;
        row.querySelector('[data-order-assignment-status]').textContent=pending?'Saving...':confirmed?'Assigned':'Not Assigned';
        row.querySelector('[data-assignment-icon]').innerHTML=pending?'<span class="pfnAssignmentSpinner"></span>':`<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="10" r="8"/>${confirmed?'<path d="m6 10 2.5 2.5L14 7"/>':'<path d="m7 7 6 6m0-6-6 6"/>'}</svg>`;
      }
    }
    assignment.querySelector('[data-assign-all]').disabled=!!model.pending.size||!active.length||!writable||active.every(order=>model.confirmed.has(order));
    assignment.querySelector('[data-assignment-status]').textContent=`${active.filter(order=>model.confirmed.has(order)).length} of ${active.length} assigned`;
  }

  function queueAssignment(changes,bulk=false){
    const model=assignmentModel(),overlay=$('pfnOrdersOverlay');
    if(overlay?.dataset.ordersReady!=='true'||bulk&&model.pending.size)return;
    const active=new Set(getActiveReceivingOrderNumbers());
    const effective=changes.filter(change=>active.has(change.orderNumber)&&!model.pending.has(change.orderNumber)&&model.confirmed.has(change.orderNumber)!==change.assigned);
    if(!effective.length){paintAssignment();return;}
    // Select All expresses a complete bulk intent, including locally confirmed
    // rows: the server may have changed one since the last UI read.
    const request={changes:bulk?changes.filter(change=>active.has(change.orderNumber)):effective};
    for(const change of effective)model.pending.set(change.orderNumber,{...change,request});
    model.queue.push(request);
    paintAssignment();
    void drainAssignments(model);
  }

  async function drainAssignments(model){
    // Manifest writes are serialized, while unrelated rows stay enabled. Each
    // delta is merged into FRESH authority by the existing persistence API.
    if(model.running)return;
    model.running=true;PF.assignmentSave=model;
    try{
      while(model.queue.length && model.scope===assignmentScope()){
        const request=model.queue.shift();
        try{
          await window.PharmFlowPermissions?.whenReady();
          if(model.scope!==assignmentScope())return;
          window.PharmFlowPermissions.require('RECEIVING',true);
          const saved=await window.setHandheldAssignedOrderNumbers([], {changes:request.changes});
          if(model.scope!==assignmentScope())return;
          if(saved!==true)throw Error('Handheld assignment could not be confirmed. Check the connection and try again.');
          syncAssignmentAuthority();
          showToast?.('Handheld assignment saved','success');
        }catch(error){
          if(model.scope===assignmentScope()){
            await window.pullActiveOrderManifestAuthority?.({clearIfMissing:true,forceApply:true});
            if(model.scope===assignmentScope())showToast?.(error?.message||'Handheld assignment could not be saved. Please try again.','error');
          }
        }finally{
          for(const change of request.changes){
            if(model.pending.get(change.orderNumber)?.request===request)model.pending.delete(change.orderNumber);
          }
          if(model.scope===assignmentScope())paintAssignment();
        }
      }
    }finally{
      model.running=false;
      if(PF.assignmentSave===model)PF.assignmentSave=null;
      if(model.scope===assignmentScope())paintAssignment();
    }
  }

  async function loadManageOrders(overlay){
    if(overlay.ordersLoad)return overlay.ordersLoad;
    const scope=assignmentScope();
    overlay.dataset.ordersReady='false';overlay.dataset.ordersError='';
    refreshOpenManageOrders();
    overlay.ordersLoad=(async()=>{
      try{
        await window.PharmFlowPermissions?.whenReady();
        if(scope!==assignmentScope())throw Error('Account changed. Reopen Manage Orders.');
        window.PharmFlowPermissions.require('RECEIVING');
        await window.pullActiveOrderManifestAuthority({clearIfMissing:true});
        if(scope!==assignmentScope())return;
        if(PharmFlowCloudWorkspace?.manifestAuthorityScope!==scope || PharmFlowCloudWorkspace?.lastManifestPullError)throw Error('Unable to load Active Orders. Please retry.');
        syncAssignmentAuthority();
        overlay.dataset.ordersReady='true';
      }catch(error){
        if(scope===assignmentScope())overlay.dataset.ordersError=error?.message||'Unable to load Active Orders.';
      }finally{
        overlay.ordersLoad=null;
        if(overlay.isConnected)refreshOpenManageOrders();
      }
    })();
    return overlay.ordersLoad;
  }

  function refreshOpenManageOrders(){
    const overlay=$('pfnOrdersOverlay');
    if(!overlay)return;
    /* #page-files is physically moved into this modal after UI.elements was
       cached. Resolve the live list node here instead of relying on the cached
       reference, then render the confirmed workspace directly into it. */
    const liveOrderList=overlay.querySelector('#orderFilesList');
    if(liveOrderList && overlay.dataset.ordersReady!=='true'){
      const error=overlay.dataset.ordersError;
      liveOrderList.setAttribute('aria-busy',String(!error));
      liveOrderList.innerHTML=`<div role="status" class="pfnOrdersLoading">${error?esc(error)+' <button type="button" data-retry-orders>Retry</button>':'Loading Active Orders…'}</div>`;
      liveOrderList.querySelector('[data-retry-orders]')?.addEventListener('click',()=>loadManageOrders(overlay));
    }else if(liveOrderList && typeof renderFileList==='function'){
      liveOrderList.setAttribute('aria-busy','false');
      renderFileList(liveOrderList,AppState?.workspace?.orderFiles||[],'No order files loaded.');
    }else if(typeof refreshFileLists==='function'){
      refreshFileLists();
    }
    renderHandheldAssignment(overlay);
  }
  window.refreshOpenManageOrders=refreshOpenManageOrders;

  function openOrders(){
    const page=$('page-files');if(!page||$('pfnOrdersOverlay'))return;
    PF.ordersAnchor=document.createComment('pfn-orders-anchor');page.parentNode.insertBefore(PF.ordersAnchor,page);
    const overlay=document.createElement('div');overlay.id='pfnOrdersOverlay';overlay.className='pfnCenterOverlay';
    overlay.innerHTML='<section class="pfnCenterModal pfnOrdersModal" role="dialog" aria-modal="true" aria-labelledby="manageOrdersTitle"><header class="pfnModalHeader"><div><span>ORDER MANAGEMENT</span><h2 id="manageOrdersTitle">Manage Orders</h2></div><button type="button" data-close aria-label="Close Manage Orders">✕</button></header><div class="pfnModalBody"></div><footer class="pfnOrdersFooter"><span>Order files and device assignment</span><button type="button" data-done>Done</button></footer></section>';
    document.body.appendChild(overlay);modalStack.open(overlay);
    const body=overlay.querySelector('.pfnModalBody');
    body.appendChild(page);page.classList.add('active','pfnEmbeddedPage');page.hidden=false;
    loadManageOrders(overlay);
    overlay.querySelector('[data-close]').onclick=closeOrders;overlay.querySelector('[data-done]').onclick=closeOrders;overlay.addEventListener('click',e=>{if(e.target===overlay)closeOrders();});
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
    menu.addEventListener('click',e=>{if(window.innerWidth>900&&!document.body.classList.contains('zebraDevice')){e.preventDefault();e.stopPropagation();setCollapsed(!document.body.classList.contains('pfnSidebarCollapsed'));}});
    close?.addEventListener('click',e=>{if(window.innerWidth>900&&!document.body.classList.contains('zebraDevice')){e.preventDefault();e.stopPropagation();setCollapsed(true);}});overlay?.addEventListener('click',()=>{if(window.innerWidth>900&&!document.body.classList.contains('zebraDevice'))setCollapsed(true);});
  }

  function bind(){
    const renderConnection=()=>{
      const status=$('sidebarConnection');if(!status)return;
      if(status.dataset.headerStatusManaged==="true")return;
      status.textContent=navigator.onLine?'ONLINE':'OFFLINE';
      status.classList.toggle('isOffline',!navigator.onLine);
    };
    renderConnection();
    window.addEventListener('online',renderConnection);
    window.addEventListener('offline',renderConnection);
    $('pfnManageOrders')?.addEventListener('click',openOrders);
    $('btnRecognizedHistory')?.addEventListener('click',()=>window.openDashboardKpiPanel?.('scans'));
    $('btnAdjustReceiving')?.addEventListener('click',openAdjustReceiving);
    $('btnReceivingReportAction')?.addEventListener('click',()=>{if(typeof window.navigateTo==='function'){window.navigateTo('receiving');return;}document.querySelector('.sidebarItem[data-page="receiving"]')?.click();});
    bindSidebar();
    if(typeof AppEvents!=="undefined"&&AppEvents?.on){
      /* Manage Orders is a live projection of Current Workspace structure.
         Re-render the Handheld scope for every structural files update while
         the modal is open. Restricting this to order-upload-confirmed misses
         the authoritative active-manifest event emitted by the read-after-write
         apply, leaving the modal on its pre-save scope until it is reopened. */
      AppEvents.on('files:updated',event=>{
        if(event?.source==='active-manifest'||String(event?.source||'').startsWith('server-authority-empty'))syncAssignmentAuthority();
        refreshOpenManageOrders();
      });
      window.addEventListener('pharmflow:permission-state',()=>refreshOpenManageOrders());
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
