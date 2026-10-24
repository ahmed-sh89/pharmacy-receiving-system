# PharmFlow Phase 1 permissions backend — 24 October 2026
Status: READY FOR REVIEW / Task 02A backend verification passed. Not USER VERIFIED / DONE.
Branch: staging/auth-access-parity-20261024.
Accepted parent: 0a021150d5cfe39299ea7f8f2a3820572b1e676a.
Staging Supabase: tovkcakucyagvbzvlnks. Production is untouched.

## Implemented contract
Existing roles, identities, pharmacy UUIDs, memberships, Auth and the Task 01B current-state password gate are preserved.
One pharmacy UUID policy stores Receiving and Expiry independently as DISABLED / READ_ONLY / FULL, and Item/Barcode access as READ_ONLY / PHARMACY_ONLY / PHARMACY_GLOBAL.
All pre-existing policies are seeded FULL/FULL; legacy HHP084 Global capability is seeded by UUID before replacing the authorization helper. Pharmacy code identity protection remains unchanged. New pharmacies receive the existing operational defaults without a new role.
Only System Administrator can call owner_set_pharmflow_permissions_v1. Changes use row locking, optional expected revision, and before/after audit. Direct policy writes are not granted to clients.
get_my_pharmflow_permissions_v1 reads the authorized policy and returns system_administrator for the existing privileged role. A System Administrator retains its existing privileged access; the password gate still applies.

96 deployed public business RPC contracts, including callable legacy versions, receive target-pharmacy/module/data guards without changing their operation bodies, confirmation contracts, idempotency keys or ACLs. The versioned contract list is proposals/phase1-permissions/guarded-rpcs.json.
Business-table triggers cover mutations inside SECURITY DEFINER calls. Restrictive RLS covers direct Expiry reads and Storage reads/writes. Shared Master lookups remain Item/Barcode reads independent of module access.
Mixed Quick Add / Expiry Resolve paths require operational and data permissions. Pharmacy Only never routes automatically to Global.
Read Only worker lists and Receiving generation reads do not create business/default rows; signed Auth-session bookkeeping remains available where needed.

Pharmacy Only local mapping INSERT/UPDATE/DELETE captures a central event in the SAME transaction: pharmacy UUID, actor, operation ID, mapping revision, before/after, source, PENDING_REVIEW. A capture failure aborts the mapping and audit operation. Idempotent retries do not duplicate events.
Existing Global audit and canonical six-Group validation remain unchanged.
Removed unnecessary TRUNCATE/REFERENCES/TRIGGER grants on the Staging Needs Review table and client execution of rls_auto_enable. No broad privilege/schema synchronization.

## Applied Staging migrations
20261024182938 staging_phase1_policy_review_foundation
20261024183018 staging_phase1_rpc_guards_01
20261024183028 staging_phase1_rpc_guards_02
20261024183030 staging_phase1_rpc_guards_03
20261024183121 staging_phase1_rpc_guards_04
20261024183123 staging_phase1_rpc_guards_05
20261024183124 staging_phase1_uuid_authorization_cutover
20261024183514 staging_phase1_policy_password_read_guard
20261024183906 staging_phase1_readonly_generation_bootstrap

## Focused evidence
PASS — tests/phase1-permissions-staging.sql against Staging, with complete rollback:
- independent Receiving/Expiry levels, Disabled read denial and Read Only write denial;
- cross-pharmacy RPC isolation, direct policy write denial and Pharmacy Admin self-grant denial;
- known Expiry capture with data READ_ONLY; mixed Resolve denial without data modification permission;
- Global authorization and Group validation; Global, local mapping and Expiry idempotency;
- atomic PENDING_REVIEW capture for local add/correct/remove; intentionally failed capture leaves no mapping;
- Pharmacy Only settings changes with both modules disabled do not change Global;
- direct authenticated RLS filters Disabled Expiry rows;
- password gate blocks Full/data rights; HHP084 retains its Global capability using a UUID policy.

PASS — real isolated Auth/HTTP requests: Receiving Read Only read allowed/write 403, Expiry Disabled read 403, direct REST filtering, self-grant 403; Receiving Storage write rejected with RLS status 403.
The malformed Expiry photo-path probe was rejected by the existing photo validator (HTTP 500/P0001); it is not claimed as an authorization PASS. Valid namespace module checks pass in the SQL tests.
PASS — build and 34 necessary existing Auth/password/Receiving/Handheld regressions.
Security advisors: anonymous SECURITY DEFINER endpoints reduced from four to three; existing unrelated advisory findings remain out of scope.
No QA Global items from the rollback suite remain. Only a new isolated HTTP QA account/pharmacy was retained; its credentials/tokens are excluded from Git and reports.

## Compatibility limits / exact Task 02B next action
The accepted Staging database lacks delete_pharmflow_order_complete, finalize_pharmflow_order and the Production Reset All RPC family. These were not silently copied or implemented. Full Delete/Finalize/Reset end-to-end acceptance is blocked by those inherited missing dependencies; existing UI confirmations were not changed.
No new administration UI, direct Auth-account creation, Staff, Supervisor, review-center UI, or new item catalog was implemented. Existing UI still has legacy visibility assumptions until Task 02B.
Task 02B should bind existing Access Management to the two policy RPCs, preserve focused actions/back/search/drafts, and reflect effective module/data access in navigation and mutation controls. Resolve the missing operational compatibility contracts in a separately scoped change before claiming complete operational acceptance. Do not automatically begin Task 02B or promote to Production.
