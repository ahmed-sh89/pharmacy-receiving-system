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

    /* Completed orders are historical, not active duplicate locks.
       Re-uploading the same Order Number starts a fresh Receiving cycle by
       using the existing server-authoritative complete-order cleanup path.
       Active/unfinished duplicate protection below remains unchanged. */
    if(["received","finalized","closed"].includes(status)){
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
        const repair = await pharmFlowConfirm({title:"Discard Unfinished Order?",message:"Order "+normalized+" is registered as an unfinished active order (status: "+(existing.status||"uploaded")+"). It may be open on another PC. Continue only to discard the old registration and upload again.",confirmText:"Discard Order",tone:"danger"});

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
    window.PharmFlowPermissions?.require("RECEIVING",true);
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
    window.PharmFlowPermissions?.require("GLOBAL",true);
    if(!AuthState.context || !AuthState.context.pharmacy_id){
        showToast("Pharmacy ADMIN context is required","error"); return false;
    }
    const first=await pharmFlowConfirm({title:"Delete Global GTIN Master?",message:"GLOBAL GTIN MASTER will be deleted for this pharmacy. Current/Historical Orders will NOT be deleted.",confirmText:"Continue",tone:"danger"});
    if(!first){return false;}
    const phrase=window.prompt('Type DELETE GLOBAL GTIN to continue:');
    if(phrase!=="DELETE GLOBAL GTIN"){showToast("Global GTIN deletion cancelled","warning");return false;}
    const finalCheck=await pharmFlowConfirm({title:"Final Confirmation",message:"Delete the complete Global GTIN Master now? This cannot be undone.",confirmText:"Delete Global Master",tone:"danger"});
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
    window.PharmFlowPermissions?.require("RECEIVING",true);
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

        /* Receiving History is the durable, lightweight completion authority.
           It records only the workspace summary, discrepancy rows and final NEW
           High Priority rows, then marks all selected Orders received atomically. */
        if(typeof finalizeReceivingWorkspaceWithHistory!=="function"){
            throw new Error("Receiving History module is unavailable");
        }
        await finalizeReceivingWorkspaceWithHistory(summary,finalizedDiscrepancyReport);

        if(allOrders){
            if(typeof closeAndArchiveAllCurrentOrders!=="function"){
                throw new Error("Receive All archive module is unavailable");
            }
            const archived=await closeAndArchiveAllCurrentOrders(summary.orderNumbers);
            if(!archived){
                throw new Error("Orders were marked Received but the Receive All archive transition could not be completed.");
            }
        }else{
            if(typeof closeAndArchiveCurrentOrder!=="function"){
                throw new Error("Receiving archive module is unavailable");
            }
            const orderNumber=summary.orderNumbers[0];
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

/* Presentation only: use the canonical report rows, never workspace totals or
   report.summary (which may include completed items). Detail rows retain order
   boundaries; each KPI counts a code once within its category across orders. */
function getReceivingEmailModel(report){
    const labels={partial:"Partial Shortage",notReceived:"Not Received",over:"Over Received",extra:"Extra Items"};
    const counts={orders:0,partial:0,notReceived:0,over:0,extra:0};
    const distinct={partial:new Set(),notReceived:new Set(),over:new Set(),extra:new Set()};
    const groups=getEmailReportOrderGroups(report).map((group,groupIndex)=>({
        ...group,
        rows:(group.rows||[]).flatMap((row,rowIndex)=>{
            const ordered=Number(row["Ordered Qty"]||0),received=Number(row["Received Qty"]||0);
            if(!Number.isFinite(ordered)||!Number.isFinite(received)) return [];
            const issue=String(row["Issue Type"]||row.Status||"").trim().toUpperCase();
            const extra=["EXTRA ITEM","EXTRA","UNORDERED","UNASSIGNED"].includes(issue)||ordered===0;
            const kind=extra&&received>0 ? "extra" : ordered>0&&received===0 ? "notReceived"
                : received>0&&received<ordered ? "partial" : received>ordered ? "over" : "";
            if(!kind) return [];
            const code=String(row["Item Number"]??"").trim().toUpperCase();
            distinct[kind].add(code||`missing:${groupIndex}:${rowIndex}`);
            const difference=Number(row["Difference"]);
            return [{...row,kind,label:kind==="extra"?"Extra":labels[kind],
                difference:Number.isFinite(difference)?difference:received-ordered}];
        })
    })).filter(group=>group.rows.length);
    const orderNumbers=[...new Set(groups.filter(g=>!g.unassigned)
        .map(g=>String(g.orderNumber||"").trim()).filter(n=>n&&!/^(UNASSIGNED|UNORDERED)$/i.test(n)))];
    counts.orders=orderNumbers.length;
    Object.keys(distinct).forEach(kind=>{counts[kind]=distinct[kind].size;});
    return {groups,orderNumbers,counts,labels:{orders:"Orders",...labels}};
}

function buildReceivingDiscrepancyEmailSubject(report){
    const model=getReceivingEmailModel(report),numbers=model.orderNumbers;
    const prefix="فرق توريد | ";
    if(numbers.length<3) return prefix+(numbers.join(" + ")||"Extra Items");
    // Prefer the latest affected order date; never an unrelated order or local date.
    const dates=model.groups.map(g=>String(g.orderDate||"").slice(0,10))
        .filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    const date=dates.at(-1)||String(report?.generatedAt||"").slice(0,10);
    const shortDate=/^\d{4}-\d{2}-\d{2}$/.test(date)?date.slice(8,10)+"-"+date.slice(5,7):"";
    return prefix+numbers[0]+" + "+(numbers.length-1)+" أخرى"+(shortDate?" | "+shortDate:"");
}

function buildFinalizedDiscrepancyEmailHTML(report){
    const esc=value=>String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;")
        .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const model=getReceivingEmailModel(report);
    const palette={
        orders:{ink:"#164e87",tint:"#eaf2fc"},partial:{ink:"#315d9b",tint:"#edf3fc"},
        notReceived:{ink:"#a12640",tint:"#fff0f3"},over:{ink:"#6546a4",tint:"#f3effb"},
        extra:{ink:"#116b77",tint:"#eaf7f8"}
    };
    // Redundant HTML attributes and explicit per-cell styles preserve essential
    // formatting when an email editor removes table CSS or inherited formatting.
    const font=(text,size=14,color="#183b62",bold=false)=>
        `<font face="Arial, Helvetica, sans-serif" size="${size>=24?5:size>=16?4:3}" color="${color}" style="font-family:Arial,Helvetica,sans-serif;font-size:${size}px;line-height:${size>=24?32:20}px;color:${color}">${bold?"<b>"+text+"</b>":text}</font>`;
    const tdStyle="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;text-align:center;vertical-align:middle;word-break:normal;";
    const th=(label,width="")=>`<th scope="col" align="center" valign="middle" bgcolor="#e7eff9" ${width?`width="${width}"`:""} style="${tdStyle}padding:4px 5px;background-color:#e7eff9;border-bottom:1px solid #ccdced;white-space:nowrap">${font(label,12,"#315779",true)}</th>`;
    const cell=(content,extra="")=>`<td align="center" valign="middle" style="${tdStyle}padding:6px 5px;${extra}">${content}</td>`;
    const nonzero=Object.entries(model.counts).filter(([,value])=>value>0);
    // Balanced centered table rows: 5 -> 3 + 2, 4 -> 2 + 2, 3 -> 3.
    // Each label can wrap at its space, never into vertical letters.
    const perRow=nonzero.length===4?2:Math.min(nonzero.length,3);
    const kpiRows=[];
    for(let i=0;i<nonzero.length;i+=perRow){
        const entries=nonzero.slice(i,i+perRow),width=Math.floor(100/entries.length);
        kpiRows.push(`<tr><td align="center" style="padding:3px 0;text-align:center"><table role="presentation" align="center" width="${entries.length===1?50:100}%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:${entries.length===1?50:100}%;table-layout:fixed"><tr>${entries.map(([key,value])=>{
            const {ink,tint}=palette[key];
            const label=model.labels[key].split(" ").map(word=>`<span style="white-space:nowrap">${word}</span>`).join(" ");
            return `<td align="center" valign="middle" width="${width}%" style="padding:0 3px;text-align:center"><table role="presentation" align="center" width="100%" border="1" bordercolor="#cbdbee" cellpadding="0" cellspacing="0" bgcolor="${tint}" style="width:100%;border-collapse:collapse;border:1px solid #cbdbee;background-color:${tint}"><tr><td align="center" bgcolor="${tint}" style="padding:8px 4px 0;text-align:center;background-color:${tint}">${font(value,28,ink,true)}</td></tr><tr><td align="center" bgcolor="${tint}" style="height:36px;padding:0 4px 7px;text-align:center;background-color:${tint}">${font(label,13,ink,true)}</td></tr></table></td>`;
        }).join("")}</tr></table></td></tr>`);
    }
    const summary=kpiRows.length?`<table role="presentation" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse"><tr><td align="center" style="padding:12px 4px 4px;text-align:center">${font("DISCREPANCY SUMMARY",12,"#315779",true)}</td></tr>${kpiRows.join("")}</table>`:"";
    const sections=model.groups.map(group=>{
        const rows=group.rows.map((row,index)=>{
            const {ink,tint}=palette[row.kind],bg=index%2?"#f3f7fc":"#ffffff";
            const diff=(row.difference>0?"+":"")+row.difference;
            // Only flow is hybrid. Inner tables, colors, borders, fonts and
            // alignment survive as regular email HTML even if display is stripped.
            return `<tr><td align="center" dir="ltr" bgcolor="${bg}" style="padding:0;text-align:center;font-size:0;background-color:${bg};border-bottom:1px solid #cbdbee">
              <div style="display:inline-block;vertical-align:middle;width:58%;min-width:280px;max-width:100%">
                <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="${bg}" dir="ltr" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:${bg}"><tr>${th("Code","86")}${th("Item Name")}</tr><tr>${cell(font(esc(row["Item Number"]),14,"#183b62",true),"width:86px;white-space:normal;overflow-wrap:break-word")}${cell(`<span dir="auto">${font(esc(row["Item Name"]),14,"#183b62",true)}</span>`,"white-space:normal;overflow-wrap:break-word")}</tr></table>
              </div><div style="display:inline-block;vertical-align:middle;width:42%;min-width:240px;max-width:100%">
                <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="${bg}" dir="ltr" style="width:100%;border-collapse:collapse;table-layout:auto;background-color:${bg}"><tr>${th("Ordered")}${th("Received")}${th("Diff + Status")}</tr><tr>${cell(font(esc(row["Ordered Qty"]??0),15,"#183b62",true),"white-space:nowrap")}${cell(font(esc(row["Received Qty"]??0),15,"#183b62",true),"white-space:nowrap")}<td align="center" valign="middle" bgcolor="${tint}" style="${tdStyle}padding:4px;background-color:${tint}">${font(diff,16,ink,true)}<br>${font(`<span style="white-space:nowrap">${row.label}</span>`,12,ink,true)}</td></tr></table>
              </div></td></tr>`;
        }).join("");
        return `<table role="presentation" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse"><tr><td align="center" height="12" style="height:12px;font-size:1px;line-height:12px">&nbsp;</td></tr></table><table role="presentation" align="center" width="100%" border="1" bordercolor="#cbdbee" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #cbdbee"><tr><td align="center" dir="ltr" bgcolor="#155d91" style="padding:9px 4px;text-align:center;background-color:#155d91;white-space:nowrap">${font(esc(group.orderNumber||"Extra / Unassigned")+" &nbsp;|&nbsp; "+esc(group.orderDate||"—"),14,"#ffffff",true)}</td></tr>${rows}</table>`;
    }).join("");
    const banner=(text,closing=false)=>`<table role="presentation" align="center" width="100%" border="1" bordercolor="#bdd3e9" cellpadding="0" cellspacing="0" bgcolor="#eaf2fc" style="width:100%;border-collapse:collapse;border:1px solid #bdd3e9;background-color:#eaf2fc"><tr><td align="center" dir="rtl" bgcolor="#eaf2fc" style="padding:${closing?10:14}px 8px;text-align:center;background-color:#eaf2fc">${font(text,16,"#173f6b",true)}</td></tr></table>`;
    return `<table role="presentation" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#ffffff" dir="rtl" style="width:100%;border-collapse:collapse;background-color:#ffffff;text-align:center"><tr><td align="center" style="padding:6px;text-align:center">
      ${banner("الإخوة الكرام بالمستودع<br>تحية طيبة وبعد<br>يوجد فرق توريد موضح أدناه<br>نأمل التكرم بالمراجعة والتشييك")}
      ${summary}${sections}
      <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td align="center" height="12" style="height:12px;font-size:1px;line-height:12px">&nbsp;</td></tr></table>
      ${banner("خالص الشكر والتقدير",true)}
      </td></tr></table>`;
}

function buildReceivingEmailClipboardHTML(report){
    return '<!doctype html><html><head><meta charset="utf-8"></head><body dir="rtl" bgcolor="#ffffff" style="margin:0;text-align:center"><!--StartFragment-->'+buildFinalizedDiscrepancyEmailHTML(report)+'<!--EndFragment--></body></html>';
}

function copyReceivingEmailWithNativeEvent(html,text){
    if(typeof document==="undefined"||typeof document.execCommand!=="function") return false;
    const selection=window.getSelection?.(),ranges=[];
    if(selection)for(let i=0;i<selection.rangeCount;i++)ranges.push(selection.getRangeAt(i).cloneRange());
    const focused=document.activeElement;
    let copied=false,host;
    const onCopy=event=>{
        if(!event.clipboardData)return;
        try{
            event.clipboardData.setData("text/html",html);
            event.clipboardData.setData("text/plain",text);
            event.preventDefault();
            event.stopImmediatePropagation();
            copied=true;
        }catch(_){copied=false;}
    };
    try{
        host=document.createElement("div");
        host.contentEditable="true";
        host.setAttribute("aria-hidden","true");
        host.style.cssText="position:fixed;left:-10000px;top:0;width:800px;background:white;";
        host.innerHTML=html;
        document.body.appendChild(host);
        const range=document.createRange();range.selectNodeContents(host);
        selection?.removeAllRanges();selection?.addRange(range);
        document.addEventListener("copy",onCopy,true);
        return document.execCommand("copy")===true&&copied;
    }catch(_){return false;}
    finally{
        document.removeEventListener("copy",onCopy,true);
        host?.remove();
        try{focused?.focus({preventScroll:true});selection?.removeAllRanges();ranges.forEach(range=>selection?.addRange(range));}catch(_){}
    }
}

async function copyFormattedReceivingEmail(report){
    const html=buildReceivingEmailClipboardHTML(report);
    const text=buildFinalizedDiscrepancyEmailText(report);
    // Run synchronously during the existing button's user gesture. Explicit
    // MIME data avoids inheriting app CSS and works without Async Clipboard.
    if(copyReceivingEmailWithNativeEvent(html,text)) return true;
    if(navigator.clipboard?.write&&typeof ClipboardItem!=="undefined"){
        try{
            const item=new ClipboardItem({
                "text/html":new Blob([html],{type:"text/html"}),
                "text/plain":new Blob([text],{type:"text/plain"})
            });
            await navigator.clipboard.write([item]);
            return true;
        }catch(_){}
    }
    if(!navigator.clipboard?.writeText)throw new Error("Rich email copying unavailable");
    await navigator.clipboard.writeText(text);
    return false;
}

window.buildFinalizedDiscrepancyEmailHTML=
    buildFinalizedDiscrepancyEmailHTML;
window.copyFormattedReceivingEmail=
    copyFormattedReceivingEmail;


function buildFinalizedDiscrepancyEmailText(report){
    const model=getReceivingEmailModel(report),groups=model.groups;

    const lines=[
        "الإخوة الكرام بالمستودع،",
        "تحية طيبة وبعد،",
        "يوجد فرق توريد موضح أدناه.",
        "نأمل التكرم بالمراجعة والتشييك.",
        ""
    ];

    lines.push(Object.entries(model.counts).filter(([,value])=>value>0)
        .map(([key,value])=>model.labels[key]+": "+value).join(" | "), "");

    groups.forEach(group=>{
        lines.push(
            "الطلبية "+(group.orderNumber||"-")+" | التاريخ "+(group.orderDate||"-"),
            "",
            "Code | Item Name | Ordered | Received | Diff + Status"
        );

        group.rows.forEach(row=>{
            const diff=row.difference;
            lines.push([
                row["Item Number"]||"",
                row["Item Name"]||"",
                row["Ordered Qty"]??0,
                row["Received Qty"]??0,
                (diff>0?"+":"")+diff+" "+row.label
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

    const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;")
        .replace(/>/g,"&gt;").replace(/"/g,"&quot;");

    const subject=buildReceivingDiscrepancyEmailSubject(report);

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
          <iframe title="Formatted discrepancy email" sandbox="" style="width:100%;height:65vh;min-height:360px;border:0" srcdoc="${esc('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">'+buildFinalizedDiscrepancyEmailHTML(report)+'</body></html>')}"></iframe>
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
                    : "Only plain text copied — email formatting unavailable",
                rich ? "success" : "warning"
            );
        }catch(_){
            showToast?.("Unable to copy email","warning");
        }
    });

    document.getElementById("btnOpenFinalizedGmail")?.addEventListener("click",async()=>{
        const to=String(
            document.getElementById("finalizedEmailTo")?.value||""
        ).trim();

        let richCopied=false;
        try{
            richCopied=await copyFormattedReceivingEmail(report);
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
                richCopied ? "Formatted report copied — paste it into Gmail (Ctrl+V)" : "Gmail opened — rich copying unavailable; use Copy Email again",
                richCopied ? "success" : "warning"
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
