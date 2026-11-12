# Receiving discrepancy email — 13 November 2026

Staging review branch `feature/receiving-email-simple-staging-20261113`. Production baseline `1da5ae0b4d2d9d9141eeb9db6d2206aa139cf4c2`. Revised application candidate `525c9700621045c4f723d0576d0d327a9600a6b6`.

- One table per TO, with a two-line, English, left-to-right header for the order/date and all entered WOs. Use vertical bars between values. Omit the date separator when the date is missing and the WO line when no number was entered. Orderless extras remain separate by receipt date.
- Start with one WO field per TO. Add or remove additional fields, retain leading zeros and update the preview while typing. The values belong to the open email preview.
- Use Arial 14pt bold for the Arabic messages, 13pt bold for TO, 13pt regular for date and WOs, and 12pt for the table. Column labels, Diff and Status use bold. Item details and quantities use regular weight. Ordered, Received and signed Diff stay visible. Status includes the absolute amount in Arabic text, with red shortages and green overages. The Outlook subject still uses up to three distinct TO numbers plus + More.
- Focused email, Preview diagnostic gate and Production artifact checks passed locally. Preview build uses Staging. Product Owner verification still needs a narrow Outlook compose paste from this Preview.
- No migrations, operational writes, backend changes or Production deployment in this task.
