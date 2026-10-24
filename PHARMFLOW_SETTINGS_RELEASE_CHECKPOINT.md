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
