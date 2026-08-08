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
