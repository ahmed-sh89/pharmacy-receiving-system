# B10 Clean17 — Startup Authority & Dirty Save
Status: PLANNED — requires USER VERIFICATION.

Root cause: startup auth event, application startup, adaptive scheduler, and foreground lifecycle could independently request the same Supabase authorities. Local 5-second autosave also emitted workspace:saved and could create unchanged cloud snapshot writes.

Fix: one startup authority flight, scheduler/foreground gating, and signature-based dirty-only compatibility workspace saves. Clean16 adaptive polling is retained.
