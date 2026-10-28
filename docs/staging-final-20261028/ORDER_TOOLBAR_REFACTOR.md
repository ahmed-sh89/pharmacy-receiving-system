# Order Items toolbar refactor — checkpoint / test matrix / changelog

2026-10-28. Staging only. Baseline actual branch and deployed version2b7bc31325b043afa7a1b99bf4c58fa25ef07599, environment staging / tovkcakucyagvbzvlnks verified before edits.

Root cause: title occupied an independent header while Order browser layout was owned by multiple rules across the stylesheet, fixed action widths and responsive overrides. Previous change retained this structure and wasted the title-row horizontal space. Refactor moves the existing title and close control into the filter row and uses a separate search/action row. Reuses real controls and their handlers. Superseded Order-specific layout rules removed from pharmflow-next.css; receiving-order-toolbar.css is the single layout owner with responsive breakpoints. Search border, fill and focus appearance retained. Hidden action slots remain reserved to anchor High Priority. SHORT/NEW use centered inline-flex, compact55px minimum,11px text,600weight and26px height; existing state colors preserved. Item name500; size/family/color/column/row density retained. No Group/data/auth/report/export/startup changes.

Changed: ui.js, css/pharmflow-next.css, new css/receiving-order-toolbar.css, index.html, two focused tests, CI focused command, this checkpoint. Production/selective-release branch untouched; no migration or new dependency.

Focused4/4PASS; buildPASS. Tests compare all filter/search/sort/priority/Print/Clear event implementation byte-for-byte with baseline, verify canonical Group and scope behavior and authoritative layout ownership. No CSS test is visual acceptance. No screenshot attachments were available in this request. Before/after toolbar heights and table viewport measurements: NOT MEASURED. Actual authenticated normal/priority screenshots, text overflow and Chrome zoom75/80/90/100 remain PENDING Product Owner/browser review; no USER VERIFIED claim. Intended reduction removes the separate header row without changing modal/table sizing, but pixel gains are not asserted.

Rollback: revert this Staging-only change and republish; no database action. Prepared selective Production release must remain unchanged until visual acceptance.

READY FOR USER TEST — PRODUCTION UNCHANGED.
