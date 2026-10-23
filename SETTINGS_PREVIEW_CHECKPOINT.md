# Settings workspace Preview — awaiting Product Owner acceptance

Baseline main: 66ac0b2f1853285d9e18d87acced61bd0126c2b7.
Branch: feature/settings-workspace-preview-20261024.

Four in-page tabs reuse the existing Expiry navigation CSS. Items Control uses the original identifier administration renderer inline, preserving parsing, prefill, Group, mapping scope, validation and backend calls. Data Management keeps its existing destructive warnings/scopes/confirmations. Operators and Access use the existing role-authorized controls and data sources. Native Settings prompts/confirmations are presented with accessible styled dialogs; their validation, payloads and permission checks are unchanged.

Retired Settings-specific CSS was removed from legacy files; css/settings-workspace.css is the responsible Settings presentation owner. No Receiving, Handheld scanner, transactions, RPC definitions or schema changes.

Preview-only isolation reuses the fail-closed Staging configuration pattern, pins tovkcakucyagvbzvlnks, validates the public anon key and exact Preview branch, and restricts connect-src to Staging. Production config/environment variables are unchanged. No SQL or database writes performed.

/settings-ui-review.html is generated at build time from the actual application markup, renderers and styles. It uses fictional data, no authentication/storage, no network connections and blocked save operations. This is visual evidence, not authenticated functional verification. The root application is the real Staging-connected application.

Focused automated checks: 28 PASS (Settings search/prefill/scopes, Group, navigation, keyboard, role visibility, permission/backend source invariants, Staging isolation, generated review isolation, and essential Handheld/Expiry regressions). Build PASS. Browser review and exact deployed SHA are reported in delivery. No Product Owner visual acceptance is claimed. Existing unrelated Settings account/access test has the known baseline Admins KPI assertion failure; it is outside this UI change.

Rollback: discard this isolated branch/Preview; main remains untouched. No database rollback.
