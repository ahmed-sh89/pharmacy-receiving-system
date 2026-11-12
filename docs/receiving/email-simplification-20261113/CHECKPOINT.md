# Receiving discrepancy email — 13 November 2026

Staging review branch `feature/receiving-email-simple-staging-20261113`. Production baseline `1da5ae0b4d2d9d9141eeb9db6d2206aa139cf4c2`. Revised application candidate `af72204f027e5ff1918379b648b1450b11cd1c77`.

- One compact table. Each TO/WO/date bar precedes its column labels and item rows. Ordered, Received and signed Diff stay visible. Orderless extras use their receipt date. Negative rows show ناقص in red and positive rows show زيادة in green.
- Centered Arabic copy in Arial 14px. Manual WO fields show a fixed WO- prefix, keep leading zeros and update the preview as the number is typed. An optional per-item override can be expanded. Values belong to the open email preview and are read when copied.
- The Outlook subject uses up to three distinct TO numbers in report order, followed by + More if applicable. A report consisting of orderless extras uses Extra Items.
- Focused email, Preview diagnostic gate and Production artifact checks passed locally. The Preview build uses Staging configuration. Product Owner verification still needs a narrow Outlook compose paste from the revised Preview.
- No migrations, operational writes, backend changes or Production deployment in this task.
