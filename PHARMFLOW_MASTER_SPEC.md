# PHARMFLOW MASTER SPEC — EXPIRY CURRENT OVERRIDE

Updated: 21 August 2026

## Handheld Expiry Capture
- Handheld-first.
- Worker selection is pharmacy configuration and remembered per device.
- Medicine GS1/QR/2D: parse available GTIN, Batch/Lot, Expiry and Serial automatically.
- When encoded expiry exists, worker enters Quantity only then Save.
- GTIN-only: worker enters Quantity and selects Expiry Month and Year from dropdowns.
- Month dropdown is 1–12 with Jan–Dec labels; Year is dropdown to minimize typing errors.
- Do not summon numeric keyboard automatically after scan.
- Actual Serial is retained/displayed when encoded.
- Manual CLEAR SCREEN is visual only and never deletes saved capture data.
- Saved confirmation may auto-clear after a short inactivity period; unsaved active input must never be auto-cleared.
- Shared Handheld idle/wake scanner recovery applies to Expiry.
- Future Expiry Report: filter selected month(s), category, worker. Medicine shows Item Name, Expiry, Qty, Batch, Serial when available. Cosmetics/accessories show captured fields such as Qty + Expiry.
