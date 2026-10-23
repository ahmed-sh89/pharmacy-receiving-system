import {readFileSync,writeFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
// Generated from the actual application markup/renderers, never a second UI.
// Fictional, service-free visual review alongside the Staging application.
export function buildSettingsReview(out){
 const {document}=parseHTML(readFileSync(out+'/index.html','utf8'));
 document.querySelectorAll('script').forEach(e=>e.remove());
 document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.remove();
 const csp=document.createElement('meta');csp.httpEquiv='Content-Security-Policy';csp.content="default-src 'self' data:; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'none'; form-action 'none'; base-uri 'none'";document.head.prepend(csp);
 for(const id of ['authGate','workspaceBootOverlay'])document.getElementById(id)?.remove();
 document.body.className='pfNextMode';
 document.querySelectorAll('.appPage').forEach(e=>{if(e.id!=='page-settings')e.remove();else e.classList.add('active');});
 document.querySelectorAll('.sidebarItem').forEach(e=>{e.classList.toggle('active',e.dataset.page==='settings');if(e.dataset.page!=='settings')e.disabled=true;});
 const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
 set('pageTitle','Settings');set('topBarPharmacyName','Demo Pharmacy');set('accountPharmacyCode','DEMO001');set('accountPharmacyName','Demo Pharmacy');set('settingsPharmacyName','Demo Pharmacy');set('settingsPharmacyCode','DEMO001');set('settingsSignedInUser','owner@example.invalid');set('settingsUserRole','System Owner');
 document.getElementById('ownerManagementCard').hidden=false;
 document.getElementById('btnEditSettingsIdentity').hidden=false;
 const note=document.createElement('p');note.className='settingsDescription';note.textContent='DEMO DATA · Visual review only. No authentication, database or saved changes.';document.getElementById('page-settings').prepend(note);
 for(const path of ['settings-review-runtime.js','js/settings-workspace.js','js/header-account-menu.js','js/header-account-popover.js','js/header-account-ui.js']){const el=document.createElement('script');el.src='/'+path;document.body.append(el);}
 const app=readFileSync('js/app.js','utf8');
 const ui=readFileSync('ui.js','utf8'),auth=readFileSync('js/auth.js','utf8'),expiry=readFileSync('js/expiry.js','utf8');
 const fn=(source,name)=>{const start=source.search(new RegExp('(?:async )?function '+name+'\\('));if(start<0)throw Error('Missing review source '+name);return source.slice(start,source.indexOf('\n}',start)+2);};
 const runtime=`"use strict";
const toSafeString=v=>String(v??'');
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const escapeAuthHtml=escapeHTML;
const setText=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
const setInputValue=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v;};
const isSystemOwner=()=>true,isPharmacyAdmin=()=>true;
const AppEvents={on:()=>{}};
const AuthState={context:{member_role:'admin',pharmacy_code:'DEMO001'},ownerPharmacies:[{pharmacy_id:'demo',pharmacy_name:'Demo Pharmacy',pharmacy_code:'DEMO001',admin_email:'owner@example.invalid',admin_user_id:'demo-owner',status:'active'},{pharmacy_id:'demo-two',pharmacy_name:'Sample Community Pharmacy',pharmacy_code:'DEMO002',pending_admin_email:'admin@example.invalid',status:'suspended'}],ownerRegistrations:[{request_id:'demo-request',request_status:'pending',applicant_email:'new@example.invalid',pharmacy_code:'DEMO003',submitted_at:'2026-10-24'}]};
const items=[{item_code:'DEMO001',item_name:'Sample Pharmacy Item',group_name:'Medicine'},{item_code:'DEMO002',item_name:'Sample Home Health Item',group_name:'HomeHealth'}];
window.PharmFlowClassificationFilters={normalizeReceiving:i=>({group:i.group_name}),displayGroup:g=>g==='HomeHealth'?'Home Health':g};
const blocked=async()=>{throw Error('Visual review only — changes are not saved.');};
const IdentifierService={resolve:async q=>q==='00000012345678'?{found:true,itemCode:'DEMO001',itemName:items[0].item_name}:{found:false},searchItems:async q=>items.filter(i=>(i.item_code+' '+i.item_name).toLowerCase().includes(q.toLowerCase())),findGlobalItemByCode:async code=>items.find(i=>i.item_code===code),listItemIdentifiers:async()=>[{identifier_id:'demo-barcode',identifier_key:'00000012345678',identifier_display:'00000012345678',mapping_revision:1}],listPharmacyItemIdentifiers:async()=>[],addIdentifier:blocked,addPharmacyIdentifier:blocked,removeIdentifier:blocked,removePharmacyIdentifier:blocked,correctIdentifier:blocked,correctPharmacyIdentifier:blocked,deleteUnusedItem:blocked,createItem:blocked};
const looksLikeStrongBarcode=()=>false;
const nrV2OperationId=()=>crypto.randomUUID();
function showToast(message){let box=document.getElementById('settingsReviewMessage');if(!box){box=document.createElement('p');box.id='settingsReviewMessage';box.className='authMessage';box.setAttribute('role','status');document.getElementById('page-settings').append(box);}box.textContent=message;}
const Logger={warn:()=>{}};
const authRpc=blocked,callPasswordAdmin=blocked,loadOwnerPharmacies=blocked,loadMyAppContext=blocked,renderAuthState=()=>{};
const setAuthBusy=()=>{},setSettingsAccessMessage=showToast,setOwnerManagementMessage=showToast;
const formatAuthDate=v=>v;
const ExpiryCaptureEngine={workers:[{worker_id:'demo-a',worker_name:'Demo Operator'},{worker_id:'demo-b',worker_name:'Sample Operator'}]};
const expiryEscapeHtml=escapeHTML,expiryPharmacyId=()=> 'demo',loadExpiryWorkers=blocked;
const saveExpiryWorkerFromSettings=()=>showToast('Visual review only — changes are not saved.');
const refreshExpiryOperatorManagement=()=>{document.getElementById('expiryWorkersSettingsCard').hidden=false;document.getElementById('expiryWorkersSettingsCard').setAttribute('aria-hidden','false');};
${fn(ui,'renderV2IdentifierAdministration')}
${['renderOwnerMetrics','ownerPharmacyMatchesSearch','getOwnerPharmacyRowsForView','renderOwnerPharmacies','openOwnerManagementPanel','closeOwnerManagementPanel','renderOwnerManagementPanel','renderOwnerRegistrationRequests','handleOwnerPharmacyAction','reviewRegistration'].map(n=>fn(auth,n)).join('\n')}
${fn(expiry,'ensureExpiryWorkerSettingsCard')}
${fn(expiry,'renderExpiryWorkerSettingsList')}
function pharmFlowConfirm(options){return window.settingsConfirm(options);}
ensureExpiryWorkerSettingsCard();renderExpiryWorkerSettingsList();renderOwnerMetrics();renderOwnerPharmacies();renderOwnerRegistrationRequests();
renderV2IdentifierAdministration(document.getElementById('globalIdentifierMasterAdmin'));
document.querySelectorAll('[data-owner-view]').forEach(b=>b.addEventListener('click',()=>openOwnerManagementPanel(b.dataset.ownerView)));
document.getElementById('btnCloseOwnerManagement').addEventListener('click',closeOwnerManagementPanel);
document.getElementById('ownerManagementSearch').addEventListener('input',e=>{AuthState.ownerManagementSearch=e.target.value;renderOwnerPharmacies();});
const UI={elements:{confirmModal:document.getElementById('confirmModal'),confirmTitle:document.getElementById('confirmTitle'),confirmMessage:document.getElementById('confirmMessage')}};
const setElementText=(el,value)=>{if(el)el.textContent=value;};
const focusScannerInput=()=>{};
${fn(ui,'showConfirmModal')}
${fn(ui,'closeConfirmModal')}
${fn(app,'requestResetWorkspace')}
${fn(app,'requestDeleteAllHistory')}
document.getElementById('btnResetWorkspace').addEventListener('click',requestResetWorkspace);
document.getElementById('btnDeleteAllHistory').addEventListener('click',requestDeleteAllHistory);
document.getElementById('btnConfirmCancel').addEventListener('click',closeConfirmModal);
document.getElementById('btnConfirmOK').addEventListener('click',()=>{closeConfirmModal();showToast('Visual review only — changes are not saved.');});
setText('headerMasterGTINStatus','ACTIVE');setText('cloudWorkspaceStatus','SYNCED');
`;
 writeFileSync(out+'/settings-review-runtime.js',runtime);
 writeFileSync(out+'/settings-ui-review.html',document.toString());
}
