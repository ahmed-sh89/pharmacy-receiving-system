# Receiving report — archived Extra Items and export menu

Staging branch `fix/receiving-archive-extra-menu`. Production baseline `463b9d1881796b4620ada6628e9030981d580cd9`. Application candidate `1bc5be0348f2df7b9cf215d8bf3602d85fcb5b8b`.

- Close the native Email export menu when any action is selected and whenever the app changes route.
- Completed discrepancy archives identify older orderless Extra Items by item code, receipt day and close time. Once all current orders were imported after that completion, exclude matching positive receipts and their linked corrections from the active ledger projection. Receipts lacking archival evidence, active overlapping orders, and later receipts of the same code stay eligible. History and server rows are retained.
- Share the filtered projection across report exports and the Extra Items KPI/management view. Refresh current projections when the existing archive load completes.
- Focused Receiving checks and Staging build passed. Manually verify with an archived orderless receipt followed by a newly imported order, then add a current Extra and filter to one active order. Check Email selection and navigation close the export menu. No database changes.
