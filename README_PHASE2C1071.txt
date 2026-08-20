PHARMFLOW 2C.10.7.1 — HANDHELD ORDER CONTEXT + FOCUS ROOT FIX

Upload/replace ALL files in this ZIP at their matching paths.
No SQL migration.

Production files changed in this phase:
- index.html
- js/handheld-runtime.js
- js/receiving.js

RECAPPED COMMIT SUBJECT
Fix handheld order context

EXTENDED DESCRIPTION
- Treat authenticated live-session item rows as current-order context when legacy session transport lacks local orderNumbers metadata
- Keep known order items out of Manual/Over Stock classification
- Stop scanner auto-focus while worker edits Quantity/date/photo/action fields
- Show live ITEMS/ORDERS context in Handheld READY state
- Preserve PC search #24 and existing data boundaries
- No SQL migration
