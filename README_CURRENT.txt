PharmFlow Phase 2C.9.9 — Strict Handheld Mode Isolation

Fixes:
- Pressing MODE / Modes now fully closes the previous Handheld mode first.
- Mode Selection can no longer appear together with Near Expiry or Receiving.
- Every .appPage is deactivated before Home is shown.
- HOME explicitly hides Expiry, Join Session, Receiving and all PC pages.
- EXPIRY explicitly hides Home, Join and Receiving.
- JOIN explicitly hides Home, Expiry and Receiving.
- RECEIVING explicitly hides Home, Expiry and Join.
- Scroll position resets to the top whenever a Handheld mode changes.

No SQL changes.
No GTIN, Receiving quantity, Session synchronization, Near Expiry capture or reporting logic changed.
