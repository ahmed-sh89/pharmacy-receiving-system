# Expiry Needs Review V2 — Staging checkpoint

Date: 18 October 2026. Status: IN VERIFICATION; Product Owner acceptance pending.
Branch: fix/staging-preview-splash-css-path. Base: ce877ddd858ac5c00b98f666a84889cd8331552e.
Database: Staging tovkcakucyagvbzvlnks only. Production was not accessed.
Applied migration: 20261018185307_expiry_review_transactional_resolution_v2.

Implemented Desktop Resolve Now after durable capture; shared Pending Existing Item / Create New Item modes; six canonical Groups; transactional Global-authorized link/create plus existing local Expiry resolution; persistent retry identity; seven Receiving mutation guards. Existing Handheld capture/photo code path retained. Local-only B cannot create Global items. Current roles preserved.

Verification: 31 focused new/capture tests passed; broader 126-case run had 124 pass / 1 historic missing-Git-object failure / 1 skip. Full suite comparison: 816 total / 757 pass / 58 existing baseline failures / 1 skip, no new failure names versus ce877ddd. Production build passed. Live Staging rollback-only fixture verified six Groups, metadata/quantity, retry, B local-only and unauthorized/cross-pharmacy rejection; fixtures rolled back. Browser visual verification and final Preview identity must be recorded in the release report; no physical Handheld verification claim.

Known independent issues retained: general pharmacy identifier-management RPCs missing on Staging; not required by the Expiry-specific resolver. One historical Expiry case without resolution audit is preserved, not repaired. Existing unrelated test failures are not green.

Next: verify rendered Desktop workflow and unchanged Handheld presentation, publish only this Staging branch, verify Preview SHA, then Product Owner acceptance. Never mark DONE before acceptance. Do not promote to Production.
