# Outlook header/status correction — 2 November 2026

Baseline: 757285cf7d051c21d9fcb28b8d211fc2f69fc059. Same isolated feature/receiving-email-staging-20261101 branch; Staging only.

## Responsible boundary and evidence

The authoritative HTML renderer in js/orders.js feeds both preview and buildReceivingEmailClipboardHTML. copyFormattedReceivingEmail passes that document unchanged to the standard ClipboardItem text/html Blob alongside text/plain. Baseline inspection shows explicit white already present on all blue-header text elements; no conflicting black source foreground or application-side clipboard transformation was found. Consequently the prior inheritance-only diagnosis does not establish the corporate Outlook cause. Owner reports black after Outlook paste, but manually applying white survives. Without authenticated Outlook access, its precise normalization rule cannot be proved here.

Remove the remaining legacy font/b hierarchy from blue headers in the shared renderer. Each header now uses a directly styled span with explicit white, Arial, unchanged 15/16px size, 22px line height and weight700. The nested LTR order/date span retains explicit white. Original blue cells/backgrounds/padding unchanged. No clipboard-specific rendering, active content, CSS overrides or alternate copy path added. This removes the legacy markup normalization dependency; real Outlook acceptance remains pending, not a claimed verified fix.

Status now has 124px allocation (was100), with Code/Ordered/Received/Diff each reduced4px; Item Name absorbs the remaining8px at the same table width. Names are intact and naturally wrap. Status uses existing category ink on font and its actual text span, explicit weight600 and unchanged13px size; nowrap fits standard labels at the existing640px table minimum. Existing narrow horizontal-scroll fallback retained; it does not squeeze text into the pane. Row backgrounds and Diff badges unchanged.

## Verification

23 focused email tests PASS. Default and preview builds PASS. Tests include actual ClipboardItem MIME/content, authoritative-renderer equality, white direct header spans without legacy font/b wrappers, all status category colors/600 weight, six-column allocation and existing fixtures/data behavior. Source comparison proves KPI HTML/model, Arabic intro/closing and rich-copy pipeline unchanged from baseline. Current realistic two-order fixture reused without edits. Deployed-browser clipboard readback/layout is checked separately during delivery where available; neither build/tests nor Chrome rendering establish Outlook PASS.

Owner acceptance required: open the realistic two-order Staging fixture, Copy Email -> normal Ctrl+V in corporate Outlook Web -> save draft -> reopen. Confirm summary/order text white on unchanged blue backgrounds; status single-line where practical, colored and semi-bold; no overlap at narrow/full width; six columns, KPI, dates, Arabic and Diff badges preserved. Also inspect all-five fixture for Not Received/Extra colors. No automatic sending. No Production/main/DB/Receiving/Expiry change or release authorized.
