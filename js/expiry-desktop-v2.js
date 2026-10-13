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
    viewportBound = false;
  const esc = (v) => expiryEscapeHtml(v ?? ""),
    el = (id) => document.getElementById(id);
  const scope = () => expiryDraftScope() + "/" + expirySignedAuthIdentity();
  const month = (r) =>
    String(r.expiry_month).padStart(2, "0") + "/" + r.expiry_year;
  const periodMonth = (n) =>
    String(((n - 1) % 12) + 1).padStart(2, "0") +
    "/" +
    Math.floor((n - 1) / 12);
  const currentRows = () =>
    session.filter(
      (r) => r.kind === "KNOWN" && r.status !== "DELETED" && r.quantity > 0,
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
    s.style.setProperty(
      "--expiry-viewport-height",
      Math.max(
        420,
        window.innerHeight - Math.max(0, s.getBoundingClientRect().top),
      ) + "px",
    );
    document.body.classList.add("expiryDesktopActive");
  }
  function setMode() {
    const s = el("zebraExpiryShell");
    s?.classList.toggle("expiryInventoryMode", mode === "INVENTORY");
    const capture = s?.querySelector(".expiryCaptureCard");
    if (capture) capture.hidden = mode === "INVENTORY";
    el("expiryCurrentHeader").hidden = mode !== "INVENTORY";
    el("expirySessionMenu").hidden = true;
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
        ? "<tr><th>Product / Identification</th><th>Batch / Expiry</th><th>Quantity</th><th>Activity</th><th>Actions</th></tr>"
        : '<tr><th><input type="checkbox" id="expiryPageSelection" aria-label="Select current page"></th><th>Product / Identification</th><th>Batch</th><th><button type="button" data-expiry-sort>Expiry</button></th><th>Quantity</th><th>Status</th><th>Last Updated</th><th>Actions</th></tr>';
    el("expiryPager").hidden = mode !== "INVENTORY";
    syncViewport();
    renderKpis();
  }
  function metricRows(key) {
    const rows = currentRows();
    if (key === "LAST") return rows.slice(0, 1);
    return rows;
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
    root.hidden = false;
    const rows = currentRows();
    const values = [
      ["ITEMS", "Items Scanned", new Set(rows.map((r) => r.item_code)).size],
      ["QUANTITY", "Total Quantity", rows.reduce((n, r) => n + qty(r), 0)],
      [
        "BATCHES",
        "Batches",
        new Set(
          rows.map((r) =>
            [
              r.item_code,
              String(r.batch_no || "")
                .trim()
                .toUpperCase(),
              r.expiry_year,
              r.expiry_month,
            ].join("|"),
          ),
        ).size,
      ],
      ["MONTHS", "Expiry Months", new Set(rows.map(month)).size],
      ["LAST", "Last Scanned", rows[0] ? month(rows[0]) : "—"],
    ];
    root.innerHTML = values
      .map(
        ([key, label, value]) =>
          '<button type="button" class="expiryKpiCard" data-metric="' +
          key +
          (sessionHydrated ? '"><span>' : '" disabled><span>') +
          label +
          "</span><strong>" +
          esc(sessionHydrated ? value : "—") +
          "</strong><small>" +
          (sessionHydrated ? "Current signed-in session" : "Loading session…") +
          "</small></button>",
      )
      .join("");
    root.querySelectorAll("[data-metric]").forEach(
      (b) =>
        (b.onclick = () =>
          openDialog(
            values.find((v) => v[0] === b.dataset.metric)[1],
            metricRows(b.dataset.metric)
              .map(
                (r) =>
                  "<li>" +
                  identity(r) +
                  "<span>Batch " +
                  esc(r.batch_no || "Not Recorded") +
                  " · " +
                  month(r) +
                  " · Qty " +
                  qty(r) +
                  "</span><time>" +
                  esc(expiryFormatVerifiedAt(r.captured_at)) +
                  "</time></li>",
              )
              .join("") || "<li>No successful session entries.</li>",
            null,
            b,
          )),
    );
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
    const rows = mode === "SESSION" ? session : page.rows;
    el("expirySessionCount").textContent = sessionHydrated
      ? String(currentRows().length)
      : "…";
    empty.hidden = !!rows.length;
    if (!rows.length) {
      body.innerHTML = "";
      empty.innerHTML =
        "<strong>" +
        (mode === "SESSION"
          ? sessionHydrated
            ? "No items captured in this session"
            : "Loading Session Activity"
          : "No matching expiry records") +
        "</strong><span>" +
        (mode === "SESSION"
          ? "Scan or search above to start."
          : "Adjust filters or return to active Inventory.") +
        "</span>";
      if (mode === "INVENTORY") updateToolbar();
      return;
    }
    if (mode === "SESSION") {
      body.innerHTML = rows
        .map(
          (r, i) =>
            "<tr" +
            (i === 0 && r.status !== "DELETED"
              ? ' class="expiryRowSavedStrong"'
              : "") +
            '><td class="expirySessionProduct">' +
            identity(r) +
            '</td><td class="expirySessionBatch"><div>' +
            esc(r.batch_no || "Not Recorded") +
            "</div><strong>" +
            month(r) +
            '</strong></td><td class="expiryActivityQty">' +
            qty(r) +
            '</td><td class="expirySessionMeta"><time>' +
            esc(expiryFormatVerifiedAt(r.captured_at)) +
            "</time><span>" +
            esc(r.worker_name || "Desktop") +
            '</span></td><td class="expirySessionActions">' +
            (r.status === "DELETED"
              ? '<span class="expiryActivityDeleted">Deleted</span>'
              : r.editable
                ? '<button class="expirySessionAction" data-session-edit="' +
                  i +
                  '">Edit</button><button class="expirySessionAction danger" data-session-delete="' +
                  i +
                  '">Delete</button>'
                : "<span>Saved</span>") +
            "</td></tr>",
        )
        .join("");
      body
        .querySelectorAll("[data-session-edit]")
        .forEach(
          (b) =>
            (b.onclick = () =>
              sessionEdit(session[Number(b.dataset.sessionEdit)], false, b)),
        );
      body
        .querySelectorAll("[data-session-delete]")
        .forEach(
          (b) =>
            (b.onclick = () =>
              sessionEdit(session[Number(b.dataset.sessionDelete)], true, b)),
        );
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
    const ownScope = scope();
    if (visibleScope !== ownScope) {
      visibleScope = ownScope;
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
      ]) {
        const key = pendingKey() + suffix,
          stored = sessionStorage.getItem(key);
        if (stored) {
          try {
            await authRpc(rpc, JSON.parse(stored));
            sessionStorage.removeItem(key);
          } catch (error) {
            if (error.serverRejected) sessionStorage.removeItem(key);
            throw error;
          }
        }
      }
      let next;
      if (requestMode === "SESSION") {
        sessionId = await ensureExpiryActiveSession();
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
  function openDialog(title, content, action, trigger) {
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
    returnFocus = trigger || document.activeElement;
    dialog.innerHTML =
      '<form novalidate><header><h2 id="expiryRecordDialogTitle">' +
      esc(title) +
      '</h2></header><div class="expiryDialogContent">' +
      content +
      '</div><p role="alert" class="expiryRecordValidation" hidden></p><footer><button type="button" data-cancel>Close</button>' +
      (action ? '<button type="submit" class="primary">Confirm</button>' : "") +
      "</footer></form>";
    dialog.querySelector("[data-cancel]").onclick = () => {
      if (!busy) dialog.close();
    };
    dialog.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      if (!action || busy) return;
      busy = true;
      dialog
        .querySelectorAll("button,input,select")
        .forEach((b) => (b.disabled = true));
      try {
        await action(dialog);
        lastSummary = 0;
        await refresh();
        busy = false;
        dialog.close();
      } catch (error) {
        busy = false;
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
  function sessionEdit(r, remove, trigger) {
    const args = {
      ...authArgs(),
      p_session_id: sessionId,
      p_operation_id: r.operation_id,
      p_request_id: crypto.randomUUID(),
      p_expected_revision: r.revision,
    };
    let frozen;
    openDialog(
      remove ? "Delete Session Entry" : "Edit Session Entry",
      identity(r) +
        (remove
          ? "<p>Remove only this successful registration, retaining its audit history?</p>"
          : '<div class="expiryRecordFields"><label>Batch<input data-batch value="' +
            esc(r.batch_no || "") +
            '"></label><label>Expiry month<input data-month type="number" min="1" max="12" value="' +
            r.expiry_month +
            '"></label><label>Expiry year<input data-year type="number" min="2020" max="2200" value="' +
            r.expiry_year +
            '"></label><label>Quantity<input data-qty type="number" min="1" step="1" value="' +
            qty(r) +
            '"></label></div>'),
      async (d) => {
        const correction = remove
          ? {
              quantity: 0,
              batch_no: r.batch_no || null,
              expiry_month: r.expiry_month,
              expiry_year: r.expiry_year,
            }
          : {
              quantity: Number(d.querySelector("[data-qty]").value),
              batch_no: d.querySelector("[data-batch]").value.trim() || null,
              expiry_month: Number(d.querySelector("[data-month]").value),
              expiry_year: Number(d.querySelector("[data-year]").value),
            };
        if (
          !Number.isInteger(correction.quantity) ||
          (!remove && correction.quantity <= 0) ||
          !Number.isInteger(correction.expiry_month) ||
          correction.expiry_month < 1 ||
          correction.expiry_month > 12 ||
          !Number.isInteger(correction.expiry_year) ||
          correction.expiry_year < 2020 ||
          correction.expiry_year > 2200
        )
          throw new Error("Check quantity and expiry.");
        if (frozen && JSON.stringify(frozen) !== JSON.stringify(correction))
          throw new Error("Retry original correction first.");
        frozen = correction;
        const key = pendingKey() + "/session",
          payload = JSON.stringify({ ...args, p_correction: correction });
        if (
          sessionStorage.getItem(key) &&
          sessionStorage.getItem(key) !== payload
        )
          throw new Error("Previous correction awaits verification");
        sessionStorage.setItem(key, payload);
        try {
          const ack = await authRpc(
            "correct_pharmflow_expiry_desktop_session_v1",
            { ...args, p_correction: correction },
          );
          if (ack.request_id !== args.p_request_id)
            throw new Error("Correction acknowledgement mismatch");
          sessionStorage.removeItem(key);
        } catch (e) {
          if (e.serverRejected) sessionStorage.removeItem(key);
          throw e;
        }
      },
      trigger,
    );
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
      el("btnExpiryNeedsReview"),
    ].forEach(
      (button) =>
        (button.onkeydown = (e) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
            return;
          e.preventDefault();
          const buttons = [
              el("btnExpirySessionView"),
              el("btnOpenExpiryInventory"),
              el("btnExpiryNeedsReview"),
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
