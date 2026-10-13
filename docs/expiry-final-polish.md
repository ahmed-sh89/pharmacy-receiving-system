# Final Expiry polish and focused group RPC review — 2026-10-14

Start deployed/GitHubcd3fbafcce6dc8102500787a7c7141e42c11aa3d; preserved local875bd77e3b111aa79ec15cb564c1cfb6548b6885 (visual documentation not previously pushed). No reset/history rewrite. Staging only pharmflow-test/tovkcakucyagvbzvlnks; Production untouched.

TaskA canonical changes: Total Items label only, unchanged current-session unique-product definition; Total Units retained.26px blue/neutral numbers versus smaller labels. Enterprise active tab remainspurple; scan container/borders neutral, focus/primary action restrainedblue. Search hover palegray-blue versus keyboard selectionblue with outline. Batch/Serial/one Expiry(Month+Year)/Quantity desktop field row; original placeholders/accessible labels/IDs and Serial parsing/storage retained. Handheld date wrappers displaycontents to preserve its existing grid. No scanning/save API or quantity rules changed.

TaskB corrected complete SQL: proposals/staging/expiry-group-correction-proposed.sql. Increases use one separate serial-free quantity adjustment through existing signed capture API, original serialized contributions unchanged. Reductions use audit-linked adjustments first. Original rawSerial remains immutable; addition explicitly markednotphysicalscan. Same signed session/pharmacy/canonical state, complete member/revision check, one atomic transaction, request idempotence and parent/member audit retained. No SQL applied; UI group writes staydisabled.

Focused UI72PASS/0FAIL. Backend34PASS/0FAIL/1SKIP on disposable localPGlite, including5+2→7→9→5, originalSerial/quantity preservation, nonserialized addition, same-pharmacy different owner, stale membership/revisions, retries/conflicts and full rollback. Independent native connections unavailable: no local PostgreSQL binary or configured disposable URL. BuildPASS. Full-suite baseline610/43/1 remains last comprehensive evidence; not rerun for this fast focused round.

Actual new visual QA pending this candidate deployment; requested1366x768/larger remainsUNVERIFIED unless actually available. Previous browser viewport1363x936. Backend proposal approval-ready with independent concurrency gate pending before UI enablement. OverallNOTDONE. Exact new deployment SHA/visual findings in delivery record.

## Verified delivery

# PharmFlow final polish / RPC approval record

Deployed SHA: a9550c8b23fe8dd52fd08827b374836e970b46e1
Staging URL: https://pharmflow-test-git-feature-expiry-stage1-115007-fhyh2xtskz-3504.vercel.app/
Vercel deployment: dpl_HU6HSnqR5tmPsGL67NnX1Qn1WN5K — READY, Preview.
Local source: 659fab87791316354f792ddfa0e15bb281e1139e; identical published tree 91ae06afcafbc572c5021bc7d194cbbc6f76a2e5.

UI: Total Items / Total Units retain current-session calculations, with distinct 26px values. Neutral scan workspace, blue search focus, gray-blue hover distinct from blue outlined keyboard selection. Desktop Batch | Serial | Expiry (Month + Year) | Quantity. Existing GS1/Serial persistence and save behavior preserved.

Real authenticated browser inspection: 1363x936, no document overflow. Recognized GS1 correctly populated VISUAL-BATCH, VISUAL-SERIAL, February 2027. No capture saved. Screenshots show current-session metrics, recognized state, empty grouped activity, and distinct actual hover/keyboard states. Requested 1366x768 remains UNVERIFIED: browser has no supported viewport-resize API. Populated grouped rows were not visually verified because this signed session is empty; no business data was manufactured. One rapid scripted transition temporarily displayed the previous Tab lookup; after clearing to READY, fresh GS1 succeeded. Timing root cause is not established.

Focused UI: 72 passed, 0 failed. Disposable local database: 34 passed, 0 failed, 1 skipped (independent native PostgreSQL connections unavailable). Build passed. No fresh full-suite claim.

RPC: complete corrected SQL included, NOT APPLIED. Quantity increases create a separate serial-free adjustment; original captured Serial and quantity are not falsely enlarged. Live Staging dependent schema/contracts reviewed. Local tests cover 5+2=7, edit current contribution to4 =>9, delete =>5, original serial preservation, scope/owner rejection, retries, stale membership and transactional rollback. Lock/atomicity/idempotency/audit design reviewed. Independent concurrent-connection behavior remains unverified because no native PostgreSQL executable or disposable URL is available. PGlite is not concurrency evidence.

Next Product Owner action: explicitly approve installation of the attached SQL on Staging tovkcakucyagvbzvlnks and isolated concurrent acceptance tests. Keep grouped Edit/Delete disabled; enabling UI requires separately approved wiring and successful gates. Production main and Production Supabase untouched. Status READY FOR VISUAL TEST, not DONE.
