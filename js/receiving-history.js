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

function pfhDayBefore(day) {
    const date = new Date(day + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
}

function pfhCompletionDay(date) {
    const timestamp = new Date(date || "");
    return Number.isNaN(timestamp.getTime()) ? "" : PFH_DAY.format(timestamp);
}

function pfhWithin(date, {from, to}) {
    const day = pfhCompletionDay(date);
    return day >= from && day <= to;
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

async function pfhReadExistingHistory(type, params, period, order, current) {
    // Existing RPC dates use UTC. Widen the first day, then apply local completion dates.
    const dates = {...params, p_from: pfhDayBefore(period.from), p_to: period.to};
    const matchesOrder = row => !order || pfhNormalizeOrder(row.order_number) === order;
    if (type === "new") {
        const rows = await pfhReadRows("list_pharmflow_new_item_history_v1", dates,
            [["order", "completed_at.desc,workspace_history_id,order_number,item_code"]], current);
        return rows.filter(row => pfhWithin(row.completed_at, period) && matchesOrder(row));
    }
    const workspaces = await pfhReadRows("list_pharmflow_receiving_workspace_history_v1", dates,
        [["order", "completed_at.desc,workspace_history_id"]], current);
    const eligible = workspaces.filter(row => pfhWithin(row.completed_at, period) &&
        Number(row.discrepancy_count) > 0 &&
        (!order || (row.order_numbers || []).some(number => pfhNormalizeOrder(number) === order)));
    const groups = await pfhReadBatches(eligible, async workspace => {
        const rows = await pfhReadRows("get_pharmflow_receiving_workspace_history_v1",
            {...params, p_workspace_history_id: workspace.workspace_history_id},
            [["event_type", "eq.DISCREPANCY"], ["order", "order_number,item_code,item_name,issue_type,ordered_qty,received_qty"]], current);
        return rows.filter(matchesOrder).map(row => ({...row, completed_at: workspace.completed_at}));
    }, current);
    return groups.flat();
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

async function pfhReadItemHistory(params, periods, order, item, current) {
    const from = periods.map(period => period.from).sort()[0];
    const to = periods.map(period => period.to).sort().at(-1);
    const nextDay = new Date(new Date(to + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
    const archives = await pfhReadRows("list_pharmflow_finalized_archives", params, [
        ["closed_at", "gte." + from + "T00:00:00+03:00"],
        ["closed_at", "lt." + nextDay + "T00:00:00+03:00"],
        ["order", "closed_at.desc,archive_id.desc"]
    ], current);

    const orders = new Map();
    for (const row of archives) {
        if (!periods.some(period => pfhWithin(row.closed_at, period))) continue;
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
            {...params, p_order_number: number}, [["order", "line_no,id"]], current);
        const items = saved ? archive.itemReceivingHistory : pfhLegacyItemRows(archive, number, uploaded);
        const file = (archive.orderFiles || []).find(row => pfhNormalizeOrder(row.documentId || row.orderNumber) === number);
        const rows = items.filter(row => String(row.item_code).toLowerCase() === item ||
            String(row.item_name || "").toLowerCase().includes(item)).map(row => ({
                ...row, received_qty: pfhQuantity(row.received_qty), order_number: number,
                order_date: file?.orderDate, completed_at
            }));
        return {rows, completed_at, missingSource: !saved && !uploaded.length};
    }, current);
    return periods.map(period => {
        const matches = results.filter(row => pfhWithin(row.completed_at, period));
        return {...period, rows: matches.flatMap(result => result.rows),
            missingSource: matches.filter(result => result.missingSource).length};
    });
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

function pfhItemSummary(period) {
    const verified = period.rows.filter(row => row.received_qty != null);
    const total = verified.length
        ? verified.reduce((sum, row) => sum + row.received_qty, 0)
        : "Not available";
    return [
        "Confirmed received total: " + total,
        ...(verified.length < period.rows.length ? [(period.rows.length - verified.length) + " matching rows lack a confirmed quantity"] : []),
        ...(period.missingSource ? [period.missingSource + " older orders lack complete searchable item records for this account"] : [])
    ];
}

function pfhRenderResult({type, periods}) {
    return periods.map(period => {
        const rows = period.rows.map(row => pfhCells(type, row));
        const headings = PFH_COLUMNS[type].map(value => "<th scope=\"col\">" + pfhEsc(value) + "</th>").join("");
        const body = rows.map(row => "<tr>" + row.map((value, index) => {
            const className = typeof value !== "number" ? "" :
                "pfhNum" + (type === "discrepancy" && index === 7 ? (value < 0 ? " pfhShort" : " pfhOver") : "");
            return '<td class="' + className + '">' + pfhEsc(value) + "</td>";
        }).join("") + "</tr>").join("");
        const summary = type === "item" ? pfhItemSummary(period) : [];
        return '<section class="pfhPeriod"><h3>' + pfhEsc(pfhPeriodLabel(period)) + "</h3>" +
            (summary.length ? "<p><strong class=\"pfhTotal\">" + pfhEsc(summary[0]) + "</strong>" +
                (summary.length > 1 ? " · " + pfhEsc(summary.slice(1).join(" · ")) : "") + "</p>" : "") +
            (rows.length ? '<div class="pfhTableWrap"><table class="dataTable pfhTable"><thead><tr>' +
                headings + "</tr></thead><tbody>" + body + "</tbody></table></div>" :
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
            const notes = type === "item" ? pfhItemSummary(period) : [];
            const sheet = XLSX.utils.aoa_to_sheet([[title], [pfhPeriodLabel(period) + " · Riyadh"],
                ...notes.map(note => [note]), PFH_COLUMNS[type], ...period.rows.map(row => pfhCells(type, row))]);
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
            for (const note of type === "item" ? pfhItemSummary(period) : []) {
                doc.text(note, 28, y);
                y += 13;
            }
            let x = 28;
            doc.setFillColor(234, 244, 252);
            doc.rect(x, y - 2, width - 56, 19, "F");
            columns.forEach((column, i) => { doc.text(column, x + 4, y + 10); x += widths[i]; });
            doc.setTextColor(23, 43, 61);
            doc.setFontSize(8);
            return y + 27;
        };
        let y = header();
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
            popover.setAttribute("role", "dialog");
            popover.setAttribute("aria-label", "Choose a date");
            button.parentElement.append(popover);
            button.setAttribute("aria-expanded", "true");
            pfhRenderCalendar(popover, month, field.value, today);
            const {right} = popover.getBoundingClientRect();
            popover.style.setProperty("--pfh-calendar-shift", Math.min(0, document.documentElement.clientWidth - right - 12) + "px");
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
    return {close, sync};
}

function pfhBoot() {
    const openButton = document.getElementById("btnReceivingHistoryReport");
    const page = document.getElementById("receivingHistoryContent");
    const report = document.getElementById("receivingReportContent");
    if (!openButton || !page || !report) return;
    const form = document.getElementById("pfhForm");
    const field = name => form.elements.namedItem(name);
    const typePicker = document.getElementById("pfhTypePicker");
    const typeTrigger = typePicker.querySelector("summary");
    const typeLabel = document.getElementById("pfhTypeValue");
    const reportOptions = typePicker.querySelectorAll("[data-pfh-type]");
    const toolbar = document.getElementById("pfhToolbar");
    const itemField = document.getElementById("pfhItemField");
    const extraPeriod = document.getElementById("pfhExtraPeriod");
    const addPeriod = document.getElementById("pfhAddPeriod");
    const list = document.getElementById("pfhResults");
    const status = document.getElementById("pfhStatus");
    const exports = document.getElementById("pfhExports");
    let result = null;
    let search = 0;
    const clear = (message = "") => {
        search++;
        result = null;
        exports.hidden = true;
        status.textContent = message;
        toolbar.hidden = !message;
        list.replaceChildren();
    };
    const datePicker = pfhDatePicker(form, clear, () => { typePicker.open = false; });
    const secondPeriod = enabled => {
        datePicker.close();
        extraPeriod.hidden = !enabled;
        addPeriod.hidden = enabled || field("reportType").value !== "item";
        for (const name of ["from2", "to2"]) {
            field(name).disabled = !enabled;
            if (!enabled) field(name).value = "";
        }
        datePicker.sync();
    };
    const changeType = () => {
        const type = field("reportType").value;
        const useItem = type === "item";
        typeLabel.textContent = PFH_TITLE[type];
        for (const option of reportOptions) {
            option.setAttribute("aria-pressed", String(option.dataset.pfhType === type));
        }
        itemField.hidden = !useItem;
        field("item").required = useItem;
        secondPeriod(false);
        clear();
    };
    const close = focus => {
        if (page.hidden) return;
        clear();
        datePicker.close();
        typePicker.open = false;
        page.hidden = true;
        report.hidden = false;
        if (focus) openButton.focus();
    };

    openButton.addEventListener("click", () => {
        try { window.PharmFlowPermissions?.require("RECEIVING", false); }
        catch (error) { showToast(error.message, "warning"); return; }
        if (!AuthState.context?.pharmacy_id) return;
        form.reset();
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
            typePicker.open = false;
            changeType();
            typeTrigger.focus();
        });
    }
    typeTrigger.addEventListener("click", () => datePicker.close());
    typePicker.addEventListener("keydown", event => {
        if (event.key === "Escape" && typePicker.open) {
            event.preventDefault();
            typePicker.open = false;
            typeTrigger.focus();
        }
    });
    document.addEventListener("pointerdown", event => {
        if (typePicker.open && !typePicker.contains(event.target)) typePicker.open = false;
    });
    form.addEventListener("input", () => clear());
    addPeriod.addEventListener("click", () => { secondPeriod(true); clear(); form.querySelector('[data-pfh-date="from2"]').focus(); });
    document.getElementById("pfhRemovePeriod").addEventListener("click", () => { secondPeriod(false); clear(); addPeriod.focus(); });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        const type = field("reportType").value;
        const item = field("item").value.trim().toLowerCase();
        const order = pfhNormalizeOrder(field("order").value);
        const periods = [{from: field("from").value, to: field("to").value}];
        if (!extraPeriod.hidden) periods.push({from: field("from2").value, to: field("to2").value});
        datePicker.close();
        typePicker.open = false;
        if (periods.some(period => !period.from || !period.to)) {
            clear("Select From and To dates for each period.");
            return;
        }
        if (periods.some(period => period.from > period.to)) {
            clear("From must be on or before To.");
            return;
        }
        if (type === "item" && !item) { clear("Enter an item code or name."); return; }
        const pharmacy = AuthState.context?.pharmacy_id;
        const epoch = AuthState.identityEpoch;
        if (!pharmacy) { clear("Sign in to search Receiving History."); return; }
        clear("Searching…");
        const request = search;
        const current = () => request === search && AuthState.identityEpoch === epoch &&
            AuthState.context?.pharmacy_id === pharmacy;
        const params = {p_pharmacy_id: pharmacy};
        try {
            const data = type === "item" ? await pfhReadItemHistory(params, periods, order, item, current) :
                [{...periods[0], rows: await pfhReadExistingHistory(type, params, periods[0], order, current)}];
            if (!current()) return;
            result = {type, periods: data};
            const count = data.reduce((sum, period) => sum + period.rows.length, 0);
            status.textContent = count ? "Completed dates shown in Saudi Arabia time." : "Search complete.";
            list.innerHTML = pfhRenderResult(result);
            exports.hidden = count === 0;
        } catch (error) {
            if (!current()) return;
            Logger?.error?.("Receiving History search failed", error);
            clear("Unable to load Receiving History. Try again.");
        }
    });

    for (const [id, format] of [["pfhExcel", "excel"], ["pfhPdf", "pdf"]]) {
        document.getElementById(id).addEventListener("click", () => {
            if (!result) return;
            try { pfhExportResult(result, format); }
            catch (error) { showToast(error.message || "Unable to export report", "error"); }
        });
    }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pfhBoot, {once: true});
else pfhBoot();
