# PHARMFLOW CURRENT CHECKPOINT

Date: 21 August 2026
Version: Phase 2C.11.3.5 — Global Readability & Typography Pass
Status: READY FOR TEST

## SCOPE
CSS/UI readability only.

No application logic, receiving logic, expiry logic, synchronization,
database, Global GTIN, history, delete behavior, scanner behavior or
persistence behavior was changed.

## USER-REPORTED ISSUE
Multiple PC and Handheld areas used typography that was too small to read
comfortably, especially:
- Near Expiry item metadata and Auto Read labels
- CAPTURED / RECENT counter
- top status/header cards
- Receiving tables
- Order Item Browser
- small badges, labels and secondary text

## CHANGES
- Increased micro-label sizes consistently.
- Increased desktop table header/body readability.
- Increased Near Expiry item metadata and form-control text.
- Enlarged CAPTURED / RECENT button label and count.
- Improved Expiry History row and filter text.
- Improved Receiving Last Scan supporting text.
- Improved Order Item Browser table and filter text.
- Increased Handheld micro-text conservatively without materially expanding layout.
- Preserved compact operational workspace and avoided broad global zoom.

## NON-REGRESSION
- Receiving 2C.11.1.9 behavior remains protected.
- Expiry workflow and history logic from 2C.11.3.x remain unchanged.
- No SQL migration.
- No JS production logic changed.

## TEST
1. PC Dashboard/Receiving: verify headers, metric labels and table text are easier to read.
2. Open Order Item Browser: verify names, quantities, statuses and headers remain readable without clipping.
3. Near Expiry PC: verify Item Code / GTIN / Category / Batch / Serial and Auto Read text.
4. Expiry Captured/Recent: verify label/count and history filters.
5. Handheld Receiving and Expiry: verify increased micro-text does not cause overflow or extra scrolling.
6. Perform one Receiving scan and one Expiry scan as visual regression checks.
