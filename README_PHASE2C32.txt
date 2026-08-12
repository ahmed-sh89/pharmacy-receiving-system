PHARMFLOW — PHASE 2C.3.2
Discrepancy Filter + Visible Export

Replace these files in GitHub:
- index.html
- js/ui.js
- js/reports.js
- css/dashboard.css

No SQL is required.

Behavior:
- Multi-select discrepancy filter: Not Received, Partial Shortage, Over Received, Manual/Unordered Extra.
- Category filter combines with discrepancy selection.
- Receiving table shows the selected discrepancy rows live.
- Displayed Items count shows the exact current result set.
- Excel/PDF export exactly the rows currently displayed.
- Export header uses metadata from every uploaded order currently loaded: Order Number, Order Date, From Warehouse, To Warehouse, Source File.
- Excel starts with order metadata and then the data table; no generic report-title/summary cover section.
- PDF starts with compact uploaded-order metadata and then the discrepancy table; no summary cover page.
