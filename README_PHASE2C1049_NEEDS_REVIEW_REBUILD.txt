PHARMFLOW PHASE 2C.10.4.9
NEEDS REVIEW SUBSYSTEM REBUILD

STATUS
READY FOR TEST

IMPLEMENTATION MODEL
This is a fresh subsystem rebuild. The application switches to
pharmflow_needs_review_v2. Legacy Needs Review V1 is not dropped.

HANDHELD RECEIVING
Known item in current order:
- Normal +1 receiving
- Compact live Item / Ordered / Received / Remaining
- No unnecessary Scan GS1 / Barcode title
- Total Scans card removed from the working viewport

Known Global Master item NOT in current order:
- Identity is already known
- Handheld shows compact known-item card
- Physical Qty
- ADD EXTRA & NEXT
- Classified Manual / Unordered

Unknown GTIN:
- GTIN is autosaved to Supabase BEFORE the worker enters quantity
- Red flash + ITEM NOT RECOGNISED
- Raw GTIN visible
- Optional product photo
- Physical Qty default 1
- SAVE & NEXT
- Pending record survives refresh/sign-in

PC NEEDS REVIEW
- Pharmacy-scoped pending queue
- Optional private product photo
- Search CURRENT ORDER first
- LINK GTIN & RECEIVE uses manual=false
- Quantity is applied using deterministic transaction id NEEDS_REVIEW_V2:<review_id>
- Retry cannot double receive
- Over remains quantity-derived only
- ADD UNORDERED & RECEIVE only when item truly is not in the order
- Unordered path uses manual=true

GTIN LEARNING
- Reviewed GTIN can be learned as a pharmacy-scoped alias
- System-wide Global GTIN Master remains protected/read-only for pharmacy users

PHOTO SECURITY
- Private Supabase Storage bucket: pharmflow-needs-review
- Path begins with pharmacy_id
- RLS permits only pharmacy members
- 5 MB max
- JPG / PNG / WEBP

EXPIRY UX
- Compact top area / scanner-first layout
- No change to expiry business logic in this phase

NON-REGRESSION
- Phase 2C.10.4.6 Historical Delete unchanged
- Phase 2C.10.4.7 stale-generation login fix unchanged
- Shared Receiving Ledger unchanged
- PC↔PC / PC↔Handheld sync architecture unchanged
- Active Order Manifest unchanged
- Returns Archive unchanged
- Global GTIN Master data unchanged

DEPLOY
1. Run PHASE2C1049_NEEDS_REVIEW_SUBSYSTEM_REBUILD.sql once.
2. Upload the changed files preserving paths.
3. Hard refresh PC and Handheld.

FOCUSED TEST
1. Known order GTIN:
   Handheld shows Item + Ordered / Received / Remaining.
2. Known Master / not in Order:
   Handheld ADD EXTRA & NEXT works; Manual increases.
3. Unknown GTIN:
   red flash; GTIN visible; Needs Review count becomes 1 BEFORE Save.
4. Optional photo:
   capture photo; PC review displays it.
5. Qty:
   change Qty then SAVE & NEXT; exact Qty appears on PC.
6. Link to existing order item:
   Qty receives normally; Manual remains unchanged.
7. Over:
   only changes if total Received exceeds Ordered.
8. Add truly unordered:
   Manual increases.
9. Refresh/sign-out/in:
   pending review survives.
10. Regression:
   one normal scan still synchronizes PC↔PC↔Handheld.

RECAPPED COMMIT SUBJECT
Rebuild handheld needs review

EXTENDED DESCRIPTION
Phase 2C.10.4.9
- Rebuild Needs Review as a fresh V2 subsystem
- Autosave unknown GTIN before worker interaction
- Add optional private product-photo evidence
- Add compact Handheld known/unknown workflows
- Restore Ordered / Received / Remaining to Handheld
- Separate known-not-in-order from unknown-GTIN flows
- Make pharmacist resolution idempotent
- Keep existing-order resolution Normal, not Manual
- Keep Over quantity-derived only
- Preserve verified cloud synchronization and data boundaries
