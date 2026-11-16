"use strict";
(function () {
    const scriptUrl = document.currentScript?.src;
    const MAX_BATCH_BYTES = 1500000;
    const importRpc = "import_pharmflow_transfer_history_v1";
    const normalized = transfer => JSON.stringify([transfer.date, transfer.source, transfer.destination,
        transfer.items.map(item => JSON.stringify([item.code, item.name, item.quantity])).sort()]);

    function start() {
        const el = id => document.getElementById(id);
        const open = el("pftOpen"), dialog = el("pftDialog");
        if (!open || !dialog || !scriptUrl || APP_CONFIG.environment !== "staging") return;
        const files = el("pftFiles"), issues = el("pftIssues"), status = el("pftImportStatus");
        const save = el("pftSave"), choose = el("pftChoose"), close = el("pftClose"), review = el("pftReview");
        let pending = [], busy = false, generation = 0;
        const scope = () => [AuthState.identityEpoch, AuthState.context?.pharmacy_id].join("|");
        const access = () => {
            window.PharmFlowPermissions?.require("RECEIVING", true);
            const context = AuthState.context;
            if (!context?.pharmacy_id || !context.pharmacy_code) throw new Error("Select an active pharmacy.");
            return context;
        };
        startManageImports(el, access, scope);

        function refresh() {
            choose.disabled = close.disabled = busy;
            save.disabled = busy || !pending.length;
            review.hidden = !issues.children.length;
        }
        function reset() {
            generation++;
            pending = [];
            files.value = "";
            status.textContent = "";
            issues.replaceChildren();
            review.open = false;
            busy = false;
            refresh();
        }
        function addIssue(text) {
            const entry = document.createElement("li");
            entry.textContent = text;
            issues.append(entry);
        }
        open.addEventListener("click", () => {
            try {
                access();
                dialog.showModal();
            } catch (error) {
                showToast(error.message, "warning");
            }
        });
        close.addEventListener("click", () => { if (!busy) dialog.close(); });
        dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
        choose.addEventListener("click", () => files.click());
        window.addEventListener("auth:context-ready", event => {
            if (!event.detail?.changed && event.detail?.currentScope) return;
            if (dialog.open) dialog.close();
            reset();
        });
        window.addEventListener("pharmflow:receiving-history-closed", () => {
            if (dialog.open) dialog.close();
            reset();
        });

        files.addEventListener("change", async () => {
            const selected = [...files.files];
            // Keep only parsed records once the read completes.
            reset();
            if (!selected.length) return;
            const stamp = generation, activeScope = scope();
            const current = () => stamp === generation && activeScope === scope();
            let worker;
            try {
                const context = access();
                busy = true;
                refresh();
                status.textContent = "Reading " + selected.length + " files…";
                worker = new Worker(new URL("item-transfer-worker.js?v=3", scriptUrl));
                const byNumber = new Map(), conflicts = new Set();
                let repeats = 0, invalid = 0;
                for (let i = 0; i < selected.length && current(); i++) {
                    const file = selected[i];
                    const response = await new Promise((resolve, reject) => {
                        const timer = setTimeout(() => reject(new Error("Excel reader timed out.")), 30000);
                        worker.onmessage = event => {clearTimeout(timer); resolve(event.data);};
                        worker.onerror = () => {clearTimeout(timer); reject(new Error("Excel reader could not start."));};
                        worker.postMessage({pharmacy: context.pharmacy_code, file});
                    });
                    if (!current()) return;
                    if (response.error) {
                        invalid++;
                        addIssue(file.name + " — " + response.error);
                    } else {
                        const transfer = response.transfer, signature = normalized(transfer);
                        const existing = byNumber.get(transfer.number);
                        if (!existing) byNumber.set(transfer.number, {signature, transfer});
                        else if (existing.signature !== signature) conflicts.add(transfer.number);
                        else repeats++;
                    }
                    if (i + 1 < selected.length) status.textContent = "Read " + (i + 1) + " of " + selected.length + " files…";
                }
                if (!current()) return;
                for (const number of conflicts) {
                    byNumber.delete(number);
                    addIssue(number + " — Different versions in this selection. Review those files before saving.");
                }
                pending = [...byNumber.values()].map(entry => entry.transfer);
                status.textContent = pending.length + " ready · " + repeats + " repeated in selection · " +
                    (invalid + conflicts.size) + " need review.";
            } catch (error) {
                if (current()) status.textContent = error.message;
            } finally {
                worker?.terminate();
                if (current()) { busy = false; refresh(); }
            }
        });

        save.addEventListener("click", async () => {
            if (busy || !pending.length) return;
            const stamp = generation, activeScope = scope();
            const current = () => stamp === generation && activeScope === scope();
            const counts = {imported: 0, duplicate: 0, conflict: 0};
            const encoder = new TextEncoder();
            try {
                const context = access();
                busy = true;
                refresh();
                while (pending.length && current()) {
                    const batch = [];
                    let bytes = 0;
                    for (const transfer of pending) {
                        if (batch.length >= 25) break;
                        const size = encoder.encode(JSON.stringify(transfer)).length;
                        if (size > MAX_BATCH_BYTES) throw new Error(transfer.number + " exceeds the save size limit.");
                        if (bytes + size > MAX_BATCH_BYTES) break;
                        batch.push(transfer);
                        bytes += size;
                    }
                    status.textContent = "Saving " + pending.length + " remaining transfers…";
                    const outcomes = await authRpc(importRpc, {p_pharmacy_id: context.pharmacy_id, p_transfers: batch});
                    if (!current()) return;
                    if (!Array.isArray(outcomes) || outcomes.length !== batch.length ||
                        outcomes.some(row => !Object.hasOwn(counts, row.outcome))) throw new Error("Unexpected save response.");
                    for (const row of outcomes) {
                        counts[row.outcome]++;
                        if (row.outcome === "conflict") addIssue(row.number + " — Saved transfer has different content.");
                    }
                    pending = pending.slice(batch.length);
                }
                if (current()) status.textContent = counts.imported + " imported · " + counts.duplicate +
                    " already imported · " + counts.conflict + " conflicts.";
            } catch (error) {
                if (current()) status.textContent = error.message + " " + pending.length + " transfers pending.";
            } finally {
                if (current()) {
                    busy = false;
                    refresh();
                    if (counts.imported) {
                        window.dispatchEvent(new CustomEvent("pharmflow:transfers-imported"));
                    }
                }
            }
        });
    }
    function startManageImports(el, access, scope) {
        const dialog = el("pftManageDialog"), form = el("pftManageForm");
        const close = el("pftManageClose"), body = el("pftManageRows"), results = el("pftManageResults");
        const status = el("pftManageStatus"), actions = el("pftManageActions");
        const prev = el("pftManagePrev"), next = el("pftManageNext"), remove = el("pftManageDelete");
        const confirmation = el("pftManageConfirm"), commit = el("pftManageCommit"), cancel = el("pftManageCancel");
        const pageSize = 100;
        const prompt = "Enter a TO number or an upload date range.";
        const uploadDate = new Intl.DateTimeFormat("sv-SE",
            {timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit"});
        const selected = new Map();
        let query, page = 0, hasMore = false, busy = false, generation = 0;

        const refresh = () => {
            const confirming = !confirmation.hidden;
            for (const control of [...form.elements, ...body.querySelectorAll("input")]) {
                control.disabled = busy || confirming;
            }
            close.disabled = cancel.disabled = commit.disabled = busy;
            prev.disabled = busy || confirming || page === 0;
            next.disabled = busy || confirming || !hasMore;
            remove.disabled = busy || confirming || !selected.size;
            remove.textContent = "Delete Selected" + (selected.size ? " (" + selected.size + ")" : "");
        };

        function clearResults() {
            selected.clear();
            confirmation.hidden = results.hidden = actions.hidden = true;
            body.replaceChildren();
        }

        function reset() {
            generation++;
            busy = false;
            query = undefined;
            page = 0;
            hasMore = false;
            form.reset();
            clearResults();
            status.textContent = prompt;
            refresh();
        }

        function requestCurrent() {
            const stamp = generation, activeScope = scope();
            return () => stamp === generation && activeScope === scope() && dialog.open;
        }

        async function load(offset, notice = "") {
            if (busy || !query) return;
            const current = requestCurrent();
            clearResults();
            busy = true;
            refresh();
            status.textContent = notice + "Searching…";
            try {
                const context = access();
                const rows = await authRpc("list_pharmflow_transfer_imports_v2",
                    {...query, p_pharmacy_id: context.pharmacy_id, p_offset: offset});
                if (!current()) return;
                if (!Array.isArray(rows)) throw new Error("Unexpected import search response.");
                page = offset;
                hasMore = rows.length > pageSize;
                for (const row of rows.slice(0, pageSize)) {
                    const tr = document.createElement("tr");
                    const checkbox = document.createElement("input");
                    checkbox.type = "checkbox";
                    checkbox.setAttribute("aria-label", "Select " + row.number);
                    checkbox.addEventListener("change", () => {
                        if (checkbox.checked) selected.set(row.number, {number: row.number, imported_at: row.imported_at});
                        else selected.delete(row.number);
                        refresh();
                    });
                    tr.insertCell().append(checkbox);
                    for (const value of [row.number, row.source, uploadDate.format(new Date(row.imported_at)), row.received_date]) {
                        tr.insertCell().textContent = value;
                    }
                    body.append(tr);
                }
                status.textContent = notice + (rows.length ? "Select transfers to delete from this page." : "No imported transfers found.");
                results.hidden = !rows.length;
                actions.hidden = !rows.length && !page;
            } catch (error) {
                if (current()) status.textContent = notice + (error.message || "Unable to load imports.");
            } finally {
                if (current()) { busy = false; refresh(); }
            }
        }

        el("pftManage").addEventListener("click", () => {
            try {
                access();
                reset();
                dialog.showModal();
            } catch (error) {
                showToast(error.message, "warning");
            }
        });
        close.addEventListener("click", () => { if (!busy) dialog.close(); });
        dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
        const closeForScope = () => { if (dialog.open) { dialog.close(); reset(); } };
        window.addEventListener("auth:context-ready", event => {
            if (event.detail?.changed || !event.detail?.currentScope) closeForScope();
        });
        window.addEventListener("pharmflow:receiving-history-closed", closeForScope);
        form.addEventListener("input", () => { clearResults(); refresh(); });
        form.addEventListener("submit", event => {
            event.preventDefault();
            const field = name => form.elements.namedItem(name).value;
            const order = field("order").trim().toUpperCase().replace(/\s+/g, "");
            const from = field("from"), to = field("to");
            if ((!order && (!from || !to)) || (from && to && from > to)) {
                status.textContent = from && to && from > to ? "From must be on or before To." : prompt;
                return;
            }
            query = {p_order: order, p_from: from || null, p_to: to || null};
            load(0);
        });
        prev.addEventListener("click", () => load(page - pageSize));
        next.addEventListener("click", () => load(page + pageSize));
        remove.addEventListener("click", () => {
            if (!selected.size) return;
            el("pftManageConfirmText").textContent = "Delete " + selected.size +
                (selected.size === 1 ? " selected transfer? " : " selected transfers? ") +
                "You can import the Excel files again after deletion.";
            confirmation.hidden = false;
            refresh();
            cancel.focus();
        });
        cancel.addEventListener("click", () => {
            confirmation.hidden = true;
            refresh();
            remove.focus();
        });
        commit.addEventListener("click", async () => {
            if (busy || confirmation.hidden || !selected.size) return;
            const current = requestCurrent();
            const imports = [...selected.values()];
            busy = true;
            refresh();
            status.textContent = "Deleting selected transfers…";
            try {
                const context = access();
                const deleted = await authRpc("delete_pharmflow_transfer_imports_v1",
                    {p_pharmacy_id: context.pharmacy_id, p_imports: imports});
                if (!current()) return;
                if (deleted !== imports.length) throw new Error("Unexpected delete response. Search again.");
                window.dispatchEvent(new CustomEvent("pharmflow:transfers-imported"));
                busy = false;
                await load(0, deleted + (deleted === 1 ? " transfer deleted. " : " transfers deleted. "));
            } catch (error) {
                if (current()) {
                    clearResults();
                    status.textContent = error.message || "Unable to delete selected transfers.";
                }
            } finally {
                if (current()) { busy = false; refresh(); }
            }
        });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, {once: true});
    else start();
})();
