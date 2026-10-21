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

## Focused acceptance correction — 18 October 2026

Baseline: 05d9b780234f541f4f351a9490149d6f7c8b2fba. Product Owner verified Create New Item -> successful Expiry Inventory persistence; preserve this accepted scenario.

Applied Staging migration 20261018201931_expiry_identifier_pharmacy_group_metadata adds canonical groupName to the PHARMACY_V2 identifier response. Existing response fields, pharmacy priority, authentication, ACL, owner, volatility and search_path retained. Live authenticated pharmacy/global lookup and Inventory agree on Medicine for existing synthetic records; B -> A lookup denied. Before/after fingerprints of all Global item and Global/pharmacy mapping rows match exactly (10 / 11 / 8 rows). No operational writes or new test data.

Temporary failed Desktop GS1 diagnostic: Copy Diagnostic appears only after parser rejection; captures exact pre-normalized input, escaped representation, controls, normalization and parser reason in memory. Clears after successful copy, dismissal, next input/status, navigation click, hidden document or page exit. No automatic transmission, database/storage/analytics writes, or successful-scan display. Activated file emitted only for the approved Vercel Preview branch, additionally gated by Staging host/project; inactive source has no source-HTML reference. Production build excludes the activated asset. GS1 parser, Receiving, Handheld runtime and business rules unchanged. Physical package cause remains UNKNOWN pending one copied diagnostic; AI21 is optional.

Verification: 216 focused tests passed, with the historic missing-09640864 test explicitly excluded. An earlier broader comparison had 13 identical baseline failures and no new failure names. Production and Staging builds pass; artifact inclusion/exclusion checked. Source/DOM/style checks completed. Actual authenticated browser visual review was blocked by sign-in; offline fixture preview was unavailable in the cloud browser. Do not claim browser visual acceptance. No Production access or modifications. Final deployment SHA/URL belong in the release report. Status: READY FOR USER TEST; GS1 defect is NOT marked resolved.
