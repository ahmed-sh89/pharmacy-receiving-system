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
                worker = new Worker(new URL("item-transfer-worker.js?v=2", scriptUrl));
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
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, {once: true});
    else start();
})();
