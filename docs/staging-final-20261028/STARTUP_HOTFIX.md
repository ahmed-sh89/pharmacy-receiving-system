# Staging startup hotfix — 28 October 2026

Scope: feature/final-staging-refinements-20261028 only. No release-preparation branch, Production, database, Auth or Edge changes.

Reported Preview: https://pharmflow-test-3v5rfu324-fhyh2xtskz-3504.vercel.app/ served runtime 20710276e78a07fa6db0e6cddf8e5225a165419a; version.json and served Supabase configuration correctly bind tovkcakucyagvbzvlnks. In the available real browser, signed-out startup, secure fresh sign-in and reload with the saved session all reached Sign in or the authorized Receiving workspace ONLINE. No application console errors appeared (one unrelated browser-extension warning). The Product Owner's perpetual hang was not reproduced; its exact incident trigger remains unconfirmed.

Confirmed blocking mechanism: application bootstrap waits for DOMContentLoaded, while optional deferred CDN QR/PDF scripts can delay that event. Core control binding also waited for window.load. Neither optional library is required for authentication or workspace initialization. Make these two downloads async (retaining SRI/crossorigin) and bind core controls on DOMContentLoaded. Local XLSX remains deferred/ordered. A second confirmed failure path caught bootstrap exceptions but left their message behind the normal capsule; show the existing protected failure/reload surface instead. No timers, permission bypass, session resets or hidden failures added.

Export Worker is action-triggered; role labels are presentation-only; neither is changed. Normal capsule markup, CSS, appearance and Loading... text are unchanged. Actual auth/permission/session enforcement, SEC-007 and pharmacy scope are unchanged byte-for-byte in their source files.

Focused matrix: 31 tests PASS, zero failures; Vite Staging build PASS. Coverage: optional dependency decoupling, fresh/restored startup sequence, injected initialization failure and retry surface, definitive permission denial, permission restoration/revocation/scope isolation and version refresh safety. Source guards verify capsule/auth/permissions/export/config/deployment protection unchanged. These controlled tests establish the blocking mechanism and failure behavior; they do not prove which network event occurred on the Product Owner's PC. No export performance investigation repeated.

Verified publication: runtime commit `420a1051e1561e0940cd72e7d565725230f27748`, deployment `dpl_6XmkETvFMz2faPETc9UdsYEzts1F`, READY Preview target null.

Corrected Preview: https://pharmflow-test-7934yq7u3-fhyh2xtskz-3504.vercel.app/

Live version.json confirms the exact runtime, environment staging and Supabase tovkcakucyagvbzvlnks. Served app.js includes the failure surface; HTML has both CDN scripts async. Old Preview local JavaScript assets: 46/46 HTTP200 with JavaScript content type. Corrected Preview real browser reached Sign in twice, with no app console errors. Secure login verification on the new origin timed out in browser tooling; the browser session subsequently disappeared. A fresh verification tab reached Sign in. Therefore corrected-runtime fresh authenticated login and saved-session browser verification remain OPEN, despite their controlled automated tests passing and both flows succeeding on old runtime207. No successful corrected-runtime authenticated browser result is claimed.

CI https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/40625294901 completed SUCCESS (focused startup/permission tests and build). Main was rechecked at 08843e42399b8830af6f0eb0773f04e0269cf0b6; the selective-release prep branch remains e91304bb8854ac1797bc91039726b04cb3539db9. No migrations or backend changes made. Code readiness: READY FOR USER TEST — PRODUCTION UNCHANGED; incident closure remains pending reproduction/acceptance evidence.

 Rollback: republish previous feature runtime 20710276e78a07fa6db0e6cddf8e5225a165419a to Staging only; no database rollback required. User acceptance remains pending. No Production promotion is authorized.
