# PharmFlow Changelog — 2C.10.7.0

- Replaced competing Handheld scan event ownership with one capture-phase runtime shared by Receiving and Expiry.
- Added truthful READY / PROCESSING / BLOCKED state and animated scan beam.
- Added independent server termination watch.
- PC sign-out now ends live shared session before logout.
- Finalize now clears Current Workspace to true No Active Order without requiring Reset.
- Historical deletion now forces Archive/Reports/lifecycle refresh after server-verified delete.
- Preserved Expiry Workers, Global GTIN Master and Returns Archive by design.
