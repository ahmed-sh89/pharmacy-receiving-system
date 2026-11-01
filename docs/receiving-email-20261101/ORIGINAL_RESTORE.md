# Original email restoration — 1 November 2026

READY FOR OWNER TEST. Reuses feature/receiving-email-staging-20261101; no Production release/preparation authorized. Production baseline 5b963d82501a317790f5ece8e5552b4a09a5886e protected. All preceding redesign evidence is historical/rejected, including 9fd0edd.

## Reference and focused cause

Approved original visual reference: IMG_B2578F36-CA3C-4B42-942B-2E13E4B3DC37.jpeg, inspected together with original js/orders.js at the verified Production baseline. The second photograph confirms normal Paste, not Paste as plain text; no Outlook format-settings investigation repeated.

Source inspection confirms one loaded Copy Email handler; no Copy Text action in this dialog. Rich success writes text/html plus text/plain. The rejected source uses hybrid inline-block layouts and a different five-field/two-row-card design, so the actual copied source itself differs from the approved original. Original source also uses CSS-only backgrounds, section/div layout, inherited styles, percentage fixed columns and overflow-wrap:anywhere, with no HTML bgcolor/align/font redundancy. These are confirmed source dependencies and width defects, not proof of exactly which rule the authenticated corporate Outlook sanitizer removes. Rich MIME alone does not establish visual fidelity. No claim is made that Outlook converted a successful rich copy to plain text.

## Minimal replacement

- Restore original blue letter/background palette, Arabic introduction and closing, Arial typography/hierarchy, centered content, blue summary and per-order section bars. Original six-field table is reinstated: Code | Item Name | Ordered | Received | Diff | Status. A single header row per order; six cells per item. No code-under-name, combined Diff/Status or stacked detail redesign.
- Replace old Order Number/Order Date/Discrepant Items summary with ONE compact horizontal row of nonzero aggregate KPIs beneath the original summary bar. 17px bold numbers + 12px labels, subtle borders/tints; no card grid/second KPI row. Distinct normalized codes counted once per category across orders; same code can legitimately be discrepant in separate categories on different orders. Orders counts distinct affected order identifiers. Existing authoritative per-order quantities, rows and reconciliation unchanged.
- Dates use each order's date (matching report metadata fallback), formatted D Mon YYYY, alongside the complete order identifier in its blue header; no current-date invention. Subject convention unchanged.
- Small Diff badges: amber Partial, red Not Received, teal Over, purple Extra; signed quantities and explicit separate status text retained.
- Standard table-based email HTML with explicit inline styles and redundant bgcolor, align, bordercolor, font-face/color and b markup. No external CSS or display:inline-block essential to email layout. The exact clipboard HTML document is also used by the sandbox iframe preview, avoiding a separate source/preview formatting context.
- Remove hidden editable DOM, selection manipulation and execCommand compatibility path completely. Copy uses one ClipboardItem with HTML + meaningful six-field plain text, then warns explicitly if only plain-text copying is available. No undocumented CF_HTML offsets or hidden clipboard workaround.
- Replace Gmail-specific generator/action/wording with Open Outlook Web: safe new-tab HTTPS Microsoft 365 compose link, noopener/noreferrer, encoded recipient and short subject, no personal account hint, body/HTML parameter, desktop protocol or send action. It does not overwrite the clipboard. Copy Email remains a separate action. Corporate SSO/tenant may land at sign-in or mailbox rather than Compose; route behavior in the real tenant is pending acceptance.

Microsoft primary route reference (checked 1 Nov): https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/registeredprotocolhandlers documents https://outlook.office.com/mail/deeplink/compose?to=... for Exchange Online. This is route support evidence, not proof of this tenant's authenticated Compose or subject persistence.

## Narrow-pane tradeoff

Six readable columns cannot all fit in a genuinely narrow pane. The detail table has a 560px minimum and a bounded horizontal-scroll wrapper, keeping names readable, headers unbroken, six-column structure intact and font size fixed. Names wrap at word boundaries, with last-resort token wrapping within the name cell. Column widths are fixed in pixels, rather than compressing percentages below safe widths. KPI table stays a single row with a 74px minimum per visible category; five indicators may also require horizontal scrolling below 370px of available content. Labels can wrap at spaces inside the same row.

The original letter colors/hierarchy remain; outer gutters are reduced to preserve usable pane width. This is a deliberate scrolling tradeoff, not a claim that six columns fit without scrolling or that every Outlook tenant preserves overflow-x/min-width. If corporate Outlook strips the scroll/minimum-width rules, its remaining layout must be evaluated by the Product Owner; no unverified alternate design is substituted.

## Technical checks / acceptance

30 focused tests PASS (16 email/preview/URL/clipboard/model, 12 existing Receiving multi-order, 2 report scope/performance; final added link test checked with the same email suite). Default and exact-branch Staging builds PASS, existing classic-script warnings unchanged. No database/schema/RPC/data changes, Receiving calculation changes, Expiry changes or Production deployment.

Browser results and deployment are in ORIGINAL_BROWSER_QA.md when complete. Actual corporate Outlook Compose Ctrl+V, saved draft reopened, Reading Pane and full-width rendering remain PENDING, not PASS.

Minimum manual test: use exact final Staging Preview, open an existing or synthetic report, Copy Email, Open Outlook Web, then normal Ctrl+V into the body. Check one/multiple orders, date per header, one compact KPI row/zero suppression, six columns, signed colored Diff and statuses. Save/close/reopen draft; inspect a manually sent self-test in narrow Reading Pane and expanded view. Scroll the detail region horizontally at narrow widths; report if Outlook removes this behavior. The application sends nothing. Owner acceptance required; no Production promotion.
