# Receiving discrepancy email — 13 November 2026

Staging review branch `feature/receiving-email-simple-staging-20261113`. Production baseline `1da5ae0b4d2d9d9141eeb9db6d2206aa139cf4c2`. Revised application candidate `41f9b63f45ba4e7132f621d79bba3b54d7f996ef`.

- One table per TO, with a two-line header for the order/date and all entered WOs. Omit the date separator when the date is missing and the WO line when no number was entered. Orderless extras remain separate by receipt date.
- Start with one WO field per TO. Add or remove additional fields, retain leading zeros and update the preview while typing. The values belong to the open email preview.
- Use Arial 14pt in the copied email. Ordered, Received and signed Diff stay visible. Status includes the absolute amount in Arabic text, with red shortages and green overages. The Outlook subject still uses up to three distinct TO numbers plus + More.
- Focused email, Preview diagnostic gate and Production artifact checks passed locally. Preview build uses Staging. Product Owner verification still needs a narrow Outlook compose paste from this Preview.
- No migrations, operational writes, backend changes or Production deployment in this task.
