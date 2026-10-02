"use strict";
/* PharmFlow lightweight Receiving History + NEW High Priority history. */
const PharmFlowReceivingHistory={mode:"receiving",workspaces:[],details:new Map(),newItems:[],from:"",to:"",accountScope:""};

function pfhCurrentAccountScope(){return String(AuthState?.context?.pharmacy_id||"");}
function pfhResetAccountData(){
    PharmFlowReceivingHistory.workspaces=[];
    PharmFlowReceivingHistory.newItems=[];
    PharmFlowReceivingHistory.details.clear();
    PharmFlowReceivingHistory.from="";
    PharmFlowReceivingHistory.to="";
    PharmFlowReceivingHistory.accountScope=pfhCurrentAccountScope();
    const host=document.getElementById("pfhResults"),summary=document.getElementById("pfhSummary"),label=document.getElementById("pfhResultLabel");
    if(host)host.innerHTML=""; if(summary)summary.innerHTML=""; if(label)label.textContent="Select a date range";
}
function pfhEnforceAccountScope(){const scope=pfhCurrentAccountScope();if(PharmFlowReceivingHistory.accountScope!==scope)pfhResetAccountData();return scope;}
window.addEventListener("pharmflow:authenticated-context-ready",pfhResetAccountData);

function pfhEsc(value){return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function pfhNum(value){const n=Number(value||0);return Number.isFinite(n)?n:0;}
function pfhDate(value){if(!value)return "-";const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString();}
function pfhDateTime(value){if(!value)return "-";const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleString();}
function pfhNormalizeOrder(value){return typeof normalizeOrderNumber==="function"?normalizeOrderNumber(value):String(value||"").trim().toUpperCase().replace(/\s+/g,"");}

function pfhOrderMeta(orderNumber){
    const key=pfhNormalizeOrder(orderNumber);
    const file=(AppState?.workspace?.orderFiles||[]).find(f=>pfhNormalizeOrder(f?.documentId||f?.orderNumber||"")===key)||{};
    const registry=(typeof OrderLifecycleEngine!=="undefined"&&Array.isArray(OrderLifecycleEngine.records))
        ? OrderLifecycleEngine.records.find(r=>pfhNormalizeOrder(r?.order_number||"")===key)||{}:{};
    return {
        orderNumber:key,
        orderName:String(file.fileName||registry.source_file||file.orderName||""),
        orderDate:String(file.orderDate||registry.order_date||"")
    };
}

function buildPharmFlowReceivingHistoryPayload(summary,discrepancyReport){
    const selected=(summary?.orderNumbers||[]).map(pfhNormalizeOrder).filter(Boolean);
    const selectedSet=new Set(selected);
    const discrepancies=[];
    const FINAL_HISTORY_DISCREPANCY_TYPES=new Set(["NOT RECEIVED","PARTIAL SHORTAGE","OVER RECEIVED","EXTRA ITEM","SHORTAGE","UNORDERED"]);
    const isHistoryDiscrepancy=row=>FINAL_HISTORY_DISCREPANCY_TYPES.has(String(row?.["Issue Type"]||row?.Status||"").trim().toUpperCase());
    const groups=Array.isArray(discrepancyReport?.orderGroups)?discrepancyReport.orderGroups:[];
    if(groups.length){
        groups.forEach(group=>{
            const order=pfhNormalizeOrder(group?.orderNumber||"");
            if(!selectedSet.has(order))return;
            const meta=pfhOrderMeta(order);
            (group.rows||[]).filter(isHistoryDiscrepancy).forEach(row=>discrepancies.push({
                order_number:order,order_name:meta.orderName,order_date:group.orderDate||meta.orderDate||"",
                item_code:String(row["Item Number"]||""),item_name:String(row["Item Name"]||""),
                ordered_qty:pfhNum(row["Ordered Qty"]),received_qty:pfhNum(row["Received Qty"]),
                difference:pfhNum(row["Difference"]),issue_type:String(row["Issue Type"]||row.Status||"")
            }));
        });
    }else if(selected.length===1){
        const order=selected[0],meta=pfhOrderMeta(order);
        (discrepancyReport?.rows||[]).filter(isHistoryDiscrepancy).forEach(row=>discrepancies.push({
            order_number:order,order_name:meta.orderName,order_date:meta.orderDate||"",
            item_code:String(row["Item Number"]||""),item_name:String(row["Item Name"]||""),
            ordered_qty:pfhNum(row["Ordered Qty"]),received_qty:pfhNum(row["Received Qty"]),
            difference:pfhNum(row["Difference"]),issue_type:String(row["Issue Type"]||row.Status||"")
        }));
    }

    const newItems=[];
    if(typeof getPerOrderReceivingRows==="function"){
        selected.forEach(order=>{
            const meta=pfhOrderMeta(order);
            const rows=getPerOrderReceivingRows(order)||[];
            rows.forEach(row=>{
                const code=String(row["Item Number"]||"").trim();
                const item=typeof getItemByCode==="function"?getItemByCode(code):null;
                const priority=typeof getEffectiveItemPriority==="function"?getEffectiveItemPriority(item):String(item?.priorityType||"");
                if(priority!=="NEW")return;
                newItems.push({
                    order_number:order,order_name:meta.orderName,order_date:meta.orderDate||"",
                    item_code:code,item_name:String(row["Item Name"]||item?.itemName||""),
                    ordered_qty:pfhNum(row["Ordered Qty"])
                });
            });
        });
    }
    const generation=Number(AppState?.workspace?.workspaceGeneration??AppState?.workspace?.generation??0);
    const completionKey=["WS",AuthState?.context?.pharmacy_id||"",generation,selected.slice().sort().join("+")].join(":");
    return {completionKey,orderNumbers:selected,discrepancies,newItems};
}
window.buildPharmFlowReceivingHistoryPayload=buildPharmFlowReceivingHistoryPayload;

async function finalizeReceivingWorkspaceWithHistory(summary,discrepancyReport){
    if(!AuthState?.context?.pharmacy_id)throw new Error("Pharmacy context is required");
    const payload=buildPharmFlowReceivingHistoryPayload(summary,discrepancyReport);
    if(!payload.orderNumbers.length)throw new Error("Receiving history has no Order Numbers");
    const result=await authRpc("finalize_pharmflow_receiving_workspace_v1",{
        p_pharmacy_id:AuthState.context.pharmacy_id,
        p_completion_key:payload.completionKey,
        p_order_numbers:payload.orderNumbers,
        p_discrepancies:payload.discrepancies,
        p_new_items:payload.newItems
    });
    await refreshOrderLifecycleRegistry?.();
    return Array.isArray(result)?result[0]:result;
}
window.finalizeReceivingWorkspaceWithHistory=finalizeReceivingWorkspaceWithHistory;

function pfhEnsureUI(){
    if(document.getElementById("pfhOverlay"))return;
    const toolbar=document.querySelector(".pfnReceivingReportToolbar");
    const share=toolbar?.querySelector(".pfnReportActionMenu");
    if(toolbar&&share&&!document.getElementById("btnReceivingHistoryReport")){
        const button=document.createElement("button");
        button.id="btnReceivingHistoryReport";button.type="button";button.className="pfhHistoryButton";
        button.innerHTML='<span aria-hidden="true">◷</span><span>History Report</span>';
        share.insertAdjacentElement("afterend",button);
        button.addEventListener("click",()=>pfhOpen("receiving"));
    }
    const staticHistoryButton=document.getElementById("btnReceivingHistoryReport");
    if(staticHistoryButton && staticHistoryButton.dataset.pfhBound!=="1"){
        staticHistoryButton.dataset.pfhBound="1";
        staticHistoryButton.addEventListener("click",()=>pfhOpen("receiving"));
    }
    const overlay=document.createElement("div");
    overlay.id="pfhOverlay";overlay.className="pfhOverlay";overlay.hidden=true;
    overlay.innerHTML='<section class="pfhPanel" role="dialog" aria-modal="true" aria-labelledby="pfhTitle">'+
      '<header class="pfhHeader"><div><span class="sectionEyebrow">RECEIVING HISTORY</span><h2 id="pfhTitle">Historical Receiving Reports</h2><p id="pfhDescription">Review completed workspaces and discrepancies grouped by Order Number.</p></div><button class="pfhClose" type="button" data-pfh-close aria-label="Close">✕</button></header>'+
      '<div class="pfhBody"><div class="pfhTabs"><button class="pfhTab active" type="button" data-pfh-mode="receiving">Receiving History</button><button class="pfhTab" type="button" data-pfh-mode="new">New Items History</button></div>'+
      '<div class="pfhFilters"><div class="pfhField"><span>FROM DATE</span><button id="pfhFromButton" class="pfhDateButton" type="button" data-pfh-date="from"><span id="pfhFromDisplay">Select date</span><b aria-hidden="true">▦</b></button></div><div class="pfhField"><span>TO DATE</span><button id="pfhToButton" class="pfhDateButton" type="button" data-pfh-date="to"><span id="pfhToDisplay">Select date</span><b aria-hidden="true">▦</b></button></div><button id="pfhGenerate" class="pfhGenerate" type="button">Generate Report</button></div>'+
      '<div id="pfhSummary" class="pfhSummary"></div><div class="pfhToolbar"><strong id="pfhResultLabel">Select a date range</strong><div class="pfhExports"><button id="pfhExcel" class="pfhExport" type="button">Export Excel</button><button id="pfhPdf" class="pfhExport" type="button">Export PDF</button></div></div><div id="pfhResults"></div></div></section>';
    document.body.appendChild(overlay);
    overlay.querySelector("[data-pfh-close]").addEventListener("click",pfhClose);
    overlay.addEventListener("click",e=>{if(e.target===overlay)pfhClose();});
    overlay.querySelectorAll("[data-pfh-mode]").forEach(btn=>btn.addEventListener("click",()=>pfhSetMode(btn.dataset.pfhMode)));
    overlay.querySelectorAll("[data-pfh-date]").forEach(btn=>btn.addEventListener("click",()=>pfhOpenCalendar(btn.dataset.pfhDate,btn)));
    overlay.querySelector("#pfhGenerate").addEventListener("click",pfhGenerate);
    overlay.querySelector("#pfhExcel").addEventListener("click",pfhExportExcel);
    overlay.querySelector("#pfhPdf").addEventListener("click",pfhExportPdf);
}
function pfhDefaultDates(){
    const now=new Date(),first=new Date(now.getFullYear(),now.getMonth(),1);
    const iso=d=>{const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,10);};
    return {from:iso(first),to:iso(now)};
}
function pfhOpen(mode="receiving"){pfhEnforceAccountScope();pfhEnsureUI();const d=pfhDefaultDates();PharmFlowReceivingHistory.from=PharmFlowReceivingHistory.from||d.from;PharmFlowReceivingHistory.to=PharmFlowReceivingHistory.to||d.to;pfhSyncDateButtons();document.getElementById("pfhOverlay").hidden=false;pfhSetMode(mode);document.getElementById("pfhFromButton").focus();}
function pfhClose(){const x=document.getElementById("pfhOverlay");if(x)x.hidden=true;}
function pfhSetMode(mode){PharmFlowReceivingHistory.mode=mode==="new"?"new":"receiving";document.querySelectorAll("[data-pfh-mode]").forEach(b=>b.classList.toggle("active",b.dataset.pfhMode===PharmFlowReceivingHistory.mode));document.getElementById("pfhTitle").textContent=PharmFlowReceivingHistory.mode==="new"?"NEW High Priority History":"Historical Receiving Reports";const desc=document.getElementById("pfhDescription");if(desc)desc.textContent=PharmFlowReceivingHistory.mode==="new"?"Review only items marked NEW High Priority during completed Receiving workspaces.":"Review completed workspaces and discrepancies grouped by Order Number.";pfhRender();}
function pfhFormatDate(value){if(!value)return "Select date";const [y,m,d]=String(value).split("-").map(Number);return new Intl.DateTimeFormat(undefined,{day:"2-digit",month:"short",year:"numeric"}).format(new Date(y,m-1,d));}
function pfhSyncDateButtons(){const a=document.getElementById("pfhFromDisplay"),b=document.getElementById("pfhToDisplay");if(a)a.textContent=pfhFormatDate(PharmFlowReceivingHistory.from);if(b)b.textContent=pfhFormatDate(PharmFlowReceivingHistory.to);}
function pfhIsoLocal(date){const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,"0"),d=String(date.getDate()).padStart(2,"0");return y+"-"+m+"-"+d;}
function pfhOpenCalendar(kind,anchor){
    document.querySelector(".pfhCalendarPopover")?.remove();
    const current=kind==="from"?PharmFlowReceivingHistory.from:PharmFlowReceivingHistory.to;
    const selected=current?new Date(current+"T12:00:00"):new Date();
    const pop=document.createElement("div");pop.className="pfhCalendarPopover";pop.dataset.kind=kind;
    document.getElementById("pfhOverlay").querySelector(".pfhPanel").appendChild(pop);
    pfhRenderCalendar(pop,selected.getFullYear(),selected.getMonth(),current);
    const ar=anchor.getBoundingClientRect(),pr=document.querySelector(".pfhPanel").getBoundingClientRect();
    pop.style.top=(ar.bottom-pr.top+7)+"px";pop.style.left=Math.max(16,Math.min(ar.left-pr.left,pr.width-326))+"px";
    setTimeout(()=>document.addEventListener("pointerdown",pfhCalendarOutside,{once:true}),0);
}
function pfhCalendarOutside(e){const pop=document.querySelector(".pfhCalendarPopover");if(pop&&!pop.contains(e.target)&&!e.target.closest("[data-pfh-date]"))pop.remove();}
function pfhRenderCalendar(pop,year,month,selectedIso){
    const first=new Date(year,month,1),last=new Date(year,month+1,0),start=first.getDay(),today=pfhIsoLocal(new Date());
    const monthTitle=new Intl.DateTimeFormat(undefined,{month:"long",year:"numeric"}).format(first);
    const weekdays=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    let cells="";
    for(let i=0;i<start;i++)cells+='<span class="pfhCalBlank"></span>';
    for(let day=1;day<=last.getDate();day++){const iso=pfhIsoLocal(new Date(year,month,day));cells+='<button type="button" class="pfhCalDay'+(iso===selectedIso?" selected":"")+(iso===today?" today":"")+'" data-date="'+iso+'">'+day+'</button>';}
    pop.innerHTML='<div class="pfhCalHead"><button type="button" data-cal-nav="-1" aria-label="Previous month">‹</button><strong>'+pfhEsc(monthTitle)+'</strong><button type="button" data-cal-nav="1" aria-label="Next month">›</button></div><div class="pfhCalWeek">'+weekdays.map(x=>'<span>'+x+'</span>').join("")+'</div><div class="pfhCalGrid">'+cells+'</div><div class="pfhCalFoot"><button type="button" data-cal-today>Today</button></div>';
    pop.querySelectorAll("[data-cal-nav]").forEach(btn=>btn.addEventListener("click",()=>{const d=new Date(year,month+Number(btn.dataset.calNav),1);pfhRenderCalendar(pop,d.getFullYear(),d.getMonth(),selectedIso);}));
    pop.querySelectorAll("[data-date]").forEach(btn=>btn.addEventListener("click",()=>{if(pop.dataset.kind==="from")PharmFlowReceivingHistory.from=btn.dataset.date;else PharmFlowReceivingHistory.to=btn.dataset.date;pfhSyncDateButtons();pop.remove();}));
    pop.querySelector("[data-cal-today]").addEventListener("click",()=>{const iso=pfhIsoLocal(new Date());if(pop.dataset.kind==="from")PharmFlowReceivingHistory.from=iso;else PharmFlowReceivingHistory.to=iso;pfhSyncDateButtons();pop.remove();});
}
async function pfhGenerate(){
    pfhEnforceAccountScope();
    const from=PharmFlowReceivingHistory.from||"",to=PharmFlowReceivingHistory.to||"";
    if(!from||!to){showToast?.("Select From Date and To Date","warning");return;}
    if(from>to){showToast?.("From Date cannot be after To Date","warning");return;}
    if(!AuthState?.context?.pharmacy_id){showToast?.("Pharmacy context is unavailable","error");return;}
    PharmFlowReceivingHistory.from=from;PharmFlowReceivingHistory.to=to;
    document.getElementById("pfhResults").innerHTML='<div class="pfhLoading">Generating report…</div>';
    try{
        if(PharmFlowReceivingHistory.mode==="new"){
            const rows=await authRpc("list_pharmflow_new_item_history_v1",{p_pharmacy_id:AuthState.context.pharmacy_id,p_from:from,p_to:to});
            PharmFlowReceivingHistory.newItems=Array.isArray(rows)?rows:[];pfhRender();
        }else{
            const rows=await authRpc("list_pharmflow_receiving_workspace_history_v1",{p_pharmacy_id:AuthState.context.pharmacy_id,p_from:from,p_to:to});
            PharmFlowReceivingHistory.workspaces=Array.isArray(rows)?rows:[];PharmFlowReceivingHistory.details.clear();pfhRender();
        }
    }catch(error){Logger?.error?.("Receiving history report failed",error);document.getElementById("pfhResults").innerHTML='<div class="pfhEmpty">Unable to load the historical report.</div>';showToast?.(error.message||"Unable to load history","error");}
}
function pfhRender(){
    const summary=document.getElementById("pfhSummary"),host=document.getElementById("pfhResults"),label=document.getElementById("pfhResultLabel");
    if(!summary||!host)return;
    if(PharmFlowReceivingHistory.mode==="new"){
        const rows=PharmFlowReceivingHistory.newItems||[];const orders=new Set(rows.map(r=>r.order_number)).size;const workspaces=new Set(rows.map(r=>r.workspace_history_id)).size;
        summary.innerHTML=pfhMetrics([["NEW ITEMS",rows.length],["WORKSPACES",workspaces],["ORDERS",orders]])+pfhPeriodMetric(PharmFlowReceivingHistory.from,PharmFlowReceivingHistory.to);
        label.textContent=rows.length+" NEW item record(s)";
        if(!rows.length){host.innerHTML='<div class="pfhEmpty">No NEW High Priority items in the selected period.</div>';return;}
        const grouped=pfhGroup(rows,r=>r.order_number);
        host.innerHTML='<div class="pfhWorkspaceList">'+Array.from(grouped.entries()).map(([order,list])=>'<article class="pfhWorkspace open"><div class="pfhOrder"><div class="pfhOrderHeader"><strong>Order '+pfhEsc(order)+'</strong><span>'+list.length+' NEW item(s)</span></div>'+pfhNewTable(list)+'</div></article>').join("")+'</div>';
        return;
    }
    const rows=PharmFlowReceivingHistory.workspaces||[];const orders=rows.reduce((n,r)=>n+pfhNum(r.orders_count),0),disc=rows.reduce((n,r)=>n+pfhNum(r.discrepancy_count),0),affected=rows.filter(r=>pfhNum(r.discrepancy_count)>0).length;
    summary.innerHTML=pfhMetrics([["WORKSPACES",rows.length],["ORDERS",orders],["DISCREPANCIES",disc],["WITH ISSUES",affected]]);
    label.textContent=rows.length+" completed workspace(s)";
    if(!rows.length){host.innerHTML='<div class="pfhEmpty">No completed Receiving workspaces in the selected period.</div>';return;}
    host.innerHTML='<div class="pfhWorkspaceList">'+rows.map(r=>'<article class="pfhWorkspace" data-pfh-workspace="'+pfhEsc(r.workspace_history_id)+'"><button type="button" class="pfhWorkspaceHead"><strong>'+pfhEsc(pfhDateTime(r.completed_at))+'</strong><span>'+pfhNum(r.orders_count)+' Orders</span><span>'+pfhNum(r.discrepancy_count)+' Discrepancies</span><span class="pfhChevron">⌄</span></button><div class="pfhWorkspaceDetail" hidden></div></article>').join("")+'</div>';
    host.querySelectorAll(".pfhWorkspaceHead").forEach(btn=>btn.addEventListener("click",()=>pfhToggleWorkspace(btn.closest(".pfhWorkspace"))));
}
function pfhMetrics(items){return items.map(([k,v])=>'<article class="pfhMetric"><span>'+pfhEsc(k)+'</span><strong>'+pfhEsc(v)+'</strong></article>').join("");}
function pfhPeriodMetric(from,to){
    if(!from||!to)return '<article class="pfhMetric pfhPeriodMetric"><span>PERIOD</span><strong>—</strong></article>';
    return '<article class="pfhMetric pfhPeriodMetric"><span>PERIOD</span><div class="pfhPeriodDates"><div><small>FROM</small><strong>'+pfhEsc(pfhFormatDate(from))+'</strong></div><i aria-hidden="true">→</i><div><small>TO</small><strong>'+pfhEsc(pfhFormatDate(to))+'</strong></div></div></article>';
}
function pfhGroup(rows,keyFn){const m=new Map();rows.forEach(r=>{const k=keyFn(r)||"-";if(!m.has(k))m.set(k,[]);m.get(k).push(r);});return m;}
async function pfhToggleWorkspace(card){
    const id=card?.dataset?.pfhWorkspace;if(!id)return;const detail=card.querySelector(".pfhWorkspaceDetail"),opening=detail.hidden;
    card.classList.toggle("open",opening);detail.hidden=!opening;if(!opening)return;
    if(PharmFlowReceivingHistory.details.has(id)){pfhRenderWorkspaceDetail(detail,PharmFlowReceivingHistory.details.get(id));return;}
    detail.innerHTML='<div class="pfhLoading">Loading workspace…</div>';
    try{const rows=await authRpc("get_pharmflow_receiving_workspace_history_v1",{p_pharmacy_id:AuthState.context.pharmacy_id,p_workspace_history_id:id});const list=Array.isArray(rows)?rows:[];PharmFlowReceivingHistory.details.set(id,list);pfhRenderWorkspaceDetail(detail,list);}catch(error){detail.innerHTML='<div class="pfhEmpty">Unable to load workspace details.</div>';showToast?.(error.message||"Unable to load workspace","error");}
}
function pfhRenderWorkspaceDetail(host,rows){
    const disc=(rows||[]).filter(r=>r.event_type==="DISCREPANCY");
    if(!disc.length){host.innerHTML='<div class="pfhEmpty">Completed with no discrepancies.</div>';return;}
    const groups=pfhGroup(disc,r=>r.order_number);
    host.innerHTML=Array.from(groups.entries()).map(([order,list])=>'<section class="pfhOrder"><div class="pfhOrderHeader"><strong>Order '+pfhEsc(order)+'</strong><span>'+list.length+' discrepancy item(s)</span></div>'+pfhDiscrepancyTable(list)+'</section>').join("");
}
function pfhDiscrepancyTable(rows){return '<div class="pfhTableWrap"><table class="pfhTable"><thead><tr><th>Item Number</th><th>Item Name</th><th>Ordered</th><th>Received</th><th>Difference</th><th>Issue</th></tr></thead><tbody>'+rows.map(r=>{const issue=String(r.issue_type||"");const cls=/SHORT|NOT RECEIVED/.test(issue)?"short":/OVER/.test(issue)?"over":"extra";const diff=pfhNum(r.difference);return '<tr><td>'+pfhEsc(r.item_code)+'</td><td>'+pfhEsc(r.item_name)+'</td><td class="pfhNum">'+pfhEsc(r.ordered_qty)+'</td><td class="pfhNum">'+pfhEsc(r.received_qty)+'</td><td class="pfhNum">'+(diff>0?"+":"")+pfhEsc(diff)+'</td><td><span class="pfhIssue '+cls+'">'+pfhEsc(issue)+'</span></td></tr>';}).join("")+'</tbody></table></div>';}
function pfhNewTable(rows){return '<div class="pfhTableWrap"><table class="pfhTable"><thead><tr><th>Date</th><th>Item Number</th><th>Item Name</th><th>Quantity</th><th>Type</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+pfhEsc(pfhDate(r.completed_at))+'</td><td>'+pfhEsc(r.item_code)+'</td><td>'+pfhEsc(r.item_name)+'</td><td class="pfhNum">'+pfhEsc(r.ordered_qty)+'</td><td><span class="pfhNewBadge">NEW</span></td></tr>').join("")+'</tbody></table></div>';}

async function pfhAllDiscrepancies(){
    const out=[];
    for(const ws of PharmFlowReceivingHistory.workspaces||[]){
        let rows=PharmFlowReceivingHistory.details.get(ws.workspace_history_id);
        if(!rows){rows=await authRpc("get_pharmflow_receiving_workspace_history_v1",{p_pharmacy_id:AuthState.context.pharmacy_id,p_workspace_history_id:ws.workspace_history_id});rows=Array.isArray(rows)?rows:[];PharmFlowReceivingHistory.details.set(ws.workspace_history_id,rows);}
        rows.filter(r=>r.event_type==="DISCREPANCY").forEach(r=>out.push({...r,completed_at:ws.completed_at,workspace_history_id:ws.workspace_history_id}));
    }
    return out;
}
async function pfhExportExcel(){
    if(typeof XLSX==="undefined"){showToast?.("Excel library is unavailable","error");return;}
    try{
        const isNew=PharmFlowReceivingHistory.mode==="new",rows=isNew?(PharmFlowReceivingHistory.newItems||[]):await pfhAllDiscrepancies();
        if(!rows.length){showToast?.("No report rows to export","warning");return;}
        const aoa=isNew
          ? [["Completed Date","Order Number","Order Name","Order Date","Item Number","Item Name","Quantity","Type"],...rows.map(r=>[pfhDateTime(r.completed_at),r.order_number,r.order_name,r.order_date,r.item_code,r.item_name,r.ordered_qty,"NEW"])]
          : [["Completed Date","Order Number","Order Name","Order Date","Item Number","Item Name","Ordered","Received","Difference","Issue Type"],...rows.map(r=>[pfhDateTime(r.completed_at),r.order_number,r.order_name,r.order_date,r.item_code,r.item_name,r.ordered_qty,r.received_qty,r.difference,r.issue_type])];
        const ws=XLSX.utils.aoa_to_sheet(aoa);ws["!cols"]=aoa[0].map((_,i)=>({wch:i===5?42:i===2?28:16}));const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,isNew?"NEW Items":"Discrepancies");XLSX.writeFile(wb,(isNew?"PharmFlow NEW Items ":"PharmFlow Receiving History ")+PharmFlowReceivingHistory.from+" to "+PharmFlowReceivingHistory.to+".xlsx");showToast?.("Historical report exported to Excel","success");
    }catch(error){Logger?.error?.("History Excel export failed",error);showToast?.("Unable to export Excel","error");}
}
async function pfhExportPdf(){
    if(!window.jspdf?.jsPDF){showToast?.("PDF library is unavailable","error");return;}
    try{
        const isNew=PharmFlowReceivingHistory.mode==="new",rows=isNew?(PharmFlowReceivingHistory.newItems||[]):await pfhAllDiscrepancies();
        if(!rows.length){showToast?.("No report rows to export","warning");return;}
        const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:"landscape",unit:"pt",format:"a4"}),pageW=doc.internal.pageSize.getWidth(),pageH=doc.internal.pageSize.getHeight(),margin=34;
        let y=38,page=1;const title=isNew?"NEW High Priority History":"Receiving Discrepancy History";
        const header=()=>{doc.setFont("helvetica","bold");doc.setFontSize(9);doc.text("PHARMFLOW",margin,y);doc.setFontSize(18);doc.text(title,margin,y+23);doc.setFont("helvetica","normal");doc.setFontSize(9);doc.text(PharmFlowReceivingHistory.from+" to "+PharmFlowReceivingHistory.to,margin,y+40);y+=62;};
        const footer=()=>{doc.setFontSize(8);doc.text("Page "+page,pageW-margin-40,pageH-18);};
        header();
        let lastOrder="";
        for(const r of rows){
            if(y>pageH-70){footer();doc.addPage();page++;y=38;header();lastOrder="";}
            if(r.order_number!==lastOrder){doc.setFillColor(247,242,238);doc.rect(margin,y,pageW-margin*2,22,"F");doc.setFont("helvetica","bold");doc.setFontSize(10);doc.text("Order "+String(r.order_number||"-"),margin+8,y+15);y+=30;lastOrder=r.order_number;}
            doc.setFont("helvetica","normal");doc.setFontSize(8);
            const name=doc.splitTextToSize(String(r.item_name||""),250).slice(0,2);
            doc.text(String(r.item_code||""),margin,y);doc.text(name,margin+100,y);
            if(isNew){doc.text("Qty "+String(r.ordered_qty??0),margin+370,y);doc.text("NEW",margin+455,y);doc.text(pfhDate(r.completed_at),margin+520,y);}
            else{doc.text("Ord "+String(r.ordered_qty??0),margin+370,y);doc.text("Rec "+String(r.received_qty??0),margin+430,y);doc.text("Diff "+String(r.difference??0),margin+495,y);doc.text(String(r.issue_type||""),margin+560,y);}
            y+=name.length>1?24:18;
        }
        footer();doc.save((isNew?"PharmFlow NEW Items ":"PharmFlow Receiving History ")+PharmFlowReceivingHistory.from+" to "+PharmFlowReceivingHistory.to+".pdf");showToast?.("Historical report exported to PDF","success");
    }catch(error){Logger?.error?.("History PDF export failed",error);showToast?.("Unable to export PDF","error");}
}
function pfhBoot(){pfhEnsureUI();}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",pfhBoot,{once:true});else setTimeout(pfhBoot,0);
window.PharmFlowReceivingHistory=PharmFlowReceivingHistory;
