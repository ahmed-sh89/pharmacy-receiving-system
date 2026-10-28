# Final blocker verification — 28 October 2026

NOT READY FOR PRODUCTION APPROVAL. Production untouched; prepared release remains7551a7e8c1ace5d71b9bc01c227053dae53cb3c6. Accepted runtime and existing51 passing tests were not changed or rerun. Evidence work only on verify/release-blockers-20261028.

## 1 Production read-only diagnostics — OPEN

Exactly one authorized Supabase retry: Unknown tool(supabase.execute_sql); no query executed. No pre-existing alternate read-only connection was found in this workspace/session. No Production credentials requested or control bypass attempted. Inaccessible CURRENT checks: column types/nullability/constraints/indexes; table/policy RLS; deployed is_system_owner definition/ACL/config; SEC007 hash/ACL/owner/search_path; existing V2/private schema and triggers; migration compatibility. Historical evidence is not treated as current. Required closure: restore the existing connector or existing authorized read-only path, run and capture these checks against zznoshzcyxmtwfbznjyr; stop on drift. Main remote remains08843e42399b8830af6f0eb0773f04e0269cf0b6.

## 2 Real PostgreSQL concurrency — defect reproduced, candidate verified; Staging gate OPEN

Isolated GitHub Actions postgres:16 service, actual PostgreSQL16.15, independent pg clients,56588 synthetic Master rows/78164 identifiers. No Supabase writes. Final test commitf415d95451fe0d8dba0579f1db4f6264d5cab61b; run https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/40696747351 SUCCESS. Baseline reproduction also succeeded in previous run40696498834.

Final measured mean ordinary update without trigger0.409ms, AFTER trigger0.431ms (about5.4% /0.022ms overhead). Eight parallel writers320 transactions298ms;1000-row import statement5.74ms. A deliberately held import caused an independently observed transactionid lock wait14.38ms until explicit commit; this is coordinated test duration, NOT a bound on real import waits. Real lock duration can extend for the whole write transaction.

Confirmed issue: writerA updates an item then owns singleton revision; writerB updates an identifier then waits for revision; A next updates B's identifier. PostgreSQL aborts B with40P01. This demonstrates row-lock/revision inversion in the current AFTER STATEMENT design; successful ordinary throughput does not dismiss it. Export concurrent with an uncommitted write sees a consistent old snapshot; after commit, old version is rejected. Rollback preserves revision and data.

Small candidate: obtain revision via BEFORE STATEMENT instead. The exact guarded tests/release-blockers/staging-revision-before-statement.sql ran in the isolated PostgreSQL database, then the same opposing-write case completed without deadlock. Mean write0.423ms; invalidation and rollback PASS. RPC/body/SEC007/ACL/Master rows unchanged. This eliminates the demonstrated DML inversion, not all possible application deadlocks (explicit SELECT FOR UPDATE before DML or unusual lock orders remain outside measured scenarios). Singleton still serializes writers and long transactions still hold it.

Candidate is STAGING-ONLY and NOT APPLIED there because Supabase connector is unavailable. Prepared Production SQL remains unchanged and must NOT be approved with the demonstrated AFTER trigger risk. Required closure: restore Staging access, inspect drift, apply guarded timing candidate only to tovkcakucyagvbzvlnks, verify trigger timing and focused export consistency/security/rollback tests. Then update guarded Production apply to BEFORE and review rollback guards; no Production application in this task.

## 3 Windows Chrome/Excel — OPEN; short standalone test ready

Use tests/release-blockers/windows-export-check.html: self-contained, no network/login/Supabase, no install or operational data. It embeds unchanged accepted collector/Worker and generates synthetic pages only, with exact associations56588/78164 and183 requests. New harness simulated under Node VM: correct counts183 requests, download generated in2116ms; this is NOT a real browser/Windows/Excel result and main heap does not include Worker memory.

Single targeted Product Owner test:
1 On a representative Windows PC open the HTML in Chrome; open Chrome Task Manager (Shift+Esc) and note tab/Worker memory.
2 Click Run once; record displayed duration, maximum tab+Worker memory and whether Chrome stayed responsive.
3 Open XLSX in Excel2016/2019: no repair warning; Items56589 rows and Identifiers78165 rows including header; Items A2 is text00000000, Identifiers B2 text0000SYN0; two identifiers for the first21576 item codes and one for the rest. Return time/memory/Excel result. No other Staging smoke test required.

This isolates browser generation/download/Excel compatibility. It excludes RPC/network/auth performance. If file/Blob Worker is blocked by company Chrome policy, report the error; do not install software or weaken policies. No real Windows memory/time claim is made and no arbitrary pass threshold is inferred from local Node measurements.

## Status and next action

All three gates remain OPEN in the specific ways above; blocker2 now has a concrete defect and tested candidate rather than a hypothetical concern. No Production migration, main merge, Pages/Vercel deployment, Auth/Edge or data modifications. All prepared Production protection/config/password/security files unchanged. Existing51 checks retain their prior PASS at7551a7e. Do not request deployment approval yet.
