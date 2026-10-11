# AI11 coordinated Staging acceptance
Starting source f68b1b3f57fe15c39e7bb158726e91b1295be8c2.
Project tovkcakucyagvbzvlnks: pharmflow-staging, ACTIVE_HEALTHY.
Migration20261011200941 applied to scan_facts(text,text) ONLY.

Physical evidence proves AI11-prefix rejection at offset25 after GS24; actual date/remainder validity remains physically unverified. Client and private server now consume validated six-digit Production Date, keeping AI17 separate and required with11. No inferred boundaries or product exceptions. Healthcare actual-day rule: https://ref.gs1.org/standards/genspecs/24.0.0/ section3.4.2. Existing17 compatibility unchanged.

Expiry and Receiving use IdentifierService.resolve with exact display identifiers. Authenticated pharmacy membership required; pharmacy mappings first, Global Master V2 second. Key normalization uppercase/trim only. Automated PLAIN/lookup/Needs Review tests cover E0029-L, U0030, S00110, 1234A, 1234, 001234,04065272072977. SQL acceptance and existing synthetic stored readback verified. These are automated evidence, not physical verification of every identifier. Shared service, Receiving and auth unchanged.

Private helper retains IMMUTABLE, SECURITY INVOKER, pg_catalog/pg_temp path and postgres-only execution ACL. Only caller save_pharmflow_expiry_capture_v3; public RPC and resolver definition hashes/ACL unchanged. Before/after identical fingerprints: operations44, events31, state19, reviews6, Storage9. Historical HHP084 operations preserved. cron.job empty; scheduler untouched.
Rollback: revert client first, inspect current helper, apply supplied original helper. No data rollback required.

Focused269PASS/0FAIL/1SKIP. Full506PASS/43FAIL/1SKIP, same43 failing names as492/43/1 baseline. SQL checks120 AI permutations, exact values, invalid dates, idempotency and pharmacy denial. Build/syntax/diff pass. Viewport rerun blocked: installed Chromium crashes before launch. No layout source changed; prior five-screen physical acceptance preserved.

Production source readiness: existing configured authoritative V2 resolver/pharmacy mappings can be reused, no staging item copy or business hardcoding. Production backend parity (Expiry foundations/private AI11 helper, grants/RLS, Storage) must be separately verified/approved as future prerequisites. No Production connection/write used. TC26 Dompy and Needs Review/photo cleanup acceptance remain gates. Expiry is not yet Production-ready.
IMPLEMENTED / AUTOMATED VERIFIED; physical Dompy acceptance pending.
