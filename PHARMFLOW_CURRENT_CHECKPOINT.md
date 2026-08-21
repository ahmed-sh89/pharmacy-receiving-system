# PHARMFLOW CURRENT CHECKPOINT

Date: 21 August 2026
Version: Phase 2C.11.3.1 — Expiry UX + History Scope + 30s Auto Clear
Status: READY FOR TEST

## VERIFIED / PROTECTED
- Receiving 2C.11.1.9 baseline is USER VERIFIED.
- Unified Workspace, receiving live sync, high-volume quantity behavior and idle/wake recovery remain protected.
- PC Expiry GS1 flow from 2C.11.3.0 was reported working.

## USER-REPORTED 2C.11.3.0 EXPIRY ISSUES
- Handheld CLEAR SCREEN was not practically visible.
- Numeric keyboard appeared automatically after Handheld Expiry scan.
- CAPTURED opened very old history without useful operational scoping.
- Worker area needed a smaller, more professional Handheld layout.
- 30-second Clear Screen behavior had not been implemented as requested.

## 2C.11.3.1 FIXES
### Handheld keyboard
- Expiry Quantity is readonly after scan.
- Numeric keypad can open only after intentional worker tap on Quantity.
- After scan, focus is restored to hardware scanner target instead of Quantity.
- Enter closes keypad and re-locks Quantity.
- GTIN-only then proceeds to Month/Year dropdowns.

### CLEAR SCREEN
- Manual CLEAR SCREEN remains UI-only and is made persistently visible on Handheld.
- After successful Save, a true 30-second inactivity timer runs on PC + Handheld.
- At 30 seconds, saved visual confirmation/status is cleared and scanner returns READY.
- Saved database records are never deleted.
- If a new unsaved item exists or worker is editing, Auto Clear defers instead of destroying work.

### Worker bar
- Handheld uses one compact Worker row: icon + WORKER + selected worker dropdown.
- No second oversized worker strip is required.

### Expiry operational history
- Handheld button is presented as RECENT.
- Default history scope is TODAY + current device class (HANDHELD on Handheld, PC on PC).
- Source tabs: HANDHELD / PC / ALL DEVICES.
- Range tabs: TODAY / 7 DAYS / ALL HISTORY.
- Operational panel shows latest 50 in a selected view.
- Full historical reporting remains the responsibility of Expiry Reports, not the operational Recent drawer.
- Existing expiry data is not deleted or migrated.

## DATABASE
No SQL migration.

## TEST
1. Handheld full GS1 scan: no keyboard must open automatically.
2. Tap Quantity intentionally: numeric keyboard opens; Enter closes it.
3. Handheld CLEAR SCREEN is visible without reload and returns READY.
4. Save an Expiry capture. Do not touch screen for 30 seconds. Saved visual state must clear automatically on PC and Handheld.
5. Start editing a new unsaved item before 30 seconds: Auto Clear must NOT remove it.
6. Open RECENT/CAPTURED: default TODAY + current source.
7. Switch HANDHELD / PC / ALL DEVICES and TODAY / 7 DAYS / ALL HISTORY.
8. Verify old records remain accessible only when explicitly choosing wider history.
9. Quick Receiving regression scan.
