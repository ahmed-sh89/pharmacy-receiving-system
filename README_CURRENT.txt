PharmFlow Phase 2C.10.2.5 — Atomic Cross-PC Workspace Reset

IMPORTANT DEPLOYMENT
Your live site was still on 2C.10.2.3 when this build was prepared.
Therefore run ONLY:
PHASE2C1025_DEPLOY_FROM_2C1023.sql

That SQL includes BOTH:
- the 2C.10.2.4 complete single-order archive delete cascade, and
- the new 2C.10.2.5 atomic reset generation protection.

Then upload this full project. Do not upload 2C.10.2.4 separately.

RESET FIX
- Reset Current Workspace is now ONE server-side atomic operation.
- It increments a pharmacy workspace generation, removes unfinished order/source rows,
  and clears the shared cloud workspace in the same server transaction.
- A PC holding an older generation is blocked from saving that stale order back.
- Every visible PC checks the server generation repeatedly and on browser focus.
- When PC2 resets, PC1 automatically clears its stale Current Order after generation detection.
- Pending local cloud snapshot timers are cancelled on reset.
- Pending transaction queue is cleared on reset.
- Local reset only happens AFTER server reset succeeds.
- Hard cloud reset timeout: 12 seconds.
- Live session close cannot block Reset for more than ~6.5 seconds.
- Lifecycle, Archive and Global Master refresh are background maintenance and no longer
  keep the loading screen open for a minute.

ALSO INCLUDED FROM 2C.10.2.4
- Complete Archive single-order deletion.
- Deleted order removed from Item Transfer source and lifecycle registry.
- Device ID hidden from Handheld & Sessions user interface.
- Email Differences available before Finalize.

Global GTIN Master and finalized unrelated history are not touched by Current Workspace Reset.
