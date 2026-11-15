"use strict";

function pfhEsc(value){return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function pfhNum(value){const n=Number(value||0);return Number.isFinite(n)?n:0;}
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

// Stored inside the existing per-order archive record. Only order-level quantities are retained.
function buildPharmFlowItemHistorySnapshots(orderNumbers) {
    const receivedMap = buildReceivedQuantityByOrder();
    return new Map(orderNumbers.map(number => {
        const order = pfhNormalizeOrder(number);
        const rows = getPerOrderReceivingRows(order, {receivedMap}).map(row => ({
            item_code: String(row["Item Number"]),
            item_name: String(row["Item Name"] || ""),
            ordered_qty: row["Ordered Qty"],
            received_qty: row["Received Qty"]
        }));
        return [order, rows];
    }));
}

const PFH_ZONE = "Asia/Riyadh";
const PFH_DAY = new Intl.DateTimeFormat("sv-SE", {timeZone: PFH_ZONE});
const PFH_TIME = new Intl.DateTimeFormat("en-GB", {
    timeZone: PFH_ZONE, dateStyle: "medium", timeStyle: "short"
});
const PFH_TITLE = {
    discrepancy: "Discrepancies",
    new: "New Items",
    item: "Item Receiving History"
};
const PFH_COLUMNS = {
    discrepancy: ["Order Number", "Order Date", "Completed Date", "Item Code", "Item Name", "Ordered", "Received", "Difference", "Issue"],
    new: ["Order Number", "Order Date", "Completed Date", "Item Code", "Item Name", "Ordered", "Type"],
    item: ["Order Number", "Order Date", "Completed Date", "Item Code", "Item Name", "Ordered", "Received", "Verification"]
};

const PFH_PAGE_SIZE = 100;

function pfhPeriodBounds(period) {
    const nextDay = new Date(new Date(period.to + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
    return [period.from + "T00:00:00+03:00", nextDay + "T00:00:00+03:00"];
}

function pfhItemMatches(row, item) {
    return String(row.item_code).toLowerCase() === item || String(row.item_name || "").toLowerCase().includes(item);
}

async function pfhReadRows(name, params, query, current) {
    const rows = [];
    const limit = 250;
    for (let offset = 0; current(); offset += limit) {
        const page = await authRpc(name, params, [...query, ["limit", limit], ["offset", offset]]);
        if (!Array.isArray(page)) throw new Error("Unexpected Receiving History response");
        rows.push(...page);
        if (page.length < limit) return rows;
    }
    return [];
}

async function pfhReadBatches(values, load, current) {
    const rows = [];
    for (let i = 0; i < values.length && current(); i += 4) {
        rows.push(...await Promise.all(values.slice(i, i + 4).map(load)));
    }
    return rows;
}

async function pfhReadHistoryPage(type, pharmacy, period, order, offset = 0) {
    const [from, to] = pfhPeriodBounds(period);
    const query = [
        ["select", "order_number,order_date,item_code,item_name,ordered_qty" +
            (type === "discrepancy" ? ",received_qty,difference,issue_type" : "") +
            ",workspace:pharmflow_receiving_workspace_history_v1!inner(completed_at)"],
        ["event_type", type === "discrepancy" ? "eq.DISCREPANCY" : "eq.NEW_ITEM"],
        ["workspace.completed_at", "gte." + from], ["workspace.completed_at", "lt." + to],
        ["order", "workspace(completed_at).desc,id.desc"], ["limit", PFH_PAGE_SIZE + 1], ["offset", offset]
    ];
    if (order) query.push(["order_number", "eq." + order]);
    const page = await readPharmFlowReceivingHistoryRows(pharmacy, query);
    if (!Array.isArray(page)) throw new Error("Unexpected Receiving History response");
    return {
        rows: page.slice(0, PFH_PAGE_SIZE).map(({workspace, ...row}) => ({...row, completed_at: workspace.completed_at})),
        nextOffset: page.length > PFH_PAGE_SIZE ? offset + PFH_PAGE_SIZE : null
    };
}

function pfhQuantity(value) {
    return value != null && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
}

function pfhLegacyItemRows(archive, order, uploaded) {
    const snapshot = archive.discrepancyReport;
    const groups = snapshot?.orderGroups || [];
    const discrepancyRows = groups.length
        ? groups.filter(group => pfhNormalizeOrder(group.orderNumber) === order).flatMap(group => group.rows || [])
        : (snapshot?.rows || []).filter(row => pfhNormalizeOrder(row.orderNumber || row["Order Number"] ||
            snapshot.orderNumber || (snapshot.orderNumbers?.length === 1 ? snapshot.orderNumbers[0] : "")) === order);
    const items = new Map();
    const itemKey = value => typeof normalizeItemCode === "function" ? normalizeItemCode(value) : String(value || "").trim();
    for (const line of uploaded) {
        const code = itemKey(line.item_code);
        if (!code) continue;
        const existing = items.get(code);
        items.set(code, {
            item_code: code,
            item_name: existing?.item_name || line.item_name,
            ordered_qty: (existing?.ordered_qty || 0) + (pfhQuantity(line.ordered_qty) || 0),
            received_qty: null
        });
    }
    for (const row of discrepancyRows) {
        const code = itemKey(row["Item Number"]);
        if (!code) continue;
        items.set(code, {
            item_code: code,
            item_name: row["Item Name"] || items.get(code)?.item_name,
            ordered_qty: pfhQuantity(row["Ordered Qty"]),
            received_qty: pfhQuantity(row["Received Qty"])
        });
    }
    return [...items.values()];
}

async function pfhReadItemHistory(params, period, order, item, current) {
    const [from, to] = pfhPeriodBounds(period);
    const filters = [
        ["closed_at", "gte." + from], ["closed_at", "lt." + to],
        ["order", "closed_at.desc,archive_id.desc"]
    ];
    if (order && /^[A-Z0-9_-]+$/.test(order)) filters.push(["order_numbers", "cs.{" + order + "}"]);
    const archives = await pfhReadRows("list_pharmflow_finalized_archives", params, filters, current);

    const orders = new Map();
    for (const row of archives) {
        const archive = row.archive_payload || {};
        for (const number of new Set((row.order_numbers || []).map(pfhNormalizeOrder))) {
            if (!number || (order && number !== order) || orders.has(number)) continue;
            orders.set(number, {archive, completed_at: row.closed_at});
        }
    }
    const results = await pfhReadBatches([...orders], async ([number, record]) => {
        const {archive, completed_at} = record;
        const saved = Array.isArray(archive.itemReceivingHistory) && pfhNormalizeOrder(archive.orderNumber) === number;
        const uploaded = saved ? [] : await pfhReadRows("get_pharmflow_order_source_items",
            {...params, p_order_number: number}, [["select", "item_code,item_name,ordered_qty"], ["order", "line_no,id"]], current);
        const items = saved ? archive.itemReceivingHistory : pfhLegacyItemRows(archive, number, uploaded);
        const file = (archive.orderFiles || []).find(row => pfhNormalizeOrder(row.documentId || row.orderNumber) === number);
        const rows = items.filter(row => pfhItemMatches(row, item)).map(row => ({
            ...row, received_qty: pfhQuantity(row.received_qty), order_number: number,
            order_date: file?.orderDate, completed_at
        }));
        return {rows, missingSource: !saved && !uploaded.length};
    }, current);
    return {...period, rows: results.flatMap(result => result.rows),
        missingSource: results.filter(result => result.missingSource).length};
}

function pfhCells(type, row) {
    const base = [row.order_number, row.order_date || "—",
        row.completed_at ? PFH_TIME.format(new Date(row.completed_at)) : "—",
        row.item_code, row.item_name, pfhQuantity(row.ordered_qty) ?? "Not available"];
    if (type === "new") return [...base, "NEW"];
    if (type === "item") return [...base, row.received_qty ?? "Not available",
        row.received_qty == null ? "Not available" : "Confirmed"];
    return [...base, pfhQuantity(row.received_qty) ?? "Not available",
        pfhQuantity(row.difference) ?? "Not available", row.issue_type];
}

function pfhPeriodLabel(period) {
    return period.from + " to " + period.to;
}

const PFH_ITEM_SUMMARY_COLUMNS = ["Item Code", "Item Name", "Total Ordered", "Confirmed Received"];

function pfhItemTotals(rows) {
    const totals = new Map();
    for (const row of rows) {
        const key = String(row.item_code).toLowerCase();
        if (!totals.has(key)) totals.set(key, [row.item_code, row.item_name, null, null]);
        const total = totals.get(key);
        const ordered = pfhQuantity(row.ordered_qty);
        const received = pfhQuantity(row.received_qty);
        if (ordered != null) total[2] = (total[2] ?? 0) + ordered;
        if (received != null) total[3] = (total[3] ?? 0) + received;
    }
    return [...totals.values()].map(row => row.map(value => value ?? "Not available"));
}

function pfhItemNotes(period) {
    const unverified = period.rows.filter(row => row.received_qty == null).length;
    const missingOrdered = period.rows.filter(row => pfhQuantity(row.ordered_qty) == null).length;
    const unmatched = period.item && !period.rows.some(row => pfhItemMatches(row, period.item));
    return [
        ...(unverified ? [unverified + " matching rows lack a confirmed received quantity"] : []),
        ...(missingOrdered ? [missingOrdered + " matching rows lack an ordered quantity"] : []),
        ...(period.missingSource ? [period.missingSource + " older orders lack complete searchable item records for this account"] : []),
        ...(unmatched ? ["No matching rows: " + period.item] : [])
    ];
}

function pfhTable(headings, rows, className = "", differenceColumn = -1, renderAction) {
    if (!rows.length) return "";
    const head = headings.map(value => '<th scope="col">' + pfhEsc(value) + "</th>").join("") +
        (renderAction ? '<th scope="col">Action</th>' : "");
    const body = rows.map((row, rowIndex) => "<tr>" + row.map((value, index) => {
        const css = typeof value !== "number" ? "" : "pfhNum" +
            (index === differenceColumn && value ? (value < 0 ? " pfhShort" : " pfhOver") : "");
        return '<td class="' + css + '">' + pfhEsc(value) + "</td>";
    }).join("") + (renderAction ? "<td>" + renderAction(rowIndex) + "</td>" : "") + "</tr>").join("");
    return '<div class="pfhTableWrap ' + className + '"><table class="dataTable pfhTable"><thead><tr>' +
        head + "</tr></thead><tbody>" + body + "</tbody></table></div>";
}

function pfhRenderResult({type, periods}, renderItemAction) {
    return periods.map(period => {
        const summary = type === "item" ? pfhTable(PFH_ITEM_SUMMARY_COLUMNS, pfhItemTotals(period.rows), "pfhItemSummary", -1, renderItemAction) : "";
        const notes = type === "item" ? pfhItemNotes(period).map(note => "<p>" + pfhEsc(note) + "</p>").join("") : "";
        const rows = period.rows.map(row => pfhCells(type, row));
        return '<section class="pfhPeriod"><h3>' + pfhEsc(pfhPeriodLabel(period)) + "</h3>" +
            summary + notes + (pfhTable(PFH_COLUMNS[type], rows, "", type === "discrepancy" ? 7 : -1) ||
                "<p>No matching records in this period.</p>") + "</section>";
    }).join("");
}

function pfhListMatches(left, right) {
    return left.from === right.from && left.to === right.to && left.order === right.order;
}

function pfhAddToExportList(list, period, code) {
    const key = String(code).toLowerCase();
    if (list && !pfhListMatches(list.period, period)) return list;
    const rows = period.rows.filter(row => String(row.item_code).toLowerCase() === key);
    if (!rows.length || list?.items.has(key)) return list;
    const selection = list || {
        period: {from: period.from, to: period.to, order: period.order},
        items: new Map()
    };
    selection.items.set(key, {rows, missingSource: period.missingSource});
    return selection;
}

function pfhExportListPeriod(selection) {
    const items = [...selection.items.values()];
    return {...selection.period, rows: items.flatMap(item => item.rows),
        missingSource: Math.max(0, ...items.map(item => item.missingSource || 0))};
}

function pfhExportTables(type, period) {
    const details = {
        name: type === "item" ? "Order Details" : PFH_TITLE[type],
        columns: PFH_COLUMNS[type], rows: period.rows.map(row => pfhCells(type, row)),
        widths: type === "item" ? [20, 15, 24, 15, 47, 15, 16, 18]
            : type === "new" ? [20, 15, 24, 15, 47, 15, 13]
            : [20, 15, 24, 15, 47, 15, 15, 15, 22]
    };
    if (type !== "item") return [details];
    return [{
        name: "Summary", columns: PFH_ITEM_SUMMARY_COLUMNS, rows: pfhItemTotals(period.rows),
        widths: [18, 52, 20, 24], notes: pfhItemNotes(period)
    }, details];
}

function pfhWorkbook(tableSet, title, dateLabel) {
    if (typeof XLSX === "undefined" || !XLSX.CFB) throw new Error("Excel library is unavailable");
    const workbook = XLSX.utils.book_new();
    const lastCol = table => table.columns.length - 1;
    const range = (start, end, column) => ({s: {r: start, c: 0}, e: {r: end, c: column}});
    const headers = tableSet.map(table => {
        const notes = table.notes || [];
        const header = notes.length + 3;
        const rows = [[title], [dateLabel], ...notes.map(note => [note]), [], table.columns, ...table.rows];
        const sheet = XLSX.utils.aoa_to_sheet(rows);
        const last = lastCol(table);
        sheet["!cols"] = table.widths.map(wch => ({wch}));
        sheet["!merges"] = [0, 1, ...notes.map((_, index) => index + 2)].map(index => range(index, index, last));
        sheet["!rows"] = rows.map((row, index) => ({
            hpt: index === 0 ? 27 : index === header ? 23 :
                Math.max(19, ...row.map((value, column) => String(value ?? "").length > table.widths[column] ?
                    15 * Math.ceil(String(value).length / table.widths[column]) + 4 : 19))
        }));
        sheet["!autofilter"] = {ref: XLSX.utils.encode_range(range(header, rows.length - 1, last))};
        XLSX.utils.book_append_sheet(workbook, sheet, table.name);
        return header;
    });

    // SheetJS CE writes the typed cells and filter. Apply the visual styles and frozen pane to the saved XML.
    const archive = XLSX.CFB.read(new Uint8Array(XLSX.write(workbook, {bookType: "xlsx", type: "array"})), {type: "buffer"});
    const encoder = new TextEncoder(), decoder = new TextDecoder();
    const patch = (path, transform) => {
        const entry = archive.FileIndex[archive.FullPaths.findIndex(name => name.endsWith("/" + path))];
        if (!entry) throw new Error("Excel workbook is missing " + path);
        entry.content = encoder.encode(transform(decoder.decode(entry.content)));
        entry.size = entry.content.length;
    };
    const fill = color => '<fill><patternFill patternType="solid"><fgColor rgb="FF' + color + '"/><bgColor indexed="64"/></patternFill></fill>';
    const font = (size, color, bold = false) => '<font>' + (bold ? '<b/>' : '') + '<sz val="' + size +
        '"/><color rgb="FF' + color + '"/><name val="Calibri"/></font>';
    const styles = [[0, 0, 0], [1, 2, 0], [0, 3, 0], [2, 2, 1], [0, 4, 1], [0, 5, 1]];
    const cells = styles.map(([fontId, fillId, borderId]) => '<xf numFmtId="0" fontId="' + fontId +
        '" fillId="' + fillId + '" borderId="' + borderId +
        '" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>');
    const line = edge => '<' + edge + ' style="thin"><color rgb="FFD6E3EF"/></' + edge + '>';
    patch("xl/styles.xml", () => '<?xml version="1.0" encoding="UTF-8"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="3">' + font(11, "203B54") + font(16, "FFFFFF", true) + font(11, "FFFFFF", true) + '</fonts>' +
        '<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
        ["174A79", "E6EFF8", "FFFFFF", "F0F6FC"].map(fill).join("") + '</fills>' +
        '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>' +
        ["left", "right", "top", "bottom"].map(line).join("") + '<diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="' + cells.length + '">' + cells.join("") + '</cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
    headers.forEach((header, index) => patch("xl/worksheets/sheet" + (index + 1) + ".xml", xml => {
        const pane = '<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="' + (header + 1) +
            '" topLeftCell="A' + (header + 2) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
        return xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, pane)
            .replace(/<c r="([A-Z]+[0-9]+)"(?: s="[0-9]+")?/g, (_, address) => {
                const row = XLSX.utils.decode_cell(address).r;
                const style = row === 0 ? 1 : row < header ? 2 : row === header ? 3 : 4 + ((row - header - 1) % 2);
                return '<c r="' + address + '" s="' + style + '"';
            });
    }));
    for (const entry of archive.FileIndex) entry.mt = new Date(1980, 0, 1);
    return new Uint8Array(XLSX.CFB.write(archive, {fileType: "zip", type: "array", compression: true}));
}

function pfhPdf(tableSet, title, dateLabel) {
    if (!window.jspdf?.jsPDF) throw new Error("PDF library is unavailable");
    const doc = new window.jspdf.jsPDF({orientation: "landscape", unit: "pt", format: "a4"});
    const margin = 28, width = doc.internal.pageSize.getWidth() - 2 * margin;
    const bottom = doc.internal.pageSize.getHeight() - 40;
    const navy = "#174A79", ink = "#203B54", border = "#D6E3EF";
    let y = 0;
    const pageHeader = () => {
        doc.setFillColor(navy);
        doc.rect(margin, 25, width, 30, "F");
        doc.setFont("helvetica", "bold").setFontSize(15).setTextColor("#FFFFFF");
        doc.text("PharmFlow | " + title, margin + 10, 45);
        doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(ink);
        doc.text(dateLabel, margin, 70);
        y = 88;
    };
    const nextPage = () => { doc.addPage(); pageHeader(); };
    pageHeader();
    for (const table of tableSet) {
        const unit = width / table.widths.reduce((sum, value) => sum + value, 0);
        const widths = table.widths.map(value => value * unit);
        const rowLines = cells => cells.map((value, column) =>
            doc.splitTextToSize(String(value ?? ""), widths[column] - 12));
        const rowHeight = lines => Math.max(21, 8 + Math.max(...lines.map(cell => cell.length)) * 11);
        const drawRow = (cells, lines, fillColor, heading = false) => {
            const height = rowHeight(lines);
            let x = margin;
            cells.forEach((value, index) => {
                const span = widths[index];
                const numeric = typeof value === "number";
                doc.setFillColor(fillColor).setDrawColor(border).setLineWidth(0.4);
                doc.rect(x, y, span, height, "FD");
                doc.setTextColor(heading ? "#FFFFFF" : ink);
                doc.text(lines[index], x + (numeric ? span - 6 : 6), y + 13, {align: numeric ? "right" : "left"});
                x += span;
            });
            y += height;
        };
        const sectionHeading = (continued = false) => {
            doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(navy);
            doc.text(table.name + (continued ? " (continued)" : ""), margin, y + 10);
            y += 18;
            doc.setFont("helvetica", "bold").setFontSize(9);
            drawRow(table.columns, rowLines(table.columns), navy, true);
            doc.setFont("helvetica", "normal").setFontSize(9);
        };
        doc.setFont("helvetica", "bold").setFontSize(9);
        const headerHeight = rowHeight(rowLines(table.columns));
        doc.setFont("helvetica", "normal").setFontSize(9);
        const firstRowHeight = table.rows.length ? rowHeight(rowLines(table.rows[0])) : 0;
        if (y + 18 + headerHeight + firstRowHeight > bottom) nextPage();
        sectionHeading();
        table.rows.forEach((row, index) => {
            const lines = rowLines(row);
            if (y + rowHeight(lines) > bottom) { nextPage(); sectionHeading(true); }
            drawRow(row, lines, index % 2 ? "#F0F6FC" : "#FFFFFF");
        });
        y += 12;
        for (const note of table.notes || []) {
            for (const line of doc.splitTextToSize(note, width)) {
                if (y + 12 > bottom) nextPage();
                doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(ink);
                doc.text(line, margin, y + 9);
                y += 12;
            }
        }
    }
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
        doc.setPage(page).setFontSize(9).setTextColor(ink);
        doc.text("Page " + page + " of " + pages, margin + width, bottom + 21, {align: "right"});
    }
    return doc;
}

function pfhExportResult({type, periods: [period]}, format) {
    const title = PFH_TITLE[type];
    const filename = "PharmFlow " + title + " " + period.from + " to " + period.to;
    const dateLabel = pfhPeriodLabel(period) + " | Riyadh" + (period.order ? " | Order " + period.order : "");
    const tables = pfhExportTables(type, period);
    if (format !== "excel") { pfhPdf(tables, title, dateLabel).save(filename + ".pdf"); return; }
    const bytes = pfhWorkbook(tables, "PharmFlow | " + title, dateLabel);
    const url = URL.createObjectURL(new Blob([bytes], {type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename + ".xlsx";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const PFH_CALENDAR_MONTH = new Intl.DateTimeFormat("en-GB", {
    month: "long", year: "numeric", timeZone: "UTC"
});
const PFH_CALENDAR_DATE = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC"
});
const pfhCalendarDateText = value => value
    ? PFH_CALENDAR_DATE.format(new Date(value + "T00:00:00Z")) : "Select date";

function pfhRenderCalendar(popover, month, selected, today) {
    const year = month.getUTCFullYear();
    const index = month.getUTCMonth();
    const title = PFH_CALENDAR_MONTH.format(month);
    const days = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
    const blanks = '<span aria-hidden="true"></span>'.repeat(month.getUTCDay());
    const dates = Array.from({length: days}, (_, day) => {
        const iso = new Date(Date.UTC(year, index, day + 1)).toISOString().slice(0, 10);
        const css = (iso === selected ? " selected" : "") + (iso === today ? " today" : "");
        return '<button type="button" class="pfhCalDay' + css + '" data-date="' + iso +
            '" aria-label="' + pfhCalendarDateText(iso) + '" aria-pressed="' + (iso === selected) + '">' + (day + 1) + '</button>';
    }).join("");
    popover.innerHTML = '<div class="pfhCalHead">' +
        '<button type="button" data-month="-1" aria-label="Previous month">‹</button>' +
        '<strong aria-live="polite">' + title + '</strong>' +
        '<button type="button" data-month="1" aria-label="Next month">›</button></div>' +
        '<div class="pfhCalWeek" aria-hidden="true">' +
        ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => "<span>" + day + "</span>").join("") +
        '</div><div class="pfhCalGrid">' + blanks + dates + '</div>' +
        '<div class="pfhCalFoot"><button type="button" data-date="' + today + '">Today</button></div>';
}

function pfhPositionPicker(picker, anchor, matchWidth = false) {
    const edge = 8;
    const gap = 6;
    const trigger = anchor.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    // Like the Duty report picker, translate viewport coordinates into CSS pixels at app zoom.
    const scale = (picker.offsetWidth && picker.getBoundingClientRect().width / picker.offsetWidth) || 1;
    if (matchWidth) picker.style.width = Math.min(viewportWidth - 2 * edge, trigger.width) / scale + "px";
    const below = viewportHeight - trigger.bottom - gap - edge;
    const above = trigger.top - gap - edge;
    picker.style.maxHeight = Math.max(0, Math.max(below, above)) / scale + "px";
    const box = picker.getBoundingClientRect();
    const left = Math.max(edge, Math.min(trigger.left, viewportWidth - box.width - edge));
    const top = box.height <= below || below >= above ? trigger.bottom + gap : trigger.top - gap - box.height;
    picker.style.left = left / scale + "px";
    picker.style.top = Math.max(edge, top) / scale + "px";
}

function pfhDatePicker(form, onChange, closeType) {
    const buttons = [...form.querySelectorAll("[data-pfh-date]")];
    const fieldFor = name => form.elements.namedItem(name);
    let activeButton;
    let popover;
    function close(restoreFocus = false) {
        if (!activeButton) return;
        popover.remove();
        activeButton.setAttribute("aria-expanded", "false");
        if (restoreFocus) activeButton.focus();
        popover = activeButton = null;
    }
    function sync() {
        for (const button of buttons) {
            button.querySelector("span").textContent = pfhCalendarDateText(fieldFor(button.dataset.pfhDate).value);
        }
    }
    for (const button of buttons) {
        button.addEventListener("click", () => {
            if (button === activeButton) { close(true); return; }
            closeType();
            close();
            activeButton = button;
            const field = fieldFor(button.dataset.pfhDate);
            const today = PFH_DAY.format(new Date());
            let month = new Date((field.value || today).slice(0, 7) + "-01T00:00:00Z");
            popover = document.createElement("div");
            popover.className = "pfhCalendarPopover";
            popover.setAttribute("popover", "manual");
            popover.setAttribute("role", "dialog");
            popover.setAttribute("aria-label", "Choose a date");
            button.parentElement.append(popover);
            button.setAttribute("aria-expanded", "true");
            pfhRenderCalendar(popover, month, field.value, today);
            popover.showPopover();
            pfhPositionPicker(popover, button);
            const initial = popover.querySelector(".selected") || popover.querySelector(".today") || popover.querySelector(".pfhCalDay");
            initial?.focus({preventScroll: true});
            popover.addEventListener("click", event => {
                const control = event.target.closest("button");
                if (!control) return;
                if (control.dataset.date) {
                    field.value = control.dataset.date;
                    sync();
                    close(true);
                    onChange();
                    return;
                }
                const direction = control.dataset.month;
                month.setUTCMonth(month.getUTCMonth() + Number(direction));
                pfhRenderCalendar(popover, month, field.value, today);
                pfhPositionPicker(popover, button);
                popover.querySelector('[data-month="' + direction + '"]').focus();
            });
        });
    }
    document.addEventListener("pointerdown", event => {
        if (activeButton && !popover.contains(event.target) && !activeButton.contains(event.target)) close();
    });
    form.addEventListener("keydown", event => {
        if (event.key === "Escape" && activeButton) {
            event.preventDefault();
            close(true);
        }
    });
    return {close, sync, reposition: () => { if (activeButton) pfhPositionPicker(popover, activeButton); }};
}

function pfhBoot() {
    const openButton = document.getElementById("btnReceivingHistoryReport");
    const page = document.getElementById("receivingHistoryContent");
    const report = document.getElementById("receivingReportContent");
    if (!openButton || !page || !report) return;
    const form = document.getElementById("pfhForm");
    const field = name => form.elements.namedItem(name);
    const typePicker = document.getElementById("pfhTypePicker");
    const typeTrigger = document.getElementById("pfhTypeTrigger");
    const typeOptions = document.getElementById("pfhTypeOptions");
    const typeLabel = document.getElementById("pfhTypeValue");
    const reportOptions = typePicker.querySelectorAll("[data-pfh-type]");
    const toolbar = document.getElementById("pfhToolbar");
    const itemField = document.getElementById("pfhItemField");
    const exportListPanel = document.getElementById("pfhExportList");
    const tabs = document.getElementById("pfhTabs");
    const searchTab = document.getElementById("pfhSearchTab");
    const listTab = document.getElementById("pfhListTab");
    const searchPanel = document.getElementById("pfhSearchPanel");
    const listActions = document.getElementById("pfhListActions");
    const emptyList = document.getElementById("pfhEmptyList");
    const selectedItems = document.getElementById("pfhSelectedItems");
    const listNotice = document.getElementById("pfhListNotice");
    const dateActions = document.getElementById("pfhDateActions");
    const more = document.getElementById("pfhMore");
    const retry = document.getElementById("pfhRetry");
    const submit = form.querySelector('[type="submit"]');
    let selection = null;
    let listView = false;
    let selectionEpoch;
    let busy = false;
    let retryAction;
    const list = document.getElementById("pfhResults");
    const status = document.getElementById("pfhStatus");
    const exports = document.getElementById("pfhExports");
    let result = null;
    let search = 0;
    const setBusy = value => {
        busy = value;
        submit.disabled = value;
        more.disabled = value;
        for (const button of exports.querySelectorAll("button")) button.disabled = value;
    };
    const clear = (message = "") => {
        search++;
        setBusy(false);
        retry.hidden = more.hidden = true;
        result = null;
        exports.hidden = true;
        status.textContent = message;
        toolbar.hidden = !message;
        list.replaceChildren();
    };
    const typeIsOpen = () => typeTrigger.getAttribute("aria-expanded") === "true";
    const closeType = () => {
        if (!typeIsOpen()) return;
        typeOptions.hidePopover();
        typeTrigger.setAttribute("aria-expanded", "false");
    };
    const datePicker = pfhDatePicker(form, clear, closeType);
    const reposition = () => {
        if (typeIsOpen()) pfhPositionPicker(typeOptions, typeTrigger, true);
        datePicker.reposition();
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    function renderSelection(message = "") {
        const count = selection?.items.size || 0;
        const visible = listView && field("reportType").value === "item";
        listTab.textContent = "Export List (" + count + ")";
        searchPanel.hidden = visible;
        exportListPanel.hidden = !visible;
        listActions.hidden = !count;
        emptyList.hidden = Boolean(count);
        listNotice.textContent = message;
        if (!visible || !count) {
            document.getElementById("pfhExportListLabel").textContent = "";
            selectedItems.replaceChildren();
            return;
        }
        const period = pfhExportListPeriod(selection);
        document.getElementById("pfhExportListLabel").textContent = pfhPeriodLabel(period) +
            (period.order ? " · Order " + period.order : "");
        selectedItems.innerHTML = pfhTable(PFH_ITEM_SUMMARY_COLUMNS, pfhItemTotals(period.rows), "pfhItemSummary", -1,
            index => '<button class="pfhButton pfhRowAction" type="button" data-pfh-remove="' + index + '">Remove</button>');
    }
    function showListView(show, moveFocus = false) {
        listView = show;
        datePicker.close();
        closeType();
        searchTab.setAttribute("aria-selected", String(!show));
        listTab.setAttribute("aria-selected", String(show));
        searchTab.tabIndex = show ? -1 : 0;
        listTab.tabIndex = show ? 0 : -1;
        renderSelection();
        if (moveFocus) (show ? listTab : searchTab).focus();
    }
    searchTab.addEventListener("click", () => showListView(false));
    listTab.addEventListener("click", () => showListView(true));
    tabs.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        showListView(event.key === "End" || (event.key !== "Home" && !listView), true);
    });
    document.getElementById("pfhListClear").addEventListener("click", () => {
        selection = null;
        renderSelection();
        if (result?.type === "item") render();
    });
    selectedItems.addEventListener("click", event => {
        const remove = event.target.closest("[data-pfh-remove]");
        if (!remove || !selection) return;
        const code = [...selection.items.keys()][Number(remove.dataset.pfhRemove)];
        selection.items.delete(code);
        if (!selection.items.size) selection = null;
        renderSelection();
        if (result?.type === "item") render();
    });
    exportListPanel.addEventListener("click", event => {
        const button = event.target.closest("[data-pfh-list-export]");
        if (!button || !selection || selectionEpoch !== AuthState.identityEpoch) return;
        try {
            pfhExportResult({type: "item", periods: [pfhExportListPeriod(selection)]}, button.dataset.pfhListExport);
        } catch (error) {
            renderSelection(error.message || "Unable to export list.");
        }
    });
    const changeType = () => {
        const type = field("reportType").value;
        const useItem = type === "item";
        typeLabel.textContent = PFH_TITLE[type];
        for (const option of reportOptions) {
            option.setAttribute("aria-pressed", String(option.dataset.pfhType === type));
        }
        itemField.hidden = !useItem;
        dateActions.hidden = useItem;
        (useItem ? document.getElementById("pfhItemEntry") : dateActions).append(submit);
        tabs.hidden = !useItem;
        showListView(false);
        datePicker.sync();
        clear();
    };
    const close = focus => {
        if (page.hidden) return;
        clear();
        datePicker.close();
        closeType();
        page.hidden = true;
        report.hidden = false;
        if (focus) openButton.focus();
    };

    openButton.addEventListener("click", () => {
        try { window.PharmFlowPermissions?.require("RECEIVING", false); }
        catch (error) { showToast(error.message, "warning"); return; }
        if (!AuthState.context?.pharmacy_id) return;
        form.reset();
        if (selectionEpoch !== AuthState.identityEpoch) selection = null;
        selectionEpoch = AuthState.identityEpoch;
        field("reportType").value = "item";
        const today = PFH_DAY.format(new Date());
        field("from").value = today.slice(0, 8) + "01";
        field("to").value = today;
        changeType();
        report.hidden = true;
        page.hidden = false;
        field("item").focus({preventScroll: true});
    });
    document.getElementById("pfhBack").addEventListener("click", () => close(true));
    window.addEventListener("auth:context-ready", event => {
        if (event.detail?.changed || !event.detail?.currentScope) {
            selection = null;
            renderSelection();
            close(false);
        }
    });
    AppEvents.on("route:changed", ({routeName}) => { if (routeName !== "receiving") close(false); });
    for (const option of reportOptions) {
        option.addEventListener("click", () => {
            field("reportType").value = option.dataset.pfhType;
            closeType();
            changeType();
            typeTrigger.focus();
        });
    }
    typeTrigger.addEventListener("click", () => {
        if (typeIsOpen()) { closeType(); return; }
        datePicker.close();
        typeOptions.showPopover();
        typeTrigger.setAttribute("aria-expanded", "true");
        pfhPositionPicker(typeOptions, typeTrigger, true);
        typeOptions.querySelector('[aria-pressed="true"]')?.focus({preventScroll: true});
    });
    typePicker.addEventListener("keydown", event => {
        if (event.key === "Escape" && typeIsOpen()) {
            event.preventDefault();
            closeType();
            typeTrigger.focus();
        }
    });
    document.addEventListener("pointerdown", event => {
        if (typeIsOpen() && !typePicker.contains(event.target)) closeType();
    });
    form.addEventListener("input", () => clear());
    const announce = message => {
        status.textContent = message;
        toolbar.hidden = !message;
    };
    const render = () => {
        const {periods: [period], nextOffset} = result;
        announce(period.rows.length
            ? period.rows.length + " rows shown · Completed dates in Saudi Arabia time."
            : "Search complete.");
        const totals = result.type === "item" ? pfhItemTotals(period.rows) : [];
        list.innerHTML = pfhRenderResult(result, result.type === "item" ? index => {
            const added = selection?.items.has(String(totals[index][0]).toLowerCase()) &&
                pfhListMatches(selection.period, period);
            return '<button class="pfhButton pfhRowAction" type="button" data-pfh-save="' + index + '"' +
                (added ? " disabled>Added" : ">Add Item") + "</button>";
        } : undefined);
        more.hidden = nextOffset == null;
        exports.hidden = !period.rows.length;
        retry.hidden = true;
    };
    list.addEventListener("click", event => {
        const add = event.target.closest("[data-pfh-save]");
        if (!add || result?.type !== "item" || !result.current()) return;
        const [period] = result.periods;
        if (selection && !pfhListMatches(selection.period, period)) {
            announce("The export list uses a different date range or order filter. Open Export List to export or clear it.");
            return;
        }
        const item = pfhItemTotals(period.rows)[Number(add.dataset.pfhSave)];
        if (!item) return;
        selection = pfhAddToExportList(selection, period, item[0]);
        renderSelection();
        render();
        field("item").focus({preventScroll: true});
    });
    const failed = (error, action) => {
        Logger?.error?.("Receiving History request failed", error);
        announce(/timed? ?out|statement timeout/i.test(error?.message || "")
            ? "The report took too long. Please try again."
            : "Unable to load Receiving History. Please try again.");
        retryAction = action;
        retry.hidden = false;
    };
    retry.addEventListener("click", () => { if (!busy) retryAction?.(); });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (busy) return;
        const type = field("reportType").value;
        const item = field("item").value.trim().toLowerCase();
        const order = pfhNormalizeOrder(field("order").value);
        const period = {from: field("from").value, to: field("to").value, order};
        datePicker.close();
        closeType();
        if (!period.from || !period.to) { clear("Select From and To dates."); return; }
        if (period.from > period.to) { clear("From must be on or before To."); return; }
        if (type === "item" && !item) { clear("Enter an item code or name."); return; }
        const pharmacy = AuthState.context?.pharmacy_id;
        const epoch = AuthState.identityEpoch;
        if (!pharmacy) { clear("Sign in to search Receiving History."); return; }
        clear("Searching…");
        setBusy(true);
        const request = search;
        const current = () => request === search && AuthState.identityEpoch === epoch &&
            AuthState.context?.pharmacy_id === pharmacy;
        const readPage = offset => pfhReadHistoryPage(type, pharmacy, period, order, offset);
        try {
            let data;
            let nextOffset = null;
            if (type === "item") {
                data = {...await pfhReadItemHistory({p_pharmacy_id: pharmacy}, period, order, item, current), item};
            } else {
                const page = await readPage(0);
                data = {...period, rows: page.rows};
                nextOffset = page.nextOffset;
            }
            if (!current()) return;
            result = {type, periods: [data], nextOffset, current, readPage};
            render();
        } catch (error) {
            if (current()) failed(error, () => form.requestSubmit());
        } finally {
            if (current()) setBusy(false);
        }
    });

    async function loadMore() {
        const active = result;
        if (busy || active?.nextOffset == null || !active.current()) return;
        setBusy(true);
        retry.hidden = true;
        announce("Loading more rows…");
        try {
            const page = await active.readPage(active.nextOffset);
            if (!active.current()) return;
            active.periods[0].rows.push(...page.rows);
            active.nextOffset = page.nextOffset;
            render();
        } catch (error) {
            if (active.current()) failed(error, loadMore);
        } finally {
            if (active.current()) setBusy(false);
        }
    }

    more.addEventListener("click", loadMore);
    for (const [id, format] of [["pfhExcel", "excel"], ["pfhPdf", "pdf"]]) {
        const button = document.getElementById(id);
        button.addEventListener("click", async () => {
            const active = result;
            if (busy || !active?.current()) return;
            setBusy(true);
            retry.hidden = true;
            try {
                if (active.nextOffset != null) announce("Loading remaining rows for export…");
                while (active.nextOffset != null && active.current()) {
                    const page = await active.readPage(active.nextOffset);
                    if (!active.current()) return;
                    active.periods[0].rows.push(...page.rows);
                    active.nextOffset = page.nextOffset;
                }
                pfhExportResult(active, format);
                render();
            } catch (error) {
                if (active.current()) {
                    render();
                    failed(error, () => button.click());
                }
            } finally {
                if (active.current()) setBusy(false);
            }
        });
    }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pfhBoot, {once: true});
else pfhBoot();
