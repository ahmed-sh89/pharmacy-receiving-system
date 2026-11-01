# Email repair after Product Owner rejection — 1 November 2026

Status: READY FOR TEST, NOT OWNER ACCEPTED. Supersedes the d378b24 design; prior BROWSER_QA.md/screenshots describe the rejected design, not current acceptance.
Branch: feature/receiving-email-staging-20261101. Production baseline 5b963d82501a317790f5ece8e5552b4a09a5886e; unchanged.

## Focused diagnosis

The supplied screenshots show partial rich formatting (blue order banner retained), not proof of a plain-text-only paste. Prior layout relied on inline-table CSS, inherited type styles, small repeated labels and weak KPI emphasis. Essential presentation had no redundant HTML bgcolor/align/font attributes. There is also a confirmed failure path: rejected Async Clipboard writes fell directly to plain text with a success toast, and ClipboardItem constructor errors escaped that fallback. The exact corporate Outlook sanitizer/clipboard cause cannot be proven without its authenticated compose/draft session.

## Repair

- One centered aggregate KPI section. Balanced regular table rows (5 = 3+2, 4 = 2+2). 28px bold values, 13px bold labels, blue/red/purple/teal colors; HTML bgcolor/bordercolor/align/font attributes duplicate explicit inline colors/alignment/fonts. No beige/brown.
- Each KPI counts distinct normalized Item Codes within its own category across affected orders, not units or repeated rows. The same code in different discrepancy categories can legitimately appear once in each category; no arbitrary cross-order status priority. Details and signed quantities retain their authoritative per-order boundaries. Extra is exclusive from Over on each row. Missing item codes retain separate row identities.
- All content cells and labels explicitly centered. Order number/date one header. Separate Code + Name stay on the same row; two fluid blocks allow quantities to flow below at genuinely narrow widths. Ordinary name wrapping at spaces, last-resort wrapping for pathological unbroken tokens. Readable 14px details, bold names/codes/quantities, 16px signed differences and distinct status backgrounds.
- Same renderer in actual application sandbox iframe preview and clipboard. HTML document has charset and StartFragment/EndFragment comments; no hand-written Windows CF_HTML offsets, scripts, tracking or external content.
- Existing Copy Email first attempts a synchronous native copy event during its click: explicitly writes text/html + text/plain and requires both successful command and handled event. Restores focus/selection and removes transient DOM/listener even after failure. Then Async Clipboard rich fallback, then explicitly warned plain-only fallback. No silent claim of rich copy on failure, including Gmail copy notification.
- No Receiving business/reconciliation, database, migration, operational-data, Auth, Expiry or Production changes. Existing exact-branch Staging binding unchanged.

## Technical validation

26 focused tests PASS: 12 email/preview/copy/model checks, 12 multi-order regression checks, 2 report scope/performance checks. Default build and exact Staging build PASS (existing classic-script warnings). A degradation test removes all inline CSS and confirms essential bgcolor/font/bold/align/border attributes remain; this is not an Outlook sanitizer simulation or Outlook PASS.

Browser verification and final deployment are recorded in REPAIR_BROWSER_QA.md when complete. Corporate Outlook authenticated access unavailable: Compose Ctrl+V, saved draft reopened, narrow Reading Pane and expanded Outlook remain PENDING OWNER ACCEPTANCE.

## Minimal manual Outlook acceptance

Use the exact final Preview /staging/receiving-email-acceptance.html. Open PharmFlow preview, then use its existing Copy Email button and paste normally with Ctrl+V into corporate Outlook Web (HTML compose, not paste-as-plain-text). Check centered intro/closing, colored KPI cards and bold values, code beside name and signed/status values. Save the draft, close and reopen it. Then check a manually sent self-test in narrow Reading Pane and expanded view; the app never sends anything.

Select one/two/five orders; 1 KPI only (Unassigned Extra), Partial only (zero KPIs hidden), Several KPIs and All categories. Confirm correct subject, one aggregate summary, no overlap or vertical letter splitting. If the app warns that only plain text was copied, rich copying failed; do not treat that result as accepted. Report visual PASS or the failing view screenshot. No Production preparation/promotion authorized.
