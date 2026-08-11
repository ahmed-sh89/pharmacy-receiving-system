PharmFlow — Phase 2B.4 Zebra Join Flow + Compact Receiving

Implemented:
- One-time safe cleanup of stale Zebra order/session state from prior builds, with recovery backup before cleanup.
- Zebra idle state no longer creates or displays any placeholder Order Number.
- Signing out on Zebra detaches the handheld from the old local/cloud order after confirming there is no pending unsynced queue.
- Zebra starts at Modes; Receiving opens a dedicated Join PC Session screen when no valid session is attached.
- Join screen has a clear back-to-Modes control and Session Number join.
- PC session QR now encodes only the numeric Session Number so Zebra hardware scanning cannot accidentally parse unrelated URL digits.
- Receiving layout is scan-first: Scan box at top, Last Scan immediately below, quantity controls promoted above secondary item details.
- Removed Scans / Qty / Items summary strip from Zebra to save vertical space.
- Search-selected quantity controls and Add Quantity are compacted into one visible block to minimize scrolling.
- Numeric quantity inputs remain numeric-only; manual name/code search remains text-capable.

No new SQL migration is required by Phase 2B.4.
