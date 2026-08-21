# PHARMFLOW CURRENT CHECKPOINT

Date: 21 August 2026
Version: Phase 2C.11.1.9 — Handheld Scan Acknowledgement + Friendly Device Labels
Status: READY FOR TEST

## USER VERIFIED / DONE BASELINE
- 2C.11.0 Unified Pharmacy Workspace direct Handheld Receiving.
- Known-item PC and Handheld scanning.
- PC↔Handheld live synchronization.
- Rapid quantity / receiving verification reported successful.
- Handheld idle/wake test passed: scanner resumes after inactivity without reload.

## APPROVED HANDHELD QUANTITY UX
For a worker physically holding 10 packs:
1. Worker scans the first pack.
2. That first pack is already committed as +1.
3. UI must explicitly say the first scanned pack was saved.
4. Worker enters only the remaining 9 packs.
5. Current Handheld local batch becomes 10.
6. Compact shared metrics continue to show Ordered / Total Received / Remaining.

## 2C.11.1.9 IMPLEMENTATION
- Added green `SCANNED +1 · PACK SAVED` acknowledgement on normal Handheld Last Scan.
- Handheld manual quantity modal now says `FIRST PACK ALREADY SCANNED`.
- Manual field is `Add remaining packs` and starts blank, not pre-filled with 1.
- Example: physical 10 packs => scan first + type 9 => local batch 10.
- Receiving transactions now store a lightweight deviceType (`PC` / `HANDHELD`) in transaction payload.
- Cloud receiving normalization preserves deviceType.
- PC and Handheld receiving history never expose raw device UUIDs.
- Friendly labels are `Handheld`, `PC`, `This PC`, or `Other Device` for legacy records.
- Existing UUID remains internally available for sync/audit/device isolation.
- No SQL migration.

## TEST
1. Handheld scan one known pack: verify visible `SCANNED +1 · PACK SAVED`.
2. Tap quantity: modal states first pack is already scanned.
3. Enter 9 remaining packs and press Enter.
4. Local Handheld batch must become 10, not 9 or 11.
5. Shared Total Received / Remaining must update correctly.
6. Open Handheld Recent / All Devices: no raw DEV-UUID should be visible.
7. Open PC Receiving activity/history: no raw DEV-UUID should be visible.
8. PC↔Handheld synchronization and idle/wake behavior must remain working.
