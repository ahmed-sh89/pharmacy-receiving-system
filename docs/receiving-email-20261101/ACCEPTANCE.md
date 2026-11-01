# Receiving discrepancy email — 1 November 2026

Status: READY FOR TEST; corporate Outlook acceptance pending.
Baseline: main 5b963d82501a317790f5ece8e5552b4a09a5886e.
Branch: feature/receiving-email-staging-20261101. Staging only.

## Change and scope

Email presentation and subject in js/orders.js. Canonical report orderGroups/rows remain the source; no Receiving ledger, reconciliation, selected-scope, archive, database, Auth, Expiry or report export changes. No automatic email sending. No migrations or Production deployment.

The original fixed six-column table and large nested padding compressed content. The replacement uses inline hybrid tables: Code + Name stay on one row; Ordered, Received and Diff + Status flow below them when space is insufficient. Full width uses both groups on the same row. Labels repeat in small type per item so stacked details remain unambiguous; values are 13px and status 12px. No media-query, flex/grid or style-block dependency; no hidden duplicate content. Outer padding is 8px. Very long unbroken name tokens can break within a word as a last resort; ordinary names wrap at spaces. Minimum tested target is 320px, not arbitrary sub-250px panes.

Orders counts distinct identified orders containing discrepancies. Other KPIs count canonical per-order item rows, never units. An item discrepant in two orders counts twice, once in each order. Each row belongs to exactly one category; Extra precedes Over. No completed rows and no zero KPIs. Unassigned can only appear when already supplied by the authoritative report; this presentation change does not expand report reconciliation scope.

The preview uses a script-disabled sandbox iframe to isolate the exported markup from app-wide !important typography rules. Rich clipboard writes HTML + plain text; unsupported/rejected rich writes attempt plain text fallback.

Subject: one/two affected order identifiers, or first identifier + remaining count and latest affected ISO order date (DD-MM). generatedAt is a fallback when order dates are missing. No current-date invention.

vite.config.js reuses the established branch-specific Preview binding: only this exact branch plus VERCEL_ENV=preview enables Staging. Production configuration and main Vercel automatic-deployment block are preserved. The synthetic acceptance page is emitted only for this Preview. Exclude Staging binding/page from any eventual Production promotion.

## Completed technical checks

- 21 focused tests PASS: 7 email model/HTML/subject/clipboard tests, 12 Receiving multi-order regression tests, 2 report scope/performance tests.
- Default build PASS and exact-branch Staging build PASS (existing classic-script bundling warnings).
- Built index/runtime files contain no Production project reference; version.json declares Staging ref tovkcakucyagvbzvlnks.
- No real corporate Outlook session was available; no compose, Reading Pane or full-width Outlook PASS claimed.
- Browser clipboard/rendering verification is recorded in BROWSER_QA.md when completed. Browser renderer checks do not establish Outlook sanitizer compatibility.

## Minimum Product Owner acceptance

1. Open /staging/receiving-email-acceptance.html on the exact Preview. Select 1 order/all categories. Copy Email, then Ctrl+V in corporate Outlook Web compose; Copy Subject separately. Confirm formatted content (not HTML source), Arabic, Code beside Name, signed differences and four statuses.
2. Manually send only to your own test mailbox if needed. At normal zoom, open in the narrow split Reading Pane, then expanded/full-width. Check no overlap/vertical letters and full width expands. This is a Product Owner action; the application sends nothing.
3. Repeat with 2 orders and 5 orders; confirm separate order/date headers, subject and Orders KPI. Choose Partial only: Orders + Partial Shortage only, no zero KPIs.
4. In normal Staging app, use an existing report's Copy Email and repeat the same visual check; preserve report scope and quantities. Do not finalize any operational Production order.
5. Report visual PASS or the failing view/screenshot. Stop before Production release until explicit acceptance and separate release approval.
