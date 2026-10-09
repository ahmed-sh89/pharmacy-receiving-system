/* Expiry-only operation adapter. No legacy fallback and no automatic replay. */
const ExpiryOperation = (() => {
    const unwrap = value => Array.isArray(value) ? value[0] : value;
    function acknowledgement(value, operationId, kind){
        const row=unwrap(value);
        if(row?.operation_id!==operationId || (kind==='UNKNOWN' ? !row.review_id || !row.product_photo_path || !row.expiry_photo_path : !row.state_id || !row.event_id)) throw new Error('Missing durable operation acknowledgement');
        return row;
    }
    function scanFacts(raw){
        let s=String(raw??'').trim().replace(/^\][A-Za-z][0-9]/,'');
        const gs1=(/^\](?:C1|d2)/.test(String(raw??'')) && /^01/.test(s)) || /^\(01\)/.test(s) || /^01\d{14}(?:17|10|21|\x1d)/.test(s);
        if(!gs1)return {format:'PLAIN',identifier:s};
        const facts={format:'GS1'};
        while(s){
            if(s[0]==='\x1d'){s=s.slice(1);continue;}
            let ai,value;
            if(s[0]==='('){
                const m=s.match(/^\((01|17|10|21)\)([^()]*)/);if(!m)throw new Error('Unsupported GS1 scan');
                [,ai,value]=m;s=s.slice(m[0].length);
            }else{
                ai=s.slice(0,2);s=s.slice(2);
                const n=ai==='01'?14:ai==='17'?6:null;
                if(!['01','17','10','21'].includes(ai))throw new Error('Unsupported GS1 scan');
                const end=n??(s.indexOf('\x1d')<0?s.length:s.indexOf('\x1d'));
                value=s.slice(0,end);s=s.slice(end);
            }
            if(facts[ai]!==undefined || (ai==='01'?!/^\d{14}$/.test(value):ai==='17'?!/^\d{6}$/.test(value):value.length<1 || value.length>20))throw new Error('Invalid GS1 scan');
            facts[ai]=value;
        }
        if(!facts['01'])throw new Error('GS1 GTIN required');
        facts.identifier=facts['01'];return facts;
    }
    async function save({rpc,upload,persist,scope,currentScope,operation,payload,photos,uuid}){
        const guard=()=>{if(scope!==currentScope())throw new Error('Capture account changed');};
        guard();
        const params={p_pharmacy_id:operation.pharmacyId,p_operation_id:operation.id};
        const finish=async value=>{
            const ack=acknowledgement(value,operation.id,operation.payload.kind);
            if(operation.payload.kind==='UNKNOWN'){
                const row=await readReview(operation.pharmacyId,ack.review_id,rpc);guard();
                if(ack.product_photo_path!==operation.payload.product_photo_path || ack.expiry_photo_path!==operation.payload.expiry_photo_path || row?.pharmacy_id!==operation.pharmacyId || row?.review_id!==ack.review_id || Object.entries(operation.payload).some(([key,value])=>row[key]!==value))throw new Error('Review read contract mismatch — draft retained');
            }
            return ack;
        };
        const reserved=unwrap(await rpc('reserve_pharmflow_expiry_capture_v1',params));guard();
        if(reserved?.operation_id!==operation.id || !['RESERVED','COMMITTED'].includes(reserved.status))throw new Error('Expiry backend incompatible — draft retained');
        if(reserved.status==='COMMITTED'){
            if(!operation.payload)throw new Error('Unreconciled operation — capture retained');
            const result=await rpc('save_pharmflow_expiry_capture_v3',{...params,p_capture:operation.payload});guard();
            return await finish(result);
        }
        if(!operation.payload){
            if(payload.kind==='UNKNOWN'){
                for(const role of ['product','expiry']){
                    guard();const file=photos[role];
                    if(!(file instanceof Blob) || !file.size || file.size>5*1024*1024 || !['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Two valid photos required');
                    if(!operation.uploaded?.[role]){
                        const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
                        const path=`${operation.pharmacyId}/expiry-v1/${operation.id}/${role}/${uuid()}.${ext}`;
                        // Each uncertain upload retry gets a fresh immutable object, never upsert.
                        await upload(path,file);guard();
                        operation.uploaded={...operation.uploaded,[role]:path};await persist('DRAFT');
                    }
                }
                payload={...payload,product_photo_path:operation.uploaded.product,expiry_photo_path:operation.uploaded.expiry};
            }
            operation.payload=structuredClone(payload);await persist('DRAFT');
        }
        guard();await persist('SENDING');guard();
        try{
            const result=await rpc('save_pharmflow_expiry_capture_v3',{...params,p_capture:operation.payload});guard();
            return await finish(result);
        }catch(error){error.uncertain=true;throw error;}
    }
    async function upload(path,file){
        const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
        let response;try{response=await fetch(getSupabaseProjectUrl()+'/storage/v1/object/pharmflow-needs-review/'+path.split('/').map(encodeURIComponent).join('/'),{
            signal:controller.signal,method:'POST',headers:{apikey:getSupabasePublishableKey(),Authorization:'Bearer '+getSupabaseAccessToken(),'Content-Type':file.type,'x-upsert':'false'},body:file
        });}finally{clearTimeout(timer);}
        if(!response.ok)throw new Error('Photo upload failed — draft retained');
    }
    async function readReceipt(operation,rpc=authRpc){
        const payload=operation?.payload;
        if(!operation?.id || !payload?.device_id || !payload.worker_id)throw new Error('Capture receipt scope unavailable');
        const rows=await rpc('list_pharmflow_expiry_capture_receipts_v1',{
            p_pharmacy_id:operation.pharmacyId,p_device_id:payload.device_id,
            p_worker_id:payload.worker_id,p_operation_ids:[operation.id]
        });
        if(!Array.isArray(rows))throw new Error('Capture receipt reader incompatible');
        if(!rows.length)return null;
        const row=rows[0];
        if(rows.length!==1 || row.operation_id!==operation.id || row.pharmacy_id!==operation.pharmacyId ||
           Object.entries(payload).some(([key,value])=>row[key]!==value))throw new Error('Capture receipt mismatch');
        acknowledgement(row.acknowledgement,operation.id,payload.kind);
        return row;
    }
    async function readReview(pharmacyId,reviewId,rpc=authRpc){
        return unwrap(await rpc('get_pharmflow_expiry_review_v1',{p_pharmacy_id:pharmacyId,p_review_id:reviewId}));
    }
    return {save,scanFacts,acknowledgement,upload,readReview,readReceipt};
})();
