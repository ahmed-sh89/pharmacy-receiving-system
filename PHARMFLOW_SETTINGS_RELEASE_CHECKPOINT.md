# Settings UI Production release — 2026-10-24

Scope: Product Owner-authorized selective promotion of accepted Settings UI only.
Production baseline: 66ac0b2f1853285d9e18d87acced61bd0126c2b7 (remote main and live version.json verified).
Accepted source: feature/settings-workspace-preview-20261024 at 0e1ec12de08b5b20c26210a6d46676262cb67f8d; visual approval a6b0056fc18d9e9044bd431cc7f08d083d373a03.
Release identity: the commit containing this checkpoint. Existing main-push GitHub Pages workflow stamps that exact SHA into live version.json and HTML build meta; deployment result is reported with the final SHA in release delivery.

Included: four Expiry-style Settings tabs; direct inline Items Control using the existing identifier renderer and Database source labels; compact Data Management and Operator presentation; inline Access Management with canonical KPI counts, combined search, one expanded pharmacy, internal scrolling and one active Edit/Admin prompt; accepted Desktop pharmacy-code-only footer. Existing management validation, role visibility, RPC arguments, confirmations and business semantics remain intact. Settings-specific obsolete CSS is removed at its responsible source; shared Expiry tab/Receiving KPI declarations are reused without changing their existing appearance.

Excluded: all Staging connection/runtime files, build guards, visual review generators/pages, diagnostics, Staging SQL migration 20261024001414 and its SQL test. Production js/supabase.js, Vite configuration, workflow, authentication/password/session code, Account presentation scripts and operational modules are unchanged. No SQL, database writes, new roles, permissions, RLS or authentication changes.

Read-only Production compatibility: owner_list_pharmacies(), owner_set_pharmacy_status(uuid,text), owner_assign_pharmacy_admin(uuid,text), owner_update_pharmacy_identity_v1(uuid,text,text), owner_list_pharmacy_registrations(text) and owner_review_pharmacy_registration_v2(uuid,text,text,text,text) exist with the frontend's parameter/return contracts and existing authenticated execution grants. Existing Owner authorization guards remain database-owned. No Staging missing-RPC workaround is needed or included.

Pre-release verification: production build PASS; 30 focused automated tests PASS covering Settings tabs/role visibility, identifiers/prefill/scopes, KPI counts and combined search, single-open rows, duplicate form prevention, prompt cancellation, action targets, unchanged mutation contracts, authentication boundaries, essential Receiving/Expiry Handheld routing and selective-release source invariants. Production configuration/deployment and operational-page DOM match the verified baseline. Historical unrelated Settings account test contains obsolete Admins/modal expectations; it is not evidence against the accepted inline redesign.

Production smoke boundary: no operational test writes, Suspend, Reset or Admin reassignment authorized or performed. Signed-in navigation/role-specific behavior still requires Product Owner non-destructive smoke after activation; automated/mock tests are not actual authenticated Production acceptance. No claim of USER VERIFIED functionality is made beyond the Product Owner's accepted visual design.

Rollback: revert only this selective release commit through the existing main-push Pages workflow; retain subsequent work. No database rollback is needed.

## Verified activation evidence

UI code release: b3c3a3b4f6563df9f8251a9876381dcc30a76753.
GitHub Pages push workflow 40045250522: completed / success at that SHA.
Live version.json and HTML build meta matched the code-release SHA. Live js/supabase.js, js/auth.js, js/settings-workspace.js, css/settings-workspace.css, ui.js and js/expiry.js byte-matched the tested sources. The live client retains Production project zznoshzcyxmtwfbznjyr; HTML and client contain no Staging runtime/target.
Non-destructive signed-out browser smoke: sign-in gate visible, authLocked true, application pointer-events none, four Settings tabs and intended Settings script present; Desktop footer status labels hidden. No credentials entered and no operational mutations performed. Signed-in Settings/role smoke remains for Product Owner verification.
This follow-up checkpoint commit changes documentation only; the same existing Pages workflow stamps its final deployed SHA. No Production SQL, migrations, roles, RLS, configuration or operational data changes.

## Focused Access action hotfix — 2026-10-24

Baseline main: f67686421efd7e5bbc8f2bb375de600b0aef52a0, re-fetched before changes. Scope: Access presentation only. Height-constrained grid rows previously permitted shrink/clipping alongside overflow-hidden cards. List rows now use intrinsic track heights; focused action mode removes the list height cap and clipping while retaining the normal internally scrolling pharmacy list.

Edit/Admin/Reset/Suspend/Activate use the original canonical handlers without altering their validation, permissions, RPCs or confirmations. UI action navigation shows only the selected pharmacy and selected action. Back restores the prior KPI/search and scroll position, retains the selected pharmacy where it still matches, and re-applies current canonical data after successful mutations. Only one action may run. Drafts survive refresh and sequential fields; Back/tab/sidebar navigation asks before discarding changes and cannot leave during an in-flight authenticated operation. Page-unload warns on a dirty draft. Status badges use green Active, red Suspended and amber Pending; summary columns reserve consistent status/chevron widths.

Changed source: js/auth.js (rendering and action dispatch only), js/settings-workspace.js (presentation navigation), css/settings-workspace.css. Existing mutation handler bodies, auth/session, RPC contracts, RLS, permissions, backend configuration, all other Settings sections and operational modules are unchanged. No SQL or Production operational data writes performed.

Verification: 18 focused automated tests PASS, production build PASS. Tests cover all action entry points, Back/restoration, draft protection across sequential fields and refresh, single-form behavior, busy-state navigation protection, combined search/KPI filters, post-action refresh, tab-navigation guarding, exact existing mutation/permission contracts and protected-source invariants. Local synthetic browser geometry review was unavailable (local QA HTTP port unreachable from the remote browser); no authenticated Production actions were exercised. Product Owner should inspect expanded rows and non-destructively open/cancel Edit/Admin and return with Back, confirming scroll restoration. Do not run Reset/Suspend/reassignment as smoke tests.

Activation uses the unchanged main-push Pages workflow; exact workflow result and live SHA are recorded in release delivery. Rollback: revert only this hotfix commit, preserving later work. No database rollback required.
