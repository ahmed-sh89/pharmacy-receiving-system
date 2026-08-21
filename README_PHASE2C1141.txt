PHARMFLOW 2C.11.4.1 — CONSECUTIVE BATCH SEMANTICS FIX

Batch Qty is now the current consecutive item run on the current device.

Example:
Dompy x10 -> Panadol x10 -> Dompy x1
Batch Qty on the final Dompy = 1.

Received remains cumulative/global.

No SQL migration.

RECAPPED COMMIT SUBJECT
Fix consecutive batch quantity
