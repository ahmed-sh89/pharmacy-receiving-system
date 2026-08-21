# PHARMFLOW CHANGELOG — 2C.11.1.9

- Added explicit Handheld acknowledgement that the barcode scan already saved the first physical pack.
- Changed manual Handheld quantity entry to `Add remaining packs`.
- Removed default `1` from additional quantity input to prevent accidental double counting.
- Added transaction deviceType metadata for future friendly device labeling.
- Replaced visible raw receiving device UUIDs with friendly PC/Handheld labels.
- Preserved internal device IDs for synchronization and audit.
- Preserved verified Unified Workspace, burst sync and idle/wake behavior.
- No SQL migration.
