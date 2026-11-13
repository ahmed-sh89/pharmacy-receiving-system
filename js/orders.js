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

const receivingEmailGreeting="السلام عليكم";
const receivingEmailIntro="يوجد فرق توريد موضح أدناه";
const receivingEmailClosing="الرجاء المراجعة والإفادة";
const receivingEmailColumns=["WO","Code","Item Name","Ord.","Rec.","Diff","Status"];

function getReceivingEmailSections(report,workOrders=new Map()){
    const sections=new Map(),extras=new Map();
    const orders=Array.isArray(report?.orders)?report.orders:[];
    getEmailReportOrderGroups(report).forEach(group=>{
        const orderNumber=String(group.orderNumber||"").trim();
        const orderless=group.unassigned===true||!orderNumber||/^(UNASSIGNED|UNORDERED)$/i.test(orderNumber);
        const orderDate=group.orderDate||orders.find(order=>String(order.orderNumber||"").trim()===orderNumber)?.orderDate||"";
        (group.rows||[]).forEach(row=>{
            const ordered=Number(row["Ordered Qty"]||0),received=Number(row["Received Qty"]||0);
            if(!Number.isFinite(ordered)||!Number.isFinite(received))return;
            const difference=received-ordered;
            const issue=String(row["Issue Type"]||row.Status||"").trim().toUpperCase();
            if(orderless){
                const extra=ordered===0||["EXTRA ITEM","EXTRA","UNORDERED","UNASSIGNED"].includes(issue);
                if(!extra||received<=0)return;
                let day=String(row["Received Date"]||"").slice(0,10);
                if(!day&&row.receivedAt){
                    const date=new Date(row.receivedAt);
                    if(Number.isFinite(date.getTime()))day=[date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
                }
                if(!extras.has(day))extras.set(day,{extraSection:true,orderDate:day,rows:[]});
                extras.get(day).rows.push({...row,ordered:0,received,difference:received});
                return;
            }
            if(!difference)return;
            if(!sections.has(orderNumber))sections.set(orderNumber,{
                orderNumber,orderDate,rows:[]
            });
            const section=sections.get(orderNumber);
            if(!section.orderDate)section.orderDate=orderDate;
            const workOrder=workOrders.get(orderNumber)?.[section.rows.length]||"";
            section.rows.push({...row,ordered,received,difference,workOrder});
        });
    });
    return [...sections.values(),...[...extras.values()].sort((a,b)=>a.orderDate.localeCompare(b.orderDate))];
}

function buildReceivingDiscrepancyEmailSubject(report){
    const sections=getReceivingEmailSections(report);
    const numbers=sections.filter(group=>!group.extraSection).map(group=>group.orderNumber);
    if(!numbers.length)return sections.length?"Extra Items":"";
    return numbers.slice(0,3).join(" + ")+(numbers.length>3?" + More":"");
}

const receivingEmailDateFormat=new Intl.DateTimeFormat("en-GB",{
    day:"numeric",month:"short",year:"numeric",timeZone:"UTC"
});

function formatReceivingEmailOrderDate(value){
    const label=String(value||"").trim();
    if(!label||/^[-–—]+$/.test(label))return "";
    const iso=label.slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return label;
    const date=new Date(iso+"T00:00:00Z");
    if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==iso)return label;
    return receivingEmailDateFormat.format(date);
}

function getReceivingEmailSectionMeta(group){
    return {
        title:group.extraSection?"Extra Items":group.orderNumber,
        date:formatReceivingEmailOrderDate(group.orderDate)
    };
}

function getReceivingEmailWorkOrder(row){
    return row.workOrder?"WO-"+row.workOrder:"—";
}

function getReceivingEmailDifference(row){
    return row.difference>0?"+"+row.difference:String(row.difference);
}

function getReceivingEmailStatus(row){
    return (row.difference<0?"ناقص ":"زيادة ")+Math.abs(row.difference);
}

function buildFinalizedDiscrepancyEmailHTML(report,workOrders){
    const esc=value=>String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;")
        .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const font=(text,color="#1d3954",bold=false,size=10)=>
        `<font face="Arial, Helvetica, sans-serif" size="${size>12?4:size<12?2:3}" color="${color}" style="font-family:Arial,Helvetica,sans-serif;font-size:${size}pt;mso-bidi-font-size:${size}pt;line-height:1.25;font-weight:${bold?700:400};color:${color}">${bold?`<b>${text}</b>`:text}</font>`;
    const interior="#F0F6FB";
    const centered="text-align:center;vertical-align:middle;font-family:Arial,Helvetica,sans-serif;";
    const sections=getReceivingEmailSections(report,workOrders);
    const widths=["19%","12%","33%","7%","7%","8%","14%"];
    const headings=receivingEmailColumns.map((label,index)=>
        `<th scope="col" align="center" valign="middle" bgcolor="#dceefb" width="${widths[index]}" style="${centered}padding:4px 3px;background-color:#dceefb;border:1px solid #b7d3e8;overflow-wrap:anywhere">${font(label,"#103d66",true)}</th>`
    ).join("");
    const workOrderColors=["#e5d5f7","#f8e7be","#efdce9","#e6e1d9","#f8dfc9","#e4defb"];
    const groups=sections.map(group=>{
        const workOrderBackgrounds=new Map();
        const rows=group.rows.map((row,index)=>{
            const bg=index%2?"#eaf4fb":"#f6fbff";
            const [ink,tint]=row.difference<0?["#a72f2f","#f7c3c3"]:["#16634b","#bde8d7"];
            const cell=(content,background=bg,style="overflow-wrap:anywhere")=>
                `<td align="center" valign="middle" bgcolor="${background}" style="${centered}padding:4px 3px;background-color:${background};border:1px solid #dce8f2;${style}">${content}</td>`;
            if(row.workOrder&&!workOrderBackgrounds.has(row.workOrder)){
                workOrderBackgrounds.set(row.workOrder,workOrderColors[workOrderBackgrounds.size%workOrderColors.length]);
            }
            const workOrderCell=cell(font(esc(getReceivingEmailWorkOrder(row)),"#1d3954",Boolean(row.workOrder)),workOrderBackgrounds.get(row.workOrder)||bg,"white-space:nowrap");
            return `<tr>${workOrderCell}${cell(font(esc(row["Item Number"])))}${cell(`<span dir="auto">${font(esc(row["Item Name"]))}</span>`)}${cell(font(esc(row.ordered),"#103d66"))}${cell(font(esc(row.received),"#103d66"))}${cell(font(esc(getReceivingEmailDifference(row)),ink,true,11),tint)}${cell(`<span dir="rtl">${font(getReceivingEmailStatus(row),ink,true,11)}</span>`)}</tr>`;
        }).join("");
        const meta=getReceivingEmailSectionMeta(group);
        const title=font(esc(meta.title),"#FFFFFF",true,12);
        const date=meta.date?font(" | "+esc(meta.date),"#DCEEFF",false,12):"";
        const heading=`<tr><td colspan="${receivingEmailColumns.length}" align="center" valign="middle" bgcolor="#0b5f9f" dir="ltr" style="${centered}direction:ltr;padding:6px;background-color:#0b5f9f;color:#FFFFFF;overflow-wrap:anywhere">${title}${date}</td></tr>`;
        return `<tr><td align="center" style="padding:0 6px"><table align="center" width="100%" border="1" bordercolor="#cbddea" cellpadding="0" cellspacing="0" dir="ltr" style="width:100%;border-collapse:collapse;table-layout:auto;border:1px solid #cbddea"><tbody>${heading}<tr>${headings}</tr>${rows}</tbody></table></td></tr>`;
    });
    const message=text=>`<table role="presentation" align="center" width="100%" border="1" bordercolor="#97c3e3" cellpadding="0" cellspacing="0" bgcolor="#d5eaf8" style="width:100%;border-collapse:collapse;background-color:#d5eaf8;border:1px solid #97c3e3;border-radius:10px"><tr><td align="center" dir="rtl" bgcolor="#d5eaf8" style="${centered}padding:6px 8px;background-color:#d5eaf8">${font(text,"#173d63",true,15)}</td></tr></table>`;
    const spacer=`<tr><td align="center" height="10" bgcolor="${interior}" style="height:10px;font-size:1px;line-height:10px">&nbsp;</td></tr>`;
    return `<table role="presentation" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" dir="rtl" bgcolor="#f2f7fb" style="width:100%;max-width:920px;table-layout:fixed;border-collapse:collapse;background-color:#f2f7fb"><tr><td align="center" style="${centered}padding:6px"><table role="presentation" align="center" width="100%" border="1" bordercolor="#b8d5e9" cellpadding="0" cellspacing="0" bgcolor="${interior}" style="width:100%;table-layout:fixed;border-collapse:collapse;background-color:${interior};border:1px solid #b8d5e9;border-radius:14px">
      <tr><td align="center" style="padding:6px 6px 0">${message(receivingEmailGreeting+"<br>"+receivingEmailIntro)}</td></tr>
      ${groups.length?spacer+groups.join(spacer):""}
      ${spacer}<tr><td align="center" style="padding:0 6px 6px">${message(receivingEmailClosing)}</td></tr>
      </table></td></tr></table>`;
}

function buildReceivingEmailClipboardHTML(report,workOrders){
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body dir="rtl" bgcolor="#f2f7fb" style="margin:0;background-color:#f2f7fb;text-align:center"><!--StartFragment-->'+buildFinalizedDiscrepancyEmailHTML(report,workOrders)+'<!--EndFragment--></body></html>';
}

async function copyFormattedReceivingEmail(report,workOrders){
    const html=buildReceivingEmailClipboardHTML(report,workOrders),text=buildFinalizedDiscrepancyEmailText(report,workOrders);
    // A single standards-based rich payload, with no DOM selection, temporary
    // hidden content, execCommand or custom native clipboard format.
    if(navigator.clipboard?.write&&typeof ClipboardItem!=="undefined"){
        try{
            await navigator.clipboard.write([new ClipboardItem({
                "text/html":new Blob([html],{type:"text/html"}),
                "text/plain":new Blob([text],{type:"text/plain"})
            })]);
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


function buildFinalizedDiscrepancyEmailText(report,workOrders){
    const lines=[receivingEmailGreeting,receivingEmailIntro];
    for(const group of getReceivingEmailSections(report,workOrders)){
        const meta=getReceivingEmailSectionMeta(group);
        lines.push("",[meta.title,meta.date].filter(Boolean).join(" | "));
        lines.push(receivingEmailColumns.join(" | "));
        for(const row of group.rows){
            lines.push([
                getReceivingEmailWorkOrder(row),
                row["Item Number"]??"",
                row["Item Name"]??"",
                row.ordered,
                row.received,
                getReceivingEmailDifference(row),
                getReceivingEmailStatus(row)
            ].join(" | "));
        }
    }
    lines.push("",receivingEmailClosing);
    return lines.join("\r\n");
}

function buildOutlookWebComposeUrl({to="",subject=""}={}){
    const params=new URLSearchParams();
    if(to)params.set("to",String(to));
    if(subject)params.set("subject",String(subject));
    const query=params.toString();
    return "https://outlook.office.com/mail/deeplink/compose"+(query?"?"+query:"");
}


function openFinalizedDiscrepancyEmailPreview(report,options={}){
    document.getElementById("finalizedEmailPreviewOverlay")?.remove();

    const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;")
        .replace(/>/g,"&gt;").replace(/"/g,"&quot;");

    const subject=buildReceivingDiscrepancyEmailSubject(report);
    const editableGroups=getReceivingEmailSections(report).filter(group=>!group.extraSection);
    const workOrderFields=editableGroups.map(group=>`
        <details class="finalizedEmailWOGroup" data-wo-group dir="ltr">
          <summary>${esc(group.orderNumber)}</summary>
          <div class="finalizedEmailWOEntries">
            ${group.rows.map(row=>`
              <label class="finalizedEmailWOEntry">
                <span class="finalizedEmailWOItem"><strong>${esc(row["Item Number"])}</strong> <span dir="auto">${esc(row["Item Name"])}</span></span>
                <span class="finalizedEmailWOInput" dir="ltr">
                  <span aria-hidden="true">WO-</span>
                  <input type="text" inputmode="numeric" autocomplete="off" data-wo-number aria-label="رقم WO للصنف ${esc(row["Item Number"])}">
                </span>
              </label>`).join("")}
          </div>
        </details>`
    ).join("");

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

        ${workOrderFields?`<section class="finalizedEmailWorkOrders" aria-labelledby="finalizedEmailWOTitle">
          <div class="finalizedEmailWOHeading" dir="rtl">
            <h3 id="finalizedEmailWOTitle">إدخال أرقام WO</h3>
            <p>افتح الطلبية واكتب رقم WO أمام الصنف</p>
          </div>
          <div class="finalizedEmailWorkOrderFields">${workOrderFields}</div>
        </section>`:""}
        <article class="finalizedEmailLetter">
          <iframe title="Formatted discrepancy email" sandbox="" style="width:100%;height:65vh;min-height:360px;border:0" srcdoc="${esc(buildReceivingEmailClipboardHTML(report))}"></iframe>
        </article>

        <footer class="finalizedEmailFooter">
          <div class="finalizedEmailActions">
            <button type="button" class="secondaryButton" id="btnCopyFinalizedEmail">Copy Email</button>
            <button type="button" class="primaryButton" id="btnOpenFinalizedOutlook">Open Outlook Web</button>
          </div>
        </footer>
      </aside>`;

    document.body.appendChild(overlay);

    function readWorkOrders(){
        const workOrders=new Map();
        overlay.querySelectorAll("[data-wo-group]").forEach((group,index)=>{
            const numbers=[...group.querySelectorAll("[data-wo-number]")].map(input=>input.value);
            workOrders.set(editableGroups[index].orderNumber,numbers);
        });
        return workOrders;
    }

    const frame=overlay.querySelector("iframe");
    const workOrderEditor=overlay.querySelector(".finalizedEmailWorkOrderFields");
    const updatePreview=()=>{
        frame.srcdoc=buildReceivingEmailClipboardHTML(report,readWorkOrders());
    };
    workOrderEditor?.addEventListener("input",event=>{
        const input=event.target;
        if(!input.matches("[data-wo-number]"))return;
        const digits=input.value.replace(/[^0-9٠-٩۰-۹]/g,"");
        if(input.value!==digits)input.value=digits;
        updatePreview();
    });
    overlay.querySelectorAll("[data-close]").forEach(button=>{
        button.onclick=()=>overlay.remove();
    });

    document.getElementById("btnCopyFinalizedEmail")?.addEventListener("click",async()=>{
        try{
            const rich=await copyFormattedReceivingEmail(report,readWorkOrders());
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

    document.getElementById("btnOpenFinalizedOutlook")?.addEventListener("click",()=>{
        const to=String(document.getElementById("finalizedEmailTo")?.value||"").trim();
        try{
            window.open(buildOutlookWebComposeUrl({to,subject}),"_blank","noopener,noreferrer");
            showToast?.("Paste the copied email into Outlook Web (Ctrl+V)","success");
        }catch(_){showToast?.("Unable to open Outlook Web","warning");}
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
