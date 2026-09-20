B10 Clean19 — Canonical Sync Owner / Mobile Deployment Path Fix

Root cause confirmed:
- The repository index loads js/cloud-workspace.js.
- Previous mobile GitHub uploads flattened changed JS files into repository root.
- Therefore the browser continued loading the old js/cloud-workspace.js containing the legacy 1s receiving loop and 3s authority loop.
- This exactly matches Supabase logs after Clean16/17/18.

This package intentionally contains cloud-workspace.js at repository ROOT and index.html points to that root file.
This makes the deployed runtime use the canonical adaptive sync owner when uploading from iPhone GitHub web UI.

No Auth, quantity, UI, SQL, or schema changes.
