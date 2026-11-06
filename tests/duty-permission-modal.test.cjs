const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
for(const fail of [false,true])test('Permissions modal '+(fail?'retains errors and offers recovery':'closes only after confirmed save'),async()=>{
 const {document}=parseHTML('<div class="ownerPharmacyRow"><button data-pharmacy-id="synthetic">Permissions</button><div class="ownerPharmacyEditor"></div></div>');
 let closed=0,submitted;const auth={busy:false,context:{pharmacy_id:'other'}};
 const window={SettingsAccessActions:{setDirty(){}}};
 const c={window,document,AuthState:auth,isSystemOwner:()=>true,setAuthBusy:value=>auth.busy=value,setOwnerManagementMessage(){},confirmSettingsDiscard:async()=>true,
 createSettingsModal:({content})=>{document.body.append(content);return {close(){closed++;content.remove();},requestClose(){}};},
 authRpc:async(name,args)=>{if(name==='get_my_pharmflow_permissions_v1')return {receiving:'FULL',expiry:'DISABLED',duty:'FULL',data_access:'READ_ONLY',revision:1};submitted=args;if(fail)throw Error('Permission policy changed');return {...args,revision:2};}};
 const s=fs.readFileSync('js/settings-workspace.js','utf8'),a=s.indexOf('window.editPharmacyPermissions=async function'),b=s.indexOf('\n};',a)+3;
 vm.createContext(c);vm.runInContext(s.slice(a,b),c);
 const pending=window.editPharmacyPermissions(document.querySelector('button'));await new Promise(setImmediate);
 const form=document.querySelector('form');assert(form);assert.equal(closed,0);
 for(const [name,value] of Object.entries({receiving:'FULL',expiry:'DISABLED',duty:'FULL',data_access:'READ_ONLY'}))Object.defineProperty(form.querySelector('[name='+name+']'),'value',{value,writable:true,configurable:true});
 await form.onsubmit({preventDefault(){}});
 assert.equal(submitted.p_receiving,'FULL');assert.equal(submitted.p_expiry,'DISABLED');assert.equal(submitted.p_duty,'FULL');assert.equal(submitted.p_expected_revision,1);
 if(fail){assert.equal(closed,0);assert.match(form.textContent,/Reload Permissions and retry/);window.editPharmacyPermissions.cancel();}else{assert.equal(closed,1);assert.equal(form.isConnected,false);}
 await pending;
});
