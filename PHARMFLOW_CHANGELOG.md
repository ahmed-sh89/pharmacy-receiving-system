# PHARMFLOW CHANGELOG — 2C.11.0

- Introduced Unified Pharmacy Workspace for Handheld Receiving.
- Removed user-facing dependency on Create/Join Session and QR pairing.
- Handheld now hydrates Active Orders directly from pharmacy-scoped Active Order Manifest.
- READY state now reflects actual synchronized Active Order data.
- Retained existing shared receiving ledger for PC/Handheld transaction synchronization.
- Hid legacy Session UI during verification; code remains dormant for safe rollback until user verification.
- Updated project specification and decision register with approved Item Movement, Expiry, Needs Review and UI simplification direction.
- No SQL migration.
