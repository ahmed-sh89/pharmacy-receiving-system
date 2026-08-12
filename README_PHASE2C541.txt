PharmFlow Phase 2C.5.4.1 — Unified Compact UI

Purpose
- Apply the approved PharmFlow visual system across the application, including Login/Auth.
- Make the PC Dashboard a compact one-screen operator console.
- Preserve all receiving, reports, archive, GTIN, session and cross-device sync logic.

Files to replace
- index.html
- css/dashboard.css
- js/ui.js
- js/app.js
- js/state.js
- js/orders.js

Important
- No SQL.
- app.js/state.js/orders.js are included to preserve the already-tested Phase 2C.5.3.1 Cross-Device Workspace Sync Guard.
- Zebra/Handheld-specific layouts are intentionally not redesigned in this patch; Phase 2C.6 handles Handheld UX separately.

Dashboard changes
- Pharmacy name replaces generic Dashboard title and stays dynamic.
- Removed duplicate Current Receiving strip.
- KPI row moved directly below the top bar.
- Compact Scan panel.
- Last Scan: item name full-width top row; quantity controls at far right; Ordered/Received/Remaining/Status underneath.
- Removed Item Number and GTIN from the visible Last Scan card (logic remains intact).
- Progress compressed to a slim footer card.
- Responsive height rules reduce vertical scroll on normal PC/laptop screens.

Application-wide visual system
- Consistent navy/blue/white palette, borders, cards, spacing and typography.
- Login, registration and password-recovery screens use the same PharmFlow identity.
- Operational tables remain scrollable when their data genuinely exceeds the viewport; content is never clipped merely to force zero scrolling.

Suggested commit
Phase 2C.5.4.1 - apply unified compact PharmFlow UI across app and login
