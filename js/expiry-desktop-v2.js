/* Canonical Expiry Desktop workspace. Inventory queries and session receipts are server-owned. */
(function () {
  if (typeof window === "undefined") return;
  const originalBind = window.bindExpiryCaptureUI,
    originalActivate = window.activateExpiryCapture;
  let mode = "SESSION",
    resolved = false,
    offset = 0,
    sort = "ADDED",
    activeSort = "ADDED",
    filters = { search: "", departments: [], months: [] };
  let page = { rows: [], count: 0, units: 0, departments: [], months: [] },
    periods = [],
    session = [],
    sessionHydrated = false,
    selected = new Set();
  let visibleScope = null,
    renderedView = "";
  let requestVersion = 0,
    searchTimer,
    pendingRead,
    lastSummary = 0,
    dialog,
    busy = false,
    returnFocus,
    sessionId,
    viewportBound = false,
    sessionSearch = "";
  const esc = (v) => expiryEscapeHtml(v ?? ""),
    el = (id) => document.getElementById(id);
  const scope = () => expiryDraftScope() + "/" + expirySignedAuthIdentity();
  const savedFlashes = new Map();
  const groupKey = (r) => JSON.stringify([r.pharmacy_id || expiryPharmacyId(),
    r.effective_state_id || r.acknowledgement?.state_id || r.operation_id]);
  function clearSavedFlashes() {
    savedFlashes.forEach(f => clearTimeout(f.timer));
    savedFlashes.clear();
  }
  window.flashExpirySessionGroup = function (stateId, confirmedSessionId = sessionId, operationId) {
    if (!stateId || expiryIsHandheld() || !sessionHydrated || confirmedSessionId !== sessionId) return;
    const r = sessionGroups().find(r => (r.effective_state_id || r.acknowledgement?.state_id) === stateId);
    if (!r || (operationId && !r.members.some(m => m.operation_id === operationId))) return;
    const key = groupKey(r), ownScope = scope(), ownSession = sessionId;
    const previous = savedFlashes.get(key);
    if (previous) clearTimeout(previous.timer);
    const flash = { scope: ownScope, session: ownSession, until: Date.now() + 1000 };
    savedFlashes.set(key, flash);
    render();
    flash.timer = setTimeout(() => {
      if (savedFlashes.get(key) !== flash) return;
      savedFlashes.delete(key);
      if (scope() !== ownScope || sessionId !== ownSession) return;
      el("expiryCurrentStateBody").querySelectorAll("[data-expiry-group-key]").forEach(row => {
        if (row.dataset.expiryGroupKey === key) row.classList.remove("expiryRowSavedStrong");
      });
    }, 1000);
  };
  const month = (r) =>
    String(r.expiry_month).padStart(2, "0") + "/" + r.expiry_year;
  const periodMonth = (n) =>
    String(((n - 1) % 12) + 1).padStart(2, "0") +
    "/" +
    Math.floor((n - 1) / 12);
  const currentRows = () =>
    session.filter(
      (r) => r.kind === "KNOWN" && r.status !== "DELETED" && r.quantity > 0 &&
        (!r.pharmacy_id || r.pharmacy_id === expiryPharmacyId()) &&
        (!r.created_by || !AuthState.user?.id || r.created_by === AuthState.user.id),
    );
  const qty = (r) => Number(r.quantity) || 0;
  function identity(r) {
    return (
      "<strong>" +
      esc(r.item_name || "Unknown item") +
      '</strong><div class="expiryIdentityMeta">Code <b>' +
      esc(r.item_code || "—") +
      "</b> · GTIN <span>" +
      esc(r.identifier_display || "—") +
      "</span></div>"
    );
  }
  function authArgs() {
    return { p_pharmacy_id: expiryPharmacyId() };
  }
  function formFilters() {
    return { ...filters, search: filters.search.trim() };
  }
  function syncViewport() {
    if (expiryIsHandheld()) return;
    const s = el("zebraExpiryShell");
    if (!s?.classList.contains("active")) return;
    const bottomInset = mode === "SESSION"
      ? parseFloat(window.getComputedStyle(s.parentElement).paddingBottom) || 0
      : 0;
    s.style.setProperty(
      "--expiry-viewport-height",
      Math.max(
        420,
        window.innerHeight - Math.max(0, s.getBoundingClientRect().top) - bottomInset,
      ) + "px",
    );
    document.body.classList.add("expiryDesktopActive");
  }
  function setMode() {
    const s = el("zebraExpiryShell");
    s?.classList.toggle("expiryInventoryMode", mode === "INVENTORY");
    const capture = s?.querySelector(".expiryCaptureCard");
    if (capture) capture.hidden = mode === "INVENTORY";
    if (el("expirySessionSummary")) el("expirySessionSummary").hidden = mode !== "SESSION";
    el("expiryCurrentHeader").hidden = mode !== "INVENTORY";
    el("btnExpirySessionView").setAttribute(
      "aria-selected",
      String(mode === "SESSION"),
    );
    el("btnOpenExpiryInventory").setAttribute(
      "aria-selected",
      String(mode === "INVENTORY"),
    );
    el("expiryWorkspaceTitle").textContent = resolved
      ? "Resolved Inventory"
      : "Expiry Inventory";
    el("expiryWorkspaceSubtitle").textContent = resolved
      ? "Retained records · Restore only the selected quantities"
      : "Active pharmacy inventory";
    const table = s.querySelector(".expiryCurrentTable");
    table.classList.toggle("expirySessionTable", mode === "SESSION");
    table.classList.toggle("expiryInventoryTable", mode === "INVENTORY");
    table.querySelector("thead").innerHTML =
      mode === "SESSION"
        ? "<tr><th>Item Code / Identifier</th><th>Product Name</th><th>Batch</th><th>Expiry</th><th>Quantity</th><th>Actions</th></tr>"
        : '<tr><th><input type="checkbox" id="expiryPageSelection" aria-label="Select current page"></th><th>Product / Identification</th><th>Batch</th><th><button type="button" data-expiry-sort>Expiry</button></th><th>Quantity</th><th>Status</th><th>Last Updated</th><th>Actions</th></tr>';
    el("expiryPager").hidden = mode !== "INVENTORY";
    syncViewport();
    renderKpis();
  }
  function renderKpis() {
    const root = document.querySelector("#zebraExpiryShell .expiryKpiRow");
    if (!root) return;
    root.classList.toggle("is-session", mode === "SESSION");
    if (mode === "INVENTORY") {
      root.hidden = resolved;
      const names = {
        EXPIRED: "Expired",
        NEXT1: "Next Month",
        NEXT2: "Next 2 Months",
        NEXT6: "Next 6 Months",
      };
      root.innerHTML = periods
        .map(
          (p) =>
            '<button type="button" class="expiryKpiCard ' +
            (p.key === "EXPIRED" ? "expiryKpiExpired" : "") +
            '" data-period="' +
            p.key +
            '"><span>' +
            names[p.key] +
            "</span><strong>" +
            p.count +
            "</strong><small>" +
            p.units +
            " units · " +
            (p.from == null
              ? periodMonth(p.to) + " and earlier"
              : p.from === p.to
                ? periodMonth(p.to)
                : periodMonth(p.from) + " – " + periodMonth(p.to)) +
            "</small></button>",
        )
        .join("");
      root.querySelectorAll("[data-period]").forEach(
        (b) =>
          (b.onclick = () => {
            const p = periods.find((p) => p.key === b.dataset.period);
            delete filters.from;
            if (p.from != null) filters.from = p.from;
            filters.to = p.to;
            sort = "EXPIRY";
            offset = 0;
            selected.clear();
            void refresh();
          }),
      );
      return;
    }
    // Inventory keeps its independent four-card period model. Scan uses a compact header.
    root.hidden = true;
    root.innerHTML = "";
    const rows = currentRows(), summary = el("expirySessionSummary");
    if (summary) {
      summary.setAttribute("aria-busy", String(!sessionHydrated));
      summary.innerHTML = '<span class="expirySessionMetric"><span>TOTAL ITEMS</span><strong data-session-total="items">' +
        (sessionHydrated ? new Set(rows.map(r => r.item_code)).size : "—") +
        '</strong></span><span class="expirySessionMetric"><span>TOTAL UNITS</span><strong data-session-total="quantity">' +
        (sessionHydrated ? rows.reduce((n, r) => n + qty(r), 0) : "—") + '</strong></span>';
    }
  }
  function sessionGroups() {
    const groups = new Map();
    for (const r of currentRows()) {
      // Reuse the authoritative aggregate identity; do not infer grouping from name/serial.
      const key = groupKey(r);
      if (!groups.has(key)) groups.set(key, { ...r, quantity: 0, members: [], captured_at: null, registrations: 0, adjustments: 0 });
      const g = groups.get(key);
      g.quantity += qty(r);
      g.members.push(r);
      if (r.contribution_type === "GROUP_QUANTITY_ADJUSTMENT") g.adjustments++;
      else {
        g.registrations++;
        if (!g.captured_at || Date.parse(r.captured_at) > Date.parse(g.captured_at)) g.captured_at = r.captured_at;
      }
    }
    return [...groups.values()];
  }
  function updateToolbar() {
    el("expiryCurrentStateCount").textContent = String(page.count);
    el("expiryResultSummary").textContent =
      page.count + " records · " + page.units + " units";
    el("expirySort").textContent = resolved
      ? sort === "EXPIRY"
        ? "Earliest Expiry"
        : "Recently Resolved"
      : sort === "ADDED"
        ? "Recently Added"
        : sort === "UPDATED"
          ? "Recently Updated"
          : "Earliest Expiry";
    el("expiryResolved").textContent = resolved
      ? "Back to Inventory"
      : "Resolved";
    el("expiryBulkAction").textContent =
      (resolved ? "Restore" : "Resolve") + " Selected";
    el("expiryBulkAction").disabled = !selected.size;
    el("expiryPageLabel").textContent = page.count
      ? "Rows " +
        (offset + 1) +
        "–" +
        Math.min(offset + 50, page.count) +
        " of " +
        page.count
      : "No records";
    el("expiryPrev").disabled = offset === 0;
    el("expiryNext").disabled = offset + 50 >= page.count;
    for (const [id, key, options, label] of [
      ["expiryDepartments", "departments", page.departments, "Department"],
      ["expiryMonths", "months", page.months, "Expiry Months"],
    ]) {
      const d = el(id),
        focused = d.contains(document.activeElement)
          ? document.activeElement?.dataset?.value
          : null;
      d.querySelector("summary").textContent =
        label + (filters[key].length ? " (" + filters[key].length + ")" : "");
      d.querySelector("div").innerHTML =
        options
          .map(
            (value) =>
              '<button type="button" role="menuitemcheckbox" aria-checked="' +
              filters[key].includes(value) +
              '" data-value="' +
              esc(value) +
              '">' +
              esc(value) +
              "<b>" +
              (filters[key].includes(value) ? "✓" : "") +
              "</b></button>",
          )
          .join("") || "<span>No options</span>";
      if (focused != null)
        [...d.querySelectorAll("button")]
          .find((b) => b.dataset.value === focused)
          ?.focus({ preventScroll: true });
      d.querySelectorAll("button").forEach(
        (b) =>
          (b.onclick = () => {
            const v = b.dataset.value;
            filters[key] = filters[key].includes(v)
              ? filters[key].filter((x) => x !== v)
              : [...filters[key], v];
            offset = 0;
            selected.clear();
            void refresh();
          }),
      );
    }
    el("expiryAppliedFilters").textContent = [
      filters.search && "Search: " + filters.search,
      ...filters.departments,
      ...filters.months,
      filters.to != null &&
        "Period: " +
          (filters.from != null
            ? periodMonth(filters.from) + " – "
            : "Through ") +
          periodMonth(filters.to),
    ]
      .filter(Boolean)
      .join(" · ");
  }
  function render() {
    renderedView = mode + "/" + resolved;
    setMode();
    const body = el("expiryCurrentStateBody"),
      empty = el("expiryCurrentStateEmpty");
    const groups = mode === "SESSION" ? sessionGroups() : [],
      query = sessionSearch.trim().toLocaleLowerCase(),
      rows = mode === "SESSION" ? groups.filter(r => !query ||
        [r.item_name, r.item_code, r.identifier_display, r.batch_no]
          .some(v => String(v ?? "").toLocaleLowerCase().includes(query))) : page.rows;
    const search = el("expirySessionSearch");
    if (search) {
      search.disabled = !sessionHydrated || !currentRows().length;
      search.value = sessionSearch;
      el("expirySessionSearchClear").hidden = !sessionSearch;
    }
    el("expirySessionCount").textContent = sessionHydrated
      ? String(sessionGroups().length)
      : "…";
    el("zebraExpiryShell").classList.toggle("expirySessionEmpty",mode === "SESSION" && !rows.length);
    empty.hidden = !!rows.length;
    if (!rows.length) {
      body.innerHTML = "";
      empty.innerHTML =
        "<strong>" +
        (mode === "SESSION" && query && groups.length
          ? "No matching session items"
          : mode === "SESSION"
          ? sessionHydrated
            ? "No items captured in this session"
            : "Loading Session Activity"
          : "No matching expiry records") +
        "</strong><span>" +
        (mode === "SESSION"
          ? query && groups.length ? "Try another name, code, GTIN or batch, or clear session search." : "Scan or search above to start."
          : "Adjust filters or return to active Inventory.") +
        "</span>";
      if (mode === "INVENTORY") updateToolbar();
      return;
    }
    if (mode === "SESSION") {
      body.innerHTML = rows.map((r, i) => {
        const available = groupEditable(r);
        const flash = savedFlashes.get(groupKey(r));
        const flashing = flash && flash.scope === scope() && flash.session === sessionId && flash.until > Date.now();
        return '<tr data-expiry-group-key="' + esc(groupKey(r)) + '"' + (flashing ? ' class="expiryRowSavedStrong" style="--expiry-flash-delay:' + (flash.until - Date.now() - 1000) + 'ms"' : '') +
          '><td class="expirySessionIdentifier"><strong>' + esc(r.item_code || '—') +
          '</strong><span>GTIN <b>' + esc(r.identifier_display || '—') + '</b></span></td>' +
          '<td class="expirySessionProduct"><strong>' + esc(r.item_name || 'Unknown item') + '</strong>' +
          '<div class="expirySessionMeta"><time>' + esc(expiryFormatVerifiedAt(r.captured_at)) +
          '</time><span> · ' + r.registrations + ' registration' + (r.registrations === 1 ? '' : 's') +
          (r.adjustments ? ' · ' + r.adjustments + ' quantity adjustment' + (r.adjustments === 1 ? '' : 's') : '') + '</span></div></td>' +
          '<td class="expirySessionBatch"><strong>' + esc(r.batch_no || "Not Recorded") + '</strong></td>' +
          '<td class="expirySessionExpiry">' + month(r) + '</td><td class="expiryActivityQty">' + qty(r) +
          '</td><td class="expirySessionActions"><button type="button" class="expirySessionAction" ' + (available ? '' : 'disabled title="Reload current session to verify this group" ') + 'data-session-edit="' + i +
          '">Edit</button><button type="button" class="expirySessionAction danger" ' + (available ? '' : 'disabled title="Reload current session to verify this group" ') + 'data-session-delete="' + i +
          '">Delete</button></td></tr>';
      }).join("");
      body.querySelectorAll("[data-session-edit],[data-session-delete]").forEach(b => {
        if (!b.disabled) b.onclick = () => sessionGroupDialog(rows[Number(b.dataset.sessionEdit ?? b.dataset.sessionDelete)], b, b.hasAttribute("data-session-delete"));
      });
      return;
    }
    updateToolbar();
    body.innerHTML = page.rows
      .map((r, i) => {
        const d = new Date(r.updated_at);
        return (
          '<tr><td><input type="checkbox" aria-label="Select ' +
          esc(r.item_code) +
          '" data-row-selection="' +
          r.row_id +
          '" ' +
          (selected.has(r.row_id) ? "checked" : "") +
          '></td><td class="expiryInventoryProduct">' +
          identity(r) +
          "</td><td>" +
          esc(r.batch_no || "Not Recorded") +
          "</td><td>" +
          month(r) +
          '</td><td class="expiryQtyCell">' +
          qty(r) +
          '</td><td><span class="expiryInventoryStatus ' +
          (r.status === "RESOLVED"
            ? "resolved"
            : r.expiry_year * 12 + r.expiry_month <= periods[0]?.to
              ? "expired"
              : "") +
          '">' +
          (r.status === "RESOLVED"
            ? "Resolved"
            : r.expiry_year * 12 + r.expiry_month <= periods[0]?.to
              ? "Expired"
              : "Active") +
          '</span></td><td class="expiryTimeCell"><time>' +
          esc(d.toLocaleDateString()) +
          "<br>" +
          esc(
            d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          ) +
          '</time></td><td class="expiryActionsCell">' +
          (!resolved
            ? '<button class="expiryRowAction" data-quantity="' +
              i +
              '">Edit Qty</button>'
            : "") +
          '<button class="expiryRowAction" data-row-action="' +
          i +
          '">' +
          (resolved ? "Restore" : "Resolve") +
          "</button></td></tr>"
        );
      })
      .join("");
    body.querySelectorAll("[data-row-selection]").forEach(
      (b) =>
        (b.onchange = () => {
          if (b.checked) selected.add(b.dataset.rowSelection);
          else selected.delete(b.dataset.rowSelection);
          updateToolbar();
        }),
    );
    el("expiryPageSelection").onchange = (e) => {
      page.rows.forEach((r) =>
        e.target.checked ? selected.add(r.row_id) : selected.delete(r.row_id),
      );
      render();
    };
    body
      .querySelectorAll("[data-row-action]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            confirmSelection(
              [page.rows[Number(b.dataset.rowAction)].row_id],
              b,
            )),
      );
    body
      .querySelectorAll("[data-quantity]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            quantityEdit(page.rows[Number(b.dataset.quantity)], b)),
      );
    document.querySelector("[data-expiry-sort]").onclick = () => {
      sort = "EXPIRY";
      offset = 0;
      void refresh();
    };
  }
  function refresh() {
    const key = JSON.stringify([
      scope(),
      mode,
      resolved,
      offset,
      sort,
      filters,
    ]);
    if (pendingRead?.key === key && pendingRead.version === requestVersion)
      return pendingRead.promise;
    const promise = performRefresh().finally(() => {
      if (pendingRead?.promise === promise) pendingRead = null;
    });
    pendingRead = { key, promise, version: requestVersion };
    return promise;
  }
  async function performRefresh() {
    if (expiryIsHandheld() || !expiryDraftScope()) return [];
    if (!el("expiryPager")) bind();
    try{if(typeof reconcileExpiryClearSession === "function")await reconcileExpiryClearSession();}
    catch(error){setExpiryStatus("error",error.message);return [];}
    const ownScope = scope();
    if (visibleScope !== ownScope) {
      clearSavedFlashes();
      visibleScope = ownScope;
      sessionSearch = "";
      session = [];
      sessionHydrated = false;
      page = { rows: [], count: 0, units: 0, departments: [], months: [] };
      periods = [];
      lastSummary = 0;
      selected.clear();
      filters = { search: "", departments: [], months: [] };
      offset = 0;
      resolved = false;
      el("expiryCurrentSearch").value = "";
      render();
    }
    const version = ++requestVersion,
      requestFilters = formFilters(),
      requestMode = mode,
      requestResolved = resolved;
    el("expiryCurrentStateBody").setAttribute("aria-busy", "true");
    if (requestMode === "INVENTORY") {
      el("expiryCurrentStateCount").textContent = "…";
      el("expiryResultSummary").textContent = "Loading inventory…";
      if (!page.rows.length) {
        el("expiryCurrentStateEmpty").hidden = false;
        el("expiryCurrentStateEmpty").innerHTML =
          "<strong>Loading Inventory</strong><span>Reading authoritative filtered records…</span>";
      }
    }
    try {
      for (const [suffix, rpc] of [
        ["", "mutate_pharmflow_expiry_inventory_v1"],
        ["/session", "correct_pharmflow_expiry_desktop_session_v1"],
        ["/group", "correct_pharmflow_expiry_desktop_group_v1"],
      ]) {
        const key = pendingKey() + suffix,
          stored = sessionStorage.getItem(key);
        if (stored) {
          try {
            const args = JSON.parse(stored);
            const ack = await authRpc(rpc, args);
            if (suffix === "/group") verifyGroupAck(ack, args, ownScope);
            sessionStorage.removeItem(key);
          } catch (error) {
            if (error.serverRejected) sessionStorage.removeItem(key);
            throw error;
          }
        }
      }
      let next;
      if (requestMode === "SESSION") {
        const nextSession = await ensureExpiryActiveSession({fresh:true});
        if(sessionId && nextSession!==sessionId){clearSavedFlashes();sessionSearch="";session=[];sessionHydrated=false;}
        sessionId=nextSession;
        next = await authRpc("list_pharmflow_expiry_desktop_session_v1", {
          ...authArgs(),
          p_session_id: sessionId,
        });
      } else
        next = await authRpc("query_pharmflow_expiry_inventory_v1", {
          ...authArgs(),
          p_filters: requestFilters,
          p_resolved: requestResolved,
          p_sort: sort,
          p_offset: offset,
          p_limit: 50,
        });
      const summary =
        !periods.length || Date.now() - lastSummary >= 30000
          ? await authRpc("summary_pharmflow_expiry_inventory_v1", authArgs())
          : periods;
      if (ownScope !== scope() || version !== requestVersion) return [];
      const repaint =
        (requestMode === "SESSION" && !sessionHydrated) ||
        renderedView !== mode + "/" + resolved ||
        JSON.stringify(periods) !== JSON.stringify(summary) ||
        JSON.stringify(requestMode === "SESSION" ? session : page) !==
          JSON.stringify(
            requestMode === "SESSION"
              ? next.filter((r) => r.kind === "KNOWN")
              : next,
          );
      periods = summary;
      lastSummary = Date.now();
      if (requestMode === "SESSION") {
        sessionHydrated = true;
        session = next.filter((r) => r.kind === "KNOWN");
        ExpiryCaptureEngine.sessionRows = session;
      } else {
        page = next;
        ExpiryCaptureEngine.currentRows = next.rows;
      }
      if (repaint) render();
      else if (mode === "INVENTORY") {
        updateToolbar();
        if (!page.rows.length) {
          el("expiryCurrentStateEmpty").innerHTML =
            "<strong>No matching expiry records</strong><span>Adjust filters or return to active Inventory.</span>";
        }
      }
      return requestMode === "SESSION" ? session : page.rows;
    } catch (error) {
      if (ownScope === scope() && version === requestVersion) {
        if (requestMode === "INVENTORY") {
          el("expiryCurrentStateCount").textContent = "—";
          el("expiryResultSummary").textContent = "Inventory unavailable";
        }
        el("expiryCurrentStateEmpty").hidden = false;
        el("expiryCurrentStateEmpty").innerHTML =
          "<strong>Unable to load Expiry workspace</strong><span>" +
          esc(error.message || "Refresh when connected") +
          "</span>";
        setExpiryStatus("error", "EXPIRY LOAD FAILED");
      }
      return [];
    } finally {
      if (version === requestVersion)
        el("expiryCurrentStateBody").setAttribute("aria-busy", "false");
    }
  }
  function openDialog(title, content, action, trigger, options = {}) {
    if (busy) return;
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "expiryRecordDialog";
      dialog.setAttribute("aria-labelledby", "expiryRecordDialogTitle");
      document.body.appendChild(dialog);
      dialog.addEventListener("cancel", (e) => {
        if (busy) e.preventDefault();
      });
      dialog.addEventListener("close", () => {
        const target = returnFocus?.isConnected
          ? returnFocus
          : el(
              mode === "SESSION" ? "expiryBarcodeInput" : "expiryCurrentSearch",
            );
        target?.focus?.({ preventScroll: true });
      });
    }
    dialog.className = "expiryRecordDialog" + (options.context === "session" ? " expirySessionDialog" : "") + (options.destructive ? " is-delete" : "");
    returnFocus = trigger || document.activeElement;
    dialog.innerHTML =
      '<form novalidate><header><h2 id="expiryRecordDialogTitle">' +
      esc(title) +
      '</h2></header><div class="expiryDialogContent">' +
      content +
      '</div><p role="alert" class="expiryRecordValidation" hidden></p><footer><button type="button" data-cancel>' + esc(options.cancelLabel || 'Close') + '</button>' +
      (action ? '<button type="submit" class="' + (options.destructive ? 'danger' : 'primary') + '">' + esc(options.confirmLabel || 'Confirm') + '</button>' : options.unavailableLabel ? '<button type="button" disabled class="' + (options.destructive ? 'danger' : 'primary') + '">' + esc(options.unavailableLabel) + '</button>' : "") +
      "</footer></form>";
    dialog.querySelector("[data-cancel]").onclick = () => {
      if (!busy) dialog.close();
    };
    dialog.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      if (!action || busy) return;
      busy = true;
      dialog.setAttribute("aria-busy", "true");
      const submit = dialog.querySelector("[type=submit]");
      const submitLabel = submit?.textContent;
      if (submit && options.context === "session") submit.textContent = options.destructive ? "Deleting…" : "Saving…";
      dialog
        .querySelectorAll("button,input,select")
        .forEach((b) => (b.disabled = true));
      try {
        await action(dialog);
        lastSummary = 0;
        await refresh();
        busy = false;
        dialog.setAttribute("aria-busy", "false");
        dialog.close();
      } catch (error) {
        busy = false;
        dialog.setAttribute("aria-busy", "false");
        if (submit) submit.textContent = submitLabel;
        dialog
          .querySelectorAll("button,input,select")
          .forEach((b) => (b.disabled = false));
        const p = dialog.querySelector("[role=alert]");
        p.hidden = false;
        p.textContent =
          error.message || "Result uncertain. Retry the same request.";
      }
    };
    dialog.showModal();
    dialog.querySelector("input,button")?.focus();
    return dialog;
  }
  function pendingKey() {
    return "pharmflow_expiry_desktop_intent/" + scope();
  }
  function groupEditable(r) {
    return sessionHydrated && !!sessionId && !!(r.effective_state_id || r.acknowledgement?.state_id) &&
      r.members.length <= 500 && r.members.every(m => m.editable !== false &&
        (!m.session_id || m.session_id === sessionId) && Number.isInteger(m.revision) && m.revision >= 0);
  }
  function verifyGroupAck(r, args, ownScope) {
    if (ownScope !== scope() || !r || r.request_id !== args.p_request_id ||
        r.session_id !== args.p_session_id || r.state_id !== args.p_state_id || r.quantity !== args.p_quantity)
      throw new Error("Result uncertain. Refresh to verify the same group request.");
  }
  async function groupMutation(args, ownScope) {
    if (ownScope !== scope() || args.p_session_id !== sessionId)
      throw new Error("Session changed. Reload Session Activity before editing.");
    const key = pendingKey() + "/group", payload = JSON.stringify(args), old = sessionStorage.getItem(key);
    if (old && old !== payload) throw new Error("A previous group result needs verification. Refresh first.");
    sessionStorage.setItem(key, payload);
    try {
      const ack = await authRpc("correct_pharmflow_expiry_desktop_group_v1", args);
      verifyGroupAck(ack, args, ownScope);
      sessionStorage.removeItem(key);
      lastSummary = 0;
      return ack;
    } catch (error) {
      if (error.serverRejected === true) sessionStorage.removeItem(key);
      throw error;
    }
  }
  function sessionGroupDialog(r, trigger, deleting) {
    if (!groupEditable(r)) return;
    const ownScope = scope(), args = {
      ...authArgs(), p_session_id: sessionId,
      p_state_id: r.effective_state_id || r.acknowledgement.state_id,
      p_request_id: crypto.randomUUID(),
      p_expected_members: r.members.map(m => ({ operation_id: m.operation_id, revision: m.revision }))
        .sort((a,b) => a.operation_id.localeCompare(b.operation_id))
    };
    let frozen;
    openDialog(deleting ? "Delete Current Session Group" : "Edit Current Session Quantity",
      identity(r) + '<p>' + esc(r.batch_no || "Not Recorded") + ' · ' + month(r) + '</p>' +
      (deleting ? '<p>Remove <strong>' + qty(r) + ' units</strong> contributed by this current session?</p>' :
        '<label>Current session quantity<input data-session-quantity type="number" min="1" max="2147483647" step="1" value="' + qty(r) + '"></label>') +
      '<p>Historical inventory and original captured Serial evidence are preserved.</p>',
      async d => {
        const raw = deleting ? "0" : d.querySelector("[data-session-quantity]").value.trim(), q = Number(raw);
        if (!raw || !Number.isInteger(q) || q < (deleting ? 0 : 1) || q > 2147483647)
          throw new Error("Enter a positive whole number. Use Delete to remove this session group.");
        if (frozen != null && frozen !== q) throw new Error("Retry the original quantity first.");
        frozen = q;
        await groupMutation({ ...args, p_quantity: q }, ownScope);
      }, trigger, { context: "session", destructive: deleting, cancelLabel: "Cancel", confirmLabel: deleting ? "Delete Session Contribution" : "Save Quantity" });
  }
  async function mutation(args) {
    const key = pendingKey(),
      old = sessionStorage.getItem(key),
      payload = JSON.stringify(args);
    if (old && old !== payload)
      throw new Error(
        "A previous result needs verification. Refresh and retry that operation first.",
      );
    sessionStorage.setItem(key, payload);
    const ownScope = scope();
    try {
      const r = await authRpc("mutate_pharmflow_expiry_inventory_v1", args);
      if (ownScope !== scope() || r.request_id !== args.p_request_id)
        throw new Error("Acknowledgement mismatch");
      sessionStorage.removeItem(key);
      selected.clear();
      lastSummary = 0;
      return r;
    } catch (e) {
      if (e.serverRejected === true) sessionStorage.removeItem(key);
      throw e;
    }
  }
  function quantityEdit(r, trigger) {
    const args = {
      ...authArgs(),
      p_request_id: crypto.randomUUID(),
      p_action: "QUANTITY",
      p_selection: [{ id: r.row_id, version: r.version }],
    };
    let frozen;
    openDialog(
      "Edit Inventory Quantity",
      identity(r) +
        "<p>" +
        esc(r.batch_no || "Not Recorded") +
        " · " +
        month(r) +
        '</p><label>Total quantity<input data-total type="number" min="0" step="1" value="' +
        qty(r) +
        '"></label><p>Zero keeps this row active. Resolve is a separate operation.</p>',
      async (d) => {
        const rawQuantity = d.querySelector("[data-total]").value.trim();
        if (!rawQuantity)
          throw new Error(
            "Enter a quantity. Use 0 to keep an empty active row.",
          );
        const q = Number(rawQuantity);
        if (!Number.isInteger(q) || q < 0)
          throw new Error("Enter a nonnegative whole number.");
        if (frozen != null && frozen !== q)
          throw new Error("Retry the original quantity first.");
        frozen = q;
        await mutation({ ...args, p_quantity: q });
      },
      trigger,
    );
  }
  async function confirmSelection(ids, trigger) {
    const ownScope = scope(),
      filterSnapshot = formFilters(),
      context = resolved;
    try {
      const preview = await authRpc("select_pharmflow_expiry_inventory_v1", {
        ...authArgs(),
        p_filters: filterSnapshot,
        p_resolved: context,
        p_ids: ids,
      });
      if (
        ownScope !== scope() ||
        JSON.stringify(filterSnapshot) !== JSON.stringify(formFilters()) ||
        context !== resolved
      )
        return;
      if (!preview.count) {
        setExpiryStatus("action", "NO MATCHING SELECTION");
        return;
      }
      const args = {
        ...authArgs(),
        p_request_id: crypto.randomUUID(),
        p_action: context ? "RESTORE" : "RESOLVE",
        p_selection: preview.selection,
      };
      openDialog(
        context ? "Restore Selected Records" : "Resolve Selected Records",
        "<p><strong>" +
          preview.count +
          " records · " +
          preview.units +
          " units</strong></p><p>" +
          esc(
            [
              filterSnapshot.search,
              ...filterSnapshot.departments,
              ...filterSnapshot.months,
              filterSnapshot.to && "Through " + periodMonth(filterSnapshot.to),
            ]
              .filter(Boolean)
              .join(" · ") ||
              "All " + (context ? "resolved" : "active") + " inventory",
          ) +
          "</p><p>Only this exact selection will be processed. Concurrent changes require a new confirmation.</p>",
        () => mutation(args),
        trigger,
      );
    } catch (e) {
      setExpiryStatus("error", e.message || "Unable to preview selection");
    }
  }
  async function shelfRows() {
    return authRpc("export_pharmflow_expiry_inventory_v1", {
      ...authArgs(),
      p_filters: formFilters(),
      p_resolved: resolved,
    });
  }
  async function exportShelf(print = false) {
    const ownScope = scope();
    try {
      const rows = await shelfRows();
      if (ownScope !== scope()) return;
      if (!rows.length) {
        setExpiryStatus("action", "NO MATCHING RECORDS");
        return;
      }
      if (print) {
        const root =
          el("expiryShelfPrint") ||
          document.body.appendChild(
            Object.assign(document.createElement("section"), {
              id: "expiryShelfPrint",
            }),
          );
        root.innerHTML =
          "<h1>PharmFlow · Expiry Shelf Check</h1><p>" +
          esc(AuthState.context?.pharmacy_code || "") +
          " · " +
          esc(new Date().toLocaleDateString()) +
          "</p><table><thead><tr><th>✓</th><th>Item Code</th><th>Product Name</th><th>Batch</th><th>Expiry</th><th>Qty</th></tr></thead><tbody>" +
          rows
            .map(
              (r) =>
                "<tr><td>□</td><td>" +
                esc(r.item_code) +
                "</td><td>" +
                esc(r.item_name) +
                "</td><td>" +
                esc(r.batch_no || "Not Recorded") +
                "</td><td>" +
                month(r) +
                "</td><td>" +
                qty(r) +
                "</td></tr>",
            )
            .join("") +
          "</tbody></table>";
        window.print();
        return;
      }
      const data = rows.map((r) => ({
          "✓": "",
          "Item Code": String(r.item_code),
          "Product Name": r.item_name,
          Batch: r.batch_no || "Not Recorded",
          Expiry: month(r),
          Qty: qty(r),
        })),
        ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [
        { wch: 3 },
        { wch: 14 },
        { wch: 48 },
        { wch: 18 },
        { wch: 11 },
        { wch: 7 },
      ];
      ws["!rows"] = [{ hpt: 22 }, ...data.map(() => ({ hpt: 18 }))];
      ws["!autofilter"] = { ref: ws["!ref"] };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Shelf Check");
      XLSX.writeFile(wb, "PharmFlow_Expiry_Shelf_Check.xlsx");
    } catch (e) {
      setExpiryStatus("error", e.message || "EXPORT FAILED");
    }
  }
  async function refreshReview() {
    if (typeof ExpiryReviewBackend !== "undefined")
      await ExpiryReviewBackend.refresh();
  }
  function bind() {
    originalBind();
    if (expiryIsHandheld()) return;
    const sessionInput = el("expirySessionSearch");
    if (sessionInput && !sessionInput.dataset.bound) {
      sessionInput.dataset.bound = "1";
      sessionInput.addEventListener("input", () => {
        sessionSearch = sessionInput.value;
        render();
      });
      const clearSessionSearch = () => {
        sessionSearch = "";
        render();
        if (typeof focusExpiryScanner === "function") focusExpiryScanner();
        else el("expiryBarcodeInput")?.focus({ preventScroll: true });
      };
      el("expirySessionSearchClear").onclick = clearSessionSearch;
      sessionInput.addEventListener("keydown", e => {
        e.stopPropagation();
        if (e.key === "Enter") e.preventDefault();
        if (e.key === "Escape") { e.preventDefault(); clearSessionSearch(); }
      });
    }
    if (!el("expiryPager")) {
      const footer = document.createElement("footer");
      footer.id = "expiryPager";
      footer.className = "expiryPager";
      footer.innerHTML =
        '<span id="expiryResultSummary"></span><button id="expiryAll" type="button">Select All Matching</button><button id="expiryBulkAction" type="button" disabled>Resolve Selected</button><span id="expiryPageLabel"></span><button id="expiryPrev" type="button">Previous</button><button id="expiryNext" type="button">Next</button>';
      document.querySelector(".expiryCurrentWorkspace").appendChild(footer);
      const tools = document.querySelector(".expiryCurrentTools");
      tools.innerHTML =
        '<input id="expiryCurrentSearch" type="search" autocomplete="off" aria-label="Search Inventory" placeholder="Product, item code, GTIN or batch"><details id="expiryDepartments" class="expiryToolbarMenu"><summary>Department</summary><div role="menu"></div></details><details id="expiryMonths" class="expiryToolbarMenu"><summary>Expiry Months</summary><div role="menu"></div></details><button id="expirySort" type="button">Recently Added</button><button id="btnClearExpiryFilters" type="button">Clear Filters</button><button id="btnExportExpiryInventory" type="button">Excel</button><button id="expiryPrint" type="button">Print</button><button id="expiryResolved" type="button">Resolved</button><div id="expiryAppliedFilters" aria-live="polite"></div>';
      tools.querySelectorAll("details").forEach((d) => {
        d.addEventListener("keydown", (e) => {
          if (e.key === "Escape") {
            d.open = false;
            d.querySelector("summary").focus();
          } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            d.open = true;
            const buttons = [...d.querySelectorAll("button")],
              i = buttons.indexOf(document.activeElement),
              next =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? buttons.length - 1
                    : Math.max(
                        0,
                        Math.min(
                          buttons.length - 1,
                          i + (e.key === "ArrowDown" ? 1 : -1),
                        ),
                      );
            buttons[next]?.focus();
          }
        });
        document.addEventListener("click", (e) => {
          if (!d.contains(e.target)) d.open = false;
        });
      });
      el("expiryCurrentSearch").oninput = (e) => {
        clearTimeout(searchTimer);
        filters.search = e.target.value;
        offset = 0;
        selected.clear();
        ++requestVersion;
        searchTimer = setTimeout(() => void refresh(), 160);
      };
      el("btnClearExpiryFilters").onclick = () => {
        filters = { search: "", departments: [], months: [] };
        sort = "ADDED";
        offset = 0;
        selected.clear();
        el("expiryCurrentSearch").value = "";
        void refresh();
      };
      el("expirySort").onclick = () => {
        sort =
          sort === "ADDED"
            ? "UPDATED"
            : sort === "UPDATED"
              ? "EXPIRY"
              : "ADDED";
        offset = 0;
        void refresh();
      };
      el("expiryResolved").onclick = () => {
        resolved = !resolved;
        if (resolved) {
          activeSort = sort;
          sort = "UPDATED";
        } else sort = activeSort;
        page = { rows: [], count: 0, units: 0, departments: [], months: [] };
        render();
        offset = 0;
        selected.clear();
        void refresh();
      };
      el("expiryAll").onclick = (e) => confirmSelection(null, e.target);
      el("expiryBulkAction").onclick = (e) =>
        confirmSelection([...selected], e.target);
      el("expiryPrev").onclick = () => {
        offset = Math.max(0, offset - 50);
        void refresh();
      };
      el("expiryNext").onclick = () => {
        offset += 50;
        void refresh();
      };
      el("btnExportExpiryInventory").onclick = () => exportShelf();
      el("expiryPrint").onclick = () => exportShelf(true);
    }
    el("btnOpenExpiryInventory").onclick = () => {
      mode = "INVENTORY";
      ExpiryCaptureEngine.desktopView = mode;
      selected.clear();
      render();
      void refresh();
    };
    el("btnExpirySessionView").onclick = () => {
      mode = "SESSION";
      ExpiryCaptureEngine.desktopView = mode;
      render();
      void refresh();
    };
    [
      el("btnExpirySessionView"),
      el("btnOpenExpiryInventory"),
    ].forEach(
      (button) =>
        (button.onkeydown = (e) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
            return;
          e.preventDefault();
          const buttons = [
              el("btnExpirySessionView"),
              el("btnOpenExpiryInventory"),
                    ].filter((b) => !b.disabled),
            i = buttons.indexOf(button),
            next =
              e.key === "Home"
                ? buttons[0]
                : e.key === "End"
                  ? buttons.at(-1)
                  : buttons[
                      (i + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) %
                        buttons.length
                    ];
          next?.focus({ preventScroll: true });
          next?.click();
        }),
    );
    el("btnExpiryNeedsReview").onclick = () => openNeedsReviewPanel("EXPIRY");
    if (!viewportBound) {
      viewportBound = true;
      if (typeof setInterval === "function")
        setInterval(() => {
          if (
            el("zebraExpiryShell")?.classList.contains("active") &&
            !document.hidden &&
            !document.documentElement.classList.contains("pf-idle-sleep-active")
          ) {
            lastSummary = 0;
            void refresh();
          }
        }, 30000);
      window.addEventListener("resize", syncViewport, { passive: true });
      window.addEventListener("focus", () => {
        if (el("zebraExpiryShell")?.classList.contains("active")) {
          lastSummary = 0;
          void refresh();
          void refreshReview();
        }
      });
      AppEvents?.on?.("route:changed", (p) => {
        if (p.routeName !== "expiry")
          document.body.classList.remove("expiryDesktopActive");
      });
    }
  }
  window.bindExpiryCaptureUI = bind;
  window.refreshExpiryCurrentState = refresh;
  window.renderExpiryCurrentState = () => {
    if (!expiryIsHandheld()) render();
  };
  window.renderExpirySessionActivity = () => {
    if (!expiryIsHandheld()) render();
  };
  window.resetExpiryDesktopSession = () => {
    clearSavedFlashes();
    sessionSearch = "";
    session = [];
    sessionHydrated = false;
    ExpiryCaptureEngine.sessionRows = [];
    ExpiryCaptureEngine.currentRows = [];
    page = { rows: [], count: 0, units: 0, departments: [], months: [] };
    visibleScope = null;
    sessionId = null;
    periods = [];
    lastSummary = 0;
    mode = "SESSION";
    resolved = false;
    offset = 0;
    sort = "ADDED";
    activeSort = "ADDED";
    filters = { search: "", departments: [], months: [] };
    selected.clear();
    ++requestVersion;
    ExpiryCaptureEngine.desktopView = "SESSION";
    if (el("expiryPager")) render();
  };
  window.markExpirySessionStateDeleted = () => {};
  window.activateExpiryCapture = async function () {
    if (expiryIsHandheld()) return originalActivate();
    mode = "SESSION";
    ExpiryCaptureEngine.desktopView = mode;
    bind();
    setMode();
    const r = await originalActivate();
    syncViewport();
    void refreshReview();
    return r;
  };
})();
