/* Canonical Expiry Desktop workspace. Inventory queries and session receipts are server-owned. */
(function () {
  if (typeof window === "undefined") return;
  const originalBind = window.bindExpiryCaptureUI,
    originalActivate = window.activateExpiryCapture;
  let mode = "SESSION",
    resolved = false,
    offset = 0,
    pageSize = 40,
    sort = "ADDED",
    activeSort = "ADDED",
    filters = { search: "", groups: [], includeUnassigned: false, months: [] };
  let page = { rows: [], count: 0, units: 0, groups: [], has_unassigned_group: false, months: [] },
    periods = [],
    session = [],
    sessionHydrated = false,
    selected = new Set();
  let visibleScope = null,
    renderedView = "";
  let requestVersion = 0,
    searchTimer,
    pendingRead,
    pendingSummary,
    lastSummary = 0,
    summaryDisjoint = false,
    dialog,
    busy = false,
    previewing = false,
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
  const kpiNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const kpiMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function kpiPeriod(p) {
    const year = n => Math.floor((n - 1) / 12);
    const name = n => kpiMonths[(n - 1) % 12];
    const date = n => name(n) + " " + year(n);
    if (p.from == null) return "Through " + date(p.to);
    if (p.from === p.to) return date(p.to);
    return year(p.from) === year(p.to)
      ? name(p.from) + "–" + name(p.to) + " " + year(p.to)
      : date(p.from) + " – " + date(p.to);
  }
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
  const monthFilters=window.ExpiryInventoryFilters;
  async function effectiveFilters(snapshot,context){
    // The existing RPC exposes all authorized month facets, independent of search/category.
    // Re-expand the open interval for every union read/export/preview, never a recent-month list.
    if(snapshot.expiredThrough!=null&&(snapshot.months.length||snapshot.excludedMonths?.length)){
      const facets=await authRpc("query_pharmflow_expiry_inventory_v1",{...authArgs(),p_filters:{},p_resolved:context,p_sort:"EXPIRY",p_offset:0,p_limit:1});
      return monthFilters.wire(snapshot,facets.months);
    }
    return monthFilters.wire(snapshot);
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
    if(mode!=="INVENTORY")closeInventoryMenus();
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
        : '<tr><th><input type="checkbox" id="expiryPageSelection" aria-label="Select all eligible rows on current page" '+(selectionMode?'':'hidden')+'></th><th>Code / GTIN</th><th>Product Name</th><th>Group</th><th>Batch</th><th><button type="button" data-expiry-sort>Expiry</button></th><th>Quantity</th><th>Last Updated</th><th>Actions</th></tr>' ;
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
      root.setAttribute("aria-busy",String(!summaryDisjoint));
      const cards=summaryDisjoint?periods:periods.length?monthFilters.buckets(periods[0].to):[];
      root.innerHTML = cards
        .map(
          (p) =>
            '<button type="button" class="expiryKpiCard ' +
            ({ EXPIRED: "expiryKpiExpired", NEXT1: "expiryKpiNextMonth", NEXT2: "expiryKpiNextTwo", NEXT6: "expiryKpiNextSix" }[p.key] || "") +
            '" data-period="' +
            p.key +
            '" '+(summaryDisjoint?'':'disabled')+'><span class="expiryKpiHeading"><span class="expiryKpiLabel">' +
            (p.from==null ? "Expired" : kpiPeriod(p)) +
            '</span> <span class="expiryKpiPeriod">' + (p.from==null ? kpiPeriod(p) : '') +
            '</span></span> <span class="expiryKpiCounts"><span class="expiryKpiRecords"><strong>' +
            (p.count==null?"…":kpiNumber.format(p.count)) +
            '</strong> <span>Records</span></span> <span class="expiryKpiUnits">' +
            (p.units==null?"…":kpiNumber.format(p.units)) +
            ' Units</span></span></button>',
        )
        .join("");
      root.querySelectorAll("[data-period]").forEach(
        (b) =>
          (b.onclick = () => {
            if(!summaryDisjoint)return;
            const p = periods.find((p) => p.key === b.dataset.period);
            monthFilters.toggle(filters,p);
            const reveal=p.from==null?page.months.filter(m=>monthFilters.number(m)<=p.to):monthFilters.months(p);
            if(!filters.months.length&&filters.expiredThrough==null)expandedYears.clear();
            else{reveal.filter(m=>monthFilters.has(filters,m)).forEach(m=>expandedYears.add(m.slice(0,4)));expandedSections.add('months');}
            closeInventoryMenus();
            sort = "EXPIRY";
            offset = 0;
            selected.clear();++requestVersion;
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
  const inventoryIcon = name => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ({sheet:'M4 3h16v18H4zM4 9h16M4 15h16M10 3v18',document:'M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h6',check:'m5 12 4 4L19 6',chevron:'m7 10 5 5 5-5',printer:'M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6z',search:'m21 21-5-5M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0',filters:'M4 7h16M7 12h10M10 17h4',sort:'M8 4v16m-4-4 4 4 4-4M14 6h6m-6 5h4m-4 5h2',export:'M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5',select:'M5 3h14v18H5zM8 12l3 3 5-6',close:'m6 6 12 12M6 18 18 6'}[name] || '') + '"/></svg>';
  let selectionMode = false, openInventoryMenu = null, filterDraft = null, filterDraftScope = null;
  const expandedYears=new Set(),expandedSections=new Set();
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  function closeInventoryMenus(restore=false) {
    const old=openInventoryMenu;closeFloatingMenu();
    for(const id of ['expiryFilter','expirySort','expiryExport','expiryBulkMenu']){if(el(id+'Panel'))el(id+'Panel').hidden=true;el(id)?.setAttribute('aria-expanded','false');}
    openInventoryMenu=null;filterDraft=null;filterDraftScope=null;
    if(restore && old)el(old)?.focus({preventScroll:true});
  }
  function openInventoryPanel(id) {
    if(openInventoryMenu===id){closeInventoryMenus(true);return;}
    closeInventoryMenus();openInventoryMenu=id;
    if(id==='expiryFilter'){
      if(!filters.months.length&&filters.expiredThrough==null)expandedYears.clear();
      filterDraft=JSON.parse(JSON.stringify(filters));filterDraftScope=scope();renderInventoryFilters();
    }
    if(id==='expiryBulkMenu'){openFloatingMenu(el(id+'Panel'),el(id));return;}
    el(id+'Panel').hidden=false;el(id).setAttribute('aria-expanded','true');
    el(id+'Panel').querySelector('button:not(:disabled)')?.focus({preventScroll:true});
  }
  function resetInventoryFilters(){
    filters={search:'',groups:[],includeUnassigned:false,months:[]};sort='ADDED';activeSort='ADDED';resolved=false;offset=0;selectionMode=false;selected.clear();++requestVersion;
    expandedYears.clear();expandedSections.clear();clearTimeout(searchTimer);el('expiryCurrentSearch').value='';closeInventoryMenus(true);render();void refresh();
  }
  function renderInventoryFilters() {
    if(!filterDraft || filterDraftScope!==scope())return;
    const allMonths=page.months; // Server facets cover all authorized rows, independent of filters/page.
    const years=[...new Set(allMonths.map(m=>m.slice(0,4)))].sort();
    const monthsRoot=el('expiryMonths');
    // Keep expansion separate from the draft selection; closed years do not lose selection.
    const expanded=expandedYears;
    monthsRoot.innerHTML=years.map(year=>{
      const all=allMonths.filter(m=>m.startsWith(year+'-')),n=all.filter(m=>monthFilters.has(filterDraft,m)).length;
      return '<section class="expiryFilterYear"><div><button type="button" role="checkbox" aria-checked="'+(n===all.length?'true':n?'mixed':'false')+'" data-year="'+year+'" class="expiryFilterChoice"><i aria-hidden="true"></i>'+year+'</button><button type="button" class="expiryYearToggle" data-year-toggle="'+year+'" aria-expanded="'+expanded.has(year)+'" aria-controls="expiryYear'+year+'" aria-label="'+(expanded.has(year)?'Collapse':'Expand')+' months for '+year+'">'+inventoryIcon('chevron')+'</button></div><div class="expiryYearMonths" id="expiryYear'+year+'" '+(expanded.has(year)?'':'hidden')+'>'+all.map(m=>'<button type="button" role="checkbox" class="expiryFilterChoice" aria-checked="'+monthFilters.has(filterDraft,m)+'" data-month="'+m+'"><i aria-hidden="true"></i>'+monthNames[Number(m.slice(5))-1]+'</button>').join('')+'</div></section>';
    }).join('') || '<p class="expiryMenuEmpty">No available expiry months</p>';
    const approvedGroups=window.PharmFlowClassificationFilters?.approvedGroups||[];
    el('expiryGroups').innerHTML=approvedGroups.map(v=>'<button type="button" role="checkbox" class="expiryFilterChoice" aria-checked="'+filterDraft.groups.includes(v)+'" data-group="'+esc(v)+'"><i aria-hidden="true"></i>'+esc(monthFilters.displayGroup(v))+'</button>').join('')+
      (page.has_unassigned_group?'<button type="button" role="checkbox" class="expiryFilterChoice" aria-checked="'+filterDraft.includeUnassigned+'" data-unassigned="true"><i aria-hidden="true"></i>No canonical Group</button>':'');
    const choice=(button,key,value,values=[value])=>{
      const remove=values.every(v=>key==='months'?monthFilters.has(filterDraft,v):filterDraft[key].includes(v));
      if(key==='months')values.forEach(v=>monthFilters.set(filterDraft,v,!remove));else filterDraft[key]=remove?filterDraft[key].filter(v=>!values.includes(v)):[...new Set([...filterDraft[key],...values])];
      const attribute=key==='groups'?'data-group':button.hasAttribute('data-year')?'data-year':'data-month';
      renderInventoryFilters();[...el('expiryFilterPanel').querySelectorAll('['+attribute+']')].find(b=>b.getAttribute(attribute)===value)?.focus({preventScroll:true});
    };
    monthsRoot.querySelectorAll('[data-year]').forEach(b=>b.onclick=()=>choice(b,'months',b.dataset.year,allMonths.filter(m=>m.startsWith(b.dataset.year+'-'))));
    monthsRoot.querySelectorAll('[data-month]').forEach(b=>b.onclick=()=>choice(b,'months',b.dataset.month));
    el('expiryGroups').querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>choice(b,'groups',b.dataset.group));
    const unassigned=el('expiryGroups').querySelector('[data-unassigned]');if(unassigned)unassigned.onclick=()=>{filterDraft.includeUnassigned=!filterDraft.includeUnassigned;renderInventoryFilters();el('expiryGroups [data-unassigned]')?.focus({preventScroll:true});};
    monthsRoot.querySelectorAll('[data-year-toggle]').forEach(b=>b.onclick=()=>{const open=b.getAttribute('aria-expanded')!=='true';if(open)expandedYears.add(b.dataset.yearToggle);else expandedYears.delete(b.dataset.yearToggle);b.setAttribute('aria-expanded',String(open));el('expiryYear'+b.dataset.yearToggle).hidden=!open;b.setAttribute('aria-label',(open?'Collapse':'Expand')+' months for '+b.dataset.yearToggle);});
    el('expiryClearPeriod').hidden=!filters.expiredThrough&&!filters.months.length;
    const past=periods[0];el('expiryExpiredChoice').textContent=past?kpiPeriod(past):'Expired';el('expiryExpiredChoice').setAttribute('aria-checked',past?monthFilters.state(filterDraft,past):'false');
    el('expiryExpiredChoice').onclick=()=>{if(past){monthFilters.toggle(filterDraft,past,'manual');renderInventoryFilters();}};
    for(const key of ['months','groups']){const button=el('expirySection'+key);button.setAttribute('aria-expanded',String(expandedSections.has(key)));el(key==='months'?'expiryMonthContent':'expiryGroups').hidden=!expandedSections.has(key);button.onclick=()=>{if(expandedSections.has(key))expandedSections.delete(key);else expandedSections.add(key);renderInventoryFilters();};}
  }
  function updateToolbar() {
    el('expiryCurrentStateCount').textContent=String(page.count);
    el('expiryResultSummary').textContent=kpiNumber.format(page.count)+' Records · '+kpiNumber.format(page.units)+' Units';
    const sortName=sort==='EXPIRY'?'Earliest Expiry':resolved?'Recently Resolved':sort==='ADDED'?'Recently Added':'Recently Updated';
    el('expirySortLabel').textContent=sortName;
    el('expiryResolved').textContent=resolved?'Show Active Records':'Show Resolved Records';
    el('expiryInventoryView').textContent=resolved?'Resolved inventory':'Active inventory';
    const count=filters.groups.length+(filters.includeUnassigned?1:0)+filters.months.length+(filters.expiredThrough!=null?1:0)+(resolved?1:0);
    el('expiryFilterLabel').textContent=resolved?'Filters · Resolved':'Filters';el('expiryFilterCount').textContent=String(count);el('expiryFilterCount').hidden=!count;
    el('expiryFilter').classList.toggle('is-active',!!count);el('expiryFilter').title=resolved?'Filters · Resolved inventory':'Filters · Active inventory';
    el('expirySearchClear').hidden=!filters.search;
    el('expiryQuickClearKpi').hidden=!monthFilters.hasKpis(filters);
    el('expirySelect').innerHTML=inventoryIcon(selectionMode?'close':'check');el('expirySelect').setAttribute('aria-label',selectionMode?'Exit selection mode':'Enter selection mode');el('expirySelect').title=selectionMode?'Exit selection mode':'Enter selection mode';el('expirySelect').setAttribute('aria-pressed',String(selectionMode));el('expirySelect').onclick=()=>{selectionMode=!selectionMode;selected.clear();closeInventoryMenus();render();};
    document.querySelector('.expiryInventoryTable')?.classList.toggle('is-selecting',selectionMode);
    el('expiryBulkMenu').hidden=!selectionMode;el('expiryBulkMenu').parentElement.hidden=!selectionMode;el('expiryAll').hidden=false;el('expiryAll').disabled=!page.count;el('expiryAll').textContent=(resolved?'Restore':'Resolve')+' All Filtered…';
    el('expiryBulkAction').hidden=!selectionMode||!selected.size;
    el('expiryBulkAction').textContent=(resolved?'Restore ':'Resolve ')+selected.size+' Selected';el('expiryBulkAction').disabled=!selected.size;
    el('expiryPageLabel').textContent=page.count?'Rows '+(offset+1)+'–'+Math.min(offset+pageSize,page.count)+' of '+page.count:'No records';
    el('expiryPrev').disabled=offset===0;el('expiryNext').disabled=offset+pageSize>=page.count;
    el('expiryPageSize').value=String(pageSize);
    const check=el('expiryPageSelection');if(check){check.hidden=!selectionMode;check.checked=!!page.rows.length&&page.rows.every(r=>selected.has(r.row_id));check.indeterminate=!check.checked&&page.rows.some(r=>selected.has(r.row_id));}
    el('expirySortPanel').querySelectorAll('[data-sort]').forEach(b=>{b.hidden=resolved&&b.dataset.sort==='ADDED';b.setAttribute('aria-checked',String(b.dataset.sort===sort));});
    document.querySelectorAll('[data-period]').forEach(b=>{const p=periods.find(p=>p.key===b.dataset.period),state=p?monthFilters.state(filters,p):'false';b.classList.toggle('is-active',state==='true');b.classList.toggle('is-partial',state==='mixed');b.setAttribute('aria-pressed',state);b.title=state==='mixed'?'Partially selected':state==='true'?'Selected':'Select period';});
  }
  let floatingMenu=null,floatingTrigger=null;
  function closeFloatingMenu(restore=false){
    if(!floatingMenu)return;try{floatingMenu.hidePopover?.();}catch{}floatingMenu.hidden=true;
    floatingTrigger?.setAttribute('aria-expanded','false');if(restore&&floatingTrigger?.isConnected)floatingTrigger.focus({preventScroll:true});floatingMenu=null;floatingTrigger=null;
  }
  function openFloatingMenu(panel,trigger){
    closeFloatingMenu();floatingMenu=panel;floatingTrigger=trigger;trigger.setAttribute('aria-expanded','true');
    panel.hidden=false;panel.showPopover?.();const rect=trigger.getBoundingClientRect?.()||{left:8,top:300,bottom:332},box=panel.getBoundingClientRect?.()||{width:225,height:44};
    panel.style.left=Math.max(8,Math.min(rect.left,(window.innerWidth||1366)-box.width-8))+'px';
    panel.style.top=Math.max(8,rect.top-box.height-6)+'px';panel.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
  }
  async function copyInventoryIdentifier(trigger){
    const value=trigger.textContent,kind=trigger.dataset.copyIdentifier;
    try{await navigator.clipboard.writeText(value);trigger.title='Copied: '+value;trigger.setAttribute('aria-label','Copied '+kind+': '+value);}
    catch{
      // Standard selected, read-only text remains copyable when clipboard permission is unavailable.
      const d=openDialog('Copy '+kind,'<p>Press Ctrl+C (or Cmd+C) to copy the complete identifier.</p><input readonly aria-label="Full '+esc(kind)+'" value="'+esc(value)+'">',null,trigger);
      const input=d?.querySelector('input');input?.focus();input?.select?.();
    }
  }
  function expiryPeriodClass(r){const n=r.expiry_year*12+r.expiry_month,p=monthFilters.buckets(periods[0]?.to).find(p=>(p.from==null||n>=p.from)&&n<=p.to);return ({EXPIRED:'rose',NEXT1:'amber',NEXT2:'lavender',NEXT6:'teal'})[p?.key]||'neutral';}
  function render() {
    if(floatingMenu)closeInventoryMenus();
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
    body.innerHTML=page.rows.map((r,i)=>{
      const d=new Date(r.updated_at),isResolved=r.status==='RESOLVED';
      const group=monthFilters.rowGroup(r);
      return '<tr'+(isResolved?' class="expiryResolvedRow"':'')+'><td><input type="checkbox" aria-label="Select '+esc(r.item_code)+'" data-row-selection="'+esc(r.row_id)+'" '+(selected.has(r.row_id)?'checked':'')+'></td><td class="expiryInventoryIdentifiers"><strong role="button" data-copy-identifier="Item Code" tabindex="0" aria-label="Copy full Item Code: '+esc(r.item_code||'—')+'" title="'+esc(r.item_code||'—')+'">'+esc(r.item_code||'—')+'</strong><span role="button" data-copy-identifier="GTIN" tabindex="0" aria-label="Copy full GTIN: '+esc(r.identifier_display||'—')+'" title="'+esc(r.identifier_display||'—')+'">'+esc(r.identifier_display||'—')+'</span></td><td class="expiryInventoryProduct"><strong>'+esc(r.item_name)+'</strong>'+(isResolved?'<span class="expiryResolvedLabel">Resolved</span>':'')+'</td><td class="expiryInventoryGroup" title="'+esc(group.label)+'">'+esc(group.label)+'</td><td>'+esc(r.batch_no||'Not Recorded')+'</td><td><span class="expiryDateBadge '+expiryPeriodClass(r)+'">'+month(r)+'</span></td><td class="expiryQtyCell">'+qty(r)+'</td><td class="expiryTimeCell"><time>'+esc(d.toLocaleDateString())+'<br>'+esc(d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))+'</time></td><td class="expiryActionsCell">'+(!isResolved?'<button type="button" class="expiryInventoryAction" data-row-edit="'+i+'" aria-label="Edit quantity for '+esc(r.item_code)+'" '+(busy?'disabled':'')+'>Edit</button> ':'')+'<button type="button" class="expiryInventoryAction expiryInventoryResolve" data-row-resolve="'+i+'" aria-label="'+(isResolved?'Restore':'Resolve')+' record '+esc(r.item_code)+'" '+(busy?'disabled':'')+'>'+(isResolved?'Restore':'Resolve')+'</button></td></tr>';
    }).join('');
    body.querySelectorAll('[data-copy-identifier]').forEach(b=>{b.onclick=()=>copyInventoryIdentifier(b);b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();return copyInventoryIdentifier(b);}};});
    body.querySelectorAll('[data-row-edit]').forEach(b=>b.onclick=()=>quantityEdit(page.rows[Number(b.dataset.rowEdit)],b));
    body.querySelectorAll('[data-row-resolve]').forEach(b=>b.onclick=()=>void confirmSelection([page.rows[Number(b.dataset.rowResolve)].row_id],b));
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
    document.querySelector("[data-expiry-sort]").onclick = () => {
      sort = "EXPIRY";
      offset = 0;selected.clear();++requestVersion;
      void refresh();
    };
  }
  function refresh(options={}) {
    const key = JSON.stringify([
      scope(),
      mode,
      resolved,
      offset,
      pageSize,
      sort,
      filters,
      options.confirmedOperationId || null,
    ]);
    if (pendingRead?.key === key && pendingRead.version === requestVersion)
      return pendingRead.promise;
    const promise = performRefresh(options).finally(() => {
      if (pendingRead?.promise === promise) pendingRead = null;
    });
    pendingRead = { key, promise, version: requestVersion };
    return promise;
  }
  function readSummary(ownScope,disjoint){
    if(pendingSummary?.scope===ownScope&&pendingSummary.disjoint===disjoint)return pendingSummary.promise;
    const promise=authRpc("summary_pharmflow_expiry_inventory_v1",authArgs()).then(async rows=>{
      if(!disjoint)return rows;
      const bounds=monthFilters.buckets(rows.find(p=>p.key==='EXPIRED').to);
      return Promise.all(bounds.map(async p=>{if(p.key==='EXPIRED'||p.key==='NEXT1')return {...p,...Object.fromEntries(['count','units'].map(k=>[k,rows.find(r=>r.key===p.key)[k]]))};const result=await authRpc("query_pharmflow_expiry_inventory_v1",{...authArgs(),p_filters:{from:p.from,to:p.to},p_resolved:false,p_sort:"EXPIRY",p_offset:0,p_limit:1});return {...p,count:result.count,units:result.units};}));
    }).finally(()=>{if(pendingSummary?.promise===promise)pendingSummary=null;});
    pendingSummary={scope:ownScope,disjoint,promise};return promise;
  }
  async function performRefresh(options={}) {
    if (expiryIsHandheld() || !expiryDraftScope()) return [];
    if (!el("expiryPager")) bind();
    try{if(typeof reconcileExpiryClearSession === "function")await reconcileExpiryClearSession();}
    catch(error){setExpiryStatus("error",error.message);return [];}
    const ownScope = scope();
    if (visibleScope !== ownScope) {
      clearSavedFlashes();
      closeInventoryMenus();expandedYears.clear();expandedSections.clear();selectionMode=false;el("expiryShelfPrint")?.remove();
      visibleScope = ownScope;
      sessionSearch = "";
      session = [];
      sessionHydrated = false;
      page = { rows: [], count: 0, units: 0, groups: [], has_unassigned_group: false, months: [] };
      periods = [];
      lastSummary = 0;pendingSummary=null;
      selected.clear();
      filters = { search: "", groups: [], includeUnassigned: false, months: [] };
      offset = 0;pageSize=40;
      resolved = false;
      el("expiryCurrentSearch").value = "";
      render();
    }
    const version = ++requestVersion,
      requestSelection = JSON.parse(JSON.stringify(filters)),
      requestMode = mode,
      requestResolved = resolved,
      requestOffset=offset,requestPageSize=pageSize,requestSort=sort;
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
      // Summary is independent of session receipts. It must not gate saved-row rendering.
      const needsSummary=!periods.length || (requestMode==="INVENTORY"&&!summaryDisjoint) || Date.now()-lastSummary>=30000;
      const summaryRead=needsSummary?readSummary(ownScope,requestMode==="INVENTORY"):null;
      if(requestMode==="SESSION" && summaryRead)void summaryRead.then(summary=>{
        if(ownScope!==scope() || version!==requestVersion)return;
        periods=summary;summaryDisjoint=false;lastSummary=Date.now();
      }).catch(()=>{}); // Inventory entry retries; a read failure cannot hide a confirmed save.
      let next;
      if (requestMode === "SESSION") {
        // Only the immediately acknowledged save can reuse this hydrated signed session.
        // Other refreshes retain fresh session discovery and old-intent reconciliation above.
        const confirmedSession=sessionHydrated && options.confirmedOperationId && options.confirmedSessionId===sessionId;
        const nextSession = confirmedSession?sessionId:await ensureExpiryActiveSession({fresh:true});
        if(sessionId && nextSession!==sessionId){clearSavedFlashes();sessionSearch="";session=[];sessionHydrated=false;}
        sessionId=nextSession;
        next = await authRpc("list_pharmflow_expiry_desktop_session_v1", {
          ...authArgs(),
          p_session_id: sessionId,
        });
      } else
        next = await authRpc("query_pharmflow_expiry_inventory_v1", {
          ...authArgs(),
          p_filters: await effectiveFilters(requestSelection,requestResolved),
          p_resolved: requestResolved,
          p_sort: requestSort,
          p_offset: requestOffset,
          p_limit: requestPageSize,
        });
      const summary = requestMode==="INVENTORY" && summaryRead?await summaryRead:periods;
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
      if(requestMode==="INVENTORY" && summaryRead){summaryDisjoint=true;lastSummary = Date.now();}
      if (requestMode === "SESSION") {
        sessionHydrated = true;
        session = next.filter((r) => r.kind === "KNOWN");
        ExpiryCaptureEngine.sessionRows = session;
      } else {
        page = monthFilters.assertCanonicalGroupContract(next);
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
        const outcome=await action(dialog);
        if(outcome?.next){busy=false;dialog.setAttribute("aria-busy","false");dialog.close();outcome.next();return;}
        lastSummary = 0;pendingSummary=null;
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
        if(error.reviewRequired&&submit)submit.disabled=true;
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
      lastSummary = 0;pendingSummary=null;
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
  async function mutation(args, rpcName = "mutate_pharmflow_expiry_inventory_v1") {
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
      const r = await authRpc(rpcName, args);
      if (ownScope !== scope() || r.request_id !== args.p_request_id)
        throw new Error("Acknowledgement mismatch");
      sessionStorage.removeItem(key);
      selected.clear();
      lastSummary = 0;pendingSummary=null;
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
  async function confirmSelection(ids,trigger){
    if(busy||previewing)return;previewing=true;if(trigger)trigger.disabled=true;
    const ownScope=scope(),filterSnapshot=JSON.parse(JSON.stringify(filters)),context=resolved,allFiltered=ids==null;
    try{
      const wireFilters=await effectiveFilters(filterSnapshot,context);
      const preview=await authRpc('select_pharmflow_expiry_inventory_v1',{...authArgs(),p_filters:wireFilters,p_resolved:context,p_ids:ids});
      const guard=()=>{if(ownScope!==scope()||JSON.stringify(filterSnapshot)!==JSON.stringify(filters)||context!==resolved){const e=Error('Inventory scope or filters changed. Review again.');e.reviewRequired=true;throw e;}};guard();
      if(!preview.count){setExpiryStatus('action','NO MATCHING SELECTION');return;}
      if(!allFiltered&&(preview.count!==new Set(ids).size||preview.selection.length!==preview.count||preview.selection.some(r=>!ids.includes(r.id))))throw Error('Selected records changed; select and review again.');
      const snapshot=JSON.parse(JSON.stringify(preview.selection)),args={...authArgs(),p_request_id:crypto.randomUUID(),p_action:context?'RESTORE':'RESOLVE',p_selection:snapshot};
      const filteredArgs={...authArgs(),p_request_id:args.p_request_id,p_filters:wireFilters,p_selection:snapshot,p_expected_count:preview.count,p_expected_units:preview.units};
      const verb=context?'Restore':'Resolve',scopeText=[filterSnapshot.search,...filterSnapshot.groups.map(monthFilters.displayGroup),filterSnapshot.includeUnassigned&&'No canonical Group',...filterSnapshot.months,filterSnapshot.expiredThrough&&'Through '+periodMonth(filterSnapshot.expiredThrough),filterSnapshot.excludedMonths?.length&&'Except '+filterSnapshot.excludedMonths.join(', ')].filter(Boolean).join(' · ')||'All '+(context?'resolved':'active')+' inventory';
      const summary='<p><strong>'+preview.count+' records · '+preview.units+' units</strong></p><p>'+(allFiltered?'All filtered results across every page.':'Exactly '+preview.count+' explicitly selected record IDs, including selections retained across pages.')+'</p><p>'+esc(scopeText)+'</p><p>'+(context?'Restores the reviewed quantities to Active Inventory.':'Moves the reviewed quantities out of Active Inventory. Historical records and audit are retained.')+'</p>';
      const final=()=>{
        const canResolveAll=allFiltered&&!context;
        const action=allFiltered?(canResolveAll?async d=>{
          guard();
          if(d.querySelector('#expiryResolvePhrase')?.value.trim()!=='RESOLVE')throw Error('Type RESOLVE to continue.');
          try{return await mutation(filteredArgs,'resolve_all_filtered_pharmflow_expiry_inventory_v1');}
          catch(e){if(/changed|unavailable|scope/i.test(e.message)){e.reviewRequired=true;try{await refresh();}catch{}}throw e;}
        }:null):async()=>{guard();try{return await mutation(args);}catch(e){if(/changed|unavailable|scope/i.test(e.message))e.reviewRequired=true;throw e;}};
        const d=openDialog('Final '+verb+' Confirmation',summary+(allFiltered?'<p class="expirySafetyGate" role="note">'+(canResolveAll?'The server will recheck the complete filtered scope before making any changes.':'All-filtered execution is unavailable for this action.')+'</p><label>Type RESOLVE<input id="expiryResolvePhrase" autocomplete="off" aria-label="Type RESOLVE"></label>':''),action,trigger,{destructive:true,confirmLabel:verb+' '+preview.count+(allFiltered?' Filtered':' Selected'),unavailableLabel:allFiltered&&!canResolveAll?'Execution blocked — safety approval required':undefined});
        if(allFiltered&&d)d.querySelector('#expiryResolvePhrase')?.focus();
      };
      openDialog(verb+' Scope Review',summary+(allFiltered?'<p class="expirySafetyGate">Execution is currently gated. You can review the full filtered scope without changing records.</p>':''),()=>{guard();return {next:final};},trigger,{confirmLabel:'Review Final Confirmation'});
    }catch(e){setExpiryStatus('error',e.message||'Unable to preview selection');}finally{previewing=false;if(trigger)trigger.disabled=false;}
  }
  async function shelfRows() {
    return authRpc("export_pharmflow_expiry_inventory_v1", {
      ...authArgs(),
      p_filters: await effectiveFilters(JSON.parse(JSON.stringify(filters)),resolved),
      p_resolved: resolved,
    });
  }
  async function exportShelf(format = "EXCEL") {
    const ownScope = scope(),context=JSON.stringify([filters,resolved]);
    const guard=()=>{if(ownScope!==scope() || context!==JSON.stringify([filters,resolved]))throw Error('Inventory scope or filters changed. Export again.');};
    const feedback=el('expiryExportStatus');if(feedback){feedback.hidden=false;feedback.textContent='Preparing '+format.toLowerCase()+' report…';feedback.setAttribute('role','status');}
    try {
      const rows = monthFilters.assertCanonicalGroupRows(await shelfRows());
      guard();
      if (!rows.length) {
        if(feedback)feedback.textContent="No matching records to export.";
        return;
      }
      const dataRows=ExpiryInventoryReport.rows(rows),meta={pharmacy:AuthState.context?.pharmacy_code||'',date:new Date().toLocaleDateString()};
      if(format==='PDF'){await ExpiryInventoryReport.pdf(dataRows,meta,guard);if(feedback)feedback.hidden=true;return;}
      if(format==='PRINT'){
        const root=el('expiryShelfPrint')||document.body.appendChild(Object.assign(document.createElement('section'),{id:'expiryShelfPrint'}));
        root.innerHTML=ExpiryInventoryReport.printMarkup(dataRows,meta);guard();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));guard();window.print();if(feedback)feedback.hidden=true;return;
      }
      const data=ExpiryInventoryReport.excelRows(rows),headers=ExpiryInventoryReport.excelHeaders,ws=XLSX.utils.json_to_sheet(data.map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]]))));
      ws['!cols']=[14,18,100,20,26,12,10,24,14].map(wch=>({wch}));ws['!rows']=[{hpt:10.5},...data.map(()=>({hpt:10.5}))];ws['!autofilter']={ref:ws['!ref']};ws['!margins']={left:.19685,right:.19685,top:.19685,bottom:.19685,header:0,footer:0};
      const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Expiry Inventory');guard();ExpiryInventoryReport.saveWorkbook(wb,guard);if(feedback)feedback.hidden=true;
    } catch (e) {
      if(feedback){feedback.setAttribute("role","alert");feedback.textContent=e.message||"Export failed. Please retry.";}
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
        '<span id="expiryResultSummary"></span><div class="expiryBulkMenu"><button id="expiryBulkMenu" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="expiryBulkMenuPanel" hidden>Bulk Actions</button><div id="expiryBulkMenuPanel" class="expiryFloatingMenu" popover="manual" role="menu" aria-label="Bulk inventory actions" hidden><button id="expiryAll" type="button" role="menuitem">Resolve All Filtered…</button></div></div><button id="expiryBulkAction" type="button" disabled>Resolve Selected</button><label class="expiryPageSize">Rows <select id="expiryPageSize" aria-label="Records per page"><option>20</option><option selected>40</option><option>50</option><option>100</option></select></label><span id="expiryPageLabel"></span><button id="expiryPrev" type="button">Previous</button><button id="expiryNext" type="button">Next</button>';
      document.querySelector(".expiryCurrentWorkspace").appendChild(footer);
      document.body.appendChild(el('expiryBulkMenuPanel'));
      const exportStatus=document.createElement('p');exportStatus.id='expiryExportStatus';exportStatus.className='expiryExportStatus';exportStatus.hidden=true;exportStatus.setAttribute('aria-live','polite');footer.before(exportStatus);
      const tools = document.querySelector(".expiryCurrentTools");
      tools.innerHTML =
        '<button id="expirySelect" type="button" aria-pressed="false" aria-label="Enter selection mode" title="Enter selection mode">'+inventoryIcon('check')+'</button><label class="expiryInventorySearch">'+inventoryIcon('search')+'<input id="expiryCurrentSearch" type="search" autocomplete="off" aria-label="Search Inventory" placeholder="Search product, code, GTIN or batch"><button id="expirySearchClear" type="button" aria-label="Clear search" hidden>'+inventoryIcon('close')+'</button></label>'+
        '<button id="expiryQuickClearKpi" type="button" title="Clear KPI Selection" aria-label="Clear KPI Selection" hidden>'+inventoryIcon('close')+'</button><div class="expiryInventoryMenu"><button type="button" id="expiryFilter" aria-expanded="false" aria-controls="expiryFilterPanel">'+inventoryIcon('filters')+'<span id="expiryFilterLabel">Filters</span> <b id="expiryFilterCount" hidden>0</b></button><section id="expiryFilterPanel" class="expiryInventoryPopover expiryFilterPanel" aria-label="Inventory filters" role="dialog" hidden><header><strong>Inventory Filters</strong><button type="button" data-dismiss-menu aria-label="Close filters">'+inventoryIcon('close')+'</button></header><div class="expiryFilterScroll"><section><h3><button type="button" id="expirySectionmonths" aria-expanded="false">Expiry Months '+inventoryIcon('chevron')+'</button></h3><div id="expiryMonthContent" hidden><button type="button" class="expiryFilterChoice" role="checkbox" aria-checked="false" id="expiryExpiredChoice">Expired</button><div id="expiryMonths"></div></div></section><section><h3><button type="button" id="expirySectiongroups" aria-expanded="false">Group '+inventoryIcon('chevron')+'</button></h3><div id="expiryGroups" hidden></div></section></div><div class="expiryFilterContext"><span id="expiryInventoryView"></span><button type="button" id="expiryResolved">Show Resolved Records</button><button type="button" id="expiryClearPeriod" hidden>Clear KPI Period</button></div><footer><button id="btnClearExpiryFilters" type="button">Reset All</button><button id="expiryApplyFilters" type="button" class="primary">Apply Filters</button></footer></section></div>'+
        '<div class="expiryInventoryMenu"><button type="button" id="expirySort" aria-expanded="false" aria-controls="expirySortPanel">'+inventoryIcon('sort')+'<span id="expirySortLabel">Recently Added</span></button><div id="expirySortPanel" class="expiryInventoryPopover expiryOptionMenu" role="menu" aria-label="Sort inventory" hidden>'+[['ADDED','Recently Added'],['UPDATED','Recently Updated'],['EXPIRY','Earliest Expiry']].map(([key,label])=>'<button type="button" role="menuitemradio" data-sort="'+key+'" aria-checked="false">'+label+'</button>').join('')+'</div></div>'+
        '<div class="expiryInventoryMenu"><button type="button" id="expiryExport" aria-expanded="false" aria-controls="expiryExportPanel">'+inventoryIcon('export')+'Export</button><div id="expiryExportPanel" class="expiryInventoryPopover expiryOptionMenu" role="menu" aria-label="Export filtered inventory" hidden><button id="btnExportExpiryInventory" type="button" role="menuitem">'+inventoryIcon('sheet')+'Excel (.xlsx)</button><button id="expiryPdf" type="button" role="menuitem">'+inventoryIcon('document')+'PDF (.pdf)</button><button id="expiryPrint" type="button" role="menuitem">'+inventoryIcon('printer')+'Print</button></div></div>';
      for(const id of ['expiryFilter','expirySort','expiryExport','expiryBulkMenu'])el(id).onclick=()=>openInventoryPanel(id);
      tools.querySelectorAll('[data-dismiss-menu]').forEach(b=>b.onclick=()=>closeInventoryMenus(true));
      el('expiryApplyFilters').onclick=()=>{
        if(!filterDraft || filterDraftScope!==scope()){closeInventoryMenus();return;}
        filters=JSON.parse(JSON.stringify(filterDraft));if(!filters.months.length&&filters.expiredThrough==null)expandedYears.clear();offset=0;selected.clear();++requestVersion;closeInventoryMenus(true);void refresh();
      };
      el('expiryClearPeriod').onclick=()=>{delete filters.expiredThrough;delete filters.excludedMonths;delete filters.kpiExpired;delete filters.kpiMonths;filters.months=[];expandedYears.clear();offset=0;selected.clear();++requestVersion;closeInventoryMenus(true);void refresh();};
      el('btnClearExpiryFilters').onclick=resetInventoryFilters;
      el('expiryQuickClearKpi').onclick=()=>{monthFilters.clearKpis(filters);if(!filters.months.length&&filters.expiredThrough==null)expandedYears.clear();offset=0;selected.clear();++requestVersion;closeInventoryMenus();render();void refresh();el('expiryFilter').focus();};
      el('expiryPageSize').onchange=e=>{const size=Number(e.target.value);if(![20,40,50,100].includes(size))return;pageSize=size;offset=0;selected.clear();++requestVersion;void refresh();};
      el('expiryCurrentSearch').oninput=e=>{
        clearTimeout(searchTimer);filters.search=e.target.value;offset=0;selected.clear();++requestVersion;el('expirySearchClear').hidden=!filters.search;
        searchTimer=setTimeout(()=>void refresh(),160);
      };
      el('expirySearchClear').onclick=()=>{clearTimeout(searchTimer);el('expiryCurrentSearch').value='';filters.search='';offset=0;selected.clear();++requestVersion;void refresh();el('expiryCurrentSearch').focus();};
      el('expirySortPanel').querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{sort=b.dataset.sort;offset=0;selected.clear();++requestVersion;closeInventoryMenus(true);void refresh();});
      el("expiryResolved").onclick = () => {
        closeInventoryMenus();selected.clear();selectionMode=false;
        resolved = !resolved;
        if (resolved) {
          activeSort = sort;
          sort = "UPDATED";
        } else sort = activeSort;
        page = { rows: [], count: 0, units: 0, groups: [], has_unassigned_group: false, months: [] };
        render();
        offset = 0;
        selected.clear();
        void refresh();
      };
      el("expiryAll").onclick = () => {closeInventoryMenus();void confirmSelection(null, el("expiryBulkMenu"));};
      el("expiryBulkAction").onclick = (e) =>
        confirmSelection([...selected], e.target);
      el("expiryPrev").onclick = () => {
        offset = Math.max(0, offset - pageSize);
        void refresh();
      };
      el("expiryNext").onclick = () => {
        offset += pageSize;
        void refresh();
      };
      el("btnExportExpiryInventory").onclick = () => {closeInventoryMenus(true);void exportShelf("EXCEL");};
      el("expiryPdf").onclick = () => {closeInventoryMenus(true);void exportShelf("PDF");};
      el("expiryPrint").onclick = () => {closeInventoryMenus(true);void exportShelf("PRINT");};
    }
    el("btnOpenExpiryInventory").onclick = () => {
      mode = "INVENTORY";selectionMode=false;
      ExpiryCaptureEngine.desktopView = mode;
      selected.clear();
      render();
      void refresh();
    };
    el("btnExpirySessionView").onclick = () => {
      mode = "SESSION";selectionMode=false;selected.clear();
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
      document.addEventListener('click',e=>{if(openInventoryMenu){const owner=el(openInventoryMenu)?.parentElement;if(!floatingMenu?.contains(e.target)&&!owner?.contains(e.target) && !e.composedPath?.().includes(owner))closeInventoryMenus();}});
      document.addEventListener('keydown',e=>{
        if(!openInventoryMenu)return;
        if(e.key==='Escape'){e.preventDefault();closeInventoryMenus(true);return;}
        const panel=el(openInventoryMenu+'Panel');
        if(openInventoryMenu!=='expiryFilter' && ['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
          e.preventDefault();const buttons=[...panel.querySelectorAll('button')].filter(b=>!b.hidden&&!b.disabled),i=buttons.indexOf(document.activeElement);
          const n=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[n]?.focus();
        }
      });
      document.addEventListener('scroll',()=>{if(floatingMenu)closeInventoryMenus();},true);
      document.addEventListener('focusin',e=>{if(openInventoryMenu&&!floatingMenu?.contains(e.target)&&!el(openInventoryMenu)?.parentElement.contains(e.target))closeInventoryMenus();});
      if (typeof setInterval === "function")
        setInterval(() => {
          if (
            el("zebraExpiryShell")?.classList.contains("active") &&
            !document.hidden &&
            !document.documentElement.classList.contains("pf-idle-sleep-active")
          ) {
            lastSummary = 0;pendingSummary=null;
            void refresh();
          }
        }, 30000);
      window.addEventListener("resize", ()=>{closeInventoryMenus();syncViewport();}, { passive: true });
      window.addEventListener("focus", () => {
        if (el("zebraExpiryShell")?.classList.contains("active")) {
          lastSummary = 0;pendingSummary=null;
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
    closeInventoryMenus();expandedYears.clear();expandedSections.clear();selectionMode=false;el("expiryShelfPrint")?.remove();
    sessionSearch = "";
    session = [];
    sessionHydrated = false;
    ExpiryCaptureEngine.sessionRows = [];
    ExpiryCaptureEngine.currentRows = [];
    page = { rows: [], count: 0, units: 0, groups: [], has_unassigned_group: false, months: [] };
    visibleScope = null;
    sessionId = null;
    periods = [];
    lastSummary = 0;pendingSummary=null;
    mode = "SESSION";
    resolved = false;
    offset = 0;pageSize=40;
    sort = "ADDED";
    activeSort = "ADDED";
    filters = { search: "", groups: [], includeUnassigned: false, months: [] };
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
