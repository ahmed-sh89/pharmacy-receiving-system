B10 Clean15.3 — Handheld Receiving Rebuild

Scope: Handheld Receiving only. No PC layout, PC receiving workflow, SQL, Supabase schema, or Project A behavior changed.

Root fixes
- Preserves active Handheld Receiving/Expiry mode across background auth resume; token refresh can no longer route an active worker back to Home.
- Active Order readiness now derives from hydrated workspace authority, eliminating contradictory "2 Active Orders" + "No Active Order" states caused by an unchanged-manifest return flag.
- Clearing/disappearance of Last Scan ends only the local worker batch; saved receiving data/history is untouched. The next scan of the same item starts at 1.

Handheld UI rebuild
- Removed redundant Receive Order label and compacted the workspace header.
- Rebuilt Scan/Search with cool background, barcode icon at far left, green bar immediately before input text, and full-width green success feedback.
- Rebuilt Last Scan as a compact readable card with subtle colored field backgrounds.
- Moved CLEAR to the far right of the LAST SCAN heading; CLEAR remains data-safe.
- Simplified labels to Ordered / Received / Remaining.

Cleanup
- Removed obsolete/duplicate Handheld CSS blocks for the same Scan/Last Scan/Clear controls before installing one canonical Handheld-only presentation block.
- All new presentation selectors are body.zebraDevice.zebraReceivingActive scoped.

Acceptance test
1. Hard refresh Handheld.
2. Confirm CONNECTED · N ACTIVE ORDERS and no false No Active Order toast.
3. Perform 30–50 rapid scans without leaving Receiving.
4. Confirm PC receives quantities normally.
5. Clear/allow Last Scan to disappear, then scan same item: local Batch Qty must start at 1 while Received total remains cumulative.
6. Confirm PC UI/layout unchanged.
