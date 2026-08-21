PHARMFLOW 2C.11.3.8 — RECEIVING PC + EXPIRY GS1/LAYOUT ROOT FIX

Upload/replace all files in this ZIP at matching paths.
No SQL migration.

TEST FIRST:
- exact Expiry Batch + Serial on same medicine on PC and Handheld
- Handheld Expiry screen fit
- PC Receiving first scan => Received 1 / Batch Qty 1
- PC no SCANNED +1 badge
- PC Receiving auto clear after 30 sec
- blue Confirm Correct Total

RECAPPED COMMIT SUBJECT
Fix GS1 and PC receiving batch UX

EXTENDED DESCRIPTION
- Stop false AI17 detection inside Batch/Serial
- Restore compact Handheld Expiry layout
- Restore PC-only legacy Batch Qty UX
- Fix first-scan PC Batch Qty hydration gap
- Add PC Receiving 30s visual Auto Clear
- Restore blue Correct Total confirmation
