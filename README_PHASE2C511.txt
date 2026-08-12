PharmFlow Phase 2C.5.1.1 - Stability Recovery

Purpose:
Restore the last known stable front-end files after Phase 2C.5.1 caused navigation/startup regression.

Replace ONLY:
- index.html
- css/dashboard.css
- js/reports.js
- js/ui.js
- js/session.js
- js/orders.js

Do NOT run or rollback SQL. The Phase 2C.5.1 SQL is additive and can remain in Supabase.
This patch does not delete or change Global GTIN, orders, archives, or Supabase data.

After upload:
1. Commit changes.
2. Wait for GitHub Pages deployment.
3. Ctrl+Shift+R.
4. Sign in.
5. Test sidebar navigation: Dashboard, Receiving, Reports, Archive, Settings.
