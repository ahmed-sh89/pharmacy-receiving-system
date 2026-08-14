PharmFlow Phase 2C.8.7

- Login redesigned as balanced two-column desktop layout: brand/logo left, sign-in form right.
- Mobile/tablet falls back to single-column layout.
- Scan Box READY state is charcoal/espresso, not copper.
- Successful scan produces a clearly visible green flash, then returns to READY.
- Failed/unknown scan produces a dark-red flash, then returns to READY.
- Fixed the scanner focus event that was immediately cancelling the success/error flash.
- Last Scan successful item remains green as previously approved.
- Capsule-in-P transparent PharmFlow logo retained.
- No Receiving, GTIN, Multi-PC or cloud business logic changed.
- No SQL required.
