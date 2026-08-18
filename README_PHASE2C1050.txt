PHARMFLOW PHASE 2C.10.5.0
STRICT GTIN / HANDHELD SCAN ROOT FIX

STATUS: READY FOR TEST

2C.10.4.9 TEST RESULT
FAILED — Handheld could not process known or unknown scans.

CONFIRMED CODE ROOT CAUSE
2C.10.4.9 removed getReceivingItemByItemCode() while the rebuilt Handheld
classification flow still called it. This caused scanner processing to throw
and fall into the generic "Unable to process barcode" handler.

ROOT FIX
- Restore the required receiving Item Code resolver.
- Add a strict GTIN identity gate: an Order quantity can change only after the
  scanned GTIN is confirmed by Global Master or an approved pharmacy alias.
- Unknown GTIN cannot use a stale browser mapping to modify Received / Over.
- Preserve the 2C.10.4.9 optional camera, autosave Needs Review V2, Physical Qty,
  known-not-in-order flow and compact Handheld layout.
- Scanner errors now show the actual safe error message for focused QA instead
  of hiding every exception behind one generic toast.

SQL
NO NEW SQL if PHASE2C1049_NEEDS_REVIEW_SUBSYSTEM_REBUILD.sql was already run.

DEPLOY
Upload these files preserving paths, then Hard Refresh PC + Handheld.

TEST ORDER
1. Known GTIN in current order — must receive +1 and show Ordered/Received/Remaining.
2. Unknown GTIN — must NOT change any Received/Over quantity; autosave to Needs Review.
3. Unknown screen — red flash, GTIN, PHOTO optional, Physical Qty, SAVE & NEXT.
4. Known Master but not Order — ADD EXTRA & NEXT; Manual only.
5. PC Needs Review — link unknown GTIN to existing order item; Manual remains unchanged.
6. One normal scan must still synchronize PC↔PC↔Handheld.

RECAPPED COMMIT SUBJECT
Fix strict handheld GTIN scan

EXTENDED DESCRIPTION
Phase 2C.10.5.0
- Restore broken Handheld Item Code resolver
- Enforce authoritative GTIN matching before receiving
- Prevent unknown GTIN from changing Received or Over
- Preserve Needs Review autosave, optional camera and Physical Qty
- Preserve known-extra Manual classification
- Improve scanner error diagnostics
- No new SQL after 2C.10.4.9
