# PHARMFLOW CURRENT CHECKPOINT

Date: 21 August 2026
Version: Phase 2C.11.0 — Unified Pharmacy Workspace Core
Status: READY FOR TEST

## AUTHORITATIVE SOURCE
Built from user-uploaded GitHub ZIP `pharmacy-receiving-system-main(8).zip`.
The deployed baseline was 2C.10.7.1. Phase 2C.10.7.2 was NOT uploaded by the user and is explicitly excluded.

## ARCHITECTURE CHANGE
Handheld is now a first-class authenticated client of the same pharmacy-scoped Supabase workspace used by PCs. User-facing Create Session / Join Code / QR pairing is no longer required for Receiving.

Authoritative path:
PC Upload Order -> Active Order Manifest (Supabase) -> PC/Handheld direct hydration -> shared receiving ledger.

## 2C.11.0 IMPLEMENTATION
- Handheld Receiving mode pulls the pharmacy Active Order Manifest directly.
- No legacy cloud-session id/secret is required for Handheld READY state.
- Handheld displays `ONLINE · WORKSPACE SYNCED · N ORDERS · N ITEMS` only when real Active Order data is present.
- If no Active Order exists it displays `WAITING FOR ACTIVE ORDER`.
- Existing Active Order Manifest preserves per-item order membership, eliminating session-snapshot membership loss.
- Receiving transactions continue through the existing authenticated pharmacy-scoped shared receiving ledger.
- Legacy Create/Join Session UI is hidden/dormant during the user-verification gate; destructive removal is deferred until the new core is verified.
- Expiry remains accessible from Handheld Modes and does not require a PC session.
- No SQL migration is required for this core because the existing Active Order Manifest + receiving ledger already provide the required server authority.

## USER VERIFIED / PROTECTED
- PC Receiving search #24: Item Name / Item Code against uploaded Orders.
- Existing PC multi-device cloud workspace architecture must not regress.
- Global GTIN, Returns Archive and historical-domain boundaries remain unchanged.

## ACCEPTANCE GATE — TEST ONLY THIS FIRST
1. PC: sign in and upload/retain an Active Order containing GTIN 06287043583491.
2. Handheld: hard refresh and sign in with the SAME pharmacy account.
3. Choose Receiving. There must be NO Join Code / QR step.
4. Handheld must show `ONLINE · WORKSPACE SYNCED` with non-zero Orders/Items.
5. Scan GTIN 06287043583491 three times. Correct item must appear and Received must increase +1 each scan without freeze.
6. PC must show the same +3 through shared receiving synchronization.

## STOP RULE
If this gate fails, do not patch DataWedge, session snapshots, Needs Review, Expiry UI or Reports. Trace only Active Manifest hydration -> item membership -> shared receiving transaction.

## NEXT AFTER USER VERIFICATION
2C.11.1 — Handheld Receiving UX + Runtime (known extra, unknown GTIN, keyboard/focus, polished state UI).
