# Final focused Receiving email refinement — 2 November 2026

READY FOR OWNER VISUAL ACCEPTANCE. Existing branch feature/receiving-email-staging-20261101, based on 218e2bdbb50b611448cf6c7590e9bfd48bb207ff. No Production promotion authorized.

Owner reports that normal Copy Email -> Ctrl+V in corporate Outlook Web largely preserves rich formatting. This progress is retained; this is not blanket acceptance of the new badge/layout refinements.

## Approved semantic change (supersedes prior item-count KPI decisions)

Orders remains a distinct affected-order count, unsigned. Every other email KPI now sums UNIT magnitudes across all relevant canonical per-order discrepancy rows: Partial = ordered minus received where 0 < received < ordered; Not Received = ordered units where received is zero; Over = received minus ordered; Extra = extra received units under the existing classification. Display minus signs for Partial/Not Received and plus signs for Over/Extra. The same code on two orders contributes both orders' units. Groups are authoritative; duplicate parallel report.rows are never also counted. Existing exclusive classification keeps Extra out of Over. No ledger, allocation, transaction, reconciliation, report/export or database calculation changes.

## Presentation refinement, not a new design

- Preserve the existing original blue letter, Arabic introduction/closing wording, 20px/41px bold intro and 18px/32px bold closing, alignment, section headers, six detail fields, per-order dates and short subjects.
- Equal fixed 124px-wide / 84px declared-height white KPI cards; one real outer table row at natural width (132px slot/card including spacing). Two cards stay centered as a compact pair rather than stretching. Three and five retain the same dimensions. Neutral card background/border, rounded corners only as nonessential decoration. Only the compact number badge is solid-colored; white bold 22px number, 14px label below. Palette: Orders #176CA1, Partial #BF8525, Not Received #C44949, Over #248568, Extra #7759A6. HTML attributes and inline styles, no grid/flex/external stylesheet dependency.
- Item names remain normal weight, now 14px. Row padding 6px; numerical values consistently bold, status 13px normal and matching its classification color. Stronger visible Diff backgrounds: amber #ffdf9e, red #f7c3c3, green #bde8d7, purple #d9ccef. Individual Diff values unchanged.
- Six-column minimum increases from 560px to 640px to give names adequate width: the exact realistic Johnson name is intended to occupy one/two lines. Long genuine names wrap without truncation. Narrow panes retain bounded horizontal scrolling; KPI row never wraps and can scroll below its natural width (264/396/660px for 2/3/5 cards, subject to email-client normalization).
- The single authoritative HTML renderer, exact preview/clipboard document equality, supported Clipboard API HTML/plain pathway and Open Outlook Web action remain. No hidden content, native-copy fallback, scripts/tracking inside email or automatic sending added. No global CSS patches or parallel templates.

## Default acceptance data (fixture only)

TO-000532501 | 29 Oct 2026: 1010120, Johnson Anti Bacterial B.Wash Sea Salt 250 Ml 31233-5876, 3 ordered / 4 received, +1 Over.

TO-000532448 | 30 Oct 2026: 1014553 Zimax 250 MG 6 Cap 30/29 (-1 Partial); 1013953 Reparil 40 Tab 40/39 (-1 Partial); 1014085 Sartan 50 Mg 30 Tab 7/8 (+1 Over).

Expected: 2 Orders, -2 Partial Shortage, +2 Over Received only. Separate selector cases: two indicators, five indicators, larger units (2 Orders, -240 Partial, -412 Not Received, +2500 Over, +75 Extra), long realistic name, Unassigned Extra and zero suppression. No real order or either database modified.

## Verification

34 focused tests PASS (20 email/model/fixture/HTML/clipboard/action; 12 Receiving multi-order regressions; 2 report scope/performance). Default and exact-branch Staging builds PASS. Final sizing checks/builds and browser measurements are in BROWSER_QA.md when completed.

Pending: actual refined Outlook New Mail Ctrl+V, draft save/reopen, narrow Reading Pane and expanded view. Do not infer Outlook PASS from browser/HTML/unit checks. Preserve the owner's existing partial rich-copy confirmation, then ask for visual acceptance of this refinement only. No auth/settings investigation repeated.
