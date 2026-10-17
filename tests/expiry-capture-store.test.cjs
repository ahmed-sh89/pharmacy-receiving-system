const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {IDBFactory}=require('fake-indexeddb');
function store(indexedDB=new IDBFactory(),session=new Map()){
 const c={indexedDB,structuredClone,crypto:require('node:crypto').webcrypto,sessionStorage:{getItem:k=>session.get(k),setItem:(k,v)=>session.set(k,v)}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('js/expiry-capture-store.js','utf8')+'\nthis.store=ExpiryDraftStore;',c);return {store:c.store,indexedDB,session};
}
test('Committed draft preserves both Blob roles and exact data through fresh runtime',async()=>{
 const h=store(),scope='user1/pharmacy1';
 await h.store.put(scope,{scope,item:{identifierDisplay:'U0030',rawBarcode:']C1U0030'},quantity:7,month:8,year:2028,batch:'LOT-A',photos:{product:new Blob(['product']),expiry:new Blob(['date'])}});
 const recovered=await store(h.indexedDB,h.session).store.get(scope);
 assert.equal(recovered.item.identifierDisplay,'U0030');assert.equal(recovered.item.rawBarcode,']C1U0030');assert.equal(recovered.batch,'LOT-A');assert.equal(recovered.quantity,7);assert.equal(await recovered.photos.product.text(),'product');assert.equal(await recovered.photos.expiry.text(),'date');
 assert.equal(await h.store.get('user2/pharmacy1'),undefined);assert.equal(await h.store.get('user1/pharmacy2'),undefined);assert.equal(await store(h.indexedDB).store.get(scope),undefined);
});
test('Queued writes snapshot at invocation and remove only after earlier writes commit',async()=>{
 const h=store(),scope='u/p',draft={scope,status:'DRAFT',quantity:1};const first=h.store.put(scope,draft);draft.quantity=999;
 const sending=h.store.put(scope,{scope,status:'SENDING',quantity:2});await first;await sending;assert.equal((await h.store.get(scope)).quantity,2);
 await h.store.remove(scope);assert.equal(await h.store.get(scope),undefined);
});
test('A request success followed by transaction abort is rejected, never called durable',async()=>{
 const h=store(),scope='u/p';await h.store.put(scope,{scope,quantity:1});
 const original=h.indexedDB.open.bind(h.indexedDB);const c=store({open(...args){const request=original(...args);request.addEventListener('success',()=>{
  const db=request.result,transaction=db.transaction.bind(db);db.transaction=(...a)=>{const tx=transaction(...a);if(a[1]==='readwrite'){
   const objectStore=tx.objectStore.bind(tx);tx.objectStore=(...b)=>{const os=objectStore(...b),put=os.put.bind(os);os.put=(...x)=>{const r=put(...x);r.addEventListener('success',()=>tx.abort());return r;};return os;};
  }return tx;};
 });return request;}},h.session);
 await assert.rejects(c.store.put(scope,{scope,quantity:2}));assert.equal((await h.store.get(scope)).quantity,1);
});
test('A missing or mismatched authenticated scope cannot write',async()=>{
 const h=store();assert.throws(()=>h.store.put('u/p',{scope:'u/other'}));assert.throws(()=>h.store.get(''));
});
test('Explicit orphan recovery keeps operation, both photos and scoped source until acknowledged removal',async()=>{
 const h=store(),scope='u/p',operation={id:'stable',pharmacyId:'p'};
 await h.store.put(scope,{scope,status:'UNCERTAIN',operation,item:{identifierDisplay:'U0030'},photos:{product:new Blob(['p']),expiry:new Blob(['e'])}});
 const other=store(h.indexedDB);assert.equal(await other.store.get(scope),undefined);
 const entries=await other.store.list(scope);assert.equal(entries.length,1);assert.equal((await other.store.list('other/p')).length,0);
 await other.store.recover(scope,entries[0].key);const recovered=await other.store.get(scope);assert.equal(recovered.operation.id,'stable');assert.equal(await recovered.photos.expiry.text(),'e');
 await other.store.put(scope,{...recovered,status:'ACKNOWLEDGED'});assert.equal((await h.store.get(scope)).status,'ACKNOWLEDGED');
 await other.store.remove(scope);assert.equal(await h.store.get(scope),undefined);assert.equal(await other.store.get(scope),undefined);
});
test('Orphan recovery cannot replace an existing current draft or cross tenants',async()=>{
 const h=store(),scope='u/p';await h.store.put(scope,{scope,status:'DRAFT',item:{identifierDisplay:'FIRST'}});const other=store(h.indexedDB);const key=(await other.store.list(scope))[0].key;
 await other.store.put(scope,{scope,status:'DRAFT',item:{identifierDisplay:'CURRENT'}});await assert.rejects(other.store.recover(scope,key));assert.equal((await other.store.get(scope)).item.identifierDisplay,'CURRENT');
 assert.throws(()=>other.store.recover('other/p',key),/scope/);
});
