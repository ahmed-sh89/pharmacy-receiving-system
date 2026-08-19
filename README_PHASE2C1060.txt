PHARMFLOW PHASE 2C.10.6.0
CLEAN HANDHELD RUNTIME BASELINE

STATUS
READY FOR TEST

WHY THIS PHASE EXISTS
The 2C.10.5.x sequence accumulated experimental scanner listeners, timing
fallbacks, processing-lock recovery, and session-termination polling. The
Handheld runtime was stable before those layers were added.

This is NOT a full rollback.

CLEAN MERGE STRATEGY
- Restore ONLY the previously stable Zebra scanner runtime from 2C.10.4.7.
- Restore ONLY the previously stable shared-session runtime from 2C.10.4.7.
- DO NOT roll back current Receiving / Order Membership / Uploaded Order search.
- DO NOT roll back item #24 (PC search by Item Name / Item Code).
- DO NOT change Global GTIN Master data.
- DO NOT add new fallbacks or duplicate handlers.

FILES REPLACED
- js/scanner.js
- js/supabase.js
- index.html (cache-bust only)

FILES INTENTIONALLY NOT REPLACED
- js/receiving.js
- js/ui.js
- js/master-gtin.js
- js/needs-review.js
- order/business/reporting files

ARCHITECTURAL RULE
One scanner event path:
Zebra hardware -> scanner.js -> shared GS1 parser -> receiving resolver

One session termination path:
PC End Session -> Supabase session state -> Handheld shared-session runtime -> Mode screen

No SQL migration is required.

FIRST ACCEPTANCE TEST
Use the exact medicine already tested:
GTIN: 06287043583491

1. PC: keep the current active orders/session.
2. Hard refresh the Handheld.
3. Join the Handheld to the PC session.
4. Scan the same GS1/DataMatrix.
Expected:
- Handheld responds immediately.
- It must not freeze.
- It must resolve the same GTIN as PC.
- If the item is in an uploaded selected Order it must NOT be classified as Extra.
5. Repeat the same scan 3 times.
6. On PC press Disconnect/End Session.
Expected:
- Handheld automatically leaves the session and returns to mode selection.
7. Rejoin and scan once more.

STOP RULE
If step 4 fails, do not add another patch.
Capture the exact raw value shown/received and perform a DataWedge/browser
configuration audit before any further application-code change.

RECAPPED COMMIT SUBJECT
Restore clean handheld runtime

EXTENDED DESCRIPTION
Phase 2C.10.6.0
- Remove accumulated experimental Zebra runtime layers
- Restore last stable scanner capture/parser runtime
- Restore last stable PC-Handheld session lifecycle
- Preserve current uploaded-order matching and PC search fix
- Preserve current GTIN/order business logic
- No SQL migration
