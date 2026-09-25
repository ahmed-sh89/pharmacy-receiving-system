"use strict";

/* =====================================================
   PHARMFLOW PHASE 2C.1 — ORDER LIFECYCLE REGISTRY
   Uploaded -> Received. Global GTIN is deliberately separate.
===================================================== */

const OrderLifecycleEngine={initialized:false,records:[]};

function initializeOrderLifecycle(){
    if(OrderLifecycleEngine.initialized){return;}
    OrderLifecycleEngine.initialized=true;
    AppEvents.on("files:updated",renderOrderLifecycleRegistry);
    AppEvents.on("archive:updated",renderOrderLifecycleRegistry);
    const deleteMasterButton=document.getElementById("btnDeleteGlobalGTIN");
    if(deleteMasterButton && deleteMasterButton.dataset.bound!=="1"){
        deleteMasterButton.dataset.bound="1";
        deleteMasterButton.addEventListener("click",requestDeleteGlobalGTINMaster);
    }
    setTimeout(()=>{refreshOrderLifecycleRegistry().catch(()=>{});},250);
}

function normalizeOrderNumber(value){
    return toSafeString(value).trim().toUpperCase().replace(/\s+/g,"");
}

function normalizeOrderDateValue(value){
    if(value===null||value===undefined||value===""){return "";}
    if(value instanceof Date && !Number.isNaN(value.getTime())){return value.toISOString().slice(0,10);}
    if(typeof value==="number" && Number.isFinite(value) && typeof XLSX!=="undefined" && XLSX.SSF){
        const d=XLSX.SSF.parse_date_code(value);
        if(d){return String(d.y).padStart(4,"0")+"-"+String(d.m).padStart(2,"0")+"-"+String(d.d).padStart(2,"0");}
    }
    const text=toSafeString(value).trim();
    const m=text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if(m){
        let year=Number(m[3]); if(year<100){year+=2000;}
        /* Pharmacy source files use M/D/YYYY, e.g. 8/3/2026. */
        return String(year).padStart(4,"0")+"-"+String(Number(m[1])).padStart(2,"0")+"-"+String(Number(m[2])).padStart(2,"0");
    }
    const parsed=new Date(text);
    return Number.isNaN(parsed.getTime())?text:parsed.toISOString().slice(0,10);
}

function extractDocumentField(matrix,aliases){
    const wanted=new Set((aliases||[]).map(normalizeExcelHeader));
    const limit=Math.min(matrix.length,30);
    for(let r=0;r<limit;r++){
        const row=matrix[r]||[];
        for(let c=0;c<row.length;c++){
            if(!wanted.has(normalizeExcelHeader(row[c]))){continue;}
            for(let n=c+1;n<row.length;n++){
                if(row[n]!==null&&row[n]!==undefined&&toSafeString(row[n]).trim()!==""){return row[n];}
            }
            if(r+1<matrix.length && matrix[r+1] && matrix[r+1][c]!==undefined){return matrix[r+1][c];}
        }
    }
    return "";
}

async function inspectOrderFileMetadata(file){
    const workbook=await readExcelWorkbook(file);
    const meta={orderNumber:"",orderDate:"",fromWarehouse:"",toWarehouse:"",fileName:file.name};
    for(const sheetName of workbook.SheetNames){
        const matrix=worksheetToMatrix(workbook.Sheets[sheetName]);
        if(!matrix.length){continue;}
        if(!meta.orderNumber){meta.orderNumber=normalizeOrderNumber(extractDocumentId(matrix,["to number","transfer id","transfer number","order number","order id"]));}
        if(!meta.orderDate){meta.orderDate=normalizeOrderDateValue(extractDocumentField(matrix,["receiving date","receiveing date","order date","transfer date","approval date","approved date"]));}
        if(!meta.fromWarehouse){meta.fromWarehouse=toSafeString(extractDocumentField(matrix,["from warehouse","source warehouse","from location"])).trim();}
        if(!meta.toWarehouse){meta.toWarehouse=toSafeString(extractDocumentField(matrix,["to warehouse","destination warehouse","to location"])).trim();}
    }
    if(!meta.orderNumber){throw new Error("Order Number could not be detected in "+file.name);}
    return meta;
}

async function getOrderLifecycleRecord(orderNumber){
    if(typeof authRpc!=="function"||typeof AuthState==="undefined"||!AuthState.context||!AuthState.context.pharmacy_id){return null;}
    const result=await authRpc("get_pharmflow_order",{p_pharmacy_id:AuthState.context.pharmacy_id,p_order_number:normalizeOrderNumber(orderNumber)});
    const row=Array.isArray(result)?result[0]:result;
    return row||null;
}

async function assertOrderNumberCanUpload(orderNumber){
    const normalized = normalizeOrderNumber(orderNumber);
    const existing = await getOrderLifecycleRecord(normalized);
    if(!existing){ return true; }

    const status = String(existing.status || "uploaded").trim().toLowerCase();

    /* B10 Clean 6 — completed-order recovery.
       A completed order is still protected by default, but an accidental
       Complete Receiving must not trap the pharmacy permanently. Reopening
       is an explicit destructive recovery action: remove only this order's
       finalized/history record, then allow the uploaded source file to start
       a brand-new Receiving cycle at zero. Global GTIN, other orders and
       Item Movement remain independent and untouched. */
    if(["received","finalized","closed"].includes(status)){
        const reopen = window.confirm(
            "Order "+normalized+" was already completed.\n\n"+
            "If Complete Receiving was done by mistake, you can reopen this order and start Receiving again from zero.\n\n"+
            "The previous Receiving history and discrepancy report for THIS order will be permanently removed. Global GTIN and other orders are not affected.\n\n"+
            "Press OK to Reopen Receiving, or Cancel to keep the completed order protected."
        );

        if(!reopen){
            throw new Error(
                "Order "+normalized+" is already completed. Duplicate upload remains blocked."
            );
        }

        const typed = window.prompt(
            "Type the Order Number exactly to reopen Receiving:\n"+normalized,
            ""
        );
        if(normalizeOrderNumber(typed)!==normalized){
            throw new Error("Reopen Receiving cancelled. Completed order remains protected.");
        }

        if(typeof authRpc!=="function" || !AuthState.context?.pharmacy_id){
            throw new Error("Pharmacy cloud context is unavailable. Sign in again and retry.");
        }

        await authRpc("delete_pharmflow_order_complete",{
            p_pharmacy_id:AuthState.context.pharmacy_id,
            p_order_number:normalized,
            p_confirmation:normalized
        });

        /* Cloud is authoritative. Re-read both historical archive and lifecycle
           before allowing the upload to continue. Never rely on stale browser
           state after a destructive recovery operation. */
        if(typeof restoreHistoricalArchive==="function"){
            await restoreHistoricalArchive();
        }
        await refreshOrderLifecycleRegistry();

        const remaining = await getOrderLifecycleRecord(normalized);
        if(remaining){
            throw new Error(
                "The completed order could not be reopened safely because its cloud lifecycle record still exists. No new upload was started."
            );
        }

        showToast(
            "Order "+normalized+" reopened — Receiving will start again from zero",
            "success",
            9000
        );
        return true;
    }

    /* Phase 2C.5.4.5 legacy orphan recovery. Older builds could clear a
       browser workspace but leave an UPLOADED/RECEIVING registry row in
       Supabase. Do not silently delete it because another PC may genuinely
       be working on that order. Offer an explicit protected discard instead. */
    const localNumbers = new Set(
        (Array.isArray(AppState?.workspace?.orderFiles) ? AppState.workspace.orderFiles : [])
            .map(file=>normalizeOrderNumber(file?.documentId || file?.orderNumber || ""))
            .filter(Boolean)
    );

    if(!localNumbers.has(normalized)){
        const repair = window.confirm(
            "Order "+normalized+" is registered as an unfinished active order (status: "+(existing.status||"uploaded")+").\n\n"+
            "This can be a previous workspace that was closed before Finalize, or an order currently open on another PC.\n\n"+
            "Press OK only if you want to DISCARD the old unfinished order and upload it again from the beginning."
        );

        if(repair){
            const typed = window.prompt(
                "Type the Order Number exactly to discard the unfinished registration:\n"+normalized,
                ""
            );
            if(normalizeOrderNumber(typed) !== normalized){
                throw new Error("Order discard cancelled. Existing active order remains protected.");
            }

            if(typeof authRpc!=="function" || !AuthState.context?.pharmacy_id){
                throw new Error("Pharmacy cloud context is unavailable. Sign in again and retry.");
            }

            await authRpc("discard_pharmflow_active_order",{
                p_pharmacy_id:AuthState.context.pharmacy_id,
                p_order_number:normalized,
                p_confirmation:normalized
            });
            await refreshOrderLifecycleRegistry();
            showToast("Old unfinished order discarded — upload can continue","success");
            return true;
        }
    }

    throw new Error(
        "Order "+normalized+" is already active (status: "+(existing.status||"uploaded")+"). Duplicate upload is blocked."
    );
}

async function registerUploadedOrder(meta,rowCount){
    if(typeof authRpc!=="function"||!AuthState.context||!AuthState.context.pharmacy_id){return null;}
    const result=await authRpc("register_pharmflow_order_upload",{
        p_pharmacy_id:AuthState.context.pharmacy_id,
        p_order_number:normalizeOrderNumber(meta.orderNumber),
        p_order_date:meta.orderDate||null,
        p_from_warehouse:meta.fromWarehouse||"",
        p_to_warehouse:meta.toWarehouse||"",
        p_source_file:meta.fileName||"",
        p_item_count:Number(rowCount||0)
    });
    await refreshOrderLifecycleRegistry();
    return result;
}

async function markWorkspaceOrdersReceived(orderNumbers){
    const wanted=new Set((orderNumbers||[]).map(normalizeOrderNumber).filter(Boolean));
    if(!wanted.size){throw new Error("A single selected Order Number is required for Finalize");}
    for(const orderNumber of wanted){
        await authRpc("finalize_pharmflow_order",{
            p_pharmacy_id:AuthState.context.pharmacy_id,
            p_order_number:orderNumber
        });
    }
    await refreshOrderLifecycleRegistry();
    return true;
}

async function refreshOrderLifecycleRegistry(){
    if(typeof authRpc!=="function"||typeof AuthState==="undefined"||!AuthState.context||!AuthState.context.pharmacy_id){return [];}
    try{
        const result=await authRpc("list_pharmflow_orders",{p_pharmacy_id:AuthState.context.pharmacy_id});
        OrderLifecycleEngine.records=Array.isArray(result)?result:[];
        renderOrderLifecycleRegistry();
        return OrderLifecycleEngine.records;
    }catch(error){Logger.warn("Order registry refresh failed",error);return [];}
}

function renderOrderLifecycleRegistry(){
    const host=document.getElementById("orderLifecycleTableBody");
    if(!host){return;}
    const rows=OrderLifecycleEngine.records||[];
    host.innerHTML=rows.length?rows.map(row=>{
        const received=String(row.status||"").toLowerCase()==="received";
        return `<tr><td>${escapeHTML(row.order_number||"")}</td><td>${escapeHTML(row.order_date||"-")}</td><td>${escapeHTML(row.from_warehouse||"-")}</td><td>${escapeHTML(row.to_warehouse||"-")}</td><td><span class="statusBadge ${received?"statusCompleted":"statusReceiving"}">${received?"Received":"Uploaded"}</span></td><td>${received?"Available":"Locked until received"}</td></tr>`;
    }).join(""):`<tr><td colspan="6" class="emptyState">No registered orders.</td></tr>`;
}

function canGenerateItemTransferReport(orderNumber){
    const key=normalizeOrderNumber(orderNumber);
    const record=(OrderLifecycleEngine.records||[]).find(x=>normalizeOrderNumber(x.order_number)===key);
    return !!record && String(record.status||"").toLowerCase()==="received";
}

window.initializeOrderLifecycle=initializeOrderLifecycle;
window.inspectOrderFileMetadata=inspectOrderFileMetadata;
window.assertOrderNumberCanUpload=assertOrderNumberCanUpload;
window.registerUploadedOrder=registerUploadedOrder;
window.markWorkspaceOrdersReceived=markWorkspaceOrdersReceived;
window.refreshOrderLifecycleRegistry=refreshOrderLifecycleRegistry;
window.canGenerateItemTransferReport=canGenerateItemTransferReport;

async function requestDeleteGlobalGTINMaster(){
    if(!AuthState.context || !AuthState.context.pharmacy_id){
        showToast("Pharmacy ADMIN context is required","error"); return false;
    }
    const first=window.confirm("GLOBAL GTIN MASTER will be deleted for this pharmacy. Current/Historical Orders will NOT be deleted. Continue?");
    if(!first){return false;}
    const phrase=window.prompt('Type DELETE GLOBAL GTIN to continue:');
    if(phrase!=="DELETE GLOBAL GTIN"){showToast("Global GTIN deletion cancelled","warning");return false;}
    const finalCheck=window.confirm("FINAL CONFIRMATION: delete the complete Global GTIN Master now?");
    if(!finalCheck){return false;}
    showLoading("Deleting Global GTIN Master...");
    try{
        await authRpc("delete_pharmacy_master_gtin",{p_pharmacy_id:AuthState.context.pharmacy_id,p_confirmation:"DELETE GLOBAL GTIN"});
        if(typeof syncGlobalMasterGTINFromCloud==="function"){
            await syncGlobalMasterGTINFromCloud({force:true,allowEmpty:true});
        }
        if(typeof refreshMasterGTINUI==="function"){refreshMasterGTINUI();}
        showToast("Global GTIN Master deleted","success");
        return true;
    }catch(error){
        Logger.error("Global GTIN deletion failed",error);
        showToast(error.message||"Unable to delete Global GTIN Master","error");
        return false;
    }finally{hideLoading();}
}
window.requestDeleteGlobalGTINMaster=requestDeleteGlobalGTINMaster;


/* =====================================================
   PHARMFLOW PHASE 2C.2 — ORIGINAL ORDER SOURCE SNAPSHOT
   The uploaded order is authoritative for business reports.
   Receiving/scanning data remains operational verification only.
===================================================== */

async function saveOriginalUploadedOrderSnapshot(orderNumber, rows){
    if(!AuthState.context || !AuthState.context.pharmacy_id){
        throw new Error("Pharmacy context is required to save the original order snapshot");
    }
    const cleanRows=(rows||[]).map((row,index)=>(
        {
            line_no:index+1,
            item_code:normalizeItemCode(row.itemCode),
            item_name:toSafeString(row.itemName),
            ordered_qty:Number(row.orderedQty||0),
            group_name:toSafeString(row.group_name||row.groupName||""),
            category:toSafeString(row.category||""),
            sub_category:toSafeString(row.sub_category||row.subCategory||""),
            source_sheet:toSafeString(row.sourceSheet||""),
            source_row:Number(row.sourceRow||0)
        }
    )).filter(row=>row.item_code && Number.isFinite(row.ordered_qty) && row.ordered_qty>0);

    if(!cleanRows.length){throw new Error("Original order snapshot contains no valid rows");}

    const batchSize=500;
    for(let start=0;start<cleanRows.length;start+=batchSize){
        const params={p_pharmacy_id:AuthState.context.pharmacy_id,p_order_number:normalizeOrderNumber(orderNumber),p_items:cleanRows.slice(start,start+batchSize),p_replace:start===0};
        try{await authRpc("save_pharmflow_order_source_items_v2",params);}
        catch(error){const message=String(error?.message||"");if(/PGRST202|save_pharmflow_order_source_items_v2.*(does not exist|schema cache)/i.test(message))await authRpc("save_pharmflow_order_source_items",params);else throw error;}
    }
    return cleanRows.length;
}

async function getOriginalUploadedOrderSnapshot(orderNumber){
    if(!AuthState.context || !AuthState.context.pharmacy_id){return [];}
    const params={p_pharmacy_id:AuthState.context.pharmacy_id,p_order_number:normalizeOrderNumber(orderNumber)};
    let result;try{result=await authRpc("get_pharmflow_order_source_items_v2",params);}
    catch(error){const message=String(error?.message||"");if(/PGRST202|get_pharmflow_order_source_items_v2.*(does not exist|schema cache)/i.test(message))result=await authRpc("get_pharmflow_order_source_items",params);else throw error;}
    return Array.isArray(result)?result:[];
}

/* Future Item Transfer/business reports MUST call this source instead of
   AppState.workspace.orderData, because workspace quantities are mutable
   during receiving. */
window.saveOriginalUploadedOrderSnapshot=saveOriginalUploadedOrderSnapshot;
window.getOriginalUploadedOrderSnapshot=getOriginalUploadedOrderSnapshot;


/* =====================================================
   PHARMFLOW PHASE 2C.4 — MANUAL FINALIZE RECEIVING
   Finalization is always an explicit user action. It never depends on
   ordered/received quantity equality. Official order data remains the
   immutable uploaded source snapshot.
===================================================== */

const FinalizeReceivingEngine={busy:false};

function getWorkspaceOrderNumbers(){
    const seen=new Set();
    const numbers=[];
    (AppState.workspace.orderFiles||[]).forEach(file=>{
        const value=normalizeOrderNumber(file.documentId||file.orderNumber||"");
        if(value && !seen.has(value)){ seen.add(value); numbers.push(value); }
    });
    return numbers;
}

function getFinalizeReceivingSummary({allOrders=false}={}){
    const allOrderNumbers=getWorkspaceOrderNumbers();
    const selectedOrders=
        typeof getSelectedReceivingOrderNumbers==="function"
            ? getSelectedReceivingOrderNumbers()
            : [];
    const orderNumbers=allOrders
        ? allOrderNumbers
        : (selectedOrders.length===1
            ? allOrderNumbers.filter(n=>n===selectedOrders[0])
            : []);
    let report=null;
    if(typeof buildReceivingDiscrepancyReport === "function"){
        report=buildReceivingDiscrepancyReport({visibleOnly:false});
    }
    return {
        orderNumbers,
        totalItems:Array.isArray(AppState.workspace.orderData)?AppState.workspace.orderData.length:0,
        discrepancies:report?Number(report.totalDiscrepancies||0):0,
        shortages:report?Number(report.shortageItems||0):0,
        over:report?Number(report.overItems||0):0,
        manual:report?Number(report.manualExtraItems||0):0
    };
}

async function repairMissingOrderRegistryFromWorkspace(orderNumbers){
    const wanted=new Set((orderNumbers||[]).map(normalizeOrderNumber).filter(Boolean));
    if(!wanted.size){ return []; }

    const files=Array.isArray(AppState.workspace.orderFiles)?AppState.workspace.orderFiles:[];
    const repaired=[];

    for(const orderNumber of wanted){
        const fileRecord=files.find(file=>
            normalizeOrderNumber(file.documentId||file.orderNumber||"")===orderNumber
        );

        if(!fileRecord){
            continue;
        }

        const meta={
            orderNumber,
            orderDate:toSafeString(fileRecord.orderDate||""),
            fromWarehouse:toSafeString(fileRecord.fromWarehouse||""),
            toWarehouse:toSafeString(fileRecord.toWarehouse||""),
            fileName:toSafeString(fileRecord.name||"")
        };

        try{
            await registerUploadedOrder(meta,Number(fileRecord.rows||0));
            repaired.push(orderNumber);
        }catch(error){
            /* Another device may have registered it between validation calls.
               Re-check before deciding this is a real failure. */
            const existing=await getOrderLifecycleRecord(orderNumber).catch(()=>null);
            if(existing){
                repaired.push(orderNumber);
                continue;
            }
            throw error;
        }
    }

    if(repaired.length){
        await refreshOrderLifecycleRegistry();
    }
    return repaired;
}

async function validateWorkspaceCanFinalize(options={}){
    const summary=getFinalizeReceivingSummary(options);
    if(summary.totalItems<=0){
        throw new Error("No receiving order is loaded");
    }
    if(!summary.orderNumbers.length){
        throw new Error("No registered Order Number was found in the current workspace");
    }

    await refreshOrderLifecycleRegistry();
    let records=OrderLifecycleEngine.records||[];
    const received=[];
    let missing=[];
    summary.orderNumbers.forEach(number=>{
        const record=records.find(row=>normalizeOrderNumber(row.order_number)===number);
        if(!record){ missing.push(number); return; }
        if(String(record.status||"").toLowerCase()==="received"){ received.push(number); }
    });

    /* Compatibility repair for an order that was already loaded before the
       persistent Order Registry was introduced. This does not change receiving
       quantities or the immutable uploaded-order source snapshot. */
    if(missing.length){
        await repairMissingOrderRegistryFromWorkspace(missing);
        records=OrderLifecycleEngine.records||[];
        missing=summary.orderNumbers.filter(number=>
            !records.some(row=>normalizeOrderNumber(row.order_number)===number)
        );
    }

    if(missing.length){
        throw new Error("Order registry could not be restored for: "+missing.join(", "));
    }
    if(received.length){
        throw new Error("Already received/finalized: "+received.join(", "));
    }
    if(typeof nrV2List==="function"){
        const pending=[];
        try{
            const rows=await nrV2List("RECEIVING",null);
            const selected=new Set(summary.orderNumbers.map(normalizeOrderNumber));
            (Array.isArray(rows)?rows:[]).forEach(row=>{
                const order=normalizeOrderNumber(row?.order_number||"");
                if(!order || selected.has(order)) pending.push(row);
            });
        }catch(error){
            throw new Error("Needs Review could not be verified. Complete Receiving was blocked for safety.");
        }
        if(pending.length){
            throw new Error("Resolve Needs Review before Complete Receiving ("+pending.length+" pending scan"+(pending.length===1?"":"s")+").");
        }
    }
    return summary;
}

function refreshFinalizeReceivingButton(){
    const button=document.getElementById("btnFinalizeReceiving");
    const completeAll=document.getElementById("btnCompleteAllReceiving");
    if(!button&&!completeAll){ return; }
    const hasOrder=!!(AppState.workspace && Array.isArray(AppState.workspace.orderData) && AppState.workspace.orderData.length);
    const active=getWorkspaceOrderNumbers();
    const selectedOrders=
        typeof getSelectedReceivingOrderNumbers==="function"
            ? getSelectedReceivingOrderNumbers()
            : [];
    const needsSpecificOrder=
        active.length>1 && selectedOrders.length!==1;
    if(button){
        button.disabled=!hasOrder||FinalizeReceivingEngine.busy||needsSpecificOrder;
        button.title=needsSpecificOrder?"Select one order before Receive Order":"";
        button.textContent=FinalizeReceivingEngine.busy?"Receiving…":"✓ Receive Order";
    }
    if(completeAll){
        completeAll.disabled=!hasOrder||FinalizeReceivingEngine.busy||active.length<2;
        completeAll.title=active.length<2?"Load more than one active Order to complete all":"";
        completeAll.textContent=FinalizeReceivingEngine.busy?"Receiving…":"Receive All";
    }
}

function requestFinalizeReceiving({allOrders=false}={}){
    if(FinalizeReceivingEngine.busy){ return; }
    validateWorkspaceCanFinalize({allOrders}).then(summary=>{
        const orders=summary.orderNumbers.join(", ");
        const message=[
            "Complete receiving for: "+orders+".",
            "This confirms the physical count is finished even when quantities do not match.",
            "Discrepancies: "+summary.discrepancies+" (Shortage "+summary.shortages+", Over "+summary.over+", Manual "+summary.manual+").",
            "The order number, order date, completion time and any discrepancy report will be retained. The active receiving workspace for this order will then be cleared."
        ].join(" ");
        showConfirmModal(allOrders?"Complete All Active Orders":"Complete Receiving",message,function(){
            finalizeCurrentReceiving({allOrders}).catch(()=>{});
        });
    }).catch(error=>{
        Logger.warn("Finalize validation failed",error);
        showToast(error.message||"Unable to finalize this receiving order","warning");
    });
}

async function finalizeCurrentReceiving({allOrders=false}={}){
    if(FinalizeReceivingEngine.busy){ return false; }
    FinalizeReceivingEngine.busy=true;
    refreshFinalizeReceivingButton();
    showLoading("Completing receiving…");
    try{
        const summary=await validateWorkspaceCanFinalize({allOrders});

        const finalizedFullReceivingReport =
            typeof buildLiveReceivingReport==="function"
                ? buildLiveReceivingReport()
                : null;

        const finalizedDiscrepancyReport =
            typeof buildReceivingEmailDifferencesReport==="function"
                ? buildReceivingEmailDifferencesReport(finalizedFullReceivingReport)
                : (
                    typeof buildReceivingDiscrepancyReport==="function"
                        ? buildReceivingDiscrepancyReport({visibleOnly:false})
                        : null
                );

        /* Both snapshots are persisted into Archive.
           Full report = every item.
           Email report = every status except COMPLETED. */
        window.__pfFinalizedFullReceivingReport =
            finalizedFullReceivingReport
                ? JSON.parse(JSON.stringify(finalizedFullReceivingReport))
                : null;

        window.__pfFinalizedDiscrepancyReport =
            finalizedDiscrepancyReport
                ? JSON.parse(JSON.stringify(finalizedDiscrepancyReport))
                : null;

        /* A live PC session must be authoritatively ended before the workspace
           is archived, so a Handheld cannot continue adding local scans. */
        if(AppState.session && AppState.session.cloud===true && AppState.session.role==="PC"){
            if(typeof leaveCloudSession!=="function"){
                throw new Error("Shared session module is unavailable");
            }
            const ended=await leaveCloudSession();
            if(ended===false){
                throw new Error("Shared Handheld session could not be ended");
            }
        }

        await markWorkspaceOrdersReceived(summary.orderNumbers);

        if(typeof closeAndArchiveCurrentOrder!=="function"){
            throw new Error("Receiving archive module is unavailable");
        }
        /* Each selected Order remains an independent completion/archive unit.
           The old first-order-only call left the other finalized Orders in
           active workspace state.  Archive each order only after its server
           completion acknowledgement, and stop on the first failed archive. */
        for(const orderNumber of summary.orderNumbers){
            const archived=await closeAndArchiveCurrentOrder(orderNumber);
            if(!archived){
                throw new Error("Order "+orderNumber+" was marked Received but its receiving archive could not be completed. Do not scan this order again; refresh and retry archive recovery.");
            }
        }

        await refreshOrderLifecycleRegistry();

        /* 2C.10.7.0 — Finalize is a terminal Current Workspace transition.
           Archive is already durable at this point; force a clean no-active-order
           UI immediately instead of waiting for a later Reset/refresh. */
        refreshEntireUI?.();
        refreshFinalizeReceivingButton?.();

        /* Receiving review photos/drafts are temporary operational evidence.
           Once receiving is finalized they must not survive as orphaned storage. */
        if(typeof nrV2ClearReceivingQueue==="function"){
            await nrV2ClearReceivingQueue();
            refreshNeedsReviewCounters?.();
        }

        if(
            finalizedDiscrepancyReport &&
            Number(finalizedDiscrepancyReport.totalDiscrepancies||0)>0 &&
            typeof openFinalizedDiscrepancyEmailPreview==="function"
        ){
            setTimeout(
                ()=>openFinalizedDiscrepancyEmailPreview(finalizedDiscrepancyReport),
                120
            );
        }

        showToast(
            summary.orderNumbers.length>1
                ? summary.orderNumbers.length+" orders completed"
                : "Order "+summary.orderNumbers[0]+" completed",
            "success"
        );
        return true;
    }catch(error){
        Logger.error("Manual receiving finalization failed",error);
        showToast(error.message||"Unable to finalize receiving","error");
        return false;
    }finally{
        hideLoading();
        FinalizeReceivingEngine.busy=false;
        refreshFinalizeReceivingButton();

        setTimeout(()=>{
            try{
                window.__pfFinalizedDiscrepancyReport=null;
                window.__pfFinalizedFullReceivingReport=null;
            }catch(_){}
        },1500);
    }
}



function getEmailReportOrderGroups(report){
    if(
        Array.isArray(report?.orderGroups) &&
        report.orderGroups.length
    ){
        return report.orderGroups;
    }

    const orders=Array.isArray(report?.orders)?report.orders:[];
    const defaultMeta=orders[0]||{};

    return [{
        orderNumber:
            defaultMeta.orderNumber ||
            report?.orderId ||
            "",
        orderDate:
            defaultMeta.orderDate ||
            "",
        summary:{
            discrepancyItems:
                Array.isArray(report?.rows)
                    ? report.rows.length
                    : 0
        },
        rows:
            Array.isArray(report?.rows)
                ? report.rows
                : []
    }];
}

function buildFinalizedDiscrepancyEmailHTML(report){
    const esc=value=>String(value??"")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;");

    const groups=getEmailReportOrderGroups(report)
        .filter(group=>Array.isArray(group.rows) && group.rows.length);

    const formatOrderDate=value=>{
        const match=String(value||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if(!match) return String(value||"-");
        return `${match[3]} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(match[2])-1]} ${match[1]}`;
    };
    const summaryRows=groups.map(group=>`
      <tr>
        <td style="padding:9px 8px;border-bottom:1px solid #dce8f3;font-weight:700;color:#133d65">${esc(group.orderNumber||"-")}</td>
        <td style="padding:9px 8px;border-bottom:1px solid #dce8f3">${esc(formatOrderDate(group.orderDate))}</td>
        <td style="padding:9px 8px;border-bottom:1px solid #dce8f3;font-weight:800;color:#b42318">${esc(group.summary?.discrepancyItems??group.rows.length)}</td>
      </tr>`).join("");

    const sections=groups.map(group=>{
        const rows=group.rows;
        const orderHeading=`الطلبية ${group.orderNumber||"-"}`;
        return `
        <section dir="rtl" style="margin:22px 0 0;border:1px solid #b8d4e9;border-radius:10px;overflow:hidden;background:#edf6fc">
          <div style="padding:12px 16px;background:#0b5f9f;color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:700;text-align:center">${esc(orderHeading)}</div>
          <div style="padding:12px">
            <table dir="ltr" role="presentation" style="width:100%;border-collapse:collapse;table-layout:fixed;font-family:Arial,sans-serif;font-size:12px;color:#1d3954;border:1px solid #cbddea" cellpadding="0" cellspacing="0">
              <thead>
                <tr style="background:#dceefb;color:#103d66">
                  <th style="width:13%;padding:9px 6px;border-bottom:1px solid #b7d3e8;text-align:center;font-weight:800">Code</th>
                  <th style="width:43%;padding:9px 8px;border-bottom:1px solid #b7d3e8;text-align:left;font-weight:800">Item Name</th>
                  <th style="width:10%;padding:9px 5px;border-bottom:1px solid #b7d3e8;text-align:center;font-weight:800">Ordered</th>
                  <th style="width:10%;padding:9px 5px;border-bottom:1px solid #b7d3e8;text-align:center;font-weight:800">Received</th>
                  <th style="width:10%;padding:9px 5px;border-bottom:1px solid #b7d3e8;text-align:center;font-weight:800">Diff</th>
                  <th style="width:14%;padding:9px 5px;border-bottom:1px solid #b7d3e8;text-align:center;font-weight:800">Status</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((row,index)=>{
                    const diff=Number(row["Difference"]||0);
                    const status=String(row["Issue Type"]||row["Status"]||"");
                    const diffStyle=diff<0
                        ? "color:#b42318;background:#fff0ef"
                        : diff>0
                            ? "color:#9a6200;background:#fff5da"
                            : "color:#315b7e;background:#edf4fa";
                    return `
                    <tr style="background:${index%2?"#eaf4fb":"#f6fbff"}">
                      <td style="padding:9px 6px;border-bottom:1px solid #e1ebf3;text-align:center;white-space:nowrap">${esc(row["Item Number"]||"")}</td>
                      <td style="padding:9px 8px;border-bottom:1px solid #e1ebf3;text-align:left;overflow-wrap:anywhere">${esc(row["Item Name"]||"")}</td>
                      <td style="padding:9px 5px;border-bottom:1px solid #e1ebf3;text-align:center"><strong style="font-weight:800;color:#103d66">${esc(row["Ordered Qty"]??0)}</strong></td>
                      <td style="padding:9px 5px;border-bottom:1px solid #e1ebf3;text-align:center"><strong style="font-weight:800;color:#103d66">${esc(row["Received Qty"]??0)}</strong></td>
                      <td style="padding:9px 5px;border-bottom:1px solid #e1ebf3;text-align:center"><strong style="display:inline-block;min-width:28px;padding:3px 5px;border-radius:5px;font-weight:800;${diffStyle}">${diff>0?"+":""}${esc(diff)}</strong></td>
                      <td style="padding:9px 5px;border-bottom:1px solid #e1ebf3;text-align:center;font-weight:700">${esc(status)}</td>
                    </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
        </section>`;
    }).join("");

    return `
    <div dir="rtl" style="max-width:920px;margin:0 auto;padding:24px;background:#f2f7fb;font-family:Arial,sans-serif;color:#173d63;text-align:center">
      <div style="max-width:840px;margin:0 auto;padding:30px 28px;background:#eaf4fb;border:1px solid #b8d5e9;border-radius:14px;box-shadow:0 5px 18px rgba(23,61,99,.10)">
      <div style="padding:20px 18px;border:1px solid #97c3e3;border-radius:10px;background:#d5eaf8">
        <p style="margin:0;font-family:Arial,sans-serif;font-size:20px;line-height:2.05;font-weight:800;color:#173d63">الإخوة الكرام بالمستودع<br>تحية طيبة وبعد<br>يوجد فرق توريد موضح أدناه<br>نأمل التكرم بالمراجعة والتشييك</p>
      </div>
      <section style="margin:26px 0 0;border:1px solid #b8d4e9;border-radius:10px;overflow:hidden;background:#f5faff">
        <div style="padding:12px 14px;background:#0b6faf;color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:800">ملخص الطلبيات التي بها فروقات</div>
        <table dir="ltr" role="presentation" style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;color:#1d3954" cellpadding="0" cellspacing="0">
          <thead><tr style="background:#f1f8fe;color:#103d66"><th style="padding:9px 8px;border-bottom:1px solid #c7ddeb;font-weight:800">Order Number</th><th style="padding:9px 8px;border-bottom:1px solid #c7ddeb;font-weight:800">Order Date</th><th style="padding:9px 8px;border-bottom:1px solid #c7ddeb;font-weight:800">Discrepant Items</th></tr></thead>
          <tbody>${summaryRows}</tbody>
        </table>
      </section>
      ${sections}
      <div style="margin:26px 0 0;padding:14px 18px;border:1px solid #97c3e3;border-radius:10px;background:#d5eaf8;font-family:Arial,sans-serif;font-size:18px;line-height:1.8;font-weight:700;color:#173d63">خالص الشكر والتقدير</div>
      </div>
    </div>`;
}

async function copyFormattedReceivingEmail(report){
    const html=buildFinalizedDiscrepancyEmailHTML(report);
    const text=buildFinalizedDiscrepancyEmailText(report);

    if(
        navigator.clipboard &&
        typeof ClipboardItem!=="undefined" &&
        navigator.clipboard.write
    ){
        const item=new ClipboardItem({
            "text/html":new Blob([html],{type:"text/html"}),
            "text/plain":new Blob([text],{type:"text/plain"})
        });

        await navigator.clipboard.write([item]);
        return true;
    }

    await navigator.clipboard.writeText(text);
    return false;
}

window.buildFinalizedDiscrepancyEmailHTML=
    buildFinalizedDiscrepancyEmailHTML;
window.copyFormattedReceivingEmail=
    copyFormattedReceivingEmail;


function buildFinalizedDiscrepancyEmailText(report){
    const groups=getEmailReportOrderGroups(report)
        .filter(group=>Array.isArray(group.rows) && group.rows.length);

    const lines=[
        "الإخوة الكرام بالمستودع،",
        "تحية طيبة وبعد،",
        "يوجد فرق توريد موضح أدناه.",
        "نأمل التكرم بالمراجعة والتشييك.",
        ""
    ];

    lines.push("ملخص الطلبيات التي بها فروقات", "Order Number | Order Date | Discrepant Items");
    groups.forEach(group=>lines.push([
        group.orderNumber||"-",
        group.orderDate||"-",
        group.summary?.discrepancyItems??group.rows.length
    ].join(" | ")));
    lines.push("");

    groups.forEach(group=>{
        lines.push(
            "الطلبية "+(group.orderNumber||"-")+" | التاريخ "+(group.orderDate||"-"),
            "",
            "Item Code | Item Name | Ordered | Received | Difference | Status"
        );

        group.rows.forEach(row=>{
            const diff=Number(row["Difference"]||0);
            lines.push([
                row["Item Number"]||"",
                row["Item Name"]||"",
                row["Ordered Qty"]??0,
                row["Received Qty"]??0,
                (diff>0?"+":"")+diff,
                row["Issue Type"]||row["Status"]||""
            ].join(" | "));
        });

        lines.push("");
    });
    lines.push("خالص الشكر والتقدير.");
    return lines.join("\r\n");
}

function buildGmailComposeUrl({to="",subject="",body=""}={}){
    const base="https://mail.google.com/mail/u/0/";
    const params=new URLSearchParams({
        fs:"1",
        tf:"cm",
        to:String(to||""),
        su:String(subject||""),
        body:String(body||"")
    });
    return base+"?"+params.toString();
}

function openGmailComposeSafely({to="",subject="",body=""}={}){
    const fullBody=String(body||"");
    let gmailBody=fullBody;

    /* Extremely long compose URLs can produce a blank browser tab.
       Keep Gmail transport safe while the complete professional report
       always remains stored in PharmFlow Archive. */
    if(encodeURIComponent(gmailBody).length>11000){
        const lines=gmailBody.split(/\r?\n/);
        gmailBody=lines.slice(0,45).join("\r\n")+
            "\r\n\r\n[The full discrepancy report is saved in PharmFlow Archive.]";
    }

    const url=buildGmailComposeUrl({to,subject,body:gmailBody});

    try{
        const popup=window.open("about:blank","_blank");
        if(!popup){
            throw new Error("Popup blocked");
        }

        popup.opener=null;
        popup.location.replace(url);

        setTimeout(()=>{
            try{
                if(popup && popup.location && popup.location.href==="about:blank"){
                    popup.location.href=url;
                }
            }catch(_){}
        },180);

        return true;
    }catch(error){
        try{
            window.location.href="mailto:"+encodeURIComponent(to)+
                "?subject="+encodeURIComponent(subject)+
                "&body="+encodeURIComponent(gmailBody);
            return true;
        }catch(_){
            return false;
        }
    }
}

function openFinalizedDiscrepancyEmailPreview(report,options={}){
    document.getElementById("finalizedEmailPreviewOverlay")?.remove();

    const esc=v=>typeof escapeHTML==="function"
        ? escapeHTML(String(v??""))
        : String(v??"");

    const orders=Array.isArray(report?.orders)?report.orders:[];
    const orderLabel=orders.map(x=>x.orderNumber).filter(Boolean).join(" + ") || report?.orderId || "";
    const reportGroups=getEmailReportOrderGroups(report)
        .filter(group=>Array.isArray(group.rows) && group.rows.length);

    const subject=`فرق توريد — ${orderLabel||"-"}`;
    const rows=Array.isArray(report?.rows)?report.rows:[];

    const overlay=document.createElement("div");
    overlay.id="finalizedEmailPreviewOverlay";
    overlay.className="finalizedEmailPreviewOverlay";

    overlay.innerHTML=`
      <button class="finalizedEmailScrim" type="button" data-close aria-label="Close"></button>

      <aside class="finalizedEmailPanel" role="dialog" aria-modal="true" aria-label="Supply discrepancy report">
        <header class="finalizedEmailHeader">
          <div>
            <span class="finalizedEmailKicker">${options.fromArchive?"SAVED REPORT":(options.liveReport?"LIVE RECEIVING REPORT":"ORDER FINALIZED")}</span>
            <h2>${esc(subject)}</h2>
          </div>

          <button type="button" class="finalizedEmailClose" data-close aria-label="Close">✕</button>
        </header>

        <section class="finalizedEmailCompose">
          <label>
            <span>To</span>
            <input id="finalizedEmailTo" type="email" placeholder="warehouse@example.com" autocomplete="email">
          </label>
        </section>

        <article class="finalizedEmailLetter">
          <div class="finalizedEmailRichPreview" dir="ltr">
            ${buildFinalizedDiscrepancyEmailHTML(report)}
          </div>
        </article>

        <footer class="finalizedEmailFooter">
          <div class="finalizedEmailActions">
            <button type="button" class="secondaryButton" id="btnCopyFinalizedEmail">Copy Email</button>
            <button type="button" class="primaryButton" id="btnOpenFinalizedGmail">Open in Gmail</button>
          </div>
        </footer>
      </aside>`;

    document.body.appendChild(overlay);

    overlay.querySelectorAll("[data-close]").forEach(button=>{
        button.onclick=()=>overlay.remove();
    });

    document.getElementById("btnCopyFinalizedEmail")?.addEventListener("click",async()=>{
        try{
            const rich=await copyFormattedReceivingEmail(report);
            showToast?.(
                rich
                    ? "Formatted email copied"
                    : "Email text copied",
                "success"
            );
        }catch(_){
            showToast?.("Unable to copy email","warning");
        }
    });

    document.getElementById("btnOpenFinalizedGmail")?.addEventListener("click",async()=>{
        const to=String(
            document.getElementById("finalizedEmailTo")?.value||""
        ).trim();

        try{
            await copyFormattedReceivingEmail(report);
        }catch(_){}

        /* Gmail compose URLs cannot inject a reliable HTML table.
           Open the compose window cleanly after copying the rich report.
           One paste keeps the professional HTML design intact. */
        const opened=openGmailComposeSafely({
            to,
            subject,
            body:""
        });

        if(opened){
            showToast?.(
                "Formatted report copied — paste it into Gmail (Ctrl+V)",
                "success"
            );
        }else{
            showToast?.(
                "Gmail could not be opened. Use Copy Email instead.",
                "warning"
            );
        }
    });
}

window.openFinalizedDiscrepancyEmailPreview=openFinalizedDiscrepancyEmailPreview;

function bindFinalizeReceivingUI(){
    const button=document.getElementById("btnFinalizeReceiving");
    if(button && button.dataset.bound!=="1"){
        button.dataset.bound="1";
        button.addEventListener("click",requestFinalizeReceiving);
    }
    const completeAll=document.getElementById("btnCompleteAllReceiving");
    if(completeAll&&completeAll.dataset.bound!=="1"){
        completeAll.dataset.bound="1";
        completeAll.addEventListener("click",()=>requestFinalizeReceiving({allOrders:true}));
    }
    ["workspace:created","workspace:cleared","files:updated","receiving:updated","archive:updated"].forEach(eventName=>{
        try{ AppEvents.on(eventName,refreshFinalizeReceivingButton); }catch(_error){}
    });
    refreshFinalizeReceivingButton();
}

window.requestFinalizeReceiving=requestFinalizeReceiving;
window.requestFinalizeAllReceiving=()=>requestFinalizeReceiving({allOrders:true});
window.finalizeCurrentReceiving=finalizeCurrentReceiving;
window.refreshFinalizeReceivingButton=refreshFinalizeReceivingButton;
window.bindFinalizeReceivingUI=bindFinalizeReceivingUI;
window.repairMissingOrderRegistryFromWorkspace=repairMissingOrderRegistryFromWorkspace;

setTimeout(bindFinalizeReceivingUI,350);
