'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ui=fs.readFileSync('ui.js','utf8'),cloud=fs.readFileSync('cloud-workspace.js','utf8'),review=fs.readFileSync('js/needs-review.js','utf8');
function fn(s,name){const at=s.indexOf(`function ${name}(`);assert(at>=0);return s.slice(s.slice(at-6,at)==='async '?at-6:at,s.indexOf('\n}',at)+2);}
const str=v=>String(v??''),norm=v=>str(v).trim().toUpperCase().replace(/^0+(?=\d)/,'');
function service(){const calls=[],c={window:{},toSafeString:str,normalizeItemCode:norm,getCurrentPharmacyId:()=> 'P',AuthState:{context:{}},globalThis:{crypto:{randomUUID:()=> 'op'}},authRpc:async(name,args)=>{calls.push({name,args});return {success:true,mappingScope:'GLOBAL',identifierId:'G',mappingRevision:2,identifierKey:args.p_identifier_display.toUpperCase(),identifierDisplay:args.p_identifier_display,itemCode:args.p_item_code};}};vm.runInNewContext(fs.readFileSync('js/identifier-service.js','utf8'),c);return {c,service:c.window.IdentifierService,calls};}
test('Receiving existing-item learning uses one scope-aware contract without new-item/Group parameters',async()=>{
 const h=service(),mapping=await h.service.learnExistingIdentifier('op','06285147015764',{item_code:'1056805'},'Receiving');
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].name,'learn_pharmflow_existing_identifier_v3');assert.equal(h.calls[0].args.p_pharmacy_id,'P');
 assert.equal(h.calls[0].args.p_identifier_display,'06285147015764');assert(!('p_group_name' in h.calls[0].args));
 const provenance=h.service.receivingProvenance(mapping);assert.equal(provenance.kind,'GLOBAL_LEARNED');assert.equal(provenance.contractVersion,4);
 mapping.mappingScope='PHARMACY';assert.equal(h.service.receivingProvenance(mapping).kind,'PHARMACY_LEARNED');
 assert.throws(()=>h.service.receivingProvenance({mappingScope:'GLOBAL'}),/provenance/);
});
function uploader(kind='GLOBAL_LEARNED',version=4){
 const calls=[],history=[{transactionId:'T',cloudSynced:false}],c={toSafeString:str,normalizeItemCode:norm,toNumber:(v,f=0)=>Number(v??f),nowISO:()=> 'now',cloudWorkspaceDeviceId:()=> 'D',AppEvents:{emit(){}},AppState:{workspace:{receivingHistory:history}},authRpc:async(name,args)=>{calls.push({name,args});return name.endsWith('_v3')?true:[{acknowledged:true}];}};
 vm.runInNewContext(fn(cloud,'uploadCloudReceivingTransaction'),c);
 const tx={transactionId:'T',selectedOrderNumber:'A',itemCode:'1056805',quantity:4,gtin:'WRONG_LEGACY_VALUE',gtinResolution:{kind,mappingId:'M',mappingRevision:2,identifierKey:'A07XA04',identifierDisplay:'A07XA04',resolvedItemCode:'1056805',...(version?{contractVersion:version}:{})}};
 return {c,calls,history,tx};
}
for(const [kind,version,rpc,scope] of [['GLOBAL_LEARNED',4,'append_pharmflow_learned_transaction_v4','GLOBAL'],['PHARMACY_LEARNED',4,'append_pharmflow_learned_transaction_v4','PHARMACY'],['PHARMACY_LEARNED',null,'append_pharmflow_learned_transaction_v3',undefined]]){
 test(`${kind} version ${version} selects ${rpc} and preserves alphanumeric identity`,async()=>{
  const h=uploader(kind,version);await h.c.uploadCloudReceivingTransaction(h.tx,'P');assert.equal(h.calls.length,1);assert.equal(h.calls[0].name,rpc);assert.equal(h.calls[0].args.p_gtin,'A07XA04');assert.equal(h.calls[0].args.p_mapping_scope,scope);assert.equal(h.history[0].cloudSynced,true);
 });
}
test('Global validation/RPC failure never downgrades to an ordinary receipt or marks it synced',async()=>{
 const h=uploader();h.c.authRpc=async(name,args)=>{h.calls.push({name,args});throw Error('Mapping conflict');};
 await assert.rejects(h.c.uploadCloudReceivingTransaction(h.tx,'P'),/conflict/);assert.equal(h.calls.length,1);assert.equal(h.history[0].cloudSynced,false);
 delete h.tx.gtinResolution.mappingId;await assert.rejects(h.c.uploadCloudReceivingTransaction(h.tx,'P'),/provenance/);assert.equal(h.calls.length,1);
});
