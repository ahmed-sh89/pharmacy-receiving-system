PHARMFLOW PHASE 2C.10.5.2
HANDHELD PERFORMANCE + NEEDS REVIEW ROOT FIX

STATUS
READY FOR TEST

TEST EVIDENCE FROM 2C.10.5.1
- Known item in Order can scan on Handheld.
- Known Global Master item not in Order fails when multiple Orders are selected
  because the worker is being asked to choose an accounting target Order.
- PC Needs Review opens as an unpositioned/inconsistent panel because V2 overlay
  did not carry the base fixed-overlay class.
- Handheld scan feels slow.

ROOT CAUSES
1. Common GTIN scan path queried pharmacy-learned Supabase aliases BEFORE using
   the locally synchronized Global Master IndexedDB cache.
2. Known Extra attempted immediate Manual receiving even when more than one
   selected Order made target ownership ambiguous.
3. Needs Review V2 overlay used needsReviewOverlayV2 but omitted the existing
   needsReviewOverlay positioning class.
4. Camera compression required modern createImageBitmap without a compatibility
   fallback on older enterprise Android browsers.

ROOT FIX
- Global Master local lookup is now first and cached for fast common scans.
- Supabase learned-alias lookup runs only after no Global Master match exists.
- 2-minute learned-alias negative cache avoids repeated network waits.
- Handheld hardware scanner debounce reduced to 55 ms.
- Known Extra + one selected Order: ADD EXTRA & NEXT directly.
- Known Extra + multiple selected Orders: SAVE EXTRA FOR REVIEW; pharmacist
  chooses target Order on PC. Worker never stops to make reporting decisions.
- PC Needs Review is a centered full operational modal.
- Add Unordered review now has an explicit Target Order selector.
- Camera photos are automatically resized/compressed, with an older-browser
  fallback. 5 MB remains server safety only.
- No SQL migration in this phase.

NON-REGRESSION
- Based on tested 2C.10.5.1.
- No Receiving Ledger schema changes.
- No Active Order Manifest changes.
- No Historical Delete changes.
- No Global GTIN Master data mutation.
- PC↔PC / PC↔Handheld synchronization architecture preserved.
- Unknown GTIN strict identity gate preserved.
- Existing-order GTIN resolution remains Normal, not Manual.
- Over remains quantity-derived only.

DEPLOY
Upload the modified files preserving paths, then Hard Refresh PC and Handheld.
No Supabase SQL is required.

FOCUSED TEST
1. Known GTIN in Order:
   scan repeatedly on Handheld. Expected faster response and +1 each scan.
2. Known Master, not in Order, ONE selected Order:
   ADD EXTRA & NEXT works and becomes Manual.
3. Known Master, not in Order, MULTIPLE selected Orders:
   SAVE EXTRA FOR REVIEW succeeds; no red target-order error.
4. PC Needs Review:
   opens centered and usable; for unordered item choose Target Order and resolve.
5. Unknown GTIN:
   autosave, optional photo, Qty, SAVE & NEXT remain working.
6. Camera:
   take a normal full-resolution photo; worker must not receive a file-size error.
7. Sync regression:
   one known scan must still appear on the linked PC.

RECAPPED COMMIT SUBJECT
Fix handheld review performance

EXTENDED DESCRIPTION
Phase 2C.10.5.2
- Make Global Master lookup local-first and cached
- Reduce Handheld scan latency
- Route ambiguous multi-order extras to pharmacist review
- Add explicit target Order selection on PC
- Rebuild Needs Review as a stable centered workspace
- Auto-compress camera photos with Android fallback
- Preserve strict GTIN classification and verified synchronization
