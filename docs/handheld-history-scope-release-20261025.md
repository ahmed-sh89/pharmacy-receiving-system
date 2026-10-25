# Handheld Receiving History scope and header hotfix

Recovery source: `5ccbd315af5a35ab43027c4869c3809017f46652`.
Target: main / GitHub Pages / Production Supabase `zznoshzcyxmtwfbznjyr`.

## Contract and scope

The former History projection filtered by device, but did not restrict order scope. Its v3 review-history RPC also omitted persisted multi-order scope. The pending-only v4 list could not fill that gap for Resolved or Deleted cases.

The additive `list_pharmflow_handheld_receiving_history_v1(uuid,text,timestamptz,uuid,integer)` returns a JSON envelope. Existing RPCs and their return signatures remain unchanged. It uses the existing current Active Order Manifest and the same configured Handheld-assignment / active-order-file intersection. It does not accept a client-supplied pharmacy assignment as authority.

The endpoint retains the existing Receiving read guard, authenticated membership boundary, fixed search path and authenticated-only EXECUTE. No table grants, policies, existing function bodies or data records change. The returned case fields preserve the old history meanings and add original `work_scope_order_numbers` and identifier display. Eligibility uses persisted captured scope or the persisted single order, never current assignments as invented historical ownership. Cases without either are counted separately as indeterminate for that device/pharmacy and not silently classified.

All review statuses are readable. Eligibility is applied server-side before a bounded (maximum 100, default/client 10) keyset page ordered by created_at DESC, review_id DESC. The envelope has rows, assigned_orders, has_more, next_cursor and indeterminate_count. JSON avoids a PostgREST row cap silently truncating a page. The client needs only the newest 10 eligible cases to merge with the current authoritative ledger's eligible actions and produce the final newest 10; it never downloads full review history.

The UI joins the existing ledger synchronization mechanism; failure to confirm a complete ledger/read result shows an explicit unavailable message instead of a partial list. It filters both sources before the final limit, handles recognized transaction order aliases, shows Order / captured orders, and refreshes on existing assignment events. Dialog listeners unsubscribe on close; stale requests cannot replace a newer scope. No added polling or competing persistent store.

Recognized is green; Pending/Needs Review amber; Resolved Review blue; Deleted Review gray. Status does not imply a resolved case was received. Existing compensating Undo checks and focused review workflow remain unchanged. Indeterminate cases are explicitly disclosed. The compact header keeps Back / Receiving / History plus Online / Orders, with fewer borders and a unified blue-gray surface. Scanner and quantity surfaces, Desktop, Expiry, Auth, write RPCs and synchronization implementation are unchanged.

## Focused evidence

- Disposable PostgreSQL rehearsal: 6 PASS; all statuses, raw scope, unrelated/device/pharmacy exclusion, real runtime-role EXECUTE denial, disabled-guard invocation, keyset pages including equal timestamps, empty/changed assignments, old v3 definition and results unchanged, repeatability, rollback, fingerprints and no broad table grants.
- Offline Chromium: 10 PASS; mixed scope/status display, filtering before limit, safe correction restrictions, assignment changes, zero orders, unknown attribution, incomplete read handling, keyboard/focus, scrolling, and exact synthetic Desktop / Handheld Expiry baseline pixel comparison.
- Canonical TC26 viewport fixtures PASS at 360px width and visible heights 480/520/640, including browser chrome and keyboard/error reachability.
- Existing affected scanner / Receiving / Expiry tests: 36 PASS; one known baseline negative-control failure refers to unavailable historical Git object `09640864` (unchanged by this task). No full-suite green claim.
- Build, JavaScript syntax and diff whitespace checks PASS.

Production migration ID: `20261025175436_handheld_receiving_history_scope_read`.

## Release and recovery

Apply only the additive migration, verify catalog/ACLs and authenticated read behavior, then publish only this source diff through the existing Pages workflow. Existing clients remain compatible while source deployment is pending.

On source regression, revert only this release commit to the recovery source through Pages. Leave the additive unused read function in place; no historical-data rollback is needed. If the new endpoint itself has a critical issue, revoke its authenticated EXECUTE and stop UI promotion pending a focused forward fix. No destructive recovery or operational-data changes are part of this release.

Physical TC26 acceptance, DataWedge throughput and live PC / Handheld interaction remain Product Owner checks. No Production test accounts, transactions, permissions or operational records may be changed for smoke testing. Status remains READY FOR USER VERIFICATION only after successful release verification, never USER VERIFIED without Product Owner confirmation.
