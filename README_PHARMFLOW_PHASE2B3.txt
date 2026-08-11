PharmFlow — Phase 2B.3 Cleanup

Implemented:
- Removed the Dashboard quick-actions strip above Scan GS1 / Barcode.
- Zebra/Android now uses a dedicated two-mode shell instead of the desktop sidebar.
- Zebra modes are Receiving and Expiry only.
- Legacy/local Zebra workspaces are backed up to a local recovery key and cleared instead of reopening automatically.
- Restored cloud Zebra sessions are validated against Supabase when online; terminal/closed-session errors clear the disposable Zebra workspace. Temporary network failures preserve local data.
- Zebra Receiving joins the PC session by Session Number/QR URL and shows a scan-first interface only.
- Removed Zebra offline Export button from the scan header.
- Quantity controls use numeric input mode. Search remains normal text input. Barcode scan remains hardware-scan-first.
- Expiry mode navigation shell is present; the full Expiry data capture/report workflow remains for the dedicated Expiry implementation phase.

No new SQL migration is required by Phase 2B.3.
