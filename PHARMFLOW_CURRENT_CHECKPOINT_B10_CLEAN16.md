# PharmFlow Current Checkpoint — B10 Clean16
Date: 2026-09-03
Target: Project B / pharmflow-dev only
Status: IMPLEMENTED — requires user verification

Root fix: latest Project B source had regressed from adaptive Clean15 scheduling to fixed 1s/3s cloud read loops. Clean16 restores one adaptive scheduler and de-duplicates overlapping mobile foreground events. No Auth/SQL/Receiving quantity/Handheld behavior changes.
