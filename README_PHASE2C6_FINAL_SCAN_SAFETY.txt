PHARMFLOW PHASE 2C.6 - FINAL CONSOLIDATED + KPI DRILLDOWN + FAST SCAN SAFETY

Includes all previously consolidated Phase 2C.6 changes plus:
1) Every Dashboard KPI card is clickable and opens its contents.
2) Total Scans opens recent local scanner activity with one-tap Undo per scan.
3) Last Scan gets a one-tap Undo Last Scan control.
4) Normal scanning remains instant: no confirmation dialog is added to successful scans.
5) If a scan pushes an item into Over Received, a stronger warning toast is shown with Undo guidance.
6) Undo creates a negative audit transaction; it does not silently delete history.

SQL:
- PHASE2C61_SAFE_GTIN_LEARNING.sql is the only SQL in this package and is the same prerequisite for Safe GTIN Learning.

Recommended commit:
Phase 2C.6 final - add KPI drilldown and one-tap scan correction
