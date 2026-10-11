# B10 Clean17 Test Matrix

## 2026-10-11 Final Expiry candidate — Staging Preview

- [x] Candidate code commit `10af4f27c48d323d51dd6f4b819fca3416c855fd` deployed to Vercel Preview `dpl_8fXEzLivCJi9MrniMykmRaMLUpe8` (READY, target Preview/null); Staging project URL remains `https://tovkcakucyagvbzvlnks.supabase.co`.
- [x] HHP084 account `tc26-expiry@example.invalid` (staff) matched by read-only Staging membership to synthetic pharmacy ID `11111111-1111-4111-8111-111111111111`; Preview reached ONLINE / READY / SYNCED.
- [x] Needs Review stayed enabled with count 2 after 30 seconds idle.
- [x] Existing authorized private Storage image fetched, decoded, and opened in viewer. Its content is a solid red placeholder fixture; this is not a representative camera-photo PASS. Two pending cases/four photos/four Storage object rows were unchanged.
- [x] Same-pharmacy transient refresh handling, private URL/auth/timeout, image decode success/failure/timeout, pharmacy-local Resolve contract, delete/cleanup contract, worker fencing, and retry fixtures pass.
- [x] Desktop tab keyboard focus uses `preventScroll`; Excel export reuses server-side search results and local Inventory filters.
- [x] Focused GS1, scanner, operation retry, session recovery, and Desktop/Handheld-path tests pass.
- [ ] Real new camera-photo display and automatic Resolve/Delete/retake Storage cleanup remain for synthetic live acceptance. Existing HHP cases are unchanged; scheduler stays paused.
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
- [x] The connectivity-only Preview `e95583ed48313866d0bf271b5aecdc3b2e2f2812` was verified at that checkpoint; it is superseded by final acceptance candidate `10af4f27c48d323d51dd6f4b819fca3416c855fd` above.
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
