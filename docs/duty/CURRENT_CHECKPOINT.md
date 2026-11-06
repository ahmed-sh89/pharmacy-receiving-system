# Duty final UI refinement · 6 November 2026

**READY FOR USER VERIFICATION — not Production-approved.** Existing release/security/native acceptance gates remain open. Staging only; no merge, Production deployment, SQL, migration or activation.

## Source / implementation

Production main baseline `2295d2de5d69ad8e2c9bf10193aea8cc7b254f3f`. Continue existing feature branch and Draft release PR #44 from `ae75e5943a968e1bb2eb9e4f9b2b953153db15b2` / `be6168ca64588b927623c0746cfe3d313c9077c1`; all prior work preserved.

- Replace superseded free-text employee combobox with one ordered single-select Employee Filter containing official names/codes. No duplicate search implementation. Clear Selection resets only employee; period and saved data remain.
- One compact contextual row places employee/code/period immediately beside Copy, Clear and Excel Export, above the five KPIs. Copy has fixed width; successful clipboard acknowledgement alone shows green ✓ Copied for 2 seconds. A new attempt clears earlier success; failures, stale responses and Clear cannot show false success. Detailed date/E:L guidance stays in the help popover.
- New `js/duty-controls.js` provides one reusable Duty calendar and popover-positioning component. Calendar visuals/interactions follow the inspected Historical Receiving calendar (month header/arrows, Sunday-first weekdays/day grid, selected/today states, Today action), with corporate blue styling. Report and Schedule From/To use the same component. Date bounds, keyboard movement and existing range validation remain. Historical Receiving functions are coupled to its own state; its source/style/behavior were left unchanged.
- Time pickers share equal grid tracks, stable trigger dimensions and popup width measured directly from the trigger before positioning. Centered semi-bold values/options, consistent selection styles; yellow sun AM and blue moon PM retain readable text in triggers/options for IN/OUT and both shifts. Generic non-time dropdown behavior retained. Popup height/placement is bounded to the viewport; no in-flow resizing.
- Superseded employee-search styles/handlers and minute-specific sizing overrides removed. Component source styles consolidated; no new library/dependency. Only Duty script tags/cache versions added to the existing entry points. Internal report scrolling, sticky headers, one-row KPIs, month loading, calculations and authoritative write/CAS contracts retained.

## Verification

| Check | Result |
|---|---|
| Focused Duty suite | PASS: 80, 0 failures/skips locally, including private actual-template overlay |
| Focused release suite | PASS: 82, 0 failures/skips locally, including 81 protected Production file hashes |
| Receiving/Expiry/auth/security/Handheld regressions | PASS: 124, 0 failures |
| Targeted new checks | PASS: filter order/Clear preserves period/data; two-second Copy success, failed retry and stale async suppression; export after employee/range changes; shared calendar bounds/navigation/keyboard; trigger-matched popup sizing; retained save/conflict/overnight/session isolation cases |
| Browser / READY identity / CI | PASS: READY preview and successful runtime CI; evidence below |
| Native Windows Chrome 75/80/100 | NOT VERIFIED; CSS-scaled synthetic checks are not native zoom proof |
| Fresh authenticated two-session verification | NOT VERIFIED in this continuation; no credential request/retry. Prior owner persistence/sync/conflict/access acceptance remains preserved |
| Native Excel 2016/2019 | Prior owner opening acceptance retained; pending final native acceptance remains USER VERIFICATION REQUIRED |
| Chrome Dangerous badge | Prior unresolved release gate retained; no bypass or clean-security claim |

Copy remains eight daily cells E:L, with actual Notes and correct selected starting date. Reserved M:O compatibility and both XLSX formats/calculations are preserved. No full legacy-suite rerun; inherited failures remain documented. Prior owner USER VERIFIED schedule/save/refresh/sync/conflict/access/Excel/paste results are preserved as prior-candidate evidence, not new browser claims.

## Safety / next action

No backend/schema/data change or new migration. Retain existing six Staging migration versions `20261103235030`, `20261103235335`, `20261104013200`, `20261105183357`, `20261106001033`, `20261106010727`; never replay or apply obsolete proposals. No Production database call. UI rollback must retain directory-v2 compatibility and manual-aware readers; retain schema/history and other module grants. PR #44 remains Draft and unmerged.

1. On the READY Staging candidate, select employees from the saved-order filter, choose a custom range using the blue calendar, Copy (green ✓ then restore), and Clear: period remains and saved data is untouched.
2. Check Report and Schedule calendars: selected/today states, previous/next month, boundary restrictions and From/To alignment. Verify both XLSX formats and full-month/custom E:L paste into a disposable correctly dated employee template.
3. At native Chrome 75%, 80%, 100%, open every IN/OUT hour/minute/AM-PM control, including Second Shift: widths stay fixed, options center, icons/text remain clear, keyboard works, footer stays visible.
4. Confirm report header/context row/KPIs remain visible with internal table scrolling; save/refresh one synthetic overnight duty and compare the independent Staging session. If Dangerous appears, stop without bypassing and report warning details. Production needs separate explicit authorization.

## Final delivery evidence

- Final Duty runtime `66dc1faffa19e67a48763ba148711bc3801b4702`; release runtime `9280ba620deb3b88f8f7f00c06c7d53ece169d45`. Later documentation-only commits do not alter runtime bytes.
- READY Staging Preview: https://pharmflow-test-8xfh0ervw-fhyh2xtskz-3504.vercel.app/ — deployment `dpl_94wNTueBtwCvhtxa4K4JqzFgaUNQ`, exact Duty runtime above, Preview target only.
- Runtime release CI: security [42153188405](https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/42153188405) SUCCESS; Duty readiness [42153188352](https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/42153188352) / [42153180801](https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/42153180801) SUCCESS. Local complete suites 80/82 PASS; after fractional-width correction, 11 targeted calendar/clipboard/export checks PASS. CI skips only the optional private template; local overlay passed.
- Browser synthetic diagnostics: all 12 IN/OUT hour/minute/AM-PM triggers in a split shift retained their widths when opened; centered options computed font-weight 650. Rounding drift was corrected in the shared component. Final 80% CSS-scaled check: trigger before/after and popup widths all **88.28125 px**, popup y=358.39–424.36 within 936 px viewport. Calendar blue day grid opened and From/To day buttons selected successfully; Employee Filter and contextual Copy/Clear/Export rendered; Clear emptied only employee selection. The two-second green/failure feedback timing is verified with controlled automated clocks; no claim of capturing the brief green state in a browser screenshot.
- Final browser sizing check used CSS scale 0.8, not native Windows Chrome zoom. Current native 75/80/100, authenticated fresh persistence/sync and native Excel gates remain as listed above. No browser schedule writes/auth retries.
- Complete PR diff reviewed: 44 files, Receiving calendar/runtime/Expiry/auth/connection/Vite/Production guards unchanged. All 81 protected Production files retain their hashes. No new migration/dependency, Production change or merge.
