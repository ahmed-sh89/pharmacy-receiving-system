PHARMFLOW PHASE 2C.5.1
1) Run PHASE2C51_DELETE_SINGLE_ORDER.sql in Supabase.
2) Replace index.html, css/dashboard.css, js/reports.js, js/ui.js, js/session.js, js/orders.js.
3) Commit: Phase 2C.5.1 - fix received orders and redesign reports archive
4) Hard refresh and sign in.

Changes: received-order table replaces empty dropdown; registry refresh updates report list; real uploaded Order Number shown in header/archive; Archive supports protected per-order deletion; Item Transfer remains original-upload source only.
