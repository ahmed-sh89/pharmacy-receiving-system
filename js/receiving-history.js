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

function pfhSearchTerms(value) {
    return [...new Set(value.split(/[,;\n]+/).map(term => term.trim().toLowerCase()).filter(Boolean))];
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

async function pfhReadItemHistory(params, period, order, terms, current) {
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
        const rows = items.filter(row => {
            const code = String(row.item_code).toLowerCase();
            const name = String(row.item_name || "").toLowerCase();
            return terms.some(term => term === code || name.includes(term));
        }).map(row => ({
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
    const unmatched = (period.terms || []).filter(term => !period.rows.some(row =>
        String(row.item_code).toLowerCase() === term || String(row.item_name || "").toLowerCase().includes(term)));
    return [
        ...(unverified ? [unverified + " matching rows lack a confirmed received quantity"] : []),
        ...(missingOrdered ? [missingOrdered + " matching rows lack an ordered quantity"] : []),
        ...(period.missingSource ? [period.missingSource + " older orders lack complete searchable item records for this account"] : []),
        ...(unmatched.length ? ["No matching rows: " + unmatched.join(", ")] : [])
    ];
}

function pfhTable(headings, rows, className = "", differenceColumn = -1) {
    if (!rows.length) return "";
    const head = headings.map(value => '<th scope="col">' + pfhEsc(value) + "</th>").join("");
    const body = rows.map(row => "<tr>" + row.map((value, index) => {
        const css = typeof value !== "number" ? "" : "pfhNum" +
            (index === differenceColumn && value ? (value < 0 ? " pfhShort" : " pfhOver") : "");
        return '<td class="' + css + '">' + pfhEsc(value) + "</td>";
    }).join("") + "</tr>").join("");
    return '<div class="pfhTableWrap ' + className + '"><table class="dataTable pfhTable"><thead><tr>' +
        head + "</tr></thead><tbody>" + body + "</tbody></table></div>";
}

function pfhRenderResult({type, periods}) {
    return periods.map(period => {
        const summary = type === "item" ? pfhTable(PFH_ITEM_SUMMARY_COLUMNS, pfhItemTotals(period.rows), "pfhItemSummary") : "";
        const notes = type === "item" ? pfhItemNotes(period).map(note => "<p>" + pfhEsc(note) + "</p>").join("") : "";
        const rows = period.rows.map(row => pfhCells(type, row));
        return '<section class="pfhPeriod"><h3>' + pfhEsc(pfhPeriodLabel(period)) + "</h3>" +
            summary + notes + (pfhTable(PFH_COLUMNS[type], rows, "", type === "discrepancy" ? 7 : -1) ||
                "<p>No matching records in this period.</p>") + "</section>";
    }).join("");
}

function pfhExportResult(result, format) {
    const {type, periods} = result;
    const title = PFH_TITLE[type];
    const filename = "PharmFlow " + title + " " + periods[0].from;
    if (format === "excel") {
        if (typeof XLSX === "undefined") throw new Error("Excel library is unavailable");
        const workbook = XLSX.utils.book_new();
        periods.forEach((period, index) => {
            const notes = type === "item" ? pfhItemNotes(period) : [];
            const totals = type === "item" ? [PFH_ITEM_SUMMARY_COLUMNS, ...pfhItemTotals(period.rows), []] : [];
            const sheet = XLSX.utils.aoa_to_sheet([[title], [pfhPeriodLabel(period) + " · Riyadh"],
                ...totals, ...notes.map(note => [note]), PFH_COLUMNS[type], ...period.rows.map(row => pfhCells(type, row))]);
            sheet["!cols"] = PFH_COLUMNS[type].map((_, column) => ({wch: column === 4 ? 44 : 22}));
            XLSX.utils.book_append_sheet(workbook, sheet, "Period " + (index + 1));
        });
        XLSX.writeFile(workbook, filename + ".xlsx");
        return;
    }
    if (!window.jspdf?.jsPDF) throw new Error("PDF library is unavailable");
    const doc = new window.jspdf.jsPDF({orientation: "landscape", unit: "pt", format: "a4"});
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const columns = PFH_COLUMNS[type];
    const weights = columns.map((_, index) => index === 4 ? 2.5 : index === 2 ? 1.5 : 1);
    const unit = (width - 56) / weights.reduce((sum, weight) => sum + weight, 0);
    const widths = weights.map(weight => weight * unit);
    periods.forEach((period, index) => {
        if (index) doc.addPage();
        const header = () => {
            doc.setTextColor(24, 67, 104);
            doc.setFontSize(16);
            doc.text("PharmFlow | " + title, 28, 34);
            doc.setFontSize(9);
            doc.text(pfhPeriodLabel(period) + " | Riyadh", 28, 50);
            let y = 65;

            let x = 28;
            doc.setFillColor(234, 244, 252);
            doc.rect(x, y - 2, width - 56, 19, "F");
            columns.forEach((column, i) => { doc.text(column, x + 4, y + 10); x += widths[i]; });
            doc.setTextColor(23, 43, 61);
            doc.setFontSize(8);
            return y + 27;
        };
        let y;
        if (type === "item") {
            doc.setFontSize(16);
            doc.text("PharmFlow | Item Receiving History", 28, 34);
            doc.setFontSize(10);
            doc.text(pfhPeriodLabel(period) + " | Riyadh", 28, 50);
            const summary = [...pfhItemTotals(period.rows).map(([code, name, ordered, received]) =>
                code + " | " + name + " | Total Ordered: " + ordered + " | Confirmed Received: " + received), ...pfhItemNotes(period)];
            y = 70;
            for (const line of summary.flatMap(note => doc.splitTextToSize(note, width - 56))) {
                if (y > height - 28) { doc.addPage(); y = 30; }
                doc.text(line, 28, y);
                y += 14;
            }
            doc.addPage();
        }
        y = header();
        for (const row of period.rows) {
            const lines = pfhCells(type, row).map((value, i) => doc.splitTextToSize(String(value ?? ""), widths[i] - 8));
            const rowHeight = Math.max(...lines.map(cell => cell.length)) * 10 + 6;
            if (y + rowHeight > height - 25) { doc.addPage(); y = header(); }
            let x = 28;
            lines.forEach((cell, i) => { doc.text(cell, x + 4, y); x += widths[i]; });
            y += rowHeight;
        }
    });
    doc.save(filename + ".pdf");
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
    const tags = document.getElementById("pfhItems");
    const more = document.getElementById("pfhMore");
    const retry = document.getElementById("pfhRetry");
    const submit = form.querySelector('[type="submit"]');
    let terms = [];
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
    const renderTerms = () => {
        tags.replaceChildren(...terms.map(term => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "pfhButton";
            button.textContent = term + " ×";
            button.setAttribute("aria-label", "Remove " + term);
            button.addEventListener("click", () => {
                terms = terms.filter(value => value !== term);
                renderTerms();
                clear();
                field("item").focus();
            });
            return button;
        }));
        tags.hidden = !terms.length;
    };
    document.getElementById("pfhAddItem").addEventListener("click", () => {
        const added = pfhSearchTerms(field("item").value);
        if (!added.length) { field("item").focus(); return; }
        terms = [...new Set([...terms, ...added])];
        field("item").value = "";
        renderTerms();
        clear();
        field("item").focus();
    });
    const changeType = () => {
        const type = field("reportType").value;
        const useItem = type === "item";
        typeLabel.textContent = PFH_TITLE[type];
        for (const option of reportOptions) {
            option.setAttribute("aria-pressed", String(option.dataset.pfhType === type));
        }
        itemField.hidden = !useItem;
        datePicker.close();
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
        terms = [];
        renderTerms();
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
        if (event.detail?.changed || !event.detail?.currentScope) close(false);
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
        list.innerHTML = pfhRenderResult(result);
        more.hidden = nextOffset == null;
        exports.hidden = !period.rows.length;
        retry.hidden = true;
    };
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
        const matches = [...new Set([...terms, ...pfhSearchTerms(field("item").value)])];
        const order = pfhNormalizeOrder(field("order").value);
        const period = {from: field("from").value, to: field("to").value};
        datePicker.close();
        closeType();
        if (!period.from || !period.to) { clear("Select From and To dates."); return; }
        if (period.from > period.to) { clear("From must be on or before To."); return; }
        if (type === "item" && !matches.length) { clear("Enter an item code or name."); return; }
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
                data = {...await pfhReadItemHistory({p_pharmacy_id: pharmacy}, period, order, matches, current), terms: matches};
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
