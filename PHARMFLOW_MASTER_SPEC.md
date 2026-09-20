# PharmFlow Master Spec Addendum — B10 Clean17

Cloud synchronization must use a single startup authority flight. Periodic and lifecycle reads wait for that flight. Local autosave may persist locally at its existing cadence but must not trigger an unchanged Supabase cloud-workspace write. Clean16 adaptive read cadence remains the baseline.
