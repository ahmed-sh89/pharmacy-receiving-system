# Settings workspace Preview — awaiting Product Owner acceptance

Baseline main: 66ac0b2f1853285d9e18d87acced61bd0126c2b7.
Branch: feature/settings-workspace-preview-20261024.

Four in-page tabs reuse the existing Expiry navigation CSS. Items Control uses the original identifier administration renderer inline, preserving parsing, prefill, Group, mapping scope, validation and backend calls. Data Management keeps its existing destructive warnings/scopes/confirmations. Operators and Access use the existing role-authorized controls and data sources. Native Settings prompts/confirmations are presented with accessible styled dialogs; their validation, payloads and permission checks are unchanged.

Retired Settings-specific CSS was removed from legacy files; css/settings-workspace.css is the responsible Settings presentation owner. No Receiving, Handheld scanner, transactions, RPC definitions or schema changes.

Preview-only isolation reuses the fail-closed Staging configuration pattern, pins tovkcakucyagvbzvlnks, validates the public anon key and exact Preview branch, and restricts connect-src to Staging. Production config/environment variables are unchanged. No SQL or database writes performed.

/settings-ui-review.html is generated at build time from the actual application markup, renderers and styles. It uses fictional data, no authentication/storage, no network connections and blocked save operations. This is visual evidence, not authenticated functional verification. The root application is the real Staging-connected application.

Focused automated checks: 29 PASS (Settings search/prefill/scopes, Group, navigation, keyboard, role visibility, permission/backend source invariants, Staging isolation, generated review isolation, and essential Handheld/Expiry regressions). Build PASS. Browser review at 1363px: all four tabs, inline search/item details/correction, Operator rename and Owner management/edit dialogs verified using fictional data; no horizontal page overflow. Exact deployed SHA is reported in delivery. No Product Owner visual acceptance is claimed. Existing unrelated Settings account/access test has the known baseline Admins KPI assertion failure; it is outside this UI change.

Rollback: discard this isolated branch/Preview; main remains untouched. No database rollback.

## Final Access refinement

Starting Preview: ef0077cf8cdc94339b9e9010dd12a7fda8f0d954. Access Management now renders the existing authorized pharmacy/request lists inline. KPI counts and canonical status predicates are unchanged; the existing Receiving Report KPI CSS is shared without changing its declarations. Search combines with the selected view. Edit/Admin prompts are anchored inline to the target row; original validation, role guards, RPC payloads and sensitive confirmations are preserved. No role is inferred when the backend does not supply one. Items Control source terminology uses Database without changing technical identifiers. Desktop footer hides only redundant status presentation; its runtime nodes and Handheld behavior remain intact.

Focused refinement checks: 25 PASS; production build PASS. Includes KPI/search combinations, request filtering, exact action targets, inline submit/cancel/filter teardown, authorized mutation source invariants, identifier scopes and parsing, shared KPI declarations, Desktop-only footer styling, role visibility and fail-closed Staging configuration. Mock review is not authenticated mutation verification. No SQL, database writes, or Production changes. Roll back this refinement by reverting its commit, preserving the accepted Settings baseline.

## Staging status RPC compatibility — 2026-10-24

Approved UI baseline: a6b0056fc18d9e9044bd431cc7f08d083d373a03. No application/UI changes.
Staging was missing owner_set_pharmacy_status(uuid,text), despite the frontend using its established signature. Applied Staging migration 20261024001414_staging_owner_set_pharmacy_status_compatibility. Existing Production behavior was read only for reference; Staging uses its already-existing is_system_owner() predicate, equivalent to the legacy system_owners/auth.uid() guard. Authenticated execution is granted, anonymous/public execution revoked. Existing active/suspended status updates, active boolean and updated_at semantics are retained. No pharmacy records, memberships, roles, RLS policies or Production objects were modified.

Verification: catalog confirms exact signature, grants and migration; SQL-role test rejects missing user before writes. Isolated PGlite tests cover Owner/non-Owner authorization, invalid status, missing pharmacy, target-only suspend/reactivate and unrelated-row preservation. These are SQL tests, not authenticated browser acceptance. Existing Access/Settings regressions and build passed.

Remaining blockers: owner_assign_pharmacy_admin(uuid,text) is also absent from Staging; Admin save cannot pass until that separate dependency is restored with its existing authorization safeguards. Edit/Admin browser save, refresh persistence and cross-account isolation are NOT TESTED: no authorized safe browser session/credentials, and Chrome warning remains unresolved. No test account provisioning or real pharmacy mutations performed. Production readiness is blocked. Rollback of this addition: revoke execute then drop only public.owner_set_pharmacy_status(uuid,text), after dependency review; no record rollback required.
