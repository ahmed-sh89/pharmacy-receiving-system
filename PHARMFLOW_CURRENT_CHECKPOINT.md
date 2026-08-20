# PHARMFLOW CURRENT CHECKPOINT

Date: 20 August 2026
Version: Phase 2C.10.7.0 — Handheld + Receiving Lifecycle Stabilization
Status: READY FOR TEST

## SOURCE OF TRUTH
Built from user-uploaded GitHub package: pharmacy-receiving-system-main(7).zip.
This package supersedes the prior 2C.10.5.x/2C.10.6.x experimental patch chain.

## USER VERIFIED / DONE
- #24 PC Receiving search by Item Code / Item Name against uploaded Orders.
- Needs Review photo opening on PC.
- Previously verified PC↔PC / PC↔Handheld sync baseline remains protected.

## AUTHORITATIVE ZEBRA DIAGNOSTIC
Standalone test on the actual Zebra proved hardware + DataWedge + Chrome deliver the COMPLETE GS1 in one input insertion. keydown/keyup are Unidentified. Therefore the failure was inside application Handheld runtime, not scanner hardware.

## 2C.10.7.0 ROOT ARCHITECTURE
- New js/handheld-runtime.js is the ONE Handheld hardware input boundary for BOTH Receiving and Expiry.
- It intercepts the complete input value in capture phase and prevents legacy target listeners from creating competing transactions.
- Receiving passes one full raw GS1 to shared parser -> receiving resolver.
- Expiry passes one full raw GS1 to the existing Expiry resolver.
- READY is truthful: Receiving shows READY only when joined cloud session + non-empty order snapshot exist.
- Animated scan beam is active only in ready state; blocked state removes it.
- Scan inputs do not summon the soft keyboard. Numeric keypad remains limited to quantity/date fields.
- Independent Handheld server-termination watcher runs outside snapshot polling.
- PC Sign Out now ends a PC-owned live session BEFORE revoking authentication.
- Finalize ends in true No Active Order state; it no longer creates a phantom fresh workspace.
- Historical Delete refreshes Archive/Reports/order lifecycle after verified server deletion.
- Expiry Workers remain configuration data and are intentionally NOT deleted by Delete All Historical Data.
- Global GTIN Master and Returns Archive remain protected independent domains.

## DATABASE
No new SQL migration in 2C.10.7.0. Existing session-termination and historical-delete RPCs are reused.

## FOCUSED ACCEPTANCE TEST
A. Receiving: join new PC session, scan GTIN 06287043583491 x3. Must resolve, +1 each scan, no freeze.
B. Expiry: switch mode and scan same GS1. Must resolve same item; GS1 batch/expiry auto-extract; worker enters Qty only.
C. Session: PC Disconnect -> Handheld leaves automatically within ~1-2 sec. Rejoin. PC Sign Out while live -> session also ends.
D. Finalize: finalize one order -> archive persists, Current Workspace shows No Active Order and counters zero without Reset.
E. Historical Delete: one execution -> visible green receipt; finalized Archive and derived historical report sources disappear. Active orders preserved. Global GTIN, Returns Archive and Expiry Workers preserved.

## STOP RULE
Do not add another scanner timing/listener patch. If A or B fails, inspect the single HandheldRuntime call result and resolver data, not the hardware capture layer.
