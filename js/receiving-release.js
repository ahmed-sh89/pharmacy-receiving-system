"use strict";

/* PharmFlow Receiving Release — device-local scan transport.
   IndexedDB holds only unconfirmed delivery work. Supabase remains authoritative. */
(function installReceivingRelease(){
    if(window.PharmFlowReceivingScanQueue) return;
    const DB_NAME="PHARMFLOW_RECEIVING_SCAN_QUEUE_V1", STORE="scans";
    let dbPromise=null, worker=null, started=false;
    function scope(){
        const pharmacy=String(AuthState?.context?.pharmacy_id||"");
        const device=typeof ensureDeviceId==="function"?ensureDeviceId():"unknown-device";
        return pharmacy&&device?pharmacy+"::"+device:"";
    }
    function transactionId(){return crypto.randomUUID?.()||"pf-"+Date.now()+"-"+Math.random().toString(16).slice(2);}
    function open(){
        if(dbPromise) return dbPromise;
        dbPromise=new Promise((resolve,reject)=>{
            const request=indexedDB.open(DB_NAME,1);
            request.onupgradeneeded=()=>{
                const db=request.result;
                const store=db.objectStoreNames.contains(STORE)?request.transaction.objectStore(STORE):db.createObjectStore(STORE,{keyPath:"transactionId"});
                if(!store.indexNames.contains("scope_sequence")) store.createIndex("scope_sequence",["scope","sequence"],{unique:false});
            };
            request.onsuccess=()=>resolve(request.result);
            request.onerror=()=>reject(request.error||new Error("Unable to open scan queue"));
        });
        return dbPromise;
    }
    async function put(row){const db=await open();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(row);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
    async function remove(id){const db=await open();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
    async function pending(){
        const current=scope(); if(!current) return [];
        const db=await open();
        return new Promise((resolve,reject)=>{
            const tx=db.transaction(STORE,"readonly"), idx=tx.objectStore(STORE).index("scope_sequence");
            const range=IDBKeyRange.bound([current,0],[current,Number.MAX_SAFE_INTEGER]), rows=[];
            const cursor=idx.openCursor(range);
            cursor.onsuccess=()=>{const c=cursor.result;if(c){rows.push(c.value);c.continue();}else resolve(rows);};
            cursor.onerror=()=>reject(cursor.error);
        });
    }
    async function nextSequence(){const rows=await pending();return rows.reduce((m,r)=>Math.max(m,Number(r.sequence||0)),0)+1;}
    function localTransaction(transactionId){
        return (AppState?.workspace?.receivingHistory||[]).find(
            row=>String(row?.transactionId||"")===String(transactionId||"")
        )||null;
    }
    async function discardConfirmedHead(row){
        const tx=localTransaction(row?.transactionId);
        if(tx?.cloudSynced===true){
            await remove(row.transactionId);
            return true;
        }
        return false;
    }
    async function run(){
        if(worker) return worker;
        worker=(async()=>{
            while(true){
                const rows=await pending();
                /* An older confirmed row can remain in IndexedDB after a
                   browser restart. It must stay durable until cloud sync
                   proves it safe to remove, but it must never make every
                   later hardware scan appear unread. The cloud transaction
                   queue serializes server upload; this scan-acceptance queue
                   may therefore continue with the next unprocessed entry. */
                for(const waiting of rows.filter(entry=>entry.state==="awaitingConfirmation")){
                    await discardConfirmedHead(waiting);
                }
                const row=(await pending()).find(entry=>entry.state==="accepted");
                if(!row) break;
                if(!navigator.onLine){window.refreshHandheldWorkspaceStatus?.();break;}
                try{
                    const clean=typeof cleanScannerInput==="function"?cleanScannerInput(row.raw):String(row.raw||"").trim();
                    const parsed=row.parsed||(typeof parseGS1Barcode==="function"?parseGS1Barcode(clean):null);
                    if(!parsed?.gtin){
                        if(typeof receiveUnrecognizedHandheldScan!=="function"){
                            throw new Error("Needs Review resolver is unavailable");
                        }
                        const handled=await receiveUnrecognizedHandheldScan(clean);
                        if(handled!==false) await remove(row.transactionId);
                        else throw new Error("Unsupported barcode could not be saved to Needs Review");
                        continue;
                    }
                    /* Persist the wait state before receiveParsedBarcode can
                       schedule and complete a cloud acknowledgement. */
                    row.state="awaitingConfirmation"; row.lastError=""; row.lastAttemptAt=new Date().toISOString(); await put(row);
                    const result=await receiveParsedBarcode(parsed,{transactionId:row.transactionId});
                    if(result===false||!localTransaction(row.transactionId)){await remove(row.transactionId);}
                }catch(error){
                    row.state="failed";row.lastError=String(error?.message||error);row.lastAttemptAt=new Date().toISOString();await put(row);
                    Logger?.warn?.("Queued scan failed without blocking later scans",error);continue;
                }
            }
        })();
        try{return await worker;}finally{
            worker=null;
            /* Queue recovery can start during application boot, before a new
               input event reaches hhProcessReceiving(). Restore the hardware
               scanner lifecycle here as well, without affecting PC runtime. */
            window.hhRefreshReadyState?.();
            window.hhRepairScannerFocus?.("receiving-queue-recovery");
        }
    }
    async function enqueue(raw,parsed=null){
        const current=scope(); if(!current) throw new Error("Receiving workspace is not connected");
        const row={transactionId:transactionId(),scope:current,sequence:await nextSequence(),raw:String(raw||""),parsed:parsed&&typeof parsed==="object"?parsed:null,state:"accepted",acceptedAt:new Date().toISOString()};
        await put(row); void run(); return {accepted:true,transactionId:row.transactionId};
    }
    window.PharmFlowReceivingScanQueue={enqueue,resume:run};
    AppEvents?.on?.("receiving:cloud-confirmed",event=>{const id=event?.transactionId;if(id) void remove(id).then(run);});
    window.addEventListener("online",()=>void run());
    window.addEventListener("auth:context-ready",()=>{if(!started){started=true;setTimeout(()=>void run(),350);}});
    if(document.readyState!=="loading") setTimeout(()=>void run(),600);
})();

/* Assignment is intentionally PC-admin only. The Handheld has no order
   picker, avoiding accidental scope changes by the worker. */

window.PharmFlowDeviceWorkScope={
    key(){return "PHARMFLOW_WORK_SCOPE_V1::"+String(AuthState?.context?.pharmacy_id||"")+"::"+(typeof ensureDeviceId==="function"?ensureDeviceId():"");},
    read(){
        const raw=localStorage.getItem(this.key());
        if(raw===null) return null;
        try{
            const saved=JSON.parse(raw);
            /* Migrate the B11 array format. In that format [] was the
               persisted ALL sentinel; a missing key was first use. */
            if(Array.isArray(saved)){
                return saved.length
                    ? {version:2,mode:"selected",orders:[...new Set(saved.map(String))]}
                    : {version:2,mode:"all",orders:[]};
            }
            if(saved?.version===2 && saved?.mode==="all") return {version:2,mode:"all",orders:[]};
            if(saved?.version===2 && saved?.mode==="selected" && Array.isArray(saved.orders)){
                return {version:2,mode:"selected",orders:[...new Set(saved.orders.map(String))]};
            }
        }catch(_){}
        return null;
    },
    write(preference){localStorage.setItem(this.key(),JSON.stringify(preference));},
    setAll(){this.write({version:2,mode:"all",orders:[]});},
    setSelected(orders){this.write({version:2,mode:"selected",orders:[...new Set((orders||[]).map(String))]});},
    set(orders){(orders||[]).length?this.setSelected(orders):this.setAll();},
    resolve(active,options={}){
        const available=[...new Set((active||[]).map(String))];
        const preference=this.read();
        if(!preference) return {mode:"unset",orders:available};
        if(preference.mode==="all") return {mode:"all",orders:available};
        const orders=preference.orders.filter(order=>available.includes(order));
        if(options.authoritative!==false && orders.length!==preference.orders.length){
            /* Only invalid manifest members are removed. If none remain,
               return to an explicit ALL preference so receiving cannot be
               left with an unusable zero-order scope. */
            if(orders.length) this.setSelected(orders); else this.setAll();
        }
        if(options.authoritative===false && !orders.length){
            return {mode:"selected",orders:[]};
        }
        return {mode:orders.length?"selected":"all",orders:orders.length?orders:available};
    },
    get(active){return this.resolve(active).orders;},
    prune(active){return this.resolve(active).orders;}
};

window.PharmFlowClassificationFilters={
    normalize(row){
        const legacy=String(row?.category||row?.Category||"").trim();
        return {group:String(row?.group_name||row?.groupName||row?.Group||legacy).trim(),category:String(row?.category||row?.Category||"").trim(),subCategory:String(row?.sub_category||row?.subCategory||row?.["Sub Category"]||"").trim()};
    },
    choices(rows,selection={}){
        const values=(list,key)=>[...new Set(list.map(r=>this.normalize(r)[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
        const groups=new Set(selection.groups||[]),categories=new Set(selection.categories||[]);
        const groupRows=groups.size?rows.filter(r=>groups.has(this.normalize(r).group)):rows;
        const categoryRows=categories.size?groupRows.filter(r=>categories.has(this.normalize(r).category)):groupRows;
        return {groups:values(rows,"group"),categories:values(groupRows,"category"),subCategories:values(categoryRows,"subCategory")};
    },
    filter(rows,selection={}){
        const sets={groups:new Set(selection.groups||[]),categories:new Set(selection.categories||[]),subCategories:new Set(selection.subCategories||[])};
        return rows.filter(row=>{const c=this.normalize(row);return(!sets.groups.size||sets.groups.has(c.group))&&(!sets.categories.size||sets.categories.has(c.category))&&(!sets.subCategories.size||sets.subCategories.has(c.subCategory));});
    }
};


/* Retired device-local Handheld work-scope chooser. */
(function retireHandheldWorkScopeChooser(){
    function isHandheld(){try{return typeof isLikelyZebraDevice==="function"&&isLikelyZebraDevice();}catch(_){return false;}}
    function mount(){
        if(!isHandheld()||document.getElementById("pfrChangeOrders"))return;
        const scan=document.getElementById("scanBox");if(!scan)return;
        const button=document.createElement("button");button.id="pfrChangeOrders";button.type="button";button.className="pfrChangeOrders";button.textContent="CHANGE ORDERS";
        button.addEventListener("click",()=>{
            const active=typeof getActiveReceivingOrderNumbers==="function"?getActiveReceivingOrderNumbers():[];
            const selected=typeof getSelectedReceivingOrderNumbers==="function"?getSelectedReceivingOrderNumbers():active;
            const overlay=document.createElement("div");overlay.className="quickKpiOverlay pfrWorkScopeOverlay";
            const esc=v=>String(v||"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
            overlay.innerHTML=`<section class="pfrWorkScopeCard"><h3>My Work Orders</h3><p>Select the Active Orders for this Handheld.</p><label class="pfrWorkAll"><input type="checkbox" data-all ${selected.length===active.length?"checked":""}> ALL ACTIVE ORDERS</label><div class="pfrWorkOrders">${active.map(order=>`<label><input type="checkbox" data-order="${esc(order)}" ${selected.includes(order)?"checked":""}> <span>${esc(order)}</span></label>`).join("")}</div><div class="pfrWorkActions"><button type="button" data-cancel>Cancel</button><button type="button" data-save>Apply</button></div></section>`;
            document.body.appendChild(overlay);window.PharmFlowModalStack?.open(overlay);
            const close=()=>{window.PharmFlowModalStack?.close(overlay);overlay.remove();};
            overlay.querySelector("[data-cancel]").onclick=close;
            overlay.querySelector("[data-all]").onchange=e=>overlay.querySelectorAll("[data-order]").forEach(x=>x.checked=e.target.checked);
            overlay.querySelector("[data-save]").onclick=()=>{const values=[...overlay.querySelectorAll("[data-order]:checked")].map(x=>x.dataset.order);if(!values.length){showToast?.("Select at least one Order","warning");return;}if(setSelectedReceivingOrderNumbers?.(values)){close();hhRefreshReadyState?.();focusScannerInput?.();}};
        });
        scan.appendChild(button);
    }
    /* no mount: selection is saved through Manage Orders on the PC */
})();
