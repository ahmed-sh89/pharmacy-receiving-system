# Receiving Quick Add — Staging verification, 22 October 2026

Base Production: 4b3fe2e03d438ba5d462d5eabae0a6446884e125.
Original prepared commit 9a9fba6eb324e626b25a7e7b81b4b532b30ebe81 retained locally and in prior verified bundle. GitHub publication uses an equivalent source commit based on the same Production parent because local authenticated push is unavailable.
Branch: fix/receiving-quick-add-staging-20261022.

Recovered exact source table columns/defaults/constraints/indexes/RLS/ACL from saved expiry-production-evidence catalog, with no operational rows. Original source table has RLS enabled, no browser grants or policies. Recovered current append receipt definition and ACL from functions-000.json. Save/get source v2 contracts recovered from PHASE2C1151_RECEIVING_RELEASE_PREPARED.sql. No historical whole-schema SQL was replayed. Compatibility creates absent objects only.

Applied ONLY to Staging tovkcakucyagvbzvlnks, in order:
20261022140245 receiving_quick_add_staging_dependencies (00)
20261022140256 receiving_quick_add_identity_provenance (01)
20261022140308 receiving_quick_add_atomic_review_capture (02)
Migration 03 remains DEFERRED and unexecuted.

Actual live SQL tests PASS: authorized Global creation and quantity four; exact retry returns same receipt; changed retry rejected; pharmacy-only admin cannot create Global item; viewer rejected; other pharmacy rejected; existing Master reused with Pharmacy mapping and quantity three; over-remaining rejected; atomic review capture quantity four; original source upload/read; browser table and anon RPC grants closed. Tests use SET LOCAL ROLE authenticated with synthetic JWT claims, exercising database role/authorization, not GoTrue login.
Two independently submitted concurrent requests committed one receipt quantity four; one response new, the other idempotent. Separate connection verified count one/sum four. All test fixtures then deleted by exact generated actor/pharmacy/order IDs. No HHP084 records used.
43 focused client tests previously passed, no runtime feature code changes since then. New compatibility SQL parser and refreshed Staging build PASS. Existing classic-script Vite warnings remain.

Preview source is explicitly configured for Staging Supabase. Production main, Production DB, accepted Staging branch and deployment are not modified. Expiry runtime preserved. Live browser login/device/multi-PC acceptance remains Product Owner verification. Publish/URL verification recorded in final response.
