"use strict";
(function () {
    const scriptUrl = document.currentScript?.src;
    const MAX_BATCH_BYTES = 1500000;
    const DATE = new Intl.DateTimeFormat("sv-SE", {timeZone: "Asia/Riyadh"});
    const importRpc = "import_pharmflow_transfer_history_v1";
    const searchRpc = "search_pharmflow_transfer_history_v1";
    const elapsed = start => (performance.now() - start).toFixed(1) + " ms";
    const message = error => /PGRST202|schema cache/i.test(error.message)
        ? "Staging database setup is pending. The 100-file local test is available." : error.message;

    function start() {
        if (APP_CONFIG.environment !== "staging") return;
        const el = id => document.getElementById(id);
        const navigation = el("transferNavigation");
        if (!navigation || !scriptUrl) return;
        navigation.hidden = false;
        const files = el("pftFiles"), issues = el("pftIssues"), status = el("pftImportStatus");
        const save = el("pftSave"), benchmark = el("pftBenchmark"), read = el("pftRead");
        const search = el("pftSearch"), searchStatus = el("pftSearchStatus"), result = el("pftResults"), more = el("pftMore");
        let pending = [];
        let syntheticTransfers = [];
        let importBusy = false;
        let searchBusy = false;
        let filter = null;
        let version = 0;
        const scope = () => [AuthState.identityEpoch, AuthState.context?.pharmacy_id].join("|");
        const access = write => {
            window.PharmFlowPermissions?.require("RECEIVING", write);
            const context = AuthState.context;
            if (!context?.pharmacy_id || !context.pharmacy_code) throw new Error("Select an active pharmacy.");
            return context;
        };
        const refreshButtons = () => {
            read.disabled = benchmark.disabled = files.disabled = importBusy;
            el("pftDateFormat").disabled = importBusy;
            save.disabled = importBusy || !pending.length;
        };
        const addIssue = text => {
            const entry = document.createElement("li");
            entry.textContent = text;
            issues.append(entry);
        };
        async function readBatch(synthetic) {
            if (importBusy || searchBusy) return;
            const selected = synthetic ? Array.from({length: 100}, (_, i) => i + 1) : [...files.files];
            if (!selected.length) { status.textContent = "Select one or more Excel files."; return; }
            const currentScope = scope();
            const ownVersion = ++version;
            const current = () => currentScope === scope() && ownVersion === version;
            const start = performance.now();
            let worker;
            try {
                const context = access(!synthetic);
                importBusy = true;
                pending = [];
                syntheticTransfers = [];
                status.textContent = "Starting Excel reader…";
                issues.replaceChildren();
                refreshButtons();
                worker = new Worker(new URL("item-transfer-worker.js?v=1", scriptUrl));
                let readMs = 0, count = 0, bytes = 0, invalid = 0;
                const parsed = [];
                for (const entry of selected) {
                    if (!current()) return;
                    const response = await new Promise((resolve, reject) => {
                        const timer = setTimeout(() => reject(new Error("Excel reader timed out.")), 30000);
                        worker.onmessage = event => {clearTimeout(timer); resolve(event.data);};
                        worker.onerror = () => {clearTimeout(timer); reject(new Error("Excel reader could not start."));};
                        worker.postMessage({dateOrder: el("pftDateFormat").value, pharmacy: context.pharmacy_code,
                            ...(synthetic ? {fixture: entry} : {file: entry})});
                    });
                    if (!current()) return;
                    if (response.error) {
                        invalid++;
                        addIssue((synthetic ? "Synthetic " + entry : entry.name) + " — " + response.error);
                    } else {
                        parsed.push(response.transfer);
                        readMs += response.readMs;
                        count += response.transfer.items.length;
                        bytes += response.bytes;
                    }
                    status.textContent = "Read " + (parsed.length + invalid) + " of " + selected.length + " files…";
                }
                if (synthetic) {
                    syntheticTransfers = parsed;
                    search.elements.namedItem("item").value = "810001";
                    search.elements.namedItem("from").value = "2026-09-01";
                    search.elements.namedItem("to").value = "2026-09-30";
                    filter = null;
                    more.hidden = el("pftReport").hidden = true;
                    result.replaceChildren();
                    searchStatus.textContent = "Synthetic transfers are ready to search in this session.";
                } else {
                    const byNumber = new Map();
                    const conflicts = new Set();
                    for (const transfer of parsed) {
                        const signature = JSON.stringify([transfer.date, transfer.source, transfer.destination,
                            transfer.items.map(item => JSON.stringify([item.code, item.name, item.quantity])).sort()]);
                        const existing = byNumber.get(transfer.number);
                        if (!existing) byNumber.set(transfer.number, {signature, transfer});
                        else if (existing.signature !== signature) conflicts.add(transfer.number);
                        else addIssue(transfer.number + " — Repeated in this selection.");
                    }
                    for (const number of conflicts) {
                        byNumber.delete(number);
                        addIssue(number + " — Different versions in this selection. Review those files before saving.");
                    }
                    pending = [...byNumber.values()].map(entry => entry.transfer);
                }
                status.textContent = (synthetic ? "Synthetic test · " : "") + parsed.length + " readable files · " +
                    count + " item rows · " + invalid + " rejected · " + (bytes / 1024).toFixed(0) + " KB local Excel · " +
                    readMs.toFixed(1) + " ms parsing · " + elapsed(start) + " total" +
                    (synthetic ? " · 0 database requests" : " · " + pending.length + " ready to save");
            } catch (error) {
                if (current()) status.textContent = message(error);
            } finally {
                worker?.terminate();
                if (current()) { importBusy = false; refreshButtons(); }
            }
        }
        read.addEventListener("click", () => readBatch(false));
        benchmark.addEventListener("click", () => readBatch(true));
        files.addEventListener("change", () => {
            pending = [];
            syntheticTransfers = [];
            filter = null;
            more.hidden = el("pftReport").hidden = true;
            result.replaceChildren();
            searchStatus.textContent = "";
            issues.replaceChildren();
            status.textContent = "";
            refreshButtons();
        });
        save.addEventListener("click", async () => {
            if (importBusy || !pending.length) return;
            const ownScope = scope();
            const start = performance.now();
            const counts = {imported: 0, duplicate: 0, conflict: 0};
            const encoder = new TextEncoder();
            try {
                const context = access(true);
                importBusy = true;
                refreshButtons();
                while (pending.length && ownScope === scope()) {
                    const batch = [];
                    let bytes = 0;
                    for (const transfer of pending) {
                        const size = encoder.encode(JSON.stringify(transfer)).length;
                        if (size > MAX_BATCH_BYTES) throw new Error(transfer.number + " exceeds the save size limit.");
                        if (batch.length >= 25 || bytes + size > MAX_BATCH_BYTES) break;
                        batch.push(transfer);
                        bytes += size;
                    }
                    status.textContent = "Saving " + pending.length + " remaining transfers…";
                    const outcomes = await authRpc(importRpc, {p_pharmacy_id: context.pharmacy_id, p_transfers: batch});
                    if (ownScope !== scope()) return;
                    if (!Array.isArray(outcomes) || outcomes.length !== batch.length ||
                        outcomes.some(row => !Object.hasOwn(counts, row.outcome))) throw new Error("Unexpected save response.");
                    for (const row of outcomes) {
                        counts[row.outcome]++;
                        if (row.outcome === "conflict") addIssue(row.number + " — Conflict: saved transfer has different content.");
                    }
                    pending = pending.slice(batch.length);
                }
                if (ownScope !== scope()) return;
                status.textContent = counts.imported + " imported · " + counts.duplicate + " already imported · " +
                    counts.conflict + " conflicts · " + elapsed(start);
            } catch (error) {
                if (ownScope === scope()) status.textContent = message(error) + " " + pending.length + " transfers pending.";
            } finally {
                if (ownScope === scope()) { importBusy = false; refreshButtons(); }
            }
        });
        function localMatches(args) {
            const query = args.p_item.toLowerCase();
            return syntheticTransfers.filter(transfer => transfer.date >= args.p_from && transfer.date <= args.p_to)
                .sort((a, b) => b.date.localeCompare(a.date) || a.number.localeCompare(b.number))
                .flatMap(transfer => transfer.items.filter(item =>
                    item.code.toLowerCase() === query || item.name.toLowerCase().includes(query))
                    .map(item => ({...item, number: transfer.number, source: transfer.source,
                        destination: transfer.destination, received_date: transfer.date})))
                .slice(args.p_offset, args.p_offset + 101);
        }
        async function load(next) {
            if (searchBusy || importBusy || (next && !filter)) return;
            const ownScope = scope();
            try {
                const context = access(false);
                const fields = search.elements;
                const args = next ? filter : {
                    p_pharmacy_id: context.pharmacy_id, p_item: fields.namedItem("item").value.trim(),
                    p_from: fields.namedItem("from").value, p_to: fields.namedItem("to").value, p_offset: 0
                };
                if (!args.p_item || args.p_from > args.p_to) throw new Error("Enter an item and a valid date range.");
                searchBusy = true;
                more.disabled = search.querySelector("button").disabled = true;
                if (!next) { result.replaceChildren(); more.hidden = true; el("pftReport").hidden = true; }
                searchStatus.textContent = "Searching…";
                const synthetic = Boolean(syntheticTransfers.length);
                const page = synthetic ? localMatches(args) : await authRpc(searchRpc, args);
                if (ownScope !== scope()) return;
                if (!Array.isArray(page)) throw new Error("Unexpected search response.");
                for (const row of page.slice(0, 100)) {
                    const tr = document.createElement("tr");
                    for (const key of ["received_date", "number", "source", "destination", "code", "name", "quantity"]) {
                        const td = document.createElement("td");
                        td.textContent = row[key] ?? "";
                        if (key === "quantity") td.className = "pftQuantity";
                        tr.append(td);
                    }
                    result.append(tr);
                }
                filter = {...args, p_offset: args.p_offset + 100};
                el("pftReport").hidden = !result.children.length;
                more.hidden = page.length < 101;
                searchStatus.textContent = (synthetic ? "Synthetic test · " : "") +
                    (result.children.length ? result.children.length + " rows shown." : "No matching transfer items.");
            } catch (error) {
                if (ownScope === scope()) searchStatus.textContent = message(error);
            } finally {
                if (ownScope === scope()) {
                    searchBusy = false;
                    more.disabled = search.querySelector("button").disabled = false;
                }
            }
        }
        search.addEventListener("submit", event => {event.preventDefault(); load(false);});
        more.addEventListener("click", () => load(true));
        const today = DATE.format(new Date());
        search.elements.namedItem("to").value = today;
        search.elements.namedItem("from").value = today.slice(0, 8) + "01";
        window.addEventListener("auth:context-ready", event => {
            if (!event.detail?.changed && event.detail?.currentScope) return;
            version++;
            pending = [];
            syntheticTransfers = [];
            filter = null;
            importBusy = searchBusy = false;
            files.value = "";
            issues.replaceChildren();
            result.replaceChildren();
            status.textContent = searchStatus.textContent = "";
            more.hidden = el("pftReport").hidden = true;
            more.disabled = search.querySelector("button").disabled = false;
            refreshButtons();
        });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, {once: true});
    else start();
})();
