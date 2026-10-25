"use strict";
/* UI projection only. Database policy/RLS/RPC guards remain authoritative. */
window.PharmFlowPermissions = (() => {
 let saved=null,savedScope="",loading=null,epoch=0,phase="unauthenticated";
 let retryTimer=null,retries=0,lastResumeAt=0;
 const retryDelays=[1000,3000,8000];
 const rpcRules={"list_pharmflow_handheld_receiving_history_v1":["RECEIVING",false],"set_pharmflow_needs_review_photo_v2":["RECEIVING",true],"save_pharmacy_expiry_verified_state_v1":["EXPIRY",true],"save_pharmacy_expiry_verified_state_v2":["EXPIRY",true],"create_pharmflow_needs_review_v3":["DYNAMIC",true],"save_pharmacy_expiry_capture_smart":["EXPIRY",true],"save_pharmacy_needs_review":["DYNAMIC",true],"save_pharmacy_expiry_capture":["EXPIRY",true],"save_pharmflow_expiry_capture_v3":["EXPIRY",true],"can_delete_pharmflow_expiry_staged_photo_v1":["EXPIRY",true],"reserve_pharmflow_expiry_capture_v1":["EXPIRY",true],"get_pharmflow_expiry_capture_operation_v1":["EXPIRY",false],"authorize_pharmflow_expiry_photo_cleanup_v1":["EXPIRY",true],"get_pharmflow_workspace_generation":["RECEIVING",false],"resolve_pharmflow_needs_review_v2":["RECEIVING",true],"get_pharmflow_active_order_manifest_v3":["RECEIVING",false],"get_pharmflow_active_order_manifest_meta_v1":["RECEIVING",false],"get_pharmflow_cloud_workspace":["RECEIVING",false],"save_pharmflow_expiry_session_capture_v1":["EXPIRY",true],"list_pharmacy_expiry_captures":["EXPIRY",false],"list_pharmacy_expiry_current_state_v1":["EXPIRY",false],"list_pharmflow_global_item_identifiers_v2":["DATA",false],"list_pharmflow_orders":["RECEIVING",false],"resolve_pharmflow_identifier_v2":["DATA",false],"list_pharmflow_finalized_archives":["RECEIVING",false],"search_pharmflow_global_items_v3":["DATA",false],"get_global_master_gtin_meta":["DATA",false],"list_pharmflow_expiry_capture_receipts_v1":["EXPIRY",false],"create_pharmflow_global_item_v2":["GLOBAL",true],"search_pharmflow_global_items_v2":["DATA",false],"count_pharmflow_expiry_reviews_v1":["EXPIRY",false],"delete_pharmflow_expiry_review_v1":["EXPIRY",true],"delete_pharmflow_needs_review_v2":["RECEIVING",true],"get_global_master_gtin_page_v2":["DATA",false],"set_pharmflow_needs_review_qty_v2":["RECEIVING",true],"get_pharmflow_expiry_review_v1":["EXPIRY",false],"add_pharmflow_global_identifier_v2":["GLOBAL",true],"get_pharmflow_expiry_review_contract_v1":["EXPIRY",false],"list_pharmflow_cloud_transactions_delta_v3":["RECEIVING",false],"list_pharmflow_needs_review_v4":["DYNAMIC",false],"save_pharmflow_cloud_workspace":["RECEIVING",true],"resolve_pharmflow_expiry_review_v1":["EXPIRY",true],"save_pharmflow_cloud_workspace_guarded":["RECEIVING",true],"save_pharmflow_active_order_manifest_v3":["RECEIVING",true],"append_pharmflow_cloud_transaction_v2":["RECEIVING",true],"open_pharmflow_expiry_session_v1":["EXPIRY",true],"close_pharmflow_expiry_session_v1":["EXPIRY",true],"correct_pharmflow_expiry_session_v1":["EXPIRY",true],"list_pharmflow_expiry_session_v1":["EXPIRY",false],"mutate_pharmflow_expiry_inventory_v1":["EXPIRY",true],"correct_pharmflow_expiry_session_v2":["EXPIRY",true],"save_pharmflow_expiry_session_capture_v2":["EXPIRY",true],"list_pharmflow_expiry_reviews_v1":["EXPIRY",false],"list_pharmflow_expiry_session_v2":["EXPIRY",false],"summary_pharmflow_expiry_inventory_v1":["EXPIRY",false],"correct_pharmflow_expiry_desktop_session_v1":["EXPIRY",true],"list_pharmflow_expiry_desktop_session_v1":["EXPIRY",false],"save_pharmflow_expiry_desktop_capture_v1":["EXPIRY",true],"correct_pharmflow_expiry_desktop_group_v1":["EXPIRY",true],"clear_pharmflow_expiry_desktop_session_v1":["EXPIRY",true],"get_pharmflow_expiry_auth_session_v1":["EXPIRY",false],"get_pharmflow_master_cache_page_v2":["DATA",false],"count_pharmflow_needs_review_v2":["DYNAMIC",false],"select_pharmflow_expiry_inventory_v1":["EXPIRY",false],"list_pharmflow_needs_review_history_v3":["DYNAMIC",false],"assign_pharmflow_needs_review_order_v1":["RECEIVING",true],"request_pharmflow_needs_review_resolution_v4":["RECEIVING",true],"create_pharmflow_needs_review_v4":["DYNAMIC",true],"list_pharmacy_expiry_workers":["EXPIRY",false],"save_pharmflow_order_source_items_v2":["RECEIVING",true],"get_pharmflow_order_source_items_v2":["RECEIVING",false],"request_pharmflow_needs_review_resolution_v5":["RECEIVING",true],"export_pharmflow_expiry_inventory_v1":["EXPIRY",false],"resolve_all_filtered_pharmflow_expiry_inventory_v1":["EXPIRY",true],"list_pharmflow_pharmacy_item_identifiers_v1":["DATA",false],"resolve_pharmflow_expiry_review_v2":["EXPIRY",true],"correct_pharmflow_global_identifier_v2":["GLOBAL",true],"remove_pharmflow_global_identifier_v2":["GLOBAL",true],"correct_pharmflow_pharmacy_identifier_v2":["DATA",true],"append_pharmflow_learned_transaction_v4":["RECEIVING",true],"remove_pharmflow_pharmacy_identifier_v2":["DATA",true],"save_pharmacy_expiry_worker":["EXPIRY",true],"add_pharmflow_pharmacy_identifier_v2":["DATA",true],"rename_pharmacy_expiry_worker":["EXPIRY",true],"deactivate_pharmacy_expiry_worker":["EXPIRY",true],"query_pharmflow_expiry_inventory_v1":["EXPIRY",false],"quick_add_pharmflow_order_item_v1":["RECEIVING",true],"append_pharmflow_receiving_action_v4":["RECEIVING",true],"learn_pharmflow_existing_identifier_v3":["DATA",true],"create_pharmflow_needs_review_v6":["DYNAMIC",true],"set_pharmflow_needs_review_qty_v3":["RECEIVING",true],"save_pharmflow_active_order_manifest_v4":["RECEIVING",true],"get_pharmflow_master_cache_meta_v2":["DATA",false],"get_pharmflow_order":["RECEIVING",false],"register_pharmflow_order_upload":["RECEIVING",true],"get_pharmflow_receiving_groups_v1":["DATA",false]};
 const context=()=>typeof AuthState==='undefined'?null:AuthState.context;
 const scope=()=>typeof AuthState==='undefined'||!AuthState.session||AuthState.mustChangePassword?'':
  [AuthState.identityEpoch||0,AuthState.user?.id||context()?.user_id||'',context()?.pharmacy_id||''].join('/');
 const active=()=>phase==='ready' && !!saved && savedScope===scope() && saved.pharmacy_id===context()?.pharmacy_id && !AuthState.mustChangePassword;
 const owner=()=>active() && saved.system_administrator===true;
 function allowed(module,write=false){
  if(!active())return false;
  if(owner())return true;
  if(module==='GLOBAL')return context()?.member_role==='admin' && saved.data_access==='PHARMACY_GLOBAL';
  if(module==='DATA')return !write || context()?.member_role==='admin' && saved.data_access!=='READ_ONLY';
  const level=saved[String(module).toLowerCase()];
  return write?level==='FULL':level==='FULL'||level==='READ_ONLY';
 }
 function checkRpc(name,args={}){
  const r=rpcRules[name];if(!r)return;
  const module=r[0]==='DYNAMIC'?String(args.p_workflow||'RECEIVING').toUpperCase():r[0];
  requireAccess(module,r[1]);
  if(/resolve_pharmacy_expiry|resolve_pharmflow_expiry|quick_add/.test(name))requireAccess('DATA',true);
 }
 function requireAccess(module,write=false){
  if(!allowed(module,write))throw new Error(`${module}: ${write?'modification':'viewing'} is not permitted. Contact the System Administrator.`);
  return true;
 }
 function cancelRetry(){if(retryTimer!==null)clearTimeout(retryTimer);retryTimer=null;}
 function clear(){
  epoch++;saved=null;savedScope='';loading=null;retries=0;cancelRetry();
  phase=scope()?'unavailable':'unauthenticated';apply();
 }
 function retry(){
  if(retryTimer!==null || retries>=retryDelays.length || !scope() || !context()?.pharmacy_id ||
     navigator.onLine===false || document.visibilityState==='hidden' || window.PharmFlowIdleSleep?.active)return;
  const expected=scope();
  retryTimer=setTimeout(()=>{
   retryTimer=null;if(scope()===expected)load().catch(()=>{});
  },retryDelays[retries++]);
 }
 async function load(){
  if(window.PharmFlowIdleSleep?.active)return null;
  const pid=context()?.pharmacy_id,key=scope();
  if(!pid || !key){clear();return null;}
  // A suspended tab may resume before a pre-sleep request's deadline callback.
  // Supersede that request; its late success/failure must not commit state.
  if(loading?.key===key && Date.now()-loading.started<30000)return loading.promise;
  cancelRetry();
  const request={key,epoch:++epoch,started:Date.now()};
  const current=()=>request.epoch===epoch && scope()===key;
  saved=null;savedScope='';phase='loading';apply();
  const promise=(async()=>{
   try{
    if(typeof prepareAuthSessionForPermissions==='function')await prepareAuthSessionForPermissions();
    if(!current())return null;
    const row=await authRpc('get_my_pharmflow_permissions_v1',{p_pharmacy_id:pid});
    if(!current())return null;
    if(!row || row.pharmacy_id!==pid || !['FULL','READ_ONLY','DISABLED'].includes(row.receiving) ||
       !['FULL','READ_ONLY','DISABLED'].includes(row.expiry) || !['READ_ONLY','PHARMACY_ONLY','PHARMACY_GLOBAL'].includes(row.data_access)){
     throw new Error('Permissions unavailable: invalid server response.');
    }
    saved=row;savedScope=key;phase='ready';retries=0;apply();
    window.dispatchEvent(new CustomEvent('pharmflow:permissions-ready'));
    return row;
   }catch(error){
    if(current()){
     saved=null;phase=AuthState.session?'unavailable':'unauthenticated';apply();
     // Definitive denials stay closed; only transient failures are retried.
     if(!error.serverRejected || error.httpStatus>=500)retry();
    }
    throw error;
   }finally{if(loading===request)loading=null;}
  })();request.promise=promise;loading=request;return promise;
 }
 function resume(){
  if(window.PharmFlowIdleSleep?.active || document.visibilityState==='hidden' || navigator.onLine===false || !scope() || !context()?.pharmacy_id)return Promise.resolve(null);
  if(loading && loading.key===scope() && Date.now()-loading.started<30000)return loading.promise;
  if(retryTimer!==null)return Promise.resolve(null);
  if(Date.now()-lastResumeAt<1500)return Promise.resolve(null);
  lastResumeAt=Date.now();retries=0;
  return load();
 }
 const routeModule=route=>route==='expiry'?'EXPIRY':['dashboard','receiving','files','reports','sessions','archive'].includes(route)?'RECEIVING':null;
 const rule=(module,write=false,extra=null)=>({module,write,extra});
 const controls={
  RECEIVING:'#barcodeInput,#btnLoadOrders,#orderFileInput,#btnFinalizeReceiving,#btnCompleteAllReceiving,#btnResetWorkspace,#btnDeleteAllHistory,#btnSaveManualItem,#btnOpenManualAdd,[data-quick-receive],[data-link-receive],[data-review],#btnCreateSession,#btnJoinCloudSession,#btnMergeZebraSession,#btnPrepareZebraWork,#btnLastScanEdit,[data-action="plus"],[data-action="minus"],[data-action="edit"],[data-remove-order-file],[data-delete-archive-order],[data-remove-last],[data-delete-entry],[data-remove-extra],#btnConfirmQuantityCorrection,#btnSearchedAdjust,#btnSearchedRemoveManual,#btnApplySearchedCorrection,#btnLastScanMinus,#btnLastScanPlus,[data-order-delete],[data-order-finalize],[data-receiving-delete],[data-receiving-reset]',
  EXPIRY:'#btnSaveExpiryCapture,#btnClearExpiryActive,.expiryHistoryActions button,#btnSaveExpiryWorker,[data-worker-delete],[data-worker-toggle],#btnExpiryQtyMinus,#btnExpiryQtyPlus,#expiryQuantity,#expiryBarcodeInput,#expiryCameraInput,#btnExpiryPhoto,#btnExpiryNote,#expiryBatchInput,#expirySerialInput,[data-review-delete],#expiryDeleteSelected,#expiryClearList,#expiryBulkAction,#expiryClearSelected,#expiryAll,#expiryClearResolved,[data-group-edit],[data-group-delete],[data-session-edit],[data-session-delete],[data-menu-edit],[data-menu-resolve],[data-edit],[data-remove]',
  DATA:'[data-add-barcode],[data-remove-mapping],[data-correct-mapping],[data-add-identifier],[data-remove-barcode],[data-correct-barcode]',
  GLOBAL:'[data-add-new-item],[data-delete-item]'
 };
 function elementRule(el){
  const target=el.closest?.('button,input,select,textarea,[role="button"]');if(!target)return null;
  if(target.matches('#btnResolveExpiryNow'))return rule('EXPIRY',true,'DATA');
  if(target.matches('[data-quick-receive],[data-link-receive]'))return rule('RECEIVING',true,'DATA');
  if(target.matches('[data-resolve],[data-confirm-resolution]'))return rule(target.closest('.expiryNeedsReviewPanel')?'EXPIRY':'RECEIVING',true,'DATA');
  for(const [module,selector]of Object.entries(controls))if(target.matches(selector))return rule(module,true);
  if(target.closest('.expiryInventoryRowMenu,.expiryInventoryDialog,.expiryGroupDialog') && /edit|delete|save|resolve|confirm/i.test(target.textContent))return rule('EXPIRY',true);
  if(target.closest('.needsReviewSelection,.needsReviewCaseActions') && /save|resolve|confirm|link|delete/i.test(target.textContent))return rule(target.closest('.expiryNeedsReviewPanel')?'EXPIRY':'RECEIVING',true,'DATA');
  return null;
 }
 function permitted(r){return !r || allowed(r.module,r.write)&&(!r.extra||allowed(r.extra,true));}
 function apply(){
  if(!document.body)return;
  const visibleState=active()?'ready':phase;
  if(document.documentElement.dataset.permissionState!==visibleState){
   document.documentElement.dataset.permissionState=visibleState;
   window.dispatchEvent(new CustomEvent('pharmflow:permission-state'));
  }
  for(const module of ['RECEIVING','EXPIRY']){
   const disabled=!allowed(module),readonly=allowed(module)&&!allowed(module,true);
   document.body.classList.toggle('permission'+module+'Disabled',disabled);
   document.body.classList.toggle('permission'+module+'ReadOnly',readonly);
  }
  document.querySelectorAll('[data-page]').forEach(el=>{const mod=routeModule(el.dataset.page);if(mod){el.classList.toggle('permissionHidden',!allowed(mod));}});
  for(const id of ['btnZebraReceivingMode','btnZebraExpiryMode'])document.getElementById(id)?.classList.toggle('permissionHidden',!allowed(id.includes('Expiry')?'EXPIRY':'RECEIVING'));
  document.querySelectorAll(Object.values(controls).join(',')+',#btnResolveExpiryNow,[data-resolve],[data-confirm-resolution]').forEach(el=>{
   const denied=!permitted(elementRule(el));
   if(denied && !el.dataset.permissionBlocked){el.dataset.permissionBlocked='1';el.dataset.permissionWasDisabled=String(el.disabled);}
   if(denied){el.disabled=true;el.setAttribute('aria-disabled','true');}
   else if(el.dataset.permissionBlocked){el.disabled=el.dataset.permissionWasDisabled==='true';el.removeAttribute('aria-disabled');delete el.dataset.permissionBlocked;delete el.dataset.permissionWasDisabled;}
  });
  if(active() && !document.body.classList.contains('authLocked') && !document.body.classList.contains('workspaceBooting') && typeof AppRouter!=='undefined' && routeModule(AppRouter.currentRoute) && !allowed(routeModule(AppRouter.currentRoute))){
   navigateTo(allowed('EXPIRY')?'expiry':'settings',{focusScanner:false});
  }
  if(active() && (document.body.classList.contains('zebraReceivingActive')&&!allowed('RECEIVING') || document.body.classList.contains('zebraExpiryActive')&&!allowed('EXPIRY')))window.setZebraHomeMode?.();
  let note=document.getElementById('pharmflowPermissionNotice');
  if(!note){note=document.createElement('div');note.id='pharmflowPermissionNotice';note.className='authMessage';note.setAttribute('role','status');document.querySelector('.mainContent')?.prepend(note);}
  const noticeText=!active()?(phase==='loading'?'Reconnecting — verifying permissions…':!scope()?'Sign in to verify permissions.':'Permissions unavailable. Reconnect or sign in again.'):!allowed('RECEIVING',true)||!allowed('EXPIRY',true)?`Receiving: ${({FULL:'Enabled',DISABLED:'Disabled',READ_ONLY:'Legacy Read Only'})[saved.receiving]} · Expiry: ${({FULL:'Enabled',DISABLED:'Disabled',READ_ONLY:'Legacy Read Only'})[saved.expiry]}`:'';
  if(note && note.textContent!==noticeText)note.textContent=noticeText;
 }
 let scheduled=false;
 function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;apply();});}
 function bind(){
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
  for(const type of ['click','submit','keydown','input','change'])document.addEventListener(type,event=>{
   const r=elementRule(event.target);if(!permitted(r)){event.preventDefault();event.stopImmediatePropagation();if(type==='click')window.showToast?.('Read Only or Disabled: this action is not permitted','warning');}
  },true);
  apply();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
 // Shared bounded recovery, independent of whether a previous read succeeded.
 window.addEventListener('focus',()=>resume().catch(()=>{}));
 document.addEventListener('resume',()=>resume().catch(()=>{}));
 window.addEventListener('pageshow',()=>resume().catch(()=>{}));
 window.addEventListener('pharmflow:idle-resume',()=>{lastResumeAt=0;resume().catch(()=>{});});
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'){cancelRetry();return;}
  resume().catch(()=>{});
 });
 window.addEventListener('online',()=>{cancelRetry();lastResumeAt=0;resume().catch(()=>{});});
 window.addEventListener('offline',()=>{
  epoch++;loading=null;saved=null;savedScope='';cancelRetry();retries=0;
  phase=scope()?'unavailable':'unauthenticated';apply();
 });
 return {load,resume,allowed,checkRpc,require:requireAccess,apply,routeModule,clear,
  state:()=>active()?'ready':phase,snapshot:()=>active()?saved:null};
})();
