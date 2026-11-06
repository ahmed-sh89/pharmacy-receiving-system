# Duty initialization / final UX polish · 6 November 2026

**READY FOR USER VERIFICATION — NOT PRODUCTION-APPROVED.** Staging only; PR #44 Draft. Prior owner Sync / Excel / Zoom acceptance remains preserved for unaffected scope.

Root cause: successful initial read mounted Schedule body only, leaving shell Calendar Settings / + Employee disabled from the pre-load render. A shared shell action synchronizer now updates after authoritative reads, render and load completion/error, honoring server can_write/current permission/scope. No timeout or CSS enable workaround. Existing grid node/scroll preservation retained.

Calendar Settings: separated Saved shifts action block using existing primary styles. Holiday fields have distinct semantic names and autocomplete off; inactive/default calendar rows never hydrate old names/notes. Normal type clears/disables and submits empty holiday fields; actual active saved Holiday restores its own name/note. Fresh modal lifecycle discards unsaved drafts.

Apply Shift: existing toolbar action now primary; existing accessible Duty dropdown shows preset names/time ranges; concise cell/replacement summary and contextual Auto-hours help. Confirmation/batch CAS/save/Undo/Redo and calculations unchanged. Failed preset deletion no longer mutates its local draft before acknowledgement.

Date Range: existing calendar fields now Start Date / End Date in bounded top-layer manual popover, separated Cancel/primary Apply footer. Opening resets drafts to applied range; Cancel/Escape don't apply; invalid ranges retain schedule and show inline error. Shared Report/calendar behavior unchanged. Superseded absolute/details source rules removed rather than overridden.

Verification: 49 focused Duty/UI/authorization checks PASS (5 new initialization/Holiday/range tests); 58 auth/Receiving/Expiry neighbors PASS. Staging build PASS. No migration edits/new SQL; seven checksums unchanged, previous native atomic seven-migration Actions 42227797916 retained without rerun. Release protected-file check follows publishing. No Receiving/Expiry/auth/permission/Production config source modified.

Fresh browser/native Windows Chrome 75/80/100 acceptance for these changed controls remains NOT VERIFIED until directly tested. Do not infer signed-in hard refresh or cross-session success from DOM tests. Tests simulate fresh-document initial reads, readonly/error restrictions, saved/inactive Holiday hydration, normal submission stripping, range draft/cancel/invalid/apply/reopen, overwrite/Undo/conflict regression.

Owner checks: (1) Open Duty directly and hard-refresh; authorized Calendar Settings/+ Employee activate without tab switching. (2) Open fresh Calendar Settings, verify blank Holiday fields and separate Presets; edit a saved Holiday, Cancel/reopen. (3) Apply a named shift to occupied cells, cancel/confirm replacement and Undo/Redo. (4) At native Chrome 75/80/100 verify Start/End range popup, Cancel, invalid range and Apply, readable shift list and no clipping.

No Production SQL/data/merge/deployment/activation authorized. Runtime/Preview/CI evidence recorded in delivery follow-up.

## Preserved prior scope

# Duty Shift Presets / Apply Shift · 6 November 2026

**READY FOR USER VERIFICATION — NOT PRODUCTION-APPROVED.** PR #44 remains Draft. Preserve owner Sync/Excel/Zoom PASS for prior scope; these are not new-flow acceptance.

Implementation: Calendar Settings → Shift Presets CRUD; short unique names, single/split/overnight periods. Presets are pharmacy-specific JSON in existing Duty settings, protected by current allowed() authorization, pharmacy transaction lock, settings revision/CAS and audit. Existing settings writers preserve presets. Authoritative month reads include presets, using existing refresh/focus/poll synchronization. No preset IDs are written to daily entries. Rename/delete never updates saved entries.

Quick Shift fills existing editor controls; no save until Save. Current Auto/Manual selection is preserved for manual adjustments. Apply Shift previews selected employee/date/cell counts and populated destinations, asks existing overwrite confirmation, then uses the same batch/CAS/save/Undo/Redo path. Applying replaces Manual allocations with destination automatic hours explicitly disclosed in preview, preserving Notes/highlight. Friday/holiday/employee rules and overnight allocation use the established model/server code. Scope/revision changes abort stale drafts; batch failure is transactional.

Migration 7: `20261106134244_duty_shift_presets_staging.sql`, SHA-256 `9c5f6aecc4a59439edccd90e08c4f03ec12145b7b51f2d97dc59fc2811cc4acb`. Applied to Staging tovkcakucyagvbzvlnks only; actual hosted migration version reconciled. Previous six unchanged. Table RLS/grants remain inherited/default-deny; new authenticated RPC checks current Duty/admin access. No new dependency or Receiving/Expiry/auth/business code changes.

Verification: 3 focused new-flow tests PASS (preset create/read/stale-revision/duplicate/isolation/rename/delete/history preservation; Quick Shift/manual adjustment/conflict; multi-cell preview/overwrite cancellation/batch/Friday/Undo conflict). 58 neighboring auth/Receiving/Expiry checks PASS. Both build types PASS. Seven-migration native two-connection COMMIT and rollback boundaries 3/6/7 PASS: https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/42227797916 — separate test-only branch. Connection pairs 75/76,86/87,89/90,100/101. All seven history records retain exact SQL. Read visibility/ACLs/default-denial verified before and after COMMIT. Auth helpers in these isolated DB tests are synthetic, not live session verification.

One initial local artifact test failed because local default build produced a Production-configured artifact; explicit feature Preview build and that test then passed. No guard weakened. Private native Excel fixture is optional and unavailable in this runtime; prior owner Excel PASS preserved. Browser refresh/two-session/new controls are NOT VERIFIED here until owner test. No authentication retries or password requests.

Production order after separate authorization: freeze release SHA and all SEVEN checksums; confirm backup/current schema/history and permission baseline; apply seven originals with seven history records in one transaction, now including presets; verify Disabled for every pharmacy and unchanged Receiving/Expiry; only then normal protected merge/official deployment. No activation approved. Rollback retains additive presets column, existing schema/history/manual-aware readers and directory-v2; older UI ignores presets; never delete operational data.

Owner checks (synthetic Staging): (1) Create/rename/edit single, split and overnight presets; refresh and compare in a second authorized session. (2) Choose Quick Shift, manually adjust, Cancel then Save; verify only Save persists. (3) Select ordinary/Friday/holiday cells with and without existing shifts; cancel replacement then apply; compare hours and Undo/Redo. (4) Change one target in another session before Apply; confirm conflict prevents partial writes, then delete preset and confirm saved duties are unchanged.

New authenticated two-session/browser acceptance and final CI/Preview evidence must be distinguished from prior owner acceptance. No Production SQL, merge, deployment or activation occurred.

## Final delivery evidence

Duty runtime `2b77d822c2165a0cb3d6d8ee511c9a3fec023635`; release runtime `8fcd6bd408f453df52bfe600fd0d2c548009ce6e`. Documentation-only heads follow separately. READY Preview https://pharmflow-test-2gwjdnrfn-fhyh2xtskz-3504.vercel.app/ · dpl_2QExDj7uBkNis6AVy32Kdx56K1uX, exact Duty runtime. Browser reached ordinary app sign-in; no credentials or auth retries; new authenticated persistence/two-session test NOT VERIFIED.

Runtime CI readiness 42228210515/42228203788 and security 42228210545 SUCCESS. Release local suite 105 PASS / 1 private-template SKIP / 0 FAIL (includes 17 prior local atomic checks; these are not new-flow/browser evidence). New-flow checks 3 PASS; neighboring regressions 58 PASS. Seven-migration hosted Staging RLS true; anon/authenticated table privileges false; anon preset RPC false, authenticated RPC true with internal allowed() authorization. Reviewed complete 50-file PR diff before final docs; no protected business code drift. Current main read-only verified unchanged at 2295d2de5d69ad8e2c9bf10193aea8cc7b254f3f. Existing PR #44 Draft/unmerged. Production untouched.
