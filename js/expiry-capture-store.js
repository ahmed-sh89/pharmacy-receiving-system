/* Local safety copy only. Server state remains authoritative. No auto replay. */
const ExpiryDraftStore = (() => {
    let database, queue=Promise.resolve();
    let tabId;
    function key(scope){
        if(!scope) throw new Error("Authenticated capture scope required");
        if(!tabId){
            tabId=sessionStorage.getItem("pharmflow_expiry_draft_tab");
            if(!tabId){tabId=crypto.randomUUID();sessionStorage.setItem("pharmflow_expiry_draft_tab",tabId);}
        }
        return `${scope}/${tabId}`;
    }
    function open(){
        if(database)return database;
        database=new Promise((resolve,reject)=>{
            const request=indexedDB.open("pharmflow-expiry-drafts",1);
            request.onupgradeneeded=()=>request.result.createObjectStore("drafts");
            request.onsuccess=()=>resolve(request.result);
            request.onerror=()=>{database=null;reject(request.error);};
            request.onblocked=()=>{database=null;reject(new Error("Draft storage blocked"));};
        });
        return database;
    }
    function transact(scope,mode,action){
        const draftKey=key(scope);
        const run=queue.catch(()=>{}).then(async()=>{
            const db=await open();
            return new Promise((resolve,reject)=>{
                const tx=db.transaction("drafts",mode);
                const request=action(tx.objectStore("drafts"),draftKey);
                // Request success alone is not durable transaction completion.
                tx.oncomplete=()=>resolve(request.result);
                tx.onabort=()=>reject(tx.error||new Error("Draft transaction aborted"));
                tx.onerror=()=>reject(tx.error||new Error("Draft transaction failed"));
            });
        });
        queue=run;return run;
    }
    return {
        put(scope,draft){
            const copy=structuredClone(draft);
            if(copy.scope!==scope)throw new Error("Draft scope mismatch");
            return transact(scope,"readwrite",(store,k)=>store.put(copy,k));
        },
        get:scope=>transact(scope,"readonly",(store,k)=>store.get(k)),
        remove:scope=>transact(scope,"readwrite",(store,k)=>store.delete(k))
    };
})();
