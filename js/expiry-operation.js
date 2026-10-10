/* Expiry-only operation adapter. No legacy fallback and no automatic replay. */
const ExpiryOperation = (() => {
    const unwrap = value => Array.isArray(value) ? value[0] : value;
    const isDefinitiveRejection = error => error?.serverRejected===true && [400,401,403,404,422].includes(Number(error.httpStatus));
    const classifySaveFailure = error => {
        error.expiryOutcome=isDefinitiveRejection(error)?'rejected':'uncertain';
        if(error.expiryOutcome==='uncertain')error.uncertain=true;
        return error;
    };
    function acknowledgement(value, operationId, kind){
        const row=unwrap(value);
        if(row?.operation_id!==operationId || (kind==='UNKNOWN' ? !row.review_id || !(row.product_photo_path||row.evidence_photo_path) : !row.state_id || !row.event_id)) throw new Error('Missing durable operation acknowledgement');
        return row;
    }
    function scanFacts(raw){
        const source=String(raw??'').trim();
        // Resolve and persist the same scanner-normalized separator that the
        // shared GS1 parser accepts (ASCII GS, scanner aliases, and AIM prefix).
        const framed=typeof cleanScannerInput==='function'?cleanScannerInput(source):source;
        let s=framed.replace(/^\][A-Za-z][0-9]/,'');
        // AI order is not fixed. Variable-first scans require an actual GS;
        // never search inside a lot/serial for the characters of another AI.
        const gs1=/^\](?:C1|d2|Q3)/i.test(source) || /^\((?:01|17|10|21)\)/.test(s) ||
            /^01\d{14}(?:$|17|10|21|\x1d)/.test(s) || /^17\d{6}(?:01|10|21|\x1d)/.test(s) ||
            /^(?:10|21)[^\x1d]{1,20}\x1d(?:01|17|10|21)/.test(s);
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
            if(ai==='17'){
                const year=2000+Number(value.slice(0,2)),month=Number(value.slice(2,4)),day=Number(value.slice(4,6));
                if(month<1 || month>12 || day>new Date(Date.UTC(year,month,0)).getUTCDate())throw new Error('Invalid GS1 expiry');
            }
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
                const legacyTwoPhoto=!!operation.payload.expiry_photo_path;
                const ackPath=ack.product_photo_path||ack.evidence_photo_path;
                if(ackPath!==operation.payload.product_photo_path || (legacyTwoPhoto&&ack.expiry_photo_path!==operation.payload.expiry_photo_path) || row?.pharmacy_id!==operation.pharmacyId || row?.review_id!==ack.review_id || Object.entries(operation.payload).some(([key,value])=>row[key]!==value))throw new Error('Review read contract mismatch — draft retained');
            }
            return ack;
        };
        let reserved;
        try{reserved=unwrap(await rpc('reserve_pharmflow_expiry_capture_v1',params));}
        catch(error){
            // Reservation cannot write inventory. Reusing this operation ID
            // is safe even if its response was lost.
            error.expiryOutcome='preflight';throw error;
        }
        guard();
        if(reserved?.operation_id!==operation.id || !['RESERVED','COMMITTED'].includes(reserved.status))throw new Error('Expiry backend incompatible — draft retained');
        if(reserved.status==='COMMITTED'){
            if(!operation.payload)throw new Error('Unreconciled operation — capture retained');
            let result;
            try{
                result=await rpc('save_pharmflow_expiry_capture_v3',{...params,p_capture:operation.payload});guard();
            }catch(error){throw classifySaveFailure(error);}
            try{return await finish(result);}catch(error){error.expiryOutcome='uncertain';error.uncertain=true;throw error;}
        }
        if(!operation.payload){
            if(payload.kind==='UNKNOWN'){
                const legacyTwoPhoto=!!photos?.product && !!photos?.expiry;
                const photoRoles=legacyTwoPhoto?['product','expiry']:['evidence'];
                const evidenceFile=photos?.evidence||photos?.product;
                for(const role of photoRoles){
                    guard();const file=photos[role];
                    const selected=role==='evidence'?evidenceFile:file;
                    if(!(selected instanceof Blob) || !selected.size || selected.size>5*1024*1024 || !['image/jpeg','image/png','image/webp'].includes(selected.type))throw new Error('One valid review photo is required');
                    if(!operation.uploaded?.[role]){
                        const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[selected.type];
                        const storageRole=role==='evidence'?'product':role;
                        const path=`${operation.pharmacyId}/expiry-v1/${operation.id}/${storageRole}/${uuid()}.${ext}`;
                        // Each uncertain upload retry gets a fresh immutable object, never upsert.
                        await upload(path,selected);guard();
                        operation.uploaded={...operation.uploaded,[role]:path};await persist('DRAFT');
                    }
                }
                payload={...payload,product_photo_path:operation.uploaded.evidence||operation.uploaded.product,...(legacyTwoPhoto?{expiry_photo_path:operation.uploaded.expiry}:{})};
            }
            operation.payload=structuredClone(payload);await persist('DRAFT');
        }
        guard();await persist('SENDING');guard();
        let result;
        try{result=await rpc('save_pharmflow_expiry_capture_v3',{...params,p_capture:operation.payload});guard();}
        catch(error){throw classifySaveFailure(error);}
        try{return await finish(result);}catch(error){error.expiryOutcome='uncertain';error.uncertain=true;throw error;}
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
