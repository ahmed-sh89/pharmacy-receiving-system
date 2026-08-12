"use strict";

/* =====================================================
   PHARMACY RECEIVING SYSTEM V3
   REPORT ENGINE
===================================================== */

const ReportsEngine = {
    initialized:false,
    currentItemReport:{
        itemCode:"",
        itemName:"",
        fromDate:"",
        toDate:"",
        transactions:[],
        totalReceived:0,
        orderCount:0,
        firstReceipt:null,
        lastReceipt:null
    }
};

function initializeReports(){
    if(ReportsEngine.initialized){
        return;
    }
    initializeReportDates();
    resetItemReportUI();
    ReportsEngine.initialized = true;
    Logger.info("Reports module initialized");
}

function initializeReportDates(){
    const fromInput = document.getElementById("reportFromDate");
    const toInput = document.getElementById("reportToDate");
    if(!fromInput || !toInput){
        return;
    }

    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    if(!fromInput.value){
        fromInput.value = dateOnlyISO(firstDay);
    }
    if(!toInput.value){
        toInput.value = dateOnlyISO(lastDay);
    }
}

function createReportFallbackTransactionKey(transaction){
    return [
        normalizeItemCode(transaction.itemCode),
        toSafeString(transaction.orderId),
        toSafeString(transaction.dateTime),
        toNumber(transaction.quantity,0),
        toSafeString(transaction.deviceId),
        toSafeString(transaction.source)
    ].join("|");
}

function getAllHistoricalTransactions(){
    const archived = Array.isArray(AppState.archive.transactions)
        ? AppState.archive.transactions
        : [];

    const current = Array.isArray(AppState.workspace.receivingHistory)
        ? AppState.workspace.receivingHistory
        : [];

    const transactionMap = new Map();

    archived.forEach(transaction=>{
        if(!transaction){
            return;
        }

        const key = transaction.transactionId
            || createReportFallbackTransactionKey(transaction);

        transactionMap.set(key, transaction);
    });

    current.forEach(transaction=>{
        if(!transaction){
            return;
        }

        const key = transaction.transactionId
            || createReportFallbackTransactionKey(transaction);

        transactionMap.set(key, transaction);
    });

    return Array.from(transactionMap.values());
}

function getReportSearchableItems(){
    if(typeof getHistoricalSearchableItems === "function"){
        return getHistoricalSearchableItems();
    }

    const itemMap = new Map();

    AppState.workspace.orderData.forEach(item=>{
        const code = normalizeItemCode(item.itemCode);
        if(!code){
            return;
        }

        itemMap.set(code,{
            itemCode:code,
            itemName:toSafeString(item.itemName)
        });
    });

    getAllHistoricalTransactions().forEach(transaction=>{
        const code = normalizeItemCode(transaction.itemCode);
        if(!code){
            return;
        }

        if(!itemMap.has(code)){
            itemMap.set(code,{
                itemCode:code,
                itemName:toSafeString(transaction.itemName)
            });
        }
    });

    return sortByItemName(Array.from(itemMap.values()));
}

function generateItemReceivingReport(){
    const selectedItem = AppState.ui.selectedReportItem;

    if(!selectedItem || !selectedItem.itemCode){
        showToast("Select an item first","warning");
        return false;
    }

    const fromInput = document.getElementById("reportFromDate");
    const toInput = document.getElementById("reportToDate");

    const fromDate = fromInput ? fromInput.value : "";
    const toDate = toInput ? toInput.value : "";

    if(fromDate && toDate && fromDate > toDate){
        showToast("From Date cannot be after To Date","warning");
        return false;
    }

    showLoading("Generating item report...");

    try{
        const report = buildItemReceivingReport(
            selectedItem.itemCode,
            selectedItem.itemName,
            fromDate,
            toDate
        );

        ReportsEngine.currentItemReport = report;
        renderItemReceivingReport(report);

        showToast(
            report.totalReceived + " unit(s) received in selected period",
            "success"
        );

        return report;
    }
    catch(error){
        Logger.error("Item report generation failed",error);
        showToast("Unable to generate item report","error");
        return false;
    }
    finally{
        hideLoading();
    }
}

function buildItemReceivingReport(itemCode,itemName,fromDate,toDate){
    const normalizedCode = normalizeItemCode(itemCode);

    const transactions = getAllHistoricalTransactions()
        .filter(transaction=>{
            const sameItem =
                normalizeItemCode(transaction.itemCode) === normalizedCode;

            if(!sameItem){
                return false;
            }

            return isDateInsideRange(
                transaction.dateTime,
                fromDate,
                toDate
            );
        })
        .sort((a,b)=>
            new Date(a.dateTime || 0) - new Date(b.dateTime || 0)
        );

    const totalReceived = transactions.reduce(
        (total,transaction)=>
            total + toNumber(transaction.quantity,0),
        0
    );

    const orderIds = new Set();

    transactions.forEach(transaction=>{
        if(transaction.orderId){
            orderIds.add(transaction.orderId);
        }
    });

    let resolvedItemName = toSafeString(itemName);

    if(!resolvedItemName && transactions.length > 0){
        resolvedItemName = toSafeString(transactions[0].itemName);
    }

    return {
        itemCode:normalizedCode,
        itemName:resolvedItemName || normalizedCode,
        fromDate:fromDate,
        toDate:toDate,
        transactions:transactions,
        totalReceived:totalReceived,
        orderCount:orderIds.size,
        firstReceipt:transactions.length ? transactions[0].dateTime : null,
        lastReceipt:transactions.length
            ? transactions[transactions.length - 1].dateTime
            : null
    };
}

function renderItemReceivingReport(report){
    setElementText(
        document.getElementById("reportSelectedItem"),
        report.itemName || "-"
    );

    setElementText(
        document.getElementById("reportSelectedCode"),
        report.itemCode || "-"
    );

    setElementText(
        document.getElementById("reportTotalReceived"),
        report.totalReceived
    );

    setElementText(
        document.getElementById("reportOrderCount"),
        report.orderCount
    );

    renderItemReportTable(report.transactions);
}

function renderItemReportTable(transactions){
    const tbody = document.getElementById("itemReportTableBody");

    if(!tbody){
        return;
    }

    tbody.innerHTML = "";

    if(!Array.isArray(transactions) || transactions.length === 0){
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="tableEmptyState">
                    No receiving transactions found for the selected item and date range.
                </td>
            </tr>
        `;
        return;
    }

    const fragment = document.createDocumentFragment();

    transactions.forEach(transaction=>{
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${escapeHTML(formatDateTime(transaction.dateTime))}</td>
            <td>${escapeHTML(transaction.orderId || "-")}</td>
            <td>${escapeHTML(transaction.itemCode || "-")}</td>
            <td>${escapeHTML(transaction.itemName || "-")}</td>
            <td>${toNumber(transaction.quantity,0)}</td>
            <td>${escapeHTML(transaction.source || "-")}</td>
            <td>${escapeHTML(transaction.deviceId || "-")}</td>
        `;

        fragment.appendChild(row);
    });

    const total = transactions.reduce(
        (sum,transaction)=>sum + toNumber(transaction.quantity,0),
        0
    );

    const totalRow = document.createElement("tr");
    totalRow.className = "reportTotalRow";

    totalRow.innerHTML = `
        <td colspan="4">TOTAL RECEIVED</td>
        <td>${total}</td>
        <td colspan="2"></td>
    `;

    fragment.appendChild(totalRow);
    tbody.appendChild(fragment);
}

function getCurrentItemReportSummary(){
    const report = ReportsEngine.currentItemReport;

    return {
        itemCode:report.itemCode,
        itemName:report.itemName,
        fromDate:report.fromDate,
        toDate:report.toDate,
        totalReceived:report.totalReceived,
        orderCount:report.orderCount,
        firstReceipt:report.firstReceipt,
        lastReceipt:report.lastReceipt,
        transactionCount:report.transactions.length
    };
}

function getCurrentItemReportByOrder(){
    const report = ReportsEngine.currentItemReport;
    const orderMap = new Map();

    report.transactions.forEach(transaction=>{
        const orderId = transaction.orderId || "UNKNOWN";

        if(!orderMap.has(orderId)){
            orderMap.set(orderId,{
                orderId:orderId,
                quantity:0,
                transactions:0,
                firstReceipt:transaction.dateTime,
                lastReceipt:transaction.dateTime
            });
        }

        const row = orderMap.get(orderId);

        row.quantity += toNumber(transaction.quantity,0);
        row.transactions++;

        if(new Date(transaction.dateTime) < new Date(row.firstReceipt)){
            row.firstReceipt = transaction.dateTime;
        }

        if(new Date(transaction.dateTime) > new Date(row.lastReceipt)){
            row.lastReceipt = transaction.dateTime;
        }
    });

    return Array.from(orderMap.values());
}

function getCurrentItemReportByDay(){
    const report = ReportsEngine.currentItemReport;
    const dayMap = new Map();

    report.transactions.forEach(transaction=>{
        const day = dateOnlyISO(transaction.dateTime);

        if(!dayMap.has(day)){
            dayMap.set(day,{
                date:day,
                quantity:0,
                transactions:0,
                orders:new Set()
            });
        }

        const row = dayMap.get(day);

        row.quantity += toNumber(transaction.quantity,0);
        row.transactions++;

        if(transaction.orderId){
            row.orders.add(transaction.orderId);
        }
    });

    return Array.from(dayMap.values())
        .map(row=>({
            date:row.date,
            quantity:row.quantity,
            transactions:row.transactions,
            orders:row.orders.size
        }))
        .sort((a,b)=>a.date.localeCompare(b.date));
}

function buildMonthlyReceivingSummary(){
    const map = new Map();

    getAllHistoricalTransactions().forEach(transaction=>{
        const date = new Date(transaction.dateTime);

        if(Number.isNaN(date.getTime())){
            return;
        }

        const month =
            date.getFullYear()
            + "-"
            + String(date.getMonth() + 1).padStart(2,"0");

        if(!map.has(month)){
            map.set(month,{
                month:month,
                quantity:0,
                transactions:0,
                orders:new Set(),
                items:new Set()
            });
        }

        const row = map.get(month);

        row.quantity += toNumber(transaction.quantity,0);
        row.transactions++;

        if(transaction.orderId){
            row.orders.add(transaction.orderId);
        }

        if(transaction.itemCode){
            row.items.add(normalizeItemCode(transaction.itemCode));
        }
    });

    return Array.from(map.values())
        .map(row=>({
            month:row.month,
            totalReceivedUnits:row.quantity,
            transactions:row.transactions,
            orders:row.orders.size,
            uniqueItems:row.items.size
        }))
        .sort((a,b)=>a.month.localeCompare(b.month));
}

function buildArchivedOrdersReport(){
    const orders = Array.isArray(AppState.archive.orders)
        ? AppState.archive.orders
        : [];

    return orders.map(order=>({
        orderId:order.orderId,
        orderName:order.orderName,
        createdAt:order.createdAt,
        startedAt:order.startedAt,
        closedAt:order.closedAt,
        totalItems:toInteger(order.totalItems,0),
        completedItems:toInteger(order.completedItems,0),
        remainingItems:toInteger(order.remainingItems,0),
        manualItems:toInteger(order.manualItems,0),
        totalTransactions:toInteger(order.totalTransactions,0),
        totalReceivedUnits:toNumber(order.totalReceivedUnits,0),
        status:order.status || "Closed",
        deviceId:order.deviceId || "-"
    }));
}

function buildCurrentOrderReport(){
    return AppState.workspace.orderData.map((item,index)=>({
        No:index + 1,
        "Item Number":item.itemCode,
        "Item Name":item.itemName,
        "Ordered Qty":toNumber(item.orderedQty,0),
        "Received Qty":toNumber(item.receivedQty,0),
        "Remaining Qty":toNumber(item.remainingQty,0),
        Status:item.status,
        Manual:item.manual ? "Yes" : "No"
    }));
}

function buildTransactionExportRows(transactions){
    const safeTransactions = Array.isArray(transactions)
        ? transactions
        : [];

    return safeTransactions.map((transaction,index)=>({
        No:index + 1,
        Date:formatDateTime(transaction.dateTime),
        "Order ID":transaction.orderId || "",
        "Item Number":transaction.itemCode || "",
        "Item Name":transaction.itemName || "",
        Quantity:toNumber(transaction.quantity,0),
        GTIN:transaction.gtin || "",
        LOT:transaction.lot || "",
        Expiry:transaction.expiry || "",
        Serial:transaction.serial || "",
        Source:transaction.source || "",
        Device:transaction.deviceId || ""
    }));
}

function exportCurrentItemReport(){
    const report = ReportsEngine.currentItemReport;

    if(!report || !report.itemCode){
        showToast("Generate the item report first","warning");
        return false;
    }

    if(report.transactions.length === 0){
        showToast("No report transactions to export","warning");
        return false;
    }

    if(typeof XLSX === "undefined"){
        showToast("Excel library is unavailable","error");
        return false;
    }

    try{
        const workbook = XLSX.utils.book_new();

        const summaryRows = [
            {Field:"Item Name",Value:report.itemName},
            {Field:"Item Number",Value:report.itemCode},
            {Field:"From Date",Value:report.fromDate || "All"},
            {Field:"To Date",Value:report.toDate || "All"},
            {Field:"Total Received",Value:report.totalReceived},
            {Field:"Number of Orders",Value:report.orderCount},
            {Field:"Transactions",Value:report.transactions.length},
            {
                Field:"First Receipt",
                Value:report.firstReceipt
                    ? formatDateTime(report.firstReceipt)
                    : "-"
            },
            {
                Field:"Last Receipt",
                Value:report.lastReceipt
                    ? formatDateTime(report.lastReceipt)
                    : "-"
            }
        ];

        appendSheetToWorkbook(workbook,"Summary",summaryRows);

        appendSheetToWorkbook(
            workbook,
            "Transactions",
            buildTransactionExportRows(report.transactions)
        );

        appendSheetToWorkbook(
            workbook,
            "By Order",
            getCurrentItemReportByOrder().map(row=>({
                "Order ID":row.orderId,
                Quantity:row.quantity,
                Transactions:row.transactions,
                "First Receipt":formatDateTime(row.firstReceipt),
                "Last Receipt":formatDateTime(row.lastReceipt)
            }))
        );

        appendSheetToWorkbook(
            workbook,
            "By Day",
            getCurrentItemReportByDay().map(row=>({
                Date:row.date,
                Quantity:row.quantity,
                Transactions:row.transactions,
                Orders:row.orders
            }))
        );

        XLSX.writeFile(
            workbook,
            buildItemReportFileName(report)
        );

        showToast("Item report exported","success");
        return true;
    }
    catch(error){
        Logger.error("Item report export failed",error);
        showToast("Unable to export item report","error");
        return false;
    }
}

function exportAllReports(){
    if(typeof XLSX === "undefined"){
        showToast("Excel library is unavailable","error");
        return false;
    }

    showLoading("Preparing reports...");

    try{
        const workbook = XLSX.utils.book_new();

        appendSheetToWorkbook(
            workbook,
            "Current Order",
            buildCurrentOrderReport()
        );

        appendSheetToWorkbook(
            workbook,
            "Current Transactions",
            buildTransactionExportRows(
                AppState.workspace.receivingHistory
            )
        );

        appendSheetToWorkbook(
            workbook,
            "Archived Orders",
            buildArchivedOrdersReport().map(order=>({
                "Order ID":order.orderId,
                "Order Name":order.orderName,
                Created:formatDateTime(order.createdAt),
                Started:formatDateTime(order.startedAt),
                Closed:formatDateTime(order.closedAt),
                "Total Items":order.totalItems,
                Completed:order.completedItems,
                Remaining:order.remainingItems,
                Manual:order.manualItems,
                Transactions:order.totalTransactions,
                "Received Units":order.totalReceivedUnits,
                Status:order.status,
                Device:order.deviceId
            }))
        );

        appendSheetToWorkbook(
            workbook,
            "Historical Transactions",
            buildTransactionExportRows(
                AppState.archive.transactions
            )
        );

        appendSheetToWorkbook(
            workbook,
            "Monthly Summary",
            buildMonthlyReceivingSummary().map(row=>({
                Month:row.month,
                "Received Units":row.totalReceivedUnits,
                Transactions:row.transactions,
                Orders:row.orders,
                "Unique Items":row.uniqueItems
            }))
        );

        const fileName =
            APP_CONFIG.reports.defaultFilePrefix
            + "_"
            + dateOnlyISO()
            + ".xlsx";

        XLSX.writeFile(workbook,fileName);

        showToast("Reports exported","success");
        return true;
    }
    catch(error){
        Logger.error("Report export failed",error);
        showToast("Unable to export reports","error");
        return false;
    }
    finally{
        hideLoading();
    }
}

function appendSheetToWorkbook(workbook,sheetName,rows){
    const safeRows = Array.isArray(rows)
        ? rows
        : [];

    const worksheet = safeRows.length > 0
        ? XLSX.utils.json_to_sheet(safeRows)
        : XLSX.utils.aoa_to_sheet([["No data available"]]);

    autoSizeWorksheetColumns(worksheet,safeRows);

    XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        sanitizeWorksheetName(sheetName)
    );
}

function autoSizeWorksheetColumns(worksheet,rows){
    if(!Array.isArray(rows) || rows.length === 0){
        return;
    }

    const headers = Object.keys(rows[0]);

    worksheet["!cols"] = headers.map(header=>{
        let width = String(header).length;

        rows.forEach(row=>{
            width = Math.max(
                width,
                String(row[header] ?? "").length
            );
        });

        return {
            wch:Math.min(
                Math.max(width + 2,10),
                40
            )
        };
    });
}

function sanitizeWorksheetName(value){
    let name = toSafeString(value)
        .replace(/[\\/\?\*\[\]\:]/g," ")
        .trim();

    if(!name){
        name = "Report";
    }

    return name.slice(0,31);
}

function buildItemReportFileName(report){
    const safeCode = toSafeString(report.itemCode)
        .replace(/[^A-Za-z0-9_-]/g,"_");

    const from = report.fromDate || "ALL";
    const to = report.toDate || "ALL";

    return (
        APP_CONFIG.reports.itemReportFilePrefix
        + "_"
        + safeCode
        + "_"
        + from
        + "_TO_"
        + to
        + ".xlsx"
    );
}

function exportCurrentItemReportCSV(){
    const report = ReportsEngine.currentItemReport;

    if(
        !report ||
        !report.itemCode ||
        report.transactions.length === 0
    ){
        showToast("Generate the item report first","warning");
        return false;
    }

    const rows = buildTransactionExportRows(report.transactions);
    const csv = objectsToCSV(rows);

    const blob = new Blob(
        ["﻿",csv],
        {
            type:"text/csv;charset=utf-8"
        }
    );

    const fileName = buildItemReportFileName(report)
        .replace(/\.xlsx$/i,".csv");

    downloadBlob(blob,fileName);

    showToast("CSV report exported","success");
    return true;
}

function objectsToCSV(rows){
    if(!Array.isArray(rows) || rows.length === 0){
        return "";
    }

    const headers = Object.keys(rows[0]);
    const lines = [
        headers.map(escapeCSVValue).join(",")
    ];

    rows.forEach(row=>{
        lines.push(
            headers.map(header=>
                escapeCSVValue(row[header])
            ).join(",")
        );
    });

    return lines.join("\r\n");
}

function escapeCSVValue(value){
    const text = String(value ?? "");

    return (
        '"'
        + text.replace(/"/g,'""')
        + '"'
    );
}

function getReportsDebugSnapshot(){
    return {
        initialized:ReportsEngine.initialized,
        currentItem:getCurrentItemReportSummary(),
        searchableItems:getReportSearchableItems().length,
        currentTransactions:
            AppState.workspace.receivingHistory.length,
        archivedTransactions:
            AppState.archive.transactions.length,
        archivedOrders:
            AppState.archive.orders.length
    };
}

/* =====================================================
   END REPORT ENGINE
===================================================== */

/* =====================================================
   PHASE 2C.3.1 — RECEIVING DISCREPANCY REPORT
   Exception-only operational reconciliation.
   Official order reports remain sourced from uploaded order data.
===================================================== */
function getReceivingOrderMetadata(){
    const files=Array.isArray(AppState.workspace.orderFiles)?AppState.workspace.orderFiles:[];
    const seen=new Set();
    const rows=[];
    files.forEach(file=>{
        const orderNumber=toSafeString(file.documentId||file.orderNumber||"").trim();
        if(!orderNumber || seen.has(orderNumber)){ return; }
        seen.add(orderNumber);
        rows.push({
            orderNumber,
            orderDate:toSafeString(file.orderDate||"").trim(),
            fromWarehouse:toSafeString(file.fromWarehouse||"").trim(),
            toWarehouse:toSafeString(file.toWarehouse||"").trim(),
            sourceFile:toSafeString(file.name||"").trim()
        });
    });
    if(!rows.length){
        const fallback=toSafeString(AppState.workspace.orderId||AppState.workspace.orderName||"").trim();
        if(fallback){ rows.push({orderNumber:fallback,orderDate:"",fromWarehouse:"",toWarehouse:"",sourceFile:""}); }
    }
    return rows;
}

function buildReceivingDiscrepancyReport(options={}){
    const visibleOnly=options.visibleOnly===true;
    const sourceItems=visibleOnly && typeof getVisibleReceivingItemsForExport==="function"
        ? getVisibleReceivingItemsForExport()
        : (Array.isArray(AppState.workspace.orderData)?AppState.workspace.orderData:[]);
    const rows=[];
    let shortageItems=0, partialShortageItems=0, overItems=0, manualExtraItems=0;

    sourceItems.forEach((item)=>{
        const ordered=toNumber(item.orderedQty,0);
        const received=toNumber(item.receivedQty,0);
        const difference=received-ordered;
        const issueKey=typeof getReceivingIssueKey==="function" ? getReceivingIssueKey(item) : "";
        let issueType="";

        if(issueKey==="manual"){
            issueType="Manual / Unordered Extra"; manualExtraItems++;
        }else if(issueKey==="over"){
            issueType="Over Received"; overItems++;
        }else if(issueKey==="not_received"){
            issueType="Not Received"; shortageItems++;
        }else if(issueKey==="partial"){
            issueType="Partial Shortage"; shortageItems++; partialShortageItems++;
        }else{
            return;
        }

        rows.push({
            "Item Number":item.itemCode||"",
            "Item Name":item.itemName||"",
            "Ordered Qty":ordered,
            "Received Qty":received,
            "Difference":difference,
            "Issue Type":issueType,
            "Category":item.category||""
        });
    });

    const rank={"Not Received":1,"Partial Shortage":2,"Over Received":3,"Manual / Unordered Extra":4};
    rows.sort((a,b)=>(rank[a["Issue Type"]]||9)-(rank[b["Issue Type"]]||9)||String(a["Item Name"]).localeCompare(String(b["Item Name"])));
    const orderMetadata=getReceivingOrderMetadata();
    return {
        orderId:orderMetadata.map(x=>x.orderNumber).join(" + ") || AppState.workspace.orderId || AppState.workspace.orderName || "Current Order",
        orders:orderMetadata,
        totalDiscrepancies:rows.length,
        shortageItems,
        partialShortageItems,
        overItems,
        manualExtraItems,
        rows
    };
}

function refreshReceivingVerificationSummary(){
    const all=buildReceivingDiscrepancyReport({visibleOnly:false});
    const visible=buildReceivingDiscrepancyReport({visibleOnly:true});
    const values={
        rsDisplayedItems:visible.totalDiscrepancies,
        rsTotalItems:all.totalDiscrepancies,
        rsShort:all.shortageItems,
        rsOver:all.overItems,
        rsManual:all.manualExtraItems
    };
    Object.entries(values).forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.textContent=value;});
    return visible;
}

function exportReceivingSummaryExcel(){
    if(typeof XLSX==="undefined"){showToast("Excel library is unavailable","error");return false;}
    const s=buildReceivingDiscrepancyReport({visibleOnly:true});
    if(!s.rows.length){showToast("No displayed discrepancies to export","warning");return false;}

    const aoa=[];
    aoa.push(["Order Number","Order Date","From Warehouse","To Warehouse","Source File"]);
    (s.orders||[]).forEach(o=>aoa.push([o.orderNumber,o.orderDate,o.fromWarehouse,o.toWarehouse,o.sourceFile]));
    aoa.push([]);
    const headerRow=aoa.length+1;
    aoa.push(["Item Number","Item Name","Ordered Qty","Received Qty","Difference","Issue Type","Category"]);
    s.rows.forEach(r=>aoa.push([r["Item Number"],r["Item Name"],r["Ordered Qty"],r["Received Qty"],r.Difference,r["Issue Type"],r.Category]));
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"]=[{wch:18},{wch:44},{wch:13},{wch:13},{wch:12},{wch:25},{wch:22}];
    ws["!freeze"]={xSplit:0,ySplit:headerRow};
    ws["!autofilter"]={ref:`A${headerRow}:G${aoa.length}`};
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"Discrepancies");
    XLSX.writeFile(wb,"PharmFlow_Receiving_Discrepancies_"+String(s.orderId).replace(/[^a-z0-9_-]+/gi,"_")+".xlsx");
    showToast("Displayed discrepancy rows exported to Excel","success"); return true;
}

function exportReceivingSummaryPDF(){
    const s=buildReceivingDiscrepancyReport({visibleOnly:true});
    if(!s.rows.length){showToast("No displayed discrepancies to export","warning");return false;}
    if(!window.jspdf || !window.jspdf.jsPDF){showToast("PDF library is unavailable","error");return false;}
    const {jsPDF}=window.jspdf;
    const doc=new jsPDF({orientation:"landscape",unit:"pt",format:"a4"});
    const pageW=doc.internal.pageSize.getWidth(), pageH=doc.internal.pageSize.getHeight();
    const margin=32;
    const cols=[
        {key:"Item Number",label:"Item Number",x:32,w:82},
        {key:"Item Name",label:"Item Name",x:114,w:272},
        {key:"Ordered Qty",label:"Ordered",x:386,w:68},
        {key:"Received Qty",label:"Received",x:454,w:68},
        {key:"Difference",label:"Difference",x:522,w:68},
        {key:"Issue Type",label:"Issue Type",x:590,w:150},
        {key:"Category",label:"Category",x:740,w:68}
    ];
    const rowH=24;
    let y=0,pageNo=0;

    function drawOrderMetadata(){
        doc.setFont("helvetica","bold");doc.setFontSize(8);
        doc.text("Order Number",margin,y);doc.text("Order Date",170,y);doc.text("From Warehouse",255,y);doc.text("To Warehouse",405,y);doc.text("Source File",555,y);
        y+=13;
        doc.setFont("helvetica","normal");
        (s.orders||[]).forEach(o=>{
            if(y>112){return;}
            doc.text(String(o.orderNumber||"-"),margin,y);
            doc.text(String(o.orderDate||"-"),170,y);
            doc.text(doc.splitTextToSize(String(o.fromWarehouse||"-"),140).slice(0,1),255,y);
            doc.text(doc.splitTextToSize(String(o.toWarehouse||"-"),140).slice(0,1),405,y);
            doc.text(doc.splitTextToSize(String(o.sourceFile||"-"),245).slice(0,1),555,y);
            y+=12;
        });
        y+=5;
        doc.setDrawColor(210);doc.line(margin,y,pageW-margin,y);y+=14;
    }

    function header(){
        pageNo++;
        y=32;
        if(pageNo===1){ drawOrderMetadata(); }
        doc.setFont("helvetica","bold");doc.setFontSize(8);
        cols.forEach(c=>doc.text(c.label,c.x,y));
        doc.setDrawColor(185);doc.line(margin,y+6,pageW-margin,y+6);
        y+=18;
    }
    function footer(){
        doc.setFont("helvetica","normal");doc.setFontSize(8);
        doc.text(`Page ${pageNo}`,pageW-margin-35,pageH-18);
        doc.text(`${s.rows.length} displayed discrepancy item(s)`,margin,pageH-18);
    }
    header();
    s.rows.forEach((r)=>{
        if(y+rowH>pageH-38){footer();doc.addPage();header();}
        doc.setFont("helvetica","normal");doc.setFontSize(8);
        const nameLines=doc.splitTextToSize(String(r["Item Name"]||""),cols[1].w-8).slice(0,2);
        const catLines=doc.splitTextToSize(String(r.Category||""),cols[6].w-4).slice(0,2);
        doc.text(String(r["Item Number"]||""),cols[0].x,y);
        doc.text(nameLines,cols[1].x,y);
        doc.text(String(r["Ordered Qty"]),cols[2].x,y);
        doc.text(String(r["Received Qty"]),cols[3].x,y);
        doc.text((r.Difference>0?"+":"")+String(r.Difference),cols[4].x,y);
        doc.setFont("helvetica","bold");doc.text(String(r["Issue Type"]),cols[5].x,y);
        doc.setFont("helvetica","normal");doc.text(catLines,cols[6].x,y);
        doc.setDrawColor(225);doc.line(margin,y+15,pageW-margin,y+15);
        y+=rowH;
    });
    footer();
    doc.save("PharmFlow_Receiving_Discrepancies_"+String(s.orderId).replace(/[^a-z0-9_-]+/gi,"_")+".pdf");
    showToast("Displayed discrepancy rows exported to PDF","success"); return true;
}


/* =====================================================
   PHARMFLOW PHASE 2C.5 — ITEM TRANSFER REPORT
   Official business report. Reads ONLY the immutable original uploaded
   order snapshot. Physical receiving quantities never alter this report.
===================================================== */

ReportsEngine.itemTransfer={
    orderNumber:"",
    orderMeta:null,
    rows:[]
};

function getReceivedOrderRegistryRows(){
    const rows=(typeof OrderLifecycleEngine!=="undefined" && Array.isArray(OrderLifecycleEngine.records))
        ? OrderLifecycleEngine.records
        : [];
    return rows.filter(row=>String(row.status||"").toLowerCase()==="received");
}

function refreshItemTransferOrderOptions(){
    const body=document.getElementById("itemTransferOrdersBody");
    const rows=getReceivedOrderRegistryRows();
    const availability=document.getElementById("itemTransferAvailability");
    if(availability){availability.textContent=rows.length?rows.length+" received order(s)":"No received orders";availability.classList.toggle("locked",!rows.length);availability.classList.toggle("available",!!rows.length);}
    if(!body)return;
    body.innerHTML=rows.length?rows.map(row=>`<tr><td><strong>${escapeHTML(row.order_number||"")}</strong></td><td>${escapeHTML(row.order_date||"-")}</td><td>${escapeHTML(row.from_warehouse||"-")}</td><td>${escapeHTML(row.to_warehouse||"-")}</td><td>${toNumber(row.item_count,0)}</td><td><span class="statusBadge statusCompleted">Received</span></td><td><button class="secondaryButton compactButton" data-item-transfer-order="${escapeHTML(row.order_number||"")}">View Report</button></td></tr>`).join(""):`<tr><td colspan="7" class="tableEmptyState">No finalized orders are available yet.</td></tr>`;
    body.querySelectorAll("[data-item-transfer-order]").forEach(btn=>btn.addEventListener("click",()=>loadItemTransferReport(btn.dataset.itemTransferOrder)));
}

function findReceivedOrderMeta(orderNumber){
    const key=normalizeOrderNumber(orderNumber);
    return getReceivedOrderRegistryRows().find(row=>normalizeOrderNumber(row.order_number)===key)||null;
}

function normalizeItemTransferRows(rows){
    return (Array.isArray(rows)?rows:[]).map((row,index)=>({
        lineNo:Number(row.line_no||index+1),
        itemCode:normalizeItemCode(row.item_code||row.itemCode||""),
        itemName:toSafeString(row.item_name||row.itemName||""),
        transferQty:toNumber(row.ordered_qty??row.orderedQty,0),
        category:toSafeString(row.category||"")
    })).filter(row=>row.itemCode && Number.isFinite(row.transferQty));
}

async function loadItemTransferReport(orderNumberOverride=""){
    const requested=normalizeOrderNumber(orderNumberOverride);
    if(!requested){showToast("Select a received order first","warning");return false;}

    showLoading("Loading original uploaded order…");
    try{
        if(typeof refreshOrderLifecycleRegistry==="function"){
            await refreshOrderLifecycleRegistry();
            refreshItemTransferOrderOptions();
        }
        const meta=findReceivedOrderMeta(requested);
        if(!meta){
            throw new Error("Item Transfer is locked until this order is finalized as Received");
        }
        if(typeof getOriginalUploadedOrderSnapshot!=="function"){
            throw new Error("Original order source module is unavailable");
        }
        const raw=await getOriginalUploadedOrderSnapshot(requested);
        const rows=normalizeItemTransferRows(raw);
        if(!rows.length){
            throw new Error("Original uploaded-order snapshot is unavailable for "+requested+". This report cannot use receiving quantities as a substitute.");
        }
        ReportsEngine.itemTransfer={orderNumber:requested,orderMeta:meta,rows};
        renderItemTransferReport();
        showToast("Item Transfer loaded from original order data","success");
        return true;
    }catch(error){
        Logger.error("Item Transfer load failed",error);
        showToast(error.message||"Unable to load Item Transfer report","error");
        return false;
    }finally{hideLoading();}
}

function renderItemTransferReport(){
    const state=ReportsEngine.itemTransfer;
    const meta=state.orderMeta||{};
    const preview=document.getElementById("itemTransferReportPreview");
    const body=document.getElementById("itemTransferTableBody");
    if(preview){preview.classList.toggle("hidden",!state.rows.length);}
    const values={
        itemTransferOrderNumber:state.orderNumber||"-",
        itemTransferOrderDate:meta.order_date||"-",
        itemTransferFromWarehouse:meta.from_warehouse||"-",
        itemTransferToWarehouse:meta.to_warehouse||"-",
        itemTransferSourceFile:meta.source_file||"-",
        itemTransferItemCount:String(state.rows.length||0)
    };
    Object.entries(values).forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.textContent=value;});
    if(body){
        body.innerHTML=state.rows.map((row,index)=>`<tr><td>${index+1}</td><td>${escapeHTML(row.itemCode)}</td><td>${escapeHTML(row.itemName)}</td><td><strong>${toNumber(row.transferQty,0)}</strong></td><td>${escapeHTML(row.category||"-")}</td></tr>`).join("");
    }
    const availability=document.getElementById("itemTransferAvailability");
    if(availability){
        availability.textContent=state.rows.length?"Official source • Received":"Select a received order";
        availability.classList.toggle("locked",!state.rows.length);
        availability.classList.toggle("available",!!state.rows.length);
    }
    ["btnExportItemTransferExcel","btnExportItemTransferPDF"].forEach(id=>{const button=document.getElementById(id);if(button)button.disabled=!state.rows.length;});
}

function buildItemTransferExcelRows(){
    return ReportsEngine.itemTransfer.rows.map((row,index)=>({
        "No.":index+1,
        "Item Number":row.itemCode,
        "Item Name":row.itemName,
        "Transfer Qty":toNumber(row.transferQty,0),
        "Category":row.category||""
    }));
}

function safeReportOrderFilePart(value){
    return String(value||"ORDER").replace(/[^a-z0-9_-]+/gi,"_");
}

function exportItemTransferExcel(){
    const state=ReportsEngine.itemTransfer;
    if(!state.rows.length){showToast("Load a received order first","warning");return false;}
    if(typeof XLSX==="undefined"){showToast("Excel library is unavailable","error");return false;}
    const meta=state.orderMeta||{};
    const aoa=[
        ["Order Number",state.orderNumber,"Order Date",meta.order_date||""],
        ["From Warehouse",meta.from_warehouse||"","To Warehouse",meta.to_warehouse||""],
        ["Source File",meta.source_file||"","Status","Received"],
        [],
        ["No.","Item Number","Item Name","Transfer Qty","Category"]
    ];
    buildItemTransferExcelRows().forEach(row=>aoa.push([row["No."],row["Item Number"],row["Item Name"],row["Transfer Qty"],row.Category]));
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"]=[{wch:7},{wch:18},{wch:44},{wch:14},{wch:24}];
    ws["!autofilter"]={ref:`A5:E${aoa.length}`};
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"Item Transfer");
    XLSX.writeFile(wb,"PharmFlow_Item_Transfer_"+safeReportOrderFilePart(state.orderNumber)+".xlsx");
    showToast("Item Transfer exported to Excel","success");
    return true;
}

function exportItemTransferPDF(){
    const state=ReportsEngine.itemTransfer;
    if(!state.rows.length){showToast("Load a received order first","warning");return false;}
    if(!window.jspdf || !window.jspdf.jsPDF){showToast("PDF library is unavailable","error");return false;}
    const {jsPDF}=window.jspdf;
    const meta=state.orderMeta||{};
    const doc=new jsPDF({orientation:"landscape",unit:"pt",format:"a4"});
    const pageW=doc.internal.pageSize.getWidth(), pageH=doc.internal.pageSize.getHeight();
    const margin=32, rowH=23;
    const cols=[
        {x:32,w:36,label:"#"},
        {x:68,w:94,label:"Item Number"},
        {x:162,w:365,label:"Item Name"},
        {x:527,w:90,label:"Transfer Qty"},
        {x:617,w:190,label:"Category"}
    ];
    let y=0,pageNo=0;
    function drawMeta(){
        doc.setFont("helvetica","bold");doc.setFontSize(10);
        doc.text("Order "+state.orderNumber,margin,y);
        doc.setFont("helvetica","normal");doc.setFontSize(9);
        doc.text("Order Date: "+String(meta.order_date||"-"),210,y);
        doc.text("Status: Received",390,y);
        y+=16;
        doc.text("From: "+String(meta.from_warehouse||"-"),margin,y);
        doc.text("To: "+String(meta.to_warehouse||"-"),300,y);
        doc.text("Source: "+String(meta.source_file||"-"),540,y);
        y+=18;
    }
    function header(){
        pageNo++;y=30;
        if(pageNo===1){drawMeta();}
        doc.setFont("helvetica","bold");doc.setFontSize(8);
        cols.forEach(c=>doc.text(c.label,c.x,y));
        doc.setDrawColor(180);doc.line(margin,y+6,pageW-margin,y+6);y+=18;
    }
    function footer(){
        doc.setFont("helvetica","normal");doc.setFontSize(8);
        doc.text("Page "+pageNo,pageW-margin-35,pageH-18);
        doc.text(state.rows.length+" item(s) • Original uploaded order source",margin,pageH-18);
    }
    header();
    state.rows.forEach((row,index)=>{
        if(y+rowH>pageH-38){footer();doc.addPage();header();}
        doc.setFont("helvetica","normal");doc.setFontSize(8);
        doc.text(String(index+1),cols[0].x,y);
        doc.text(String(row.itemCode||""),cols[1].x,y);
        doc.text(doc.splitTextToSize(String(row.itemName||""),cols[2].w-8).slice(0,2),cols[2].x,y);
        doc.setFont("helvetica","bold");doc.text(String(toNumber(row.transferQty,0)),cols[3].x,y);
        doc.setFont("helvetica","normal");doc.text(doc.splitTextToSize(String(row.category||"-"),cols[4].w-8).slice(0,2),cols[4].x,y);
        doc.setDrawColor(230);doc.line(margin,y+15,pageW-margin,y+15);y+=rowH;
    });
    footer();
    doc.save("PharmFlow_Item_Transfer_"+safeReportOrderFilePart(state.orderNumber)+".pdf");
    showToast("Item Transfer exported to PDF","success");
    return true;
}

function bindItemTransferReportUI(){
    const excel=document.getElementById("btnExportItemTransferExcel");
    if(excel && excel.dataset.bound!=="1"){excel.dataset.bound="1";excel.addEventListener("click",exportItemTransferExcel);}
    const pdf=document.getElementById("btnExportItemTransferPDF");
    if(pdf && pdf.dataset.bound!=="1"){pdf.dataset.bound="1";pdf.addEventListener("click",exportItemTransferPDF);}
    refreshItemTransferOrderOptions();
}

window.refreshItemTransferOrderOptions=refreshItemTransferOrderOptions;
window.loadItemTransferReport=loadItemTransferReport;
window.exportItemTransferExcel=exportItemTransferExcel;
window.exportItemTransferPDF=exportItemTransferPDF;

setTimeout(()=>{
    bindItemTransferReportUI();
    if(typeof refreshOrderLifecycleRegistry==="function"){
        refreshOrderLifecycleRegistry().then(refreshItemTransferOrderOptions).catch(()=>{});
    }
},700);
