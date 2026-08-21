# PHARMFLOW CHANGELOG — 2C.11.4.1

- Corrected Batch Qty semantics from per-item cumulative local quantity to
  current consecutive item batch.
- Switching items now closes the previous batch.
- Returning to a previously scanned item starts its Batch Qty from 1.
- Shared Received Total remains unchanged and synchronized.
- No SQL migration.
