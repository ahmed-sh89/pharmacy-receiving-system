# B10 Clean17 Test Matrix

## 2026-10-11 Final Expiry candidate — local checks

- [x] Same-pharmacy auth-context refresh retains verified Needs Review access through a transient RPC failure; server RPCs remain authoritative.
- [x] Private evidence fetch is authenticated and bounded; image decode success, decode failure, and timeout produce finite UI outcomes with retry.
- [x] Pending-only review, pharmacy-local Resolve, delete contract, durable photo-cleanup queue, worker fencing, and worker retry regression fixtures pass.
- [x] Desktop tab keyboard focus uses `preventScroll`; Inventory export reuses the table's server-search result and local filters.
- [x] Existing focused GS1, scanner, operation retry, session recovery, and Desktop/Handheld path tests pass.
- [ ] Live HHP084 photo display remains to verify after updated Preview is deployed. Existing HHP cases are unchanged.
- [ ] Synthetic Staging Resolve/Delete, retake photo cleanup, retry fencing, isolation, and unchanged Receiving/Global Master/Expiry side-effect counts remain to verify. Scheduler stays paused until pass.
- [ ] Physical Zebra acceptance remains with Product Owner.
- [ ] No approved Expiry PDF/report specification found in supplied source records; current Excel export verified only by implementation and regression fixtures.

## 2026-10-11 Staging connectivity recovery

- [x] Startup compatibility RPC signatures and role grants inspected in Staging.
- [x] Active Order Manifest/workspace/Receiving delta read contracts verified present and pharmacy-scoped.
- [x] Authenticated branch Preview smoke: Synthetic-B reaches ONLINE / SYNCED; initial RPC 404s absent.
- [x] Pharmacy-local Expiry review resolution fixture: one mapping, state, event, and audit; retry does not duplicate; conflicting mapping stays pending.
- [x] Staging write RPC fixture: membership isolation, authenticated-only grants, no direct table write, idempotent transaction append.
- [x] Staging pre/post read-only counts show no changes to review, current state, events, operations, photos, cleanup jobs, or Receiving transactions.
- [x] Final corrected Preview deployed from exact feature-branch candidate SHA `e95583ed48313866d0bf271b5aecdc3b2e2f2812`; Vercel reports READY/Preview and existing authenticated alias shows ONLINE / READY / SYNCED.
- [x] Existing SYNTHETIC-B account rechecked after final Preview deployment: Expiry, Needs Review, Receiving, and Settings load; HHP084 account still requires a separate authorized session.
- [ ] Physical Desktop/Zebra acceptance remains with Product Owner.
- [ ] Real private Storage Resolve/Delete cleanup remains a separate acceptance gate; scheduler stays paused.

**Known full-suite baseline:** 31 passed / 10 failed; the same 10 known failures were present at base `c62a25a`.

- [ ] Sign in reaches correct pharmacy workspace.
- [ ] Refresh shows Preparing PharmFlow then returns to workspace without Complete Access/sign-in regression.
- [ ] One visible idle tab for 30 seconds shows no startup RPC burst pattern.
- [ ] save_pharmflow_cloud_workspace_guarded does not repeat from unchanged local autosave.
- [ ] PC receiving transaction remains immediate and quantities remain correct.
- [ ] Handheld receiving remains synchronized.
- [ ] Active Order Manifest remains correct after refresh.
- [ ] Hidden tab produces no periodic cloud reads.
