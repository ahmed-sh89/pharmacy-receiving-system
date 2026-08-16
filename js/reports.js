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

    /* Phase 2C.5.2.1: Item Transfer data can become available AFTER
       Reports initializes (auth context, IndexedDB archive restore, or
       cloud order registry refresh). Keep the selector synchronized with
       those late data sources instead of relying on one startup timeout. */
    if(typeof AppEvents!=="undefined" && AppEvents && typeof AppEvents.on==="function"){
        AppEvents.on("archive:updated",()=>{
            if(typeof refreshItemTransferOrderOptions==="function"){
                refreshItemTransferOrderOptions();
            }
        });
    }

    [400,1200,2500,5000].forEach(delay=>{
        setTimeout(async()=>{
            try{
                if(typeof restoreHistoricalArchive==="function" &&
                   typeof AppState!=="undefined" && AppState.archive &&
                   Array.isArray(AppState.archive.orders) && !AppState.archive.orders.length){
                    await restoreHistoricalArchive();
                }
                if(typeof refreshOrderLifecycleRegistry==="function" &&
                   typeof AuthState!=="undefined" && AuthState.context && AuthState.context.pharmacy_id){
                    await refreshOrderLifecycleRegistry();
                }
            }catch(error){
                if(typeof Logger!=="undefined" && Logger.warn){
                    Logger.warn("Item Transfer source refresh retry failed",error);
                }
            }finally{
                if(typeof refreshItemTransferOrderOptions==="function"){
                    refreshItemTransferOrderOptions();
                }
            }
        },delay);
    });

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

/* =====================================================
   PHASE 2C.10.2.7 — MULTI-ORDER RECEIVING SCOPE
===================================================== */

function getActiveReceivingOrderNumbers(){
    const files=Array.isArray(AppState?.workspace?.orderFiles)
        ? AppState.workspace.orderFiles
        : [];

    const seen=new Set();
    const rows=[];

    files.forEach(file=>{
        const number=normalizeOrderNumber(
            file?.documentId || file?.orderNumber || ""
        );

        if(number && !seen.has(number)){
            seen.add(number);
            rows.push(number);
        }
    });

    return rows;
}

function getSelectedReceivingOrderNumber(){
    const active=getActiveReceivingOrderNumbers();
    const raw=toSafeString(
        AppState?.workspace?.selectedOrderNumber || ""
    ).trim();

    if(raw.toUpperCase()==="ALL"){
        return "ALL";
    }

    const current=normalizeOrderNumber(raw);

    if(current && active.includes(current)){
        return current;
    }

    return active.length>1
        ? "ALL"
        : (active[0] || "");
}

function setSelectedReceivingOrderNumber(orderNumber){
    const raw=toSafeString(orderNumber||"").trim();
    const active=getActiveReceivingOrderNumbers();

    if(raw.toUpperCase()==="ALL"){
        if(!active.length){
            return false;
        }

        AppState.workspace.selectedOrderNumber="ALL";
        AppState.workspace.orderName="All Orders";

        saveWorkspaceSnapshot?.();
        refreshEntireUI?.();
        return true;
    }

    const normalized=normalizeOrderNumber(raw);

    if(!normalized || !active.includes(normalized)){
        return false;
    }

    AppState.workspace.selectedOrderNumber=normalized;
    AppState.workspace.orderName=normalized;

    saveWorkspaceSnapshot?.();
    refreshEntireUI?.();

    return true;
}

function getWorkspaceOrderFile(orderNumber){
    const normalized=normalizeOrderNumber(orderNumber);

    return (AppState?.workspace?.orderFiles||[]).find(
        file=>
            normalizeOrderNumber(
                file?.documentId || file?.orderNumber || ""
            )===normalized
    ) || null;
}

function getWorkspaceOrderSourceRows(orderNumber){
    const file=getWorkspaceOrderFile(orderNumber);

    if(file && Array.isArray(file.sourceRows) && file.sourceRows.length){
        return file.sourceRows.map(row=>({
            itemCode:normalizeItemCode(row?.itemCode||""),
            itemName:toSafeString(row?.itemName||""),
            orderedQty:toNumber(row?.orderedQty,0),
            category:toSafeString(row?.category||"")
        }));
    }

    /* Compatibility fallback for workspaces uploaded before 2C.10.2.7. */
    const normalized=normalizeOrderNumber(orderNumber);

    return (AppState?.workspace?.orderData||[])
        .filter(item=>
            Array.isArray(item?.orderNumbers) &&
            item.orderNumbers.some(
                value=>normalizeOrderNumber(value)===normalized
            )
        )
        .map(item=>({
            itemCode:item.itemCode,
            itemName:item.itemName,
            orderedQty:toNumber(item.orderedQty,0),
            category:item.category||""
        }));
}

function buildReceivedQuantityByOrder(){
    const totals=new Map();
    const activeOrders=getActiveReceivingOrderNumbers();

    const ensure=(order,itemCode)=>{
        const key=normalizeOrderNumber(order)+"||"+normalizeItemCode(itemCode);
        if(!totals.has(key)) totals.set(key,0);
        return key;
    };

    (AppState?.workspace?.receivingHistory||[]).forEach(tx=>{
        if(tx?.undone===true) return;

        const code=normalizeItemCode(tx?.itemCode||"");
        if(!code) return;

        let order=normalizeOrderNumber(
            tx?.orderNumber ||
            tx?.orderId ||
            tx?.selectedOrderNumber ||
            ""
        );

        if(!activeOrders.includes(order)){
            const item=getItemByCode?.(code);
            const memberships=(item?.orderNumbers||[])
                .map(normalizeOrderNumber)
                .filter(number=>activeOrders.includes(number));

            if(memberships.length===1){
                order=memberships[0];
            }else{
                order="";
            }
        }

        if(order){
            const key=ensure(order,code);
            totals.set(
                key,
                totals.get(key)+toNumber(tx?.quantity,0)
            );
        }
    });

    /* Legacy/unattributed quantities: distribute deterministically FIFO
       across active orders using original ordered quantities. */
    (AppState?.workspace?.orderData||[]).forEach(item=>{
        const code=normalizeItemCode(item?.itemCode||"");
        if(!code) return;

        const totalReceived=toNumber(item?.receivedQty,0);
        let attributed=0;

        activeOrders.forEach(order=>{
            attributed += totals.get(ensure(order,code)) || 0;
        });

        let remainder=Math.max(0,totalReceived-attributed);
        if(remainder<=0) return;

        const memberships=activeOrders
            .map(order=>({
                order,
                source:getWorkspaceOrderSourceRows(order)
                    .find(row=>normalizeItemCode(row.itemCode)===code)
            }))
            .filter(entry=>entry.source);

        memberships.forEach(entry=>{
            if(remainder<=0) return;

            const key=ensure(entry.order,code);
            const already=totals.get(key)||0;
            const ordered=toNumber(entry.source.orderedQty,0);
            const capacity=Math.max(0,ordered-already);
            const allocate=Math.min(remainder,capacity);

            if(allocate>0){
                totals.set(key,already+allocate);
                remainder-=allocate;
            }
        });

        if(remainder>0 && memberships.length){
            const target=getSelectedReceivingOrderNumber() || memberships[0].order;
            const chosen=memberships.find(x=>x.order===target) || memberships[memberships.length-1];
            const key=ensure(chosen.order,code);
            totals.set(key,(totals.get(key)||0)+remainder);
        }
    });

    return totals;
}

function getPerOrderReceivingRows(orderNumber){
    const normalized=normalizeOrderNumber(orderNumber);
    const source=getWorkspaceOrderSourceRows(normalized);
    const receivedMap=buildReceivedQuantityByOrder();

    const rows=source.map(row=>{
        const code=normalizeItemCode(row.itemCode||"");
        const received=toNumber(
            receivedMap.get(normalized+"||"+code),
            0
        );
        const ordered=toNumber(row.orderedQty,0);
        const difference=received-ordered;

        let issueKey="";
        let issueType="";

        if(received>ordered){
            issueKey="over";
            issueType="Over Received";
        }else if(ordered>0 && received<=0){
            issueKey="not_received";
            issueType="Not Received";
        }else if(ordered>0 && received>0 && received<ordered){
            issueKey="partial";
            issueType="Partial Shortage";
        }else if(received>0){
            issueKey="received_any";
            issueType="Received";
        }

        return {
            orderNumber:normalized,
            "Item Number":row.itemCode||"",
            "Item Name":row.itemName||"",
            "Ordered Qty":ordered,
            "Received Qty":received,
            "Difference":difference,
            "Issue Type":issueType,
            issueKey,
            "Category":row.category||""
        };
    });

    /* Manual extras attributed to the selected order / transaction order. */
    const manualItems=(AppState?.workspace?.orderData||[])
        .filter(item=>item?.manual===true && toNumber(item?.receivedQty,0)>0);

    manualItems.forEach(item=>{
        const txs=(AppState?.workspace?.receivingHistory||[])
            .filter(tx=>
                normalizeItemCode(tx?.itemCode||"")===normalizeItemCode(item.itemCode) &&
                normalizeOrderNumber(tx?.orderId||tx?.orderNumber||"")===normalized &&
                tx?.undone!==true
            );

        const received=txs.reduce(
            (sum,tx)=>sum+toNumber(tx?.quantity,0),
            0
        );

        if(received>0){
            rows.push({
                orderNumber:normalized,
                "Item Number":item.itemCode||"",
                "Item Name":item.itemName||"",
                "Ordered Qty":0,
                "Received Qty":received,
                "Difference":received,
                "Issue Type":"Manual / Unordered Extra",
                issueKey:"manual",
                "Category":item.category||""
            });
        }
    });

    return rows;
}

function getCurrentReceivingFilterKeys(){
    const set=
        typeof UI!=="undefined" &&
        UI.receivingFilters?.issues instanceof Set
            ? UI.receivingFilters.issues
            : new Set([
                "not_received",
                "partial",
                "received_any",
                "over",
                "manual"
            ]);

    return new Set(set);
}

function buildMultiOrderReceivingReport(options={}){
    const visibleOnly=options.visibleOnly===true;
    const selectedKeys=visibleOnly
        ? getCurrentReceivingFilterKeys()
        : new Set(["not_received","partial","received_any","over","manual"]);

    const category=
        visibleOnly &&
        typeof UI!=="undefined"
            ? (UI.receivingFilters?.category||"all")
            : "all";

    const groups=[];
    const flatRows=[];

    const selectedScope=getSelectedReceivingOrderNumber();
    const reportOrders=selectedScope && selectedScope!=="ALL" ? getActiveReceivingOrderNumbers().filter(order=>order===selectedScope) : getActiveReceivingOrderNumbers();

    reportOrders.forEach(orderNumber=>{
        const meta=getReceivingOrderMetadata()
            .find(meta=>
                normalizeOrderNumber(meta.orderNumber)===orderNumber
            ) || {orderNumber,orderDate:""};

        const allRows=getPerOrderReceivingRows(orderNumber);

        const rows=allRows.filter(row=>{
            if(!row.issueKey || !selectedKeys.has(row.issueKey)){
                return false;
            }

            if(
                category!=="all" &&
                toSafeString(row["Category"]||"").trim()!==category
            ){
                return false;
            }

            return true;
        });

        if(rows.length){
            const summary={
                totalItems:allRows.length,
                discrepancyItems:rows.length,
                notReceived:rows.filter(r=>r.issueKey==="not_received").length,
                shortage:rows.filter(r=>r.issueKey==="partial").length,
                received:rows.filter(r=>r.issueKey==="received_any").length,
                over:rows.filter(r=>r.issueKey==="over").length,
                manual:rows.filter(r=>r.issueKey==="manual").length
            };

            groups.push({
                orderNumber,
                orderDate:meta.orderDate||"",
                fromWarehouse:meta.fromWarehouse||"",
                toWarehouse:meta.toWarehouse||"",
                sourceFile:meta.sourceFile||"",
                summary,
                rows
            });

            flatRows.push(...rows);
        }
    });

    return {
        reportType:"MULTI_ORDER_RECEIVING",
        generatedAt:new Date().toISOString(),
        orderGroups:groups,
        orders:groups.map(group=>({
            orderNumber:group.orderNumber,
            orderDate:group.orderDate,
            fromWarehouse:group.fromWarehouse,
            toWarehouse:group.toWarehouse,
            sourceFile:group.sourceFile
        })),
        orderId:groups.map(g=>g.orderNumber).join(" + "),
        totalDiscrepancies:flatRows.length,
        rows:flatRows
    };
}

window.getActiveReceivingOrderNumbers=getActiveReceivingOrderNumbers;
window.getSelectedReceivingOrderNumber=getSelectedReceivingOrderNumber;
window.setSelectedReceivingOrderNumber=setSelectedReceivingOrderNumber;
window.getWorkspaceOrderSourceRows=getWorkspaceOrderSourceRows;
window.buildMultiOrderReceivingReport=buildMultiOrderReceivingReport;


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


/* =====================================================
   PHASE 2C.10.2.3 — LIVE RECEIVING REPORT
   Independent from Finalize.
===================================================== */

function getLiveReceivingItemStatus(item){
    const ordered=toNumber(item?.orderedQty,0);
    const received=toNumber(item?.receivedQty,0);

    if(item?.manual===true || ordered===0){
        return received>0 ? "UNORDERED" : "COMPLETED";
    }

    if(received===ordered){
        return "COMPLETED";
    }

    if(received===0 && ordered>0){
        return "NOT RECEIVED";
    }

    if(received<ordered){
        return "SHORTAGE";
    }

    if(received>ordered){
        return "OVER RECEIVED";
    }

    return "COMPLETED";
}

function buildLiveReceivingReport(options={}){
    const sourceItems=Array.isArray(options.items)
        ? options.items
        : (Array.isArray(AppState?.workspace?.orderData) ? AppState.workspace.orderData : []);

    const orderMetadata=
        typeof getReceivingOrderMetadata==="function"
            ? getReceivingOrderMetadata()
            : [];

    const rows=sourceItems.map(item=>{
        const ordered=toNumber(item?.orderedQty,0);
        const received=toNumber(item?.receivedQty,0);
        const difference=received-ordered;
        const status=getLiveReceivingItemStatus(item);

        return {
            "Item Number":item?.itemCode||"",
            "Item Name":item?.itemName||"",
            "Ordered Qty":ordered,
            "Received Qty":received,
            "Difference":difference,
            "Status":status,
            "Category":item?.category||"",
            "Manual":item?.manual===true
        };
    });

    const statusRank={
        "NOT RECEIVED":1,
        "SHORTAGE":2,
        "OVER RECEIVED":3,
        "UNORDERED":4,
        "COMPLETED":5
    };

    rows.sort((a,b)=>
        (statusRank[a.Status]||9)-(statusRank[b.Status]||9) ||
        String(a["Item Name"]).localeCompare(String(b["Item Name"]))
    );

    const counts=rows.reduce((acc,row)=>{
        acc.total++;
        acc[row.Status]=(acc[row.Status]||0)+1;
        if(row.Status!=="COMPLETED") acc.requiresReview++;
        return acc;
    },{
        total:0,
        requiresReview:0,
        "COMPLETED":0,
        "SHORTAGE":0,
        "NOT RECEIVED":0,
        "OVER RECEIVED":0,
        "UNORDERED":0
    });

    return {
        reportType:"LIVE_RECEIVING",
        generatedAt:new Date().toISOString(),
        snapshotStatus:AppState?.workspace?.active ? "RECEIVING IN PROGRESS" : "RECEIVING SNAPSHOT",
        orderId:orderMetadata.map(x=>x.orderNumber).filter(Boolean).join(" + ")
            || AppState?.workspace?.orderId
            || AppState?.workspace?.orderName
            || "Current Order",
        orders:orderMetadata,
        counts,
        rows
    };
}

function buildReceivingEmailDifferencesReport(liveReport=null){
    const live=liveReport || buildLiveReceivingReport();
    const rows=(live?.rows||[])
        .filter(row=>String(row?.Status||"").toUpperCase()!=="COMPLETED")
        .map(row=>({
            "Item Number":row["Item Number"],
            "Item Name":row["Item Name"],
            "Ordered Qty":row["Ordered Qty"],
            "Received Qty":row["Received Qty"],
            "Difference":row["Difference"],
            "Issue Type":row["Status"],
            "Category":row["Category"]||""
        }));

    return {
        orderId:live?.orderId||"",
        orders:Array.isArray(live?.orders)?live.orders:[],
        totalDiscrepancies:rows.length,
        shortageItems:rows.filter(r=>["SHORTAGE","NOT RECEIVED"].includes(r["Issue Type"])).length,
        partialShortageItems:rows.filter(r=>r["Issue Type"]==="SHORTAGE").length,
        overItems:rows.filter(r=>r["Issue Type"]==="OVER RECEIVED").length,
        manualExtraItems:rows.filter(r=>r["Issue Type"]==="UNORDERED").length,
        rows
    };
}

function printLiveReceivingReport(report=null){
    const live=report || buildLiveReceivingReport();
    const esc=value=>String(value??"")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;");

    const orders=(live.orders||[]);
    const orderNumbers=orders.map(o=>o.orderNumber).filter(Boolean).join(" + ") || live.orderId || "-";
    const orderDate=orders.map(o=>o.orderDate).filter(Boolean)[0] || "-";

    const printWindow=window.open("","_blank","width=1200,height=850");
    if(!printWindow){
        showToast?.("Allow pop-ups to print the report","warning");
        return false;
    }

    printWindow.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Receiving Report - ${esc(orderNumbers)}</title>
<style>
@page{size:A4 landscape;margin:12mm}
*{box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#342d28;font-size:11px}
.header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #9a6246;padding-bottom:12px;margin-bottom:14px}
.brand{font-size:12px;letter-spacing:.12em;color:#9a6246}
h1{font-size:22px;font-weight:600;margin:4px 0}
.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
.meta div{border:1px solid #ddd1c7;border-radius:8px;padding:8px}
.meta span{display:block;font-size:8px;color:#85766b;margin-bottom:3px}
.meta strong{font-size:12px;font-weight:600}
table{width:100%;border-collapse:collapse}
th{background:#9a6246;color:#fff;text-align:left;font-size:9px;font-weight:600;padding:8px;border:1px solid #9a6246}
td{padding:7px 8px;border:1px solid #e6ddd6;font-size:9px}
td.num{text-align:center}
.status{font-weight:600}
.completed{color:#3f7455}.shortage,.notreceived{color:#a54343}.over{color:#96651f}.unordered{color:#76528c}
.footer{margin-top:10px;font-size:8px;color:#7e7269}
</style>
</head>
<body>
<div class="header">
 <div><div class="brand">PHARMFLOW</div><h1>Receiving Report</h1><div>${esc(live.snapshotStatus||"REPORT SNAPSHOT")}</div></div>
 <div>Generated: ${esc(new Date(live.generatedAt||Date.now()).toLocaleString())}</div>
</div>
<div class="meta">
 <div><span>ORDER NUMBER</span><strong>${esc(orderNumbers)}</strong></div>
 <div><span>ORDER DATE</span><strong>${esc(orderDate)}</strong></div>
 <div><span>TOTAL ITEMS</span><strong>${live.counts?.total||0}</strong></div>
 <div><span>REQUIRES REVIEW</span><strong>${live.counts?.requiresReview||0}</strong></div>
</div>
<table>
<thead><tr><th>Item Code</th><th>Item Name</th><th>Ordered</th><th>Received</th><th>Difference</th><th>Status</th></tr></thead>
<tbody>
${(live.rows||[]).map(row=>{
    const status=String(row.Status||"");
    const cls=status==="COMPLETED"?"completed":
              status==="SHORTAGE"?"shortage":
              status==="NOT RECEIVED"?"notreceived":
              status==="OVER RECEIVED"?"over":"unordered";
    const diff=Number(row["Difference"]||0);
    return `<tr>
      <td>${esc(row["Item Number"])}</td>
      <td>${esc(row["Item Name"])}</td>
      <td class="num">${row["Ordered Qty"]}</td>
      <td class="num">${row["Received Qty"]}</td>
      <td class="num">${diff>0?"+":""}${diff}</td>
      <td class="status ${cls}">${esc(status)}</td>
    </tr>`;
}).join("")}
</tbody>
</table>
<div class="footer">This report is a snapshot of PharmFlow receiving data at the generated time.</div>
<script>window.onload=()=>{setTimeout(()=>window.print(),250)};<\/script>
</body></html>`);

    printWindow.document.close();
    return true;
}

window.buildLiveReceivingReport=buildLiveReceivingReport;
window.buildReceivingEmailDifferencesReport=buildReceivingEmailDifferencesReport;
window.printLiveReceivingReport=printLiveReceivingReport;


function buildReceivingDiscrepancyReportLegacy(options={}){
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
        }else if(received>0){
            // Included only when the visible table is using the "Received Any Quantity" filter.
            // Keep completed receipts visible in the final exported report without
            // changing the original uploaded order source.
            issueType="Received";
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

    const rank={"Not Received":1,"Partial Shortage":2,"Received":3,"Over Received":4,"Manual / Unordered Extra":5};
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

function buildReceivingDiscrepancyReport(options={}){
    const activeOrders=getActiveReceivingOrderNumbers();

    if(
        activeOrders.length &&
        activeOrders.every(order=>{
            const file=getWorkspaceOrderFile(order);
            return !!(
                file &&
                Array.isArray(file.sourceRows) &&
                file.sourceRows.length
            );
        })
    ){
        const multi=buildMultiOrderReceivingReport(options);

        let shortageItems=0;
        let partialShortageItems=0;
        let overItems=0;
        let manualExtraItems=0;

        multi.rows.forEach(row=>{
            const type=String(row["Issue Type"]||"");

            if(type==="Not Received"){
                shortageItems++;
            }else if(type==="Partial Shortage"){
                shortageItems++;
                partialShortageItems++;
            }else if(type==="Over Received"){
                overItems++;
            }else if(type==="Manual / Unordered Extra"){
                manualExtraItems++;
            }
        });

        return {
            ...multi,
            shortageItems,
            partialShortageItems,
            overItems,
            manualExtraItems
        };
    }

    return buildReceivingDiscrepancyReportLegacy(options);
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


function buildEmailReportFromDisplayedReceiving(){
    const report=buildReceivingDiscrepancyReport({visibleOnly:true});

    if(Array.isArray(report.orderGroups)){
        return {
            ...report,
            emailUsesCurrentFilters:true
        };
    }

    return report;
}

window.buildEmailReportFromDisplayedReceiving=
    buildEmailReportFromDisplayedReceiving;


function getReceivingReportFileBase(summary){
    const orderNumbers=(summary?.orders||[])
        .map(o=>toSafeString(o?.orderNumber||"").trim())
        .filter(Boolean);
    const raw=(orderNumbers.length ? orderNumbers.join("_") : toSafeString(summary?.orderId||"Receiving").trim());
    const safe=raw.replace(/[^a-z0-9_-]+/gi,"_").replace(/^_+|_+$/g,"") || "Receiving";
    return safe+"-PharmFlow";
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
    XLSX.writeFile(wb,getReceivingReportFileBase(s)+".xlsx");
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
    doc.save(getReceivingReportFileBase(s)+".pdf");
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
    const registry=(typeof OrderLifecycleEngine!=="undefined" && Array.isArray(OrderLifecycleEngine.records))
        ? OrderLifecycleEngine.records
        : [];
    const receivedRegistry=registry.filter(row=>String(row.status||"").toLowerCase()==="received");

    // Phase 2C.5.2: historical orders may have been finalized before the
    // permanent order registry was introduced. The Archive is authoritative
    // evidence that receiving was finalized, so expose its source order
    // numbers as report candidates too. Item Transfer still refuses to load
    // unless an immutable original uploaded-order snapshot exists.
    const archived=(typeof AppState!=="undefined" && AppState.archive && Array.isArray(AppState.archive.orders))
        ? AppState.archive.orders
        : [];
    const archiveRows=[];
    archived.forEach(order=>{
        if(String(order.status||"").toLowerCase()!=="received"){return;}
        const files=Array.isArray(order.orderFiles)?order.orderFiles:[];
        files.forEach(file=>{
            const number=normalizeOrderNumber(file.documentId||file.orderNumber||file.order_number||"");
            if(!number){return;}
            archiveRows.push({
                order_number:number,
                order_date:file.orderDate||file.order_date||order.orderDate||order.closedAt||"",
                from_warehouse:file.fromWarehouse||file.from_warehouse||"",
                to_warehouse:file.toWarehouse||file.to_warehouse||"",
                source_file:file.fileName||file.source_file||"",
                status:"received",
                archive_order_id:order.orderId||""
            });
        });
    });

    const merged=new Map();
    [...archiveRows,...receivedRegistry].forEach(row=>{
        const key=normalizeOrderNumber(row.order_number);
        if(!key){return;}
        merged.set(key,{...(merged.get(key)||{}),...row,order_number:key,status:"received"});
    });
    return Array.from(merged.values());
}

function refreshItemTransferOrderOptions(){
    const select=document.getElementById("itemTransferOrderSelect");
    if(!select){return;}
    const current=select.value;
    const rows=getReceivedOrderRegistryRows();
    select.innerHTML='<option value="">Select received order</option>'+rows.map(row=>{
        const number=toSafeString(row.order_number);
        const date=toSafeString(row.order_date||"");
        return '<option value="'+escapeHTML(number)+'">'+escapeHTML(number+(date?' • '+date:''))+'</option>';
    }).join("");
    if(current && rows.some(row=>normalizeOrderNumber(row.order_number)===normalizeOrderNumber(current))){
        select.value=current;
    }else{
        select.value="";
        if(
            ReportsEngine.itemTransfer?.orderNumber &&
            !rows.some(row=>normalizeOrderNumber(row.order_number)===normalizeOrderNumber(ReportsEngine.itemTransfer.orderNumber))
        ){
            ReportsEngine.itemTransfer={orderNumber:"",orderMeta:null,rows:[]};
            if(typeof renderItemTransferReport==="function")renderItemTransferReport();
        }
    }
    const availability=document.getElementById("itemTransferAvailability");
    if(availability && !ReportsEngine.itemTransfer.orderNumber){
        availability.textContent=rows.length?"Received orders available":"No received orders";
        availability.classList.toggle("locked",!rows.length);
        availability.classList.toggle("available",!!rows.length);
    }
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
    const select=document.getElementById("itemTransferOrderSelect");
    const requested=normalizeOrderNumber(orderNumberOverride || (select?select.value:""));
    if(!requested){showToast("Select a received order first","warning");return false;}

    showLoading("Loading original uploaded order…");
    try{
        if(typeof refreshOrderLifecycleRegistry==="function"){
            await refreshOrderLifecycleRegistry();
            refreshItemTransferOrderOptions();
            if(select){select.value=requested;}
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
    const load=document.getElementById("btnLoadItemTransfer");
    if(load && load.dataset.bound!=="1"){
        load.dataset.bound="1";
        load.addEventListener("click",()=>loadItemTransferReport());
    }
    const excel=document.getElementById("btnExportItemTransferExcel");
    if(excel && excel.dataset.bound!=="1"){
        excel.dataset.bound="1";excel.addEventListener("click",exportItemTransferExcel);
    }
    const pdf=document.getElementById("btnExportItemTransferPDF");
    if(pdf && pdf.dataset.bound!=="1"){
        pdf.dataset.bound="1";pdf.addEventListener("click",exportItemTransferPDF);
    }
    const select=document.getElementById("itemTransferOrderSelect");
    if(select && select.dataset.bound!=="1"){
        select.dataset.bound="1";
        select.addEventListener("change",()=>{
            ReportsEngine.itemTransfer={orderNumber:"",orderMeta:null,rows:[]};
            renderItemTransferReport();
        });
    }
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
