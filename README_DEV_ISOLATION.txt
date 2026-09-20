PHARMFLOW DEV — DEVISO1
2026-08-25

Purpose
-------
Hard safety boundary for the pharmflow-dev (B) deployment while it shares the
same Supabase project as Production A.

Dedicated development tenant
----------------------------
Name: PharmFlow Dev
Code: DEV001
Pharmacy UUID: ffcac9ca-dfca-4344-9490-a77dcdba9d01
Admin: dev001@gmail.com

Protection
----------
1. Mutation RPCs in B fail closed unless authenticated pharmacy_id is DEV001.
2. Global GTIN cloud master remains readable but import/commit/delete is blocked.
3. Legacy cloud-session mutation RPCs are blocked because they are not tenant-scoped.
4. Production repository A is not modified by this package.

Files changed
-------------
- index.html
- js/dev-isolation.js (new)
- PHARMFLOW_CURRENT_CHECKPOINT.md
- PHARMFLOW_DECISION_REGISTER.md
- PHARMFLOW_TEST_MATRIX.md
- PHARMFLOW_CHANGELOG.md
- README_DEV_ISOLATION.txt (new)

Verification
------------
A. Deploy this package to pharmflow-dev only.
B. Sign in to B with dev001@gmail.com. Confirm DEV001 workspace opens.
C. Upload a small disposable test order in B and confirm it is visible only under DEV001.
D. Confirm Global GTIN can resolve/look up items but Update Global GTIN is unavailable.
E. Optional negative test: sign in to B using a non-DEV pharmacy account and attempt a write;
   it must fail with a DEV SAFETY BLOCK message.

IMPORTANT
---------
Never upload js/dev-isolation.js or the DEV script include to Production A.
