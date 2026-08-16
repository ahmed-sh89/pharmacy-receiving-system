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

    /* Received/finalized orders remain protected from duplicate upload.
       They can only be removed through the protected Archive/Historical
       deletion workflows. */
    if(["received","finalized","closed"].includes(status)){
        throw new Error(
            "Order "+normalized+" was already uploaded (status: "+(existing.status||"received")+"). Duplicate upload is blocked."
        );
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

async function markWorkspaceOrdersReceived(){
    const records=(AppState.workspace.orderFiles||[]).filter(x=>x.documentId);
    if(!records.length){return true;}
    for(const record of records){
        await authRpc("finalize_pharmflow_order",{p_pharmacy_id:AuthState.context.pharmacy_id,p_order_number:normalizeOrderNumber(record.documentId)});
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
            category:toSafeString(row.category||""),
            source_sheet:toSafeString(row.sourceSheet||""),
            source_row:Number(row.sourceRow||0)
        }
    )).filter(row=>row.item_code && Number.isFinite(row.ordered_qty) && row.ordered_qty>0);

    if(!cleanRows.length){throw new Error("Original order snapshot contains no valid rows");}

    const batchSize=500;
    for(let start=0;start<cleanRows.length;start+=batchSize){
        await authRpc("save_pharmflow_order_source_items",{
            p_pharmacy_id:AuthState.context.pharmacy_id,
            p_order_number:normalizeOrderNumber(orderNumber),
            p_items:cleanRows.slice(start,start+batchSize),
            p_replace:start===0
        });
    }
    return cleanRows.length;
}

async function getOriginalUploadedOrderSnapshot(orderNumber){
    if(!AuthState.context || !AuthState.context.pharmacy_id){return [];}
    const result=await authRpc("get_pharmflow_order_source_items",{
        p_pharmacy_id:AuthState.context.pharmacy_id,
        p_order_number:normalizeOrderNumber(orderNumber)
    });
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

function getFinalizeReceivingSummary(){
    const orderNumbers=getWorkspaceOrderNumbers();
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

async function validateWorkspaceCanFinalize(){
    const summary=getFinalizeReceivingSummary();
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
    return summary;
}

function refreshFinalizeReceivingButton(){
    const button=document.getElementById("btnFinalizeReceiving");
    if(!button){ return; }
    const hasOrder=!!(AppState.workspace && Array.isArray(AppState.workspace.orderData) && AppState.workspace.orderData.length);
    button.disabled=!hasOrder || FinalizeReceivingEngine.busy;
    button.textContent=FinalizeReceivingEngine.busy?"Finalizing…":"✓ Finalize Receiving";
}

function requestFinalizeReceiving(){
    if(FinalizeReceivingEngine.busy){ return; }
    validateWorkspaceCanFinalize().then(summary=>{
        const orders=summary.orderNumbers.join(", ");
        const message=[
            "Finalize receiving manually for: "+orders+".",
            "This confirms the physical count is finished even when quantities do not match.",
            "Discrepancies: "+summary.discrepancies+" (Shortage "+summary.shortages+", Over "+summary.over+", Manual "+summary.manual+").",
            "The original uploaded order remains the source for official reports. After finalization, this receiving workspace will be archived and cleared."
        ].join(" ");
        showConfirmModal("Finalize Receiving",message,function(){
            finalizeCurrentReceiving().catch(()=>{});
        });
    }).catch(error=>{
        Logger.warn("Finalize validation failed",error);
        showToast(error.message||"Unable to finalize this receiving order","warning");
    });
}

async function finalizeCurrentReceiving(){
    if(FinalizeReceivingEngine.busy){ return false; }
    FinalizeReceivingEngine.busy=true;
    refreshFinalizeReceivingButton();
    showLoading("Finalizing receiving…");
    try{
        const summary=await validateWorkspaceCanFinalize();

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

        await markWorkspaceOrdersReceived();

        if(typeof closeAndArchiveCurrentOrder!=="function"){
            throw new Error("Receiving archive module is unavailable");
        }
        const archived=await closeAndArchiveCurrentOrder();
        if(!archived){
            throw new Error("Order was marked Received but the local receiving archive could not be completed. Do not scan this order again; refresh and retry archive recovery.");
        }

        await refreshOrderLifecycleRegistry();

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
                ? summary.orderNumbers.length+" orders finalized as Received"
                : "Order "+summary.orderNumbers[0]+" finalized as Received",
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

    const totalRows=groups.reduce(
        (sum,group)=>sum+group.rows.length,
        0
    );

    const sections=groups.map((group,index)=>{
        const rows=group.rows;

        return `
        <div style="margin:24px 0 0;border:1px solid #ddc9bb;border-radius:14px;overflow:hidden;background:#ffffff">
          <div style="padding:16px;background:#f5ebe3;border-bottom:1px solid #ddc9bb;text-align:center">
            <div style="font-size:11px;letter-spacing:.08em;color:#9a6246;font-weight:700">ORDER ${index+1}</div>
            <div style="font-size:18px;color:#342d28;font-weight:700;margin-top:3px">${esc(group.orderNumber||"-")}</div>
            <div style="font-size:12px;color:#76675d;margin-top:3px">
              Order Date: ${esc(group.orderDate||"-")}
              &nbsp;&nbsp;•&nbsp;&nbsp;
              Displayed Items: ${rows.length}
            </div>
          </div>

          <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;text-align:center" cellpadding="0" cellspacing="0">
            <thead>
              <tr style="background:#9a6246;color:#ffffff">
                <th style="padding:10px 8px;text-align:center;font-weight:800">Item Code</th>
                <th style="padding:10px 8px;text-align:center;font-weight:800">Item Name</th>
                <th style="padding:10px 8px;text-align:center;font-weight:800">Ordered</th>
                <th style="padding:10px 8px;text-align:center;font-weight:800">Received</th>
                <th style="padding:10px 8px;text-align:center;font-weight:800">Difference</th>
                <th style="padding:10px 8px;text-align:center;font-weight:800">Status</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(row=>{
                  const diff=Number(row["Difference"]||0);
                  const status=String(
                      row["Issue Type"] ||
                      row["Status"] ||
                      ""
                  );

                  return `
                  <tr>
                    <td style="padding:9px 8px;border-bottom:1px solid #eee4dc;text-align:center">${esc(row["Item Number"]||"")}</td>
                    <td style="padding:9px 8px;border-bottom:1px solid #eee4dc;text-align:center">${esc(row["Item Name"]||"")}</td>
                    <td style="padding:9px 8px;border-bottom:1px solid #eee4dc;text-align:center">${esc(row["Ordered Qty"]??0)}</td>
                    <td style="padding:9px 8px;border-bottom:1px solid #eee4dc;text-align:center">${esc(row["Received Qty"]??0)}</td>
                    <td style="padding:9px 8px;border-bottom:1px solid #eee4dc;text-align:center;font-weight:700;color:${diff<0?"#a54343":(diff>0?"#9a6a20":"#47795a")}">${diff>0?"+":""}${esc(diff)}</td>
                    <td style="padding:9px 8px;border-bottom:1px solid #eee4dc;text-align:center;font-weight:700">${esc(status)}</td>
                  </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>`;
    }).join("");

    return `
    <div style="max-width:980px;margin:0 auto;font-family:Arial,Tahoma,sans-serif;color:#342d28;background:#ffffff;text-align:center;font-size:15px;line-height:1.7">
      <div dir="rtl" style="text-align:center;padding:18px 14px 8px">
        <div style="font-size:30px;line-height:1.45;font-weight:800;color:#6f432e;text-align:center">الإخوة الكرام بالمستودع</div>
        <div style="font-size:21px;line-height:1.7;font-weight:800;color:#8b5d46;margin-top:6px;text-align:center">تحية طيبة وبعد،</div>
        <div style="font-size:18px;line-height:1.9;font-weight:700;color:#443832;margin:12px auto 0;max-width:800px;text-align:center">
          يوجد فرق توريد في الطلبية الموضحة أدناه، نأمل التكرم بالمراجعة والتشييك.
        </div>
      </div>

      <div style="display:block;margin:12px 0;padding:12px 14px;border-radius:12px;background:#f8f3ef;border:1px solid #e3d6cc;text-align:center">
        <span style="font-size:12px;color:#7c6d63">Orders with displayed results:</span>
        <strong style="font-size:14px;color:#342d28">${groups.length}</strong>
        <span style="font-size:12px;color:#7c6d63">&nbsp;&nbsp;•&nbsp;&nbsp;Total displayed items:</span>
        <strong style="font-size:14px;color:#342d28">${totalRows}</strong>
      </div>

      ${sections}

      <div dir="rtl" style="text-align:center;margin-top:28px;font-size:18px;line-height:1.9;color:#443832">
        <div style="font-weight:700">للإفادة والمراجعة والتشييك.</div>
        <div style="margin-top:8px;font-size:19px;font-weight:800;color:#6f432e">خالص الشكر والتقدير.</div>
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
        "الإخوة الكرام بالمستودع",
        "تحية طيبة وبعد،",
        "",
        "يوجد فرق توريد في الطلبية الموضحة أدناه، نأمل التكرم بالمراجعة والتشييك.",
        ""
    ];

    groups.forEach((group,index)=>{
        lines.push(
            "ORDER "+(index+1)+": "+(group.orderNumber||"-"),
            "Order Date: "+(group.orderDate||"-"),
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

    lines.push(
        "للإفادة والمراجعة والتشييك.",
        "",
        "خالص الشكر والتقدير."
    );

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
    const orderDate=orders.map(x=>x.orderDate).filter(Boolean)[0] || "";
    const reportGroups=getEmailReportOrderGroups(report)
        .filter(group=>Array.isArray(group.rows) && group.rows.length);

    const subject=
        reportGroups.length>1
            ? `Supply Discrepancy Report | ${reportGroups.length} Orders | ${new Date().toISOString().slice(0,10)}`
            : "Supply Discrepancy | Order "+orderLabel+(orderDate?" | "+orderDate:"");
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
            <h2>Supply Discrepancy Report</h2>
            <p>${rows.length} discrepancy item${rows.length===1?"":"s"} · Review before opening Gmail</p>
          </div>

          <button type="button" class="finalizedEmailClose" data-close aria-label="Close">✕</button>
        </header>

        <section class="finalizedEmailSummary">
          <div><span>ORDER NUMBER</span><strong>${esc(orderLabel||"-")}</strong></div>
          <div><span>ORDER DATE</span><strong>${esc(orderDate||"-")}</strong></div>
          <div><span>DISCREPANCIES</span><strong>${rows.length}</strong></div>
          <div><span>STATUS</span><strong>${options.fromArchive?"Finalized":(options.liveReport?"In Progress":"Finalized")}</strong></div>
        </section>

        <section class="finalizedEmailCompose">
          <label>
            <span>To</span>
            <input id="finalizedEmailTo" type="email" placeholder="warehouse@example.com" autocomplete="email">
          </label>

          <label>
            <span>Subject</span>
            <input id="finalizedEmailSubject" type="text" value="${esc(subject)}">
          </label>
        </section>

        <article class="finalizedEmailLetter">
          <div class="finalizedEmailRichPreview" dir="ltr">
            ${buildFinalizedDiscrepancyEmailHTML(report)}
          </div>
        </article>

        <footer class="finalizedEmailFooter">
          <div class="finalizedEmailSavedNote">
            <span>✓</span>
            <div>
              <strong>${options.fromArchive?"Saved in PharmFlow Archive":(options.liveReport?"Live report — Finalize not required":"Saved in PharmFlow Archive")}</strong>
              <small>${options.liveReport?"Email includes every current status except Completed.":"You can close this window and reopen the report at any time."}</small>
            </div>
          </div>

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

        const subjectValue=String(
            document.getElementById("finalizedEmailSubject")?.value||subject
        ).trim();

        try{
            await copyFormattedReceivingEmail(report);
        }catch(_){}

        /* Gmail compose URLs cannot inject a reliable HTML table.
           Open the compose window cleanly after copying the rich report.
           One paste keeps the professional HTML design intact. */
        const opened=openGmailComposeSafely({
            to,
            subject:subjectValue,
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
    ["workspace:created","workspace:cleared","files:updated","receiving:updated","archive:updated"].forEach(eventName=>{
        try{ AppEvents.on(eventName,refreshFinalizeReceivingButton); }catch(_error){}
    });
    refreshFinalizeReceivingButton();
}

window.requestFinalizeReceiving=requestFinalizeReceiving;
window.finalizeCurrentReceiving=finalizeCurrentReceiving;
window.refreshFinalizeReceivingButton=refreshFinalizeReceivingButton;
window.bindFinalizeReceivingUI=bindFinalizeReceivingUI;
window.repairMissingOrderRegistryFromWorkspace=repairMissingOrderRegistryFromWorkspace;

setTimeout(bindFinalizeReceivingUI,350);
