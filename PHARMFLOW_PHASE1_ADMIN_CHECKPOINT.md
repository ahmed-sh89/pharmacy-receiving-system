# Task 02B — Phase 1 Access Management
Status: READY FOR PRODUCT OWNER REVIEW. No Product Owner acceptance claimed.
Target: staging/auth-access-parity-20261024 / Supabase tovkcakucyagvbzvlnks.
Parent: 0a3a3eb973d1c275f3eeacef19d689df2ed4e7c1.
Production main verified bd20065f0a2c7bb44861df88e1d021225e7c9725; Production untouched.

## Changes
- Existing focused pharmacy action includes Permissions. Reads get_my_pharmflow_permissions_v1(uuid); saves owner_set_pharmflow_permissions_v1(uuid,text,text,text,bigint) using expected revision. Independent Receiving/Expiry and Item & Barcode values, Save/Cancel/status, retained drafts and guarded Back/tab/sidebar/keyboard navigation.
- Existing Access Management adds Create Pharmacy & Admin. The existing password-admin Edge Function handles privileged Auth creation, calls existing pharmacy creation/assignment via a journaled owner RPC, and never resets an existing user's password automatically.
- New account receives cryptographically random temporary password, server-owned forced-change metadata, and immediate required replacement before business operations. Password response uses no-store; credentials are shown only in the existing secure handoff prompt and are absent from journal/draft/log/report.
- Operation UUID + actor + immutable request fields serialize retries. Pharmacy creation is transactional with its private journal; Auth and assignment are separate recoverable phases. If Auth creation succeeds but its credential response is lost, retry finishes assignment without resetting credentials. UI directs owner to the existing explicit Reset action. Cancellation retains any created remote records and states this explicitly.
- Effective server policy loads before account-ready/workspace boot. A shared UI projection gates navigation, Desktop/Handheld modes, RPC dispatch, scanners/quantity/import/queue mutations, Expiry mutations, Storage evidence actions and item/barcode controls. UUID policy replaces UI HHP084 Global exception. Server remains authoritative.
- Receiving Disabled boots an empty Receiving runtime without requesting Receiving authority; independent Expiry/Settings remain available. Read Only pauses durable mutation retries and retains pending work rather than discarding it. Policies refresh on resume and on server permission denial, without new polling.
- Existing operational confirmation, Group/mapping/audit, password gate, self-registration and invitation contracts remain in place. No direct browser policy-table grants or service key exposure.

## Staging database/Edge
20261024185827 staging_phase1_direct_account_provision.
Private RLS-protected account_provision_v1 journal; public owner_provision_pharmacy_v1(uuid,text,text,text,boolean). Only authenticated execute, current System Administrator + completed password requirement checked inside.
pharmflow-password-admin Edge Function version 3, verify_jwt=true. create-account action explicitly limited to this Staging URL. Reset and completion retained; replacement cannot equal the temporary password.

## Focused evidence
PASS: 40 automated Auth/password/Receiving/Expiry/permission tests, including all nine Receiving/Expiry combinations and Desktop/Handheld control projections, Global policy/tenant/password boundaries, local Receiving pre-mutation denial, and permission editor revision/save/error behavior.
PASS: 8 selected existing Access Management behavioral regressions (KPI/search, single expansion, inline drafts, focused actions, Back/filter/scroll/tab restoration).
PASS: build.
PASS: real isolated Staging HTTP: direct new Auth/pharmacy/admin creation; temporary first login; direct RPC blocked before replacement; replacement + fresh login + authorized read; self-grant rejection; owner persistence/stale revision rejection; Receiving Read Only and Expiry Disabled RPC/REST enforcement; cross-pharmacy denial; existing-email credential unchanged; same-operation retry; pharmacy-prepared retry; existing System Administrator reset/forced-change flow.
PASS: Auth-created/assignment-incomplete state recovery using isolated journal fixture; no initial credential replay or implicit reset; explicit Reset required.
An isolated prior HTTP QA user was temporarily a System Administrator for these tests and returned to its original role afterward. New QA pharmacies/accounts and restrictive policies are isolated; no Production records or credentials were copied.
Security advisor review found no new exposed-table/RLS issue from this private journal. Existing unrelated baseline notices are outside this task.

## Limits
NOT TESTED: physical Handheld hardware and full rendered authenticated browser acceptance (browser runtime unavailable). DOM/runtime permission tests are automated evidence, not device acceptance.
BLOCKED inherited Staging dependencies: delete_pharmflow_order_complete, finalize_pharmflow_order and Production Reset All RPC family. No substitutes/mocks were used to claim operational acceptance. Full Receiving Delete/Finalize/Reset acceptance remains blocked. No Phase 2 work or Production deployment.

## Product Owner acceptance (maximum three)
1. In Preview, open Access Management → pharmacy → Permissions; save mixed levels, return and reopen to confirm values, search/KPI/Back and discard protection.
2. Create an isolated pharmacy/admin using an unregistered email; securely hand off temporary password, verify forced replacement, then sign in. Existing email must retain its password.
3. Check Desktop and Handheld with mixed module/data permissions: authorized viewing remains available, restricted scans/mutations/disabled modules are unavailable; HHP084 retains Global controls.
