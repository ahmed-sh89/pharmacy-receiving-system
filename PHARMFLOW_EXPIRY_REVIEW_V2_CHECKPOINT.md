# Expiry Needs Review V2 — Staging checkpoint

Date: 18 October 2026. Status: READY FOR USER TEST; Product Owner acceptance pending.
Branch: fix/staging-preview-splash-css-path. Base: ce877ddd858ac5c00b98f666a84889cd8331552e.
Database: Staging tovkcakucyagvbzvlnks only. Production was not accessed.
Applied migration: 20261018185307_expiry_review_transactional_resolution_v2.

Implemented Desktop Resolve Now after durable capture; shared Pending Existing Item / Create New Item modes; six canonical Groups; transactional Global-authorized link/create plus existing local Expiry resolution; persistent retry identity; seven Receiving mutation guards. Existing Handheld capture/photo code path retained. Local-only B cannot create Global items. Current roles preserved.

Verification: 140 focused tests passed / 1 skipped; broader 126-case run had 124 pass / 1 historic missing-Git-object failure / 1 skip. Full suite comparison: 831 total / 772 pass / 58 existing baseline failures / 1 skip, no new failure names versus ce877ddd. Production build passed. Live Staging rollback-only fixture verified six Groups, metadata/quantity, retry, B local-only and unauthorized/cross-pharmacy rejection; fixtures rolled back. Desktop rendered candidate ab4c650b reviewed in browser at 1363x936: unknown actions, required fields, name/code search, selected original barcode, creation form, conflict, saving, success, Pending and Inventory. Final focus guard is additionally covered by DOM/capture tests. Handheld-mode controls and photo actions rendered at the available desktop-sized browser viewport; this is not physical TC26/360x640 camera/throughput verification. Final deployment identity belongs in release report.

Known independent issues retained: general pharmacy identifier-management RPCs missing on Staging; not required by the Expiry-specific resolver. One historical Expiry case without resolution audit is preserved, not repaired. Existing unrelated test failures are not green.

Next: Product Owner acceptance on final Staging Preview, including physical Handheld scan/photo and native viewport checks. Never mark DONE before acceptance. Do not promote to Production.

Browser acceptance retained two explicit synthetic Staging cases: PFQA1810X001 -> existing 1011923 (old 06291100080069 preserved), and PFQA1810X002 -> new PF-QA-1810-NEW / Expiry QA Item 20261018 / Medicine. Both RESOLVED, one unit, one inventory event and one audit each. No pre-existing Pending case was resolved or deleted. Concurrent live retries returned the same event ID with no additional audit or quantity. Do not replay these cases.
