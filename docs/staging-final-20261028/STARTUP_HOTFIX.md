# Staging startup hotfix — 28 October 2026

Scope: feature/final-staging-refinements-20261028 only. No release-preparation branch, Production, database, Auth or Edge changes.

Reported Preview: https://pharmflow-test-3v5rfu324-fhyh2xtskz-3504.vercel.app/ served runtime 20710276e78a07fa6db0e6cddf8e5225a165419a; version.json and served Supabase configuration correctly bind tovkcakucyagvbzvlnks. In the available real browser, signed-out startup, secure fresh sign-in and reload with the saved session all reached Sign in or the authorized Receiving workspace ONLINE. No application console errors appeared (one unrelated browser-extension warning). The Product Owner's perpetual hang was not reproduced; its exact incident trigger remains unconfirmed.

Confirmed blocking mechanism: application bootstrap waits for DOMContentLoaded, while optional deferred CDN QR/PDF scripts can delay that event. Core control binding also waited for window.load. Neither optional library is required for authentication or workspace initialization. Make these two downloads async (retaining SRI/crossorigin) and bind core controls on DOMContentLoaded. Local XLSX remains deferred/ordered. A second confirmed failure path caught bootstrap exceptions but left their message behind the normal capsule; show the existing protected failure/reload surface instead. No timers, permission bypass, session resets or hidden failures added.

Export Worker is action-triggered; role labels are presentation-only; neither is changed. Normal capsule markup, CSS, appearance and Loading... text are unchanged. Actual auth/permission/session enforcement, SEC-007 and pharmacy scope are unchanged byte-for-byte in their source files.

Focused matrix: 31 tests PASS, zero failures; Vite Staging build PASS. Coverage: optional dependency decoupling, fresh/restored startup sequence, injected initialization failure and retry surface, definitive permission denial, permission restoration/revocation/scope isolation and version refresh safety. Source guards verify capsule/auth/permissions/export/config/deployment protection unchanged. These controlled tests establish the blocking mechanism and failure behavior; they do not prove which network event occurred on the Product Owner's PC. No export performance investigation repeated.

Publication/browser verification will be recorded after deployment. Rollback: republish previous feature runtime 20710276e78a07fa6db0e6cddf8e5225a165419a to Staging only; no database rollback required. User acceptance remains pending. No Production promotion is authorized.
